import { Injectable, OnModuleInit } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AppLogger } from "../../common/log";
import {
	EXECUTION_EVENTS,
	type ExecutionFinishedEvent,
	type ExecutionSuspendedEvent,
	type ExecutionPhaseChangedEvent,
	type ExecutionActionThoughtEvent,
} from "../../common/events/execution-events";
import { StandbySocketService } from "../../common/ws/standby-socket.service";
import { TaskService } from "../task/task.service";
import { TaskExecutionService } from "../task/task-execution.service";
import {
	type RemoteControlExecutionResponse,
	RemoteControlService,
} from "../remote-control";
import { DiscordBotService } from "./discord/discord-bot.service";
import { FeishuBotService } from "./feishu/feishu-bot.service";
import { TelegramBotService } from "./telegram/telegram-bot.service";
import { CommandParserService } from "./command/command-parser.service";
import { CommandType } from "./command/command.types";
import { DEFAULT_USER_ID } from "./im-channel.constants";
import type {
	ActiveImExecution,
	ImInboundMessage,
	ImPlatform,
} from "./im-channel.types";

/**
 *
 */
@Injectable()
export class ImChannelService implements OnModuleInit {
	private readonly activeExecutions = new Map<number, ActiveImExecution>();

	constructor(
		private readonly logger: AppLogger,
		private readonly feishuBot: FeishuBotService,
		private readonly telegramBot: TelegramBotService,
		private readonly discordBot: DiscordBotService,
		private readonly commandParser: CommandParserService,
		private readonly taskService: TaskService,
		private readonly taskExecutionService: TaskExecutionService,
		private readonly standbySocketService: StandbySocketService,
		private readonly remoteControlService: RemoteControlService,
	) {
		this.logger.setContext(ImChannelService.name);
	}

	onModuleInit() {
		if (this.feishuBot.isEnabled) {
			this.feishuBot.onMessage = (openId, text) =>
				this.handleMessage({
					platform: "feishu",
					conversationId: openId,
					platformUserId: openId,
					text,
				});
			this.logger.log("IM channel: Feishu bot registered");
		}
		if (this.telegramBot.isEnabled) {
			this.telegramBot.onMessage = (chatId, text) =>
				this.handleMessage({
					platform: "telegram",
					conversationId: chatId,
					platformUserId: chatId,
					text,
				});
			this.logger.log("IM channel: Telegram bot registered");
		}
		this.discordBot.onMessage = (message) => this.handleMessage(message);
		if (this.discordBot.isEnabled) {
			this.logger.log("IM channel: Discord bot registered");
		}
	}

	// ============================================================

	// ============================================================

	private async handleMessage(message: ImInboundMessage): Promise<void> {
		const cmd = this.commandParser.parse(message.text);

		try {
			switch (cmd.type) {
				case CommandType.HELP:
					await this.handleHelp(message);
					break;
				case CommandType.LIST_TASKS:
					await this.handleListTasks(message);
					break;
				case CommandType.RUN_TASK:
					await this.handleRunTask(message, cmd.taskId!);
					break;
				case CommandType.DO_TASK:
					await this.handleDoTask(message, cmd.description!);
					break;
				case CommandType.STATUS:
					await this.handleStatus(message, cmd.executionId);
					break;
				case CommandType.CANCEL:
					await this.handleCancel(message, cmd.executionId);
					break;
				case CommandType.PAUSE:
					await this.handlePause(message, cmd.executionId);
					break;
				case CommandType.RESUME:
					await this.handleResume(message, cmd.executionId, cmd.feedback);
					break;
				case CommandType.DEVICES:
					await this.handleDevices(message);
					break;
				case CommandType.FREE_TEXT:
					await this.handleFreeText(message, cmd.rawText);
					break;
			}
		} catch (e) {
			this.logger.error(
				`Command handler error: ${(e as Error).message}`,
			);
			await this.reply(message, `❌ Processing failed: ${(e as Error).message}`);
		}
	}

	// ============================================================

	// ============================================================

	private async handleHelp(message: ImInboundMessage) {
		await this.reply(
			message,
			[
				"📱 OpenGUI Remote Control",
				"",
				"/tasks — View task list",
				"/run <ID> — Run an existing task by ID",
				"/do <description> — Create and run a new task",
				"/status [executionId] — View execution status",
				"/cancel [executionId] — Cancel execution",
				"/pause [executionId] — Pause execution",
				"/resume [executionId] <feedback> — Resume paused execution",
				"/devices — View online devices",
				"/help — View this help",
			].join("\n"),
		);
	}

	private async handleListTasks(message: ImInboundMessage) {
		const result = await this.taskService.getTaskList(DEFAULT_USER_ID, {
			page: 1,
			pageSize: 20,
		});

		if (!result.items.length) {
			await this.reply(
				message,
				"No tasks yet. Send /do <description> to create one.",
			);
			return;
		}

		const lines = ["📋 Task list", ""];
		for (const task of result.items) {
			lines.push(
				`#${task.id}  ${task.taskName} (success ${task.successCount}/${task.totalExecutions})`,
			);
		}
		lines.push("", "Send /run <ID> to execute");
		await this.reply(message, lines.join("\n"));
	}

	private async handleRunTask(message: ImInboundMessage, taskId: number) {
		const result = await this.remoteControlService.runTask(
			{ taskId },
			DEFAULT_USER_ID,
		);
		await this.trackDispatchedExecution(message, result);
	}

	private async handleDoTask(message: ImInboundMessage, description: string) {
		const result = await this.remoteControlService.doTask(
			{ description },
			DEFAULT_USER_ID,
		);
		await this.reply(message, `📝 Created task: ${result.taskName}`);
		await this.trackDispatchedExecution(message, result);
	}

	private async handleStatus(message: ImInboundMessage, executionId?: number) {
		if (executionId) {
			const execution = await this.taskExecutionService.getExecutionById(
				executionId,
				DEFAULT_USER_ID,
			);
			const info = this.activeExecutions.get(executionId);
			const lines = [
				`📊 Execution #${execution.id}`,
				`Task ID: ${execution.taskId}`,
				`Status: ${execution.executionStatus}`,
			];
			if (execution.executionResult) {
				lines.push(`Result: ${execution.executionResult}`);
			}
			if (execution.statusMessage) {
				lines.push(`Message: ${execution.statusMessage}`);
			}
			if (execution.currentStep) {
				lines.push(`Current step: ${execution.currentStep}`);
			}
			if (info) {
				lines.push(`Task: ${info.taskName}`);
			}
			await this.reply(message, lines.join("\n"));
			return;
		}

		const activeExecutions = this.getActiveExecutionsForContext(message);
		if (activeExecutions.length === 0) {
			await this.reply(message, "No active execution");
			return;
		}

		const lines = ["📊 Execution status", ""];
		for (const [execId, info] of activeExecutions) {
			const elapsed = Math.floor((Date.now() - info.startedAt) / 1000);
			const min = Math.floor(elapsed / 60);
			const sec = elapsed % 60;
			lines.push(`Task: ${info.taskName} (ID: ${execId})`);
			lines.push(`Runtime: ${min}m ${sec}s`);
		}
		await this.reply(message, lines.join("\n"));
	}

	private async handleCancel(message: ImInboundMessage, executionId?: number) {
		const execId = this.getExecutionIdForContext(message, executionId);
		if (!execId) {
			await this.reply(message, "No active execution");
			return;
		}
		await this.taskExecutionService.cancelExecution(execId, DEFAULT_USER_ID);
		await this.reply(message, `⏹ Cancelled execution #${execId}`);
	}

	private async handlePause(message: ImInboundMessage, executionId?: number) {
		const execId = this.getExecutionIdForContext(message, executionId);
		if (!execId) {
			await this.reply(message, "No active execution");
			return;
		}
		await this.taskExecutionService.pauseExecution(execId, DEFAULT_USER_ID);
		await this.reply(
			message,
			`⏸ Paused execution #${execId}. Use /resume ${execId} <feedback> to resume or /cancel ${execId} to cancel.`,
		);
	}

	private async handleResume(
		message: ImInboundMessage,
		executionId: number | undefined,
		feedback: string | undefined,
	) {
		const execId = this.getExecutionIdForContext(message, executionId);
		if (!execId) {
			await this.reply(message, "No resumable task");
			return;
		}
		await this.taskExecutionService.resumeExecution(
			execId,
			DEFAULT_USER_ID,
			feedback ? { feedback } : undefined,
		);
		await this.reply(message, `▶️ Execution #${execId} resumed`);
	}

	private async handleDevices(message: ImInboundMessage) {
		const devices = this.standbySocketService.getOnlineDevices();
		if (devices.length === 0) {
			await this.reply(message, "No online devices");
			return;
		}
		const lines = ["📱 Online Devices", ""];
		for (const d of devices) {
			lines.push(`• ${d.deviceName || d.deviceId}`);
		}
		await this.reply(message, lines.join("\n"));
	}

	private async handleFreeText(message: ImInboundMessage, text: string) {
		const execId = this.getExecutionIdForContext(message);
		if (execId) {
			await this.taskExecutionService.resumeExecution(
				execId,
				DEFAULT_USER_ID,
				{ feedback: text },
			);
			await this.reply(message, "▶️ Reply received. Continuing execution...");
			return;
		}

		await this.reply(message, "Send /help to view available commands");
	}

	// ============================================================

	// ============================================================

	@OnEvent(EXECUTION_EVENTS.SUSPENDED)
	async onExecutionSuspended(event: ExecutionSuspendedEvent) {
		const info = this.activeExecutions.get(event.executionId);
		if (!info) return;

		await this.reply(
			info,
			[
				"🔔 Task needs your help",
				"",
				event.reason || "Check the phone screen",
				"",
				"Reply with text to continue, or send /cancel to cancel.",
			].join("\n"),
		);
	}

	@OnEvent(EXECUTION_EVENTS.FINISHED)
	async onExecutionFinished(event: ExecutionFinishedEvent) {
		const info = this.activeExecutions.get(event.executionId);
		if (!info) return;

		this.activeExecutions.delete(event.executionId);
		this.lastActionThoughtTime.delete(event.executionId);

		const elapsed = Math.floor((Date.now() - info.startedAt) / 1000);
		const min = Math.floor(elapsed / 60);
		const sec = elapsed % 60;

		let text: string;
		switch (event.result) {
			case "SUCCEED":
				text = [
					`✅ Task completed: ${info.taskName}`,
					"",
					event.summary || "",
					`Duration ${min}m ${sec}s`,
				]
					.filter(Boolean)
					.join("\n");
				break;
			case "CANCELLED":
				text = `⚠️ Task cancelled: ${info.taskName}`;
				break;
			default:
				text = [
					`❌ Task failed: ${info.taskName}`,
					"",
					event.errorMessage ? `Reason: ${event.errorMessage}` : "",
					`Duration ${min}m ${sec}s`,
				]
					.filter(Boolean)
					.join("\n");
		}

		await this.reply(info, text);
	}

	private lastActionThoughtTime = new Map<number, number>();

	@OnEvent(EXECUTION_EVENTS.PHASE_CHANGED)
	async onPhaseChanged(event: ExecutionPhaseChangedEvent) {
		const info = this.activeExecutions.get(event.executionId);
		if (!info) return;

		const phaseNames: Record<string, string> = {
			plan_supervisor: "📋 Planning...",
			executor: "⚡ Executing",
			summarizer: "📝 Summarizing...",
		};
		const label = phaseNames[event.phase];
		if (label) {
			await this.reply(info, label);
		}
	}

	@OnEvent(EXECUTION_EVENTS.ACTION_THOUGHT)
	async onActionThought(event: ExecutionActionThoughtEvent) {
		const info = this.activeExecutions.get(event.executionId);
		if (!info) return;

		const now = Date.now();
		const last = this.lastActionThoughtTime.get(event.executionId) ?? 0;
		if (now - last < 10_000) return;
		this.lastActionThoughtTime.set(event.executionId, now);

		await this.reply(info, `> ${event.content}`);
	}

	// ============================================================

	// ============================================================

	private async trackDispatchedExecution(
		message: ImInboundMessage,
		result: RemoteControlExecutionResponse,
	) {
		this.activeExecutions.set(result.executionId, {
			platform: message.platform,
			conversationId: message.conversationId,
			platformUserId: message.platformUserId,
			taskName: result.taskName,
			startedAt: Date.now(),
		});

		await this.reply(
			message,
			`▶️ Starting execution: ${result.taskName}\nDevice: ${result.device.deviceName || result.device.deviceId}`,
		);
	}

	private getExecutionIdForContext(
		message: ImInboundMessage,
		executionId?: number,
	): number | null {
		if (executionId) return executionId;
		for (const [id] of this.getActiveExecutionsForContext(message)) {
			return id;
		}
		return null;
	}

	private getActiveExecutionsForContext(
		message: ImInboundMessage,
	): Array<[number, ActiveImExecution]> {
		return Array.from(this.activeExecutions.entries()).filter(([, info]) =>
			this.isSameConversation(info, message),
		);
	}

	private isSameConversation(
		info: ActiveImExecution,
		message: ImInboundMessage,
	): boolean {
		return (
			info.platform === message.platform &&
			info.conversationId === message.conversationId
		);
	}

	private async reply(
		target: { platform: ImPlatform; conversationId: string },
		text: string,
	) {
		if (target.platform === "telegram" && this.telegramBot.isEnabled) {
			await this.telegramBot.sendMessage(target.conversationId, text);
		} else if (target.platform === "discord" && this.discordBot.isEnabled) {
			await this.discordBot.sendMessage(target.conversationId, text);
		} else if (target.platform === "feishu" && this.feishuBot.isEnabled) {
			await this.feishuBot.sendMessage(target.conversationId, text);
		}
	}
}
