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
import { StandbyGateway } from "../../common/ws/standby.gateway";
import { StandbySocketService } from "../../common/ws/standby-socket.service";
import { TaskService } from "../task/task.service";
import { TaskExecutionService } from "../task/task-execution.service";
import { FeishuBotService } from "./feishu/feishu-bot.service";
import { TelegramBotService } from "./telegram/telegram-bot.service";
import { CommandParserService } from "./command/command-parser.service";
import { CommandType } from "./command/command.types";
import { DEFAULT_USER_ID } from "./im-channel.constants";

/**
 *
 */
@Injectable()
export class ImChannelService implements OnModuleInit {
	private readonly activeExecutions = new Map<
		number,
		{ userId: string; platform: "feishu" | "telegram"; taskName: string; startedAt: number }
	>();

	constructor(
		private readonly logger: AppLogger,
		private readonly feishuBot: FeishuBotService,
		private readonly telegramBot: TelegramBotService,
		private readonly commandParser: CommandParserService,
		private readonly taskService: TaskService,
		private readonly taskExecutionService: TaskExecutionService,
		private readonly standbyGateway: StandbyGateway,
		private readonly standbySocketService: StandbySocketService,
	) {
		this.logger.setContext(ImChannelService.name);
	}

	onModuleInit() {
		if (this.feishuBot.isEnabled) {
			this.feishuBot.onMessage = (openId, text) =>
				this.handleMessage(openId, text, "feishu");
			this.logger.log("IM channel: Feishu bot registered");
		}
		if (this.telegramBot.isEnabled) {
			this.telegramBot.onMessage = (chatId, text) =>
				this.handleMessage(chatId, text, "telegram");
			this.logger.log("IM channel: Telegram bot registered");
		}
	}

	// ============================================================

	// ============================================================

	private async handleMessage(userId: string, text: string, platform: "feishu" | "telegram"): Promise<void> {
		const cmd = this.commandParser.parse(text);

		try {
			switch (cmd.type) {
				case CommandType.HELP:
					await this.handleHelp(userId, platform);
					break;
				case CommandType.LIST_TASKS:
					await this.handleListTasks(userId, platform);
					break;
				case CommandType.RUN_TASK:
					await this.handleRunTask(userId, cmd.taskId!, platform);
					break;
				case CommandType.DO_TASK:
					await this.handleDoTask(userId, cmd.description!, platform);
					break;
				case CommandType.STATUS:
					await this.handleStatus(userId, platform);
					break;
				case CommandType.CANCEL:
					await this.handleCancel(userId, platform);
					break;
				case CommandType.PAUSE:
					await this.handlePause(userId, platform);
					break;
				case CommandType.RESUME:
					await this.handleResume(userId, cmd.rawText, platform);
					break;
				case CommandType.DEVICES:
					await this.handleDevices(userId, platform);
					break;
				case CommandType.FREE_TEXT:
					await this.handleFreeText(userId, cmd.rawText, platform);
					break;
			}
		} catch (e) {
			this.logger.error(
				`Command handler error: ${(e as Error).message}`,
			);
			await this.reply(userId, `❌ Processing failed: ${(e as Error).message}`, platform);
		}
	}

	// ============================================================

	// ============================================================

	private async handleHelp(userId: string, platform: "feishu" | "telegram") {
		await this.reply(
			userId,
			[
				"📱 OpenGUI Remote Control",
				"",
				"/tasks — View task list",
				"/run <ID> — Run an existing task by ID",
					"/do <description> — Create and run a new task",
				"/status — View current execution status",
				"/cancel — Cancel current execution",
				"/pause — Pause current execution",
				"/resume — Resume paused execution",
				"/devices — View online devices",
				"/help — View this help",
			].join("\n"),
			platform,
		);
	}

	private async handleListTasks(userId: string, platform: "feishu" | "telegram") {
		const result = await this.taskService.getTaskList(DEFAULT_USER_ID, {
			page: 1,
			pageSize: 20,
		});

		if (!result.items.length) {
			await this.reply(userId, "No tasks yet. Send /do <description> to create one.", platform);
			return;
		}

		const lines = ["📋 Task list", ""];
		for (const task of result.items) {
			lines.push(
				`#${task.id}  ${task.taskName} (success ${task.successCount}/${task.totalExecutions})`,
			);
		}
		lines.push("", "Send /run <ID> to execute");
		await this.reply(userId, lines.join("\n"), platform);
	}

	private async handleRunTask(userId: string, taskId: number, platform: "feishu" | "telegram") {
		const device = this.standbySocketService.getOnlineDevice();
		if (!device) {
			await this.reply(userId, "❌ No online device. Start the app on the work phone first.", platform);
			return;
		}

		const task = await this.taskService.getTaskById(taskId, DEFAULT_USER_ID);
		if (!task) {
				await this.reply(userId, `❌ No task found with ID ${taskId}\nSend /tasks to view the list`, platform);
			return;
		}

		await this.dispatchExecution(userId, taskId, task.taskName, device, platform);
	}

	private async handleDoTask(userId: string, description: string, platform: "feishu" | "telegram") {
		const device = this.standbySocketService.getOnlineDevice();
		if (!device) {
			await this.reply(userId, "❌ No online device. Start the app on the work phone first.", platform);
			return;
		}

		const name =
			description.length > 20
				? `${description.substring(0, 20)}...`
				: description;
		const task = await this.taskService.createTask(DEFAULT_USER_ID, {
			taskName: name,
			taskDescription: description,
		});

		await this.reply(userId, `📝 Created task: ${name}`, platform);
		await this.dispatchExecution(userId, task.id, name, device, platform);
	}

	private async handleStatus(userId: string, platform: "feishu" | "telegram") {
		if (this.activeExecutions.size === 0) {
			await this.reply(userId, "No active execution", platform);
			return;
		}

		const lines = ["📊 Execution status", ""];
		for (const [execId, info] of this.activeExecutions) {
			const elapsed = Math.floor((Date.now() - info.startedAt) / 1000);
			const min = Math.floor(elapsed / 60);
			const sec = elapsed % 60;
			lines.push(`Task: ${info.taskName} (ID: ${execId})`);
			lines.push(`Runtime: ${min}m ${sec}s`);
		}
		await this.reply(userId, lines.join("\n"), platform);
	}

	private async handleCancel(userId: string, platform: "feishu" | "telegram") {
		const execId = this.getFirstActiveExecutionId();
		if (!execId) {
			await this.reply(userId, "No active execution", platform);
			return;
		}
		await this.taskExecutionService.cancelExecution(execId, DEFAULT_USER_ID);
		await this.reply(userId, "⏹ Cancelled", platform);
	}

	private async handlePause(userId: string, platform: "feishu" | "telegram") {
		const execId = this.getFirstActiveExecutionId();
		if (!execId) {
			await this.reply(userId, "No active execution", platform);
			return;
		}
		await this.taskExecutionService.pauseExecution(execId, DEFAULT_USER_ID);
		await this.reply(userId, "⏸ Paused. Use /resume to resume or /cancel to cancel.", platform);
	}

	private async handleResume(userId: string, feedback: string | undefined, platform: "feishu" | "telegram") {
		const execId = this.getFirstActiveExecutionId();
		if (!execId) {
			await this.reply(userId, "No resumable task", platform);
			return;
		}
		await this.taskExecutionService.resumeExecution(
			execId,
			DEFAULT_USER_ID,
		);
		await this.reply(userId, "▶️ Execution resumed", platform);
	}

	private async handleDevices(userId: string, platform: "feishu" | "telegram") {
		const devices = this.standbySocketService.getOnlineDevices();
		if (devices.length === 0) {
			await this.reply(userId, "No online devices", platform);
			return;
		}
		const lines = ["📱 Online Devices", ""];
		for (const d of devices) {
			lines.push(`• ${d.deviceName || d.deviceId}`);
		}
		await this.reply(userId, lines.join("\n"), platform);
	}

	private async handleFreeText(userId: string, text: string, platform: "feishu" | "telegram") {
		const execId = this.getFirstActiveExecutionId();
		if (execId) {
			await this.taskExecutionService.resumeExecution(
				execId,
				DEFAULT_USER_ID,
				{ feedback: text },
			);
			await this.reply(userId, "▶️ Reply received. Continuing execution...", platform);
			return;
		}

		await this.reply(userId, "Send /help to view available commands", platform);
	}

	// ============================================================

	// ============================================================

	@OnEvent(EXECUTION_EVENTS.SUSPENDED)
	async onExecutionSuspended(event: ExecutionSuspendedEvent) {
		const info = this.activeExecutions.get(event.executionId);
		if (!info) return;

		await this.reply(
			info.userId,
			[
				"🔔 Task needs your help",
				"",
				event.reason || "Check the phone screen",
				"",
				"Reply with text to continue, or send /cancel to cancel.",
			].join("\n"),
			info.platform,
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

		await this.reply(info.userId, text, info.platform);
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
			await this.reply(info.userId, label, info.platform);
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

		await this.reply(info.userId, `> ${event.content}`, info.platform);
	}

	// ============================================================

	// ============================================================

	private async dispatchExecution(
		userId: string,
		taskId: number,
		taskName: string,
		device: NonNullable<ReturnType<StandbySocketService["getOnlineDevice"]>>,
		platform: "feishu" | "telegram",
	) {
		const result = await this.taskExecutionService.executeTask(
			taskId,
			DEFAULT_USER_ID,
			{ deviceId: device.deviceId },
		);

		this.activeExecutions.set(result.executionId, {
			userId,
			platform,
			taskName,
			startedAt: Date.now(),
		});

		await this.reply(
			userId,
			`▶️ Starting execution: ${taskName}\nDevice: ${device.deviceName || device.deviceId}`,
			platform,
		);

		this.standbyGateway.dispatchToDevice(device, {
			executionId: result.executionId,
			taskId,
			taskName,
		});
	}

	private getFirstActiveExecutionId(): number | null {
		for (const [id] of this.activeExecutions) {
			return id;
		}
		return null;
	}

	private async reply(userId: string, text: string, platform?: "feishu" | "telegram") {
		if (platform === "telegram" && this.telegramBot.isEnabled) {
			await this.telegramBot.sendMessage(userId, text);
		} else if (this.feishuBot.isEnabled) {
			await this.feishuBot.sendMessage(userId, text);
		}
	}
}
