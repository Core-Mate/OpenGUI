import { Injectable } from "@nestjs/common";
import { CommandType, type ParsedCommand } from "./command.types";

/**
 * 命令解析服务
 *
 * 将 IM 消息文本解析为结构化命令。
 * 支持 slash 命令和中文命令。
 */
@Injectable()
export class CommandParserService {
	parse(text: string): ParsedCommand {
		const trimmed = text.trim();

		// /tasks
		if (/^\/tasks?\b/i.test(trimmed)) {
			return { type: CommandType.LIST_TASKS, rawText: trimmed };
		}

		// /run <ID>
		const runMatch = trimmed.match(/^\/run\s+(\d+)/i);
		if (runMatch) {
			return {
				type: CommandType.RUN_TASK,
				taskId: Number.parseInt(runMatch[1], 10),
				rawText: trimmed,
			};
		}

		// /do <description>
		const doMatch = trimmed.match(/^\/do\s+(.+)/is);
		if (doMatch) {
			return {
				type: CommandType.DO_TASK,
				description: doMatch[1].trim(),
				rawText: trimmed,
			};
		}

		// /status
		if (/^\/status\b/i.test(trimmed)) {
			return { type: CommandType.STATUS, rawText: trimmed };
		}

		// /cancel
		if (/^\/cancel\b/i.test(trimmed)) {
			return { type: CommandType.CANCEL, rawText: trimmed };
		}

		// /pause
		if (/^\/pause\b/i.test(trimmed)) {
			return { type: CommandType.PAUSE, rawText: trimmed };
		}

		// /resume
		if (/^\/resume\b/i.test(trimmed)) {
			return { type: CommandType.RESUME, rawText: trimmed };
		}

		// /devices
		if (/^\/devices?\b/i.test(trimmed)) {
			return { type: CommandType.DEVICES, rawText: trimmed };
		}

		// /help
		if (/^\/help\b/i.test(trimmed)) {
			return { type: CommandType.HELP, rawText: trimmed };
		}

		// 中文命令
		if (/^任务列表/.test(trimmed)) {
			return { type: CommandType.LIST_TASKS, rawText: trimmed };
		}

		const cnRunMatch = trimmed.match(/^(?:执行|运行)\s*[:：]?\s*(\d+)/);
		if (cnRunMatch) {
			return {
				type: CommandType.RUN_TASK,
				taskId: Number.parseInt(cnRunMatch[1], 10),
				rawText: trimmed,
			};
		}

		const cnDoMatch = trimmed.match(/^做\s*[:：]?\s*(.+)/s);
		if (cnDoMatch) {
			return {
				type: CommandType.DO_TASK,
				description: cnDoMatch[1].trim(),
				rawText: trimmed,
			};
		}

		if (/^状态$/.test(trimmed)) {
			return { type: CommandType.STATUS, rawText: trimmed };
		}
		if (/^取消$/.test(trimmed)) {
			return { type: CommandType.CANCEL, rawText: trimmed };
		}
		if (/^暂停$/.test(trimmed)) {
			return { type: CommandType.PAUSE, rawText: trimmed };
		}
		if (/^恢复$/.test(trimmed)) {
			return { type: CommandType.RESUME, rawText: trimmed };
		}
		if (/^帮助$/.test(trimmed)) {
			return { type: CommandType.HELP, rawText: trimmed };
		}

		// 非命令文本
		return { type: CommandType.FREE_TEXT, rawText: trimmed };
	}
}
