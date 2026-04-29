import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot } from "grammy";
import { AppLogger } from "../../../common/log";

/**
 *
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
	private bot: Bot | null = null;
	private enabled = false;

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
