import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	Client,
	Events,
	GatewayIntentBits,
	REST,
	Routes,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
} from "discord.js";
import { AppLogger } from "../../../common/log";
import type { ImInboundMessage } from "../im-channel.types";

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
	private client: Client | null = null;
	private enabled = false;
	private commandPrefix = "!opengui";
	private allowedGuildIds = new Set<string>();
	private allowedChannelIds = new Set<string>();
	private allowedUserIds = new Set<string>();

	onMessage: ((message: ImInboundMessage) => Promise<void>) | null = null;

	constructor(
		private readonly logger: AppLogger,
		private readonly configService: ConfigService,
	) {
		this.logger.setContext(DiscordBotService.name);
	}

	async onModuleInit() {
		const token = this.configService.get("DISCORD_BOT_TOKEN", "");
		if (!token) {
			this.logger.log("Discord bot not configured, skipping");
			return;
		}

		this.commandPrefix = this.configService.get(
			"DISCORD_COMMAND_PREFIX",
			"!opengui",
		);
		this.allowedGuildIds = this.parseIdList("DISCORD_ALLOWED_GUILD_IDS");
		this.allowedChannelIds = this.parseIdList("DISCORD_ALLOWED_CHANNEL_IDS");
		this.allowedUserIds = this.parseIdList("DISCORD_ALLOWED_USER_IDS");
		this.enabled = true;

		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
			],
		});

		this.client.once(Events.ClientReady, async (client) => {
			this.logger.log(`[DiscordBot] Connected as ${client.user.tag}`);
			try {
				await this.registerSlashCommandsIfEnabled(token);
			} catch (e) {
				this.logger.error(
					`Failed to register Discord slash commands: ${(e as Error).message}`,
				);
			}
		});

		this.client.on(Events.MessageCreate, async (message) => {
			if (message.author.bot) return;
			if (!this.hasCommandPrefix(message.content)) return;
			if (
				!this.isAllowed({
					guildId: message.guildId ?? undefined,
					channelId: message.channelId,
					userId: message.author.id,
				})
			) {
				return;
			}

			await this.onMessage?.({
				platform: "discord",
				conversationId: message.channelId,
				platformUserId: message.author.id,
				guildId: message.guildId ?? undefined,
				text: this.stripCommandPrefix(message.content),
			});
		});

		this.client.on(Events.InteractionCreate, async (interaction) => {
			if (!interaction.isChatInputCommand()) return;
			if (interaction.commandName !== "opengui") return;
			await this.handleSlashCommand(interaction);
		});

		try {
			await this.client.login(token);
		} catch (e) {
			this.enabled = false;
			this.logger.error(`Failed to start Discord bot: ${(e as Error).message}`);
			await this.client.destroy();
			this.client = null;
		}
	}

	async onModuleDestroy() {
		this.enabled = false;
		if (this.client) {
			await this.client.destroy();
			this.client = null;
		}
	}

	get isEnabled(): boolean {
		return this.enabled;
	}

	async sendMessage(channelId: string, text: string): Promise<void> {
		if (!this.client) return;
		try {
			const channel = await this.client.channels.fetch(channelId);
			const sendableChannel = channel as {
				send?: (content: string) => Promise<unknown>;
			} | null;
			if (typeof sendableChannel?.send !== "function") return;
			for (const chunk of this.splitMessage(text)) {
				await sendableChannel.send(chunk);
			}
		} catch (e) {
			this.logger.error(`Failed to send Discord message: ${(e as Error).message}`);
		}
	}

	private async handleSlashCommand(interaction: ChatInputCommandInteraction) {
		if (
			!this.isAllowed({
				guildId: interaction.guildId ?? undefined,
				channelId: interaction.channelId,
				userId: interaction.user.id,
			})
		) {
			await interaction.reply({
				content: "You are not allowed to control OpenGUI from here.",
				ephemeral: true,
			});
			return;
		}

		const text = this.slashInteractionToText(interaction);
		if (!text) {
			await interaction.reply({
				content: "Unsupported OpenGUI command.",
				ephemeral: true,
			});
			return;
		}

		await interaction.reply("OpenGUI command received.");
		await this.onMessage?.({
			platform: "discord",
			conversationId: interaction.channelId,
			platformUserId: interaction.user.id,
			guildId: interaction.guildId ?? undefined,
			text,
		});
	}

	private slashInteractionToText(
		interaction: ChatInputCommandInteraction,
	): string | null {
		const subcommand = interaction.options.getSubcommand();
		switch (subcommand) {
			case "help":
				return "/help";
			case "devices":
				return "/devices";
			case "do":
				return `/do ${interaction.options.getString("task", true)}`;
			case "run":
				return `/run ${interaction.options.getInteger("task_id", true)}`;
			case "status": {
				const executionId = interaction.options.getInteger("execution_id");
				return executionId ? `/status ${executionId}` : "/status";
			}
			case "cancel":
				return `/cancel ${interaction.options.getInteger("execution_id", true)}`;
			case "pause":
				return `/pause ${interaction.options.getInteger("execution_id", true)}`;
			case "resume":
				return `/resume ${interaction.options.getInteger(
					"execution_id",
					true,
				)} ${interaction.options.getString("feedback", true)}`;
			default:
				return null;
		}
	}

	private async registerSlashCommandsIfEnabled(token: string) {
		const shouldRegister =
			this.configService.get("DISCORD_REGISTER_COMMANDS", "false") === "true";
		if (!shouldRegister) return;

		const clientId = this.configService.get("DISCORD_CLIENT_ID", "");
		if (!clientId) {
			this.logger.warn(
				"DISCORD_REGISTER_COMMANDS=true but DISCORD_CLIENT_ID is missing",
			);
			return;
		}
		if (this.allowedGuildIds.size === 0) {
			this.logger.warn(
				"DISCORD_REGISTER_COMMANDS=true but DISCORD_ALLOWED_GUILD_IDS is empty",
			);
			return;
		}

		const command = this.buildSlashCommand();
		const rest = new REST({ version: "10" }).setToken(token);
		for (const guildId of this.allowedGuildIds) {
			await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
				body: [command.toJSON()],
			});
			this.logger.log(`[DiscordBot] Slash commands registered for guild ${guildId}`);
		}
	}

	private buildSlashCommand() {
		return new SlashCommandBuilder()
			.setName("opengui")
			.setDescription("Control OpenGUI phone tasks")
			.addSubcommand((subcommand) =>
				subcommand.setName("help").setDescription("Show OpenGUI commands"),
			)
			.addSubcommand((subcommand) =>
				subcommand.setName("devices").setDescription("List online devices"),
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("do")
					.setDescription("Create and run a new task")
					.addStringOption((option) =>
						option
							.setName("task")
							.setDescription("Task text")
							.setRequired(true),
					),
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("run")
					.setDescription("Run an existing task")
					.addIntegerOption((option) =>
						option
							.setName("task_id")
							.setDescription("Task ID")
							.setRequired(true),
					),
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("status")
					.setDescription("Show execution status")
					.addIntegerOption((option) =>
						option
							.setName("execution_id")
							.setDescription("Execution ID")
							.setRequired(false),
					),
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("cancel")
					.setDescription("Cancel an execution")
					.addIntegerOption((option) =>
						option
							.setName("execution_id")
							.setDescription("Execution ID")
							.setRequired(true),
					),
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("pause")
					.setDescription("Pause an execution")
					.addIntegerOption((option) =>
						option
							.setName("execution_id")
							.setDescription("Execution ID")
							.setRequired(true),
					),
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("resume")
					.setDescription("Resume an execution")
					.addIntegerOption((option) =>
						option
							.setName("execution_id")
							.setDescription("Execution ID")
							.setRequired(true),
					)
					.addStringOption((option) =>
						option
							.setName("feedback")
							.setDescription("Feedback for the paused task")
							.setRequired(true),
					),
			);
	}

	private isAllowed(input: {
		guildId?: string;
		channelId: string;
		userId: string;
	}): boolean {
		return (
			this.matchesAllowList(this.allowedGuildIds, input.guildId) &&
			this.matchesAllowList(this.allowedChannelIds, input.channelId) &&
			this.matchesAllowList(this.allowedUserIds, input.userId)
		);
	}

	private matchesAllowList(allowList: Set<string>, value?: string): boolean {
		if (allowList.size === 0) return true;
		return value ? allowList.has(value) : false;
	}

	private parseIdList(key: string): Set<string> {
		const value = this.configService.get(key, "");
		return new Set(
			value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean),
		);
	}

	private stripCommandPrefix(text: string): string {
		const withoutPrefix = text.trim().slice(this.commandPrefix.length).trim();
		return withoutPrefix || "help";
	}

	private hasCommandPrefix(text: string): boolean {
		const trimmed = text.trim().toLowerCase();
		const prefix = this.commandPrefix.toLowerCase();
		return trimmed === prefix || trimmed.startsWith(`${prefix} `);
	}

	private splitMessage(text: string): string[] {
		const maxLength = 1900;
		if (text.length <= maxLength) return [text];

		const chunks: string[] = [];
		for (let i = 0; i < text.length; i += maxLength) {
			chunks.push(text.slice(i, i + maxLength));
		}
		return chunks;
	}
}
