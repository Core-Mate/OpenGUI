import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Lark from "@larksuiteoapi/node-sdk";
import { AppLogger } from "../../../common/log";

/**
 * 飞书 Bot 服务 — 基于官方 @larksuiteoapi/node-sdk
 *
 * 使用 WSClient 长连接模式接收消息（不需要公网 IP）。
 * 配置 FEISHU_APP_ID + FEISHU_APP_SECRET 即可启用。
 */
@Injectable()
export class FeishuBotService implements OnModuleInit, OnModuleDestroy {
	private appId: string;
	private appSecret: string;
	private client: Lark.Client | null = null;
	private wsClient: Lark.WSClient | null = null;
	private enabled = false;

	/** 消息回调，由 ImChannelService 注册 */
	onMessage: ((openId: string, text: string) => Promise<void>) | null = null;

	constructor(
		private readonly logger: AppLogger,
		private readonly configService: ConfigService,
	) {
		this.logger.setContext(FeishuBotService.name);
		this.appId = this.configService.get("FEISHU_APP_ID", "");
		this.appSecret = this.configService.get("FEISHU_APP_SECRET", "");
	}

	async onModuleInit() {
		if (!this.appId || !this.appSecret) {
			this.logger.log("Feishu bot not configured (FEISHU_APP_ID missing), skipping");
			return;
		}
		this.enabled = true;
		this.logger.log("Starting Feishu bot...");

		const baseConfig = {
			appId: this.appId,
			appSecret: this.appSecret,
		};

		// HTTP client — 用于发送消息
		this.client = new Lark.Client(baseConfig);

		// WebSocket client — 用于接收消息
		this.wsClient = new Lark.WSClient({
			...baseConfig,
			loggerLevel: Lark.LoggerLevel.info,
		});

		this.wsClient.start({
			eventDispatcher: new Lark.EventDispatcher({}).register({
				"im.message.receive_v1": async (data) => {
					this.handleMessage(data);
				},
			}),
		});

		this.logger.log("[FeishuBot] Connected ✓");
	}

	onModuleDestroy() {
		this.enabled = false;
		// SDK 没有暴露显式的 close 方法，GC 会清理
		this.client = null;
		this.wsClient = null;
	}

	get isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * 发送文本消息给飞书用户
	 */
	async sendMessage(openId: string, text: string): Promise<void> {
		if (!this.client) return;
		try {
			await this.client.im.v1.message.create({
				params: { receive_id_type: "open_id" },
				data: {
					receive_id: openId,
					msg_type: "text",
					content: JSON.stringify({ text }),
				},
			});
		} catch (e) {
			this.logger.error(`Failed to send Feishu message: ${(e as Error).message}`);
		}
	}

	// ---- 内部实现 ----

	private handleMessage(data: any) {
		try {
			const senderId = data?.sender?.sender_id?.open_id;
			if (!senderId) return;

			const message = data?.message;
			if (!message || message.message_type !== "text") return;

			const content = JSON.parse(message.content || "{}");
			const text = content.text;
			if (!text) return;

			this.logger.log(
				`[FeishuBot] Message from open_id=${senderId}: ${text.substring(0, 50)}`,
			);

			if (this.onMessage) {
				this.onMessage(senderId, text).catch((e) =>
					this.logger.error(`Message handler error: ${(e as Error).message}`),
				);
			}
		} catch (e) {
			this.logger.error(`Failed to handle Feishu message: ${(e as Error).message}`);
		}
	}
}
