import { Injectable } from "@nestjs/common";
import { CommandType, type ParsedCommand } from "./command.types";

/**
 *
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


		if (/^(?:task\s+list|\u4efb\u52a1\u5217\u8868)$/i.test(trimmed)) {
			return { type: CommandType.LIST_TASKS, rawText: trimmed };
		}

		const cnRunMatch = trimmed.match(/^(?:\u6267\u884c|\u8fd0\u884c)\s*[:\uff1a]?\s*(\d+)/);
		if (cnRunMatch) {
			return {
				type: CommandType.RUN_TASK,
				taskId: Number.parseInt(cnRunMatch[1], 10),
				rawText: trimmed,
			};
		}

		const cnDoMatch = trimmed.match(/^\u505a\s*[:\uff1a]?\s*(.+)/s);
		if (cnDoMatch) {
			return {
				type: CommandType.DO_TASK,
				description: cnDoMatch[1].trim(),
				rawText: trimmed,
			};
		}

		if (/^\u72b6\u6001$/.test(trimmed)) {
			return { type: CommandType.STATUS, rawText: trimmed };
		}
		if (/^\u53d6\u6d88$/.test(trimmed)) {
			return { type: CommandType.CANCEL, rawText: trimmed };
		}
		if (/^\u6682\u505c$/.test(trimmed)) {
			return { type: CommandType.PAUSE, rawText: trimmed };
		}
		if (/^\u6062\u590d$/.test(trimmed)) {
			return { type: CommandType.RESUME, rawText: trimmed };
		}
		if (/^\u5e2e\u52a9$/.test(trimmed)) {
			return { type: CommandType.HELP, rawText: trimmed };
		}


		return { type: CommandType.FREE_TEXT, rawText: trimmed };
	}
}
