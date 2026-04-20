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
 * IM 频道核心服务
 *
 * 负责：
 * 1. 接收 IM 消息（飞书/Telegram）→ 解析命令 → 分发执行
 * 2. 监听执行事件（SUSPENDED/FINISHED/PHASE_CHANGED/ACTION_THOUGHT）→ 回传 IM
 */
@Injectable()
export class ImChannelService implements OnModuleInit {
	/** 当前活跃的 executionId → 用户信息（用于结果回传） */
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
	// 入站消息处理
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
			await this.reply(userId, `❌ 处理失败: ${(e as Error).message}`, platform);
		}
	}

	// ============================================================
	// 命令处理
	// ============================================================

	private async handleHelp(userId: string, platform: "feishu" | "telegram") {
		await this.reply(
			userId,
			[
				"📱 OpenGUI 远程控制",
				"",
				"/tasks — 查看任务列表",
				"/run <ID> — 按 ID 执行已有任务",
				"/do <描述> — 新建任务并立即执行",
				"/status — 查看当前执行进度",
				"/cancel — 取消当前执行",
				"/pause — 暂停当前执行",
				"/resume — 恢复暂停的执行",
				"/devices — 查看在线设备",
				"/help — 查看此帮助",
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
			await this.reply(userId, "暂无任务。发送 /do <描述> 新建任务", platform);
			return;
		}

		const lines = ["📋 任务列表", ""];
		for (const task of result.items) {
			lines.push(
				`#${task.id}  ${task.taskName} (成功 ${task.successCount}/${task.totalExecutions})`,
			);
		}
		lines.push("", "发送 /run <ID> 执行");
		await this.reply(userId, lines.join("\n"), platform);
	}

	private async handleRunTask(userId: string, taskId: number, platform: "feishu" | "telegram") {
		const device = this.standbySocketService.getOnlineDevice();
		if (!device) {
			await this.reply(userId, "❌ 没有在线设备。请先在工作手机上启动 App。", platform);
			return;
		}

		const task = await this.taskService.getTaskById(taskId, DEFAULT_USER_ID);
		if (!task) {
			await this.reply(userId, `❌ 未找到 ID 为 ${taskId} 的任务\n发送 /tasks 查看列表`, platform);
			return;
		}

		await this.dispatchExecution(userId, taskId, task.taskName, device, platform);
	}

	private async handleDoTask(userId: string, description: string, platform: "feishu" | "telegram") {
		const device = this.standbySocketService.getOnlineDevice();
		if (!device) {
			await this.reply(userId, "❌ 没有在线设备。请先在工作手机上启动 App。", platform);
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

		await this.reply(userId, `📝 已创建任务: ${name}`, platform);
		await this.dispatchExecution(userId, task.id, name, device, platform);
	}

	private async handleStatus(userId: string, platform: "feishu" | "telegram") {
		if (this.activeExecutions.size === 0) {
			await this.reply(userId, "当前没有执行中的任务", platform);
			return;
		}

		const lines = ["📊 执行状态", ""];
		for (const [execId, info] of this.activeExecutions) {
			const elapsed = Math.floor((Date.now() - info.startedAt) / 1000);
			const min = Math.floor(elapsed / 60);
			const sec = elapsed % 60;
			lines.push(`任务: ${info.taskName} (ID: ${execId})`);
			lines.push(`运行时间: ${min}分${sec}秒`);
		}
		await this.reply(userId, lines.join("\n"), platform);
	}

	private async handleCancel(userId: string, platform: "feishu" | "telegram") {
		const execId = this.getFirstActiveExecutionId();
		if (!execId) {
			await this.reply(userId, "当前没有执行中的任务", platform);
			return;
		}
		await this.taskExecutionService.cancelExecution(execId, DEFAULT_USER_ID);
		await this.reply(userId, "⏹ 已取消", platform);
	}

	private async handlePause(userId: string, platform: "feishu" | "telegram") {
		const execId = this.getFirstActiveExecutionId();
		if (!execId) {
			await this.reply(userId, "当前没有执行中的任务", platform);
			return;
		}
		await this.taskExecutionService.pauseExecution(execId, DEFAULT_USER_ID);
		await this.reply(userId, "⏸ 已暂停。/resume 恢复，/cancel 取消", platform);
	}

	private async handleResume(userId: string, feedback: string | undefined, platform: "feishu" | "telegram") {
		const execId = this.getFirstActiveExecutionId();
		if (!execId) {
			await this.reply(userId, "当前没有可恢复的任务", platform);
			return;
		}
		await this.taskExecutionService.resumeExecution(
			execId,
			DEFAULT_USER_ID,
		);
		await this.reply(userId, "▶️ 已恢复执行", platform);
	}

	private async handleDevices(userId: string, platform: "feishu" | "telegram") {
		const devices = this.standbySocketService.getOnlineDevices();
		if (devices.length === 0) {
			await this.reply(userId, "没有在线设备", platform);
			return;
		}
		const lines = ["📱 在线设备", ""];
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
			await this.reply(userId, "▶️ 已收到回复，继续执行...", platform);
			return;
		}

		await this.reply(userId, "发送 /help 查看可用命令", platform);
	}

	// ============================================================
	// 执行事件监听
	// ============================================================

	@OnEvent(EXECUTION_EVENTS.SUSPENDED)
	async onExecutionSuspended(event: ExecutionSuspendedEvent) {
		const info = this.activeExecutions.get(event.executionId);
		if (!info) return;

		await this.reply(
			info.userId,
			[
				"🔔 任务需要你的帮助",
				"",
				event.reason || "请检查手机屏幕",
				"",
				"直接回复文字即可继续，或发送 /cancel 取消。",
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
					`✅ 任务完成: ${info.taskName}`,
					"",
					event.summary || "",
					`用时 ${min}分${sec}秒`,
				]
					.filter(Boolean)
					.join("\n");
				break;
			case "CANCELLED":
				text = `⚠️ 任务已取消: ${info.taskName}`;
				break;
			default:
				text = [
					`❌ 任务失败: ${info.taskName}`,
					"",
					event.errorMessage ? `原因: ${event.errorMessage}` : "",
					`用时 ${min}分${sec}秒`,
				]
					.filter(Boolean)
					.join("\n");
		}

		await this.reply(info.userId, text, info.platform);
	}

	/** 节流：每个 execution 最后一次 action thought 推送时间 */
	private lastActionThoughtTime = new Map<number, number>();

	@OnEvent(EXECUTION_EVENTS.PHASE_CHANGED)
	async onPhaseChanged(event: ExecutionPhaseChangedEvent) {
		const info = this.activeExecutions.get(event.executionId);
		if (!info) return;

		const phaseNames: Record<string, string> = {
			plan_supervisor: "📋 规划中...",
			executor: "⚡ 执行中",
			summarizer: "📝 总结中...",
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
	// 内部方法
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
			`▶️ 开始执行: ${taskName}\n设备: ${device.deviceName || device.deviceId}`,
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
