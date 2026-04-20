import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot } from "grammy";
import { AppLogger } from "../../../common/log";

/**
 * Telegram Bot 服务 — 基于 grammY SDK
 *
 * 使用 long polling 模式接收消息（不需要公网 IP）。
 * 配置 TELEGRAM_BOT_TOKEN 即可启用。
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
	private bot: Bot | null = null;
	private enabled = false;

	/** 消息回调，由 ImChannelService 注册 */
	onMessage: ((chatId: string, text: string) => Promise<void>) | null = null;

	constructor(
		private readonly logger: AppLogger,
		private readonly configService: ConfigService,
	) {
		this.logger.setContext(TelegramBotService.name);
	}

	async onModuleInit() {
		const token = this.configService.get("TELEGRAM_BOT_TOKEN", "");
		if (!token) {
			this.logger.log(
				"Telegram bot not configured (TELEGRAM_BOT_TOKEN missing), skipping",
			);
			return;
		}

		this.enabled = true;
		this.bot = new Bot(token);

		// 监听文本消息
		this.bot.on("message:text", async (ctx) => {
			const chatId = String(ctx.chat.id);
			const text = ctx.message.text;

			this.logger.log(
				`[TelegramBot] Message from chatId=${chatId}: ${text.substring(0, 50)}`,
			);

			if (this.onMessage) {
				try {
					await this.onMessage(chatId, text);
				} catch (e) {
					this.logger.error(
						`Message handler error: ${(e as Error).message}`,
					);
				}
			}
		});

		// 启动 long polling（非阻塞）
		this.bot.start({
			onStart: () => {
				this.logger.log("[TelegramBot] Connected, polling started ✓");
			},
		});
	}

	onModuleDestroy() {
		if (this.bot) {
			this.bot.stop();
			this.bot = null;
		}
		this.enabled = false;
	}

	get isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * 发送文本消息给 Telegram 用户
	 */
	async sendMessage(chatId: string, text: string): Promise<void> {
		if (!this.bot) return;
		try {
			await this.bot.api.sendMessage(chatId, text);
		} catch (e) {
			this.logger.error(
				`Failed to send Telegram message: ${(e as Error).message}`,
			);
		}
	}
}
