import { Injectable } from "@nestjs/common";
import { CommandType, type ParsedCommand } from "./command.types";

/**
 *
 */
@Injectable()
export class CommandParserService {
	parse(text: string, options?: { commandPrefix?: string }): ParsedCommand {
		const rawText = text.trim();
		const trimmed = this.stripCommandPrefix(
			rawText,
			options?.commandPrefix ?? "!opengui",
		);

		// /tasks
		if (/^\/?(?:tasks?|list)\b/i.test(trimmed)) {
			return { type: CommandType.LIST_TASKS, rawText };
		}

		// /run <ID>
		const runMatch = trimmed.match(/^\/?run\s+(\d+)/i);
		if (runMatch) {
			return {
				type: CommandType.RUN_TASK,
				taskId: Number.parseInt(runMatch[1], 10),
				rawText,
			};
		}

		// /do <description>
		const doMatch = trimmed.match(/^\/?do\s+(.+)/is);
		if (doMatch) {
			return {
				type: CommandType.DO_TASK,
				description: doMatch[1].trim(),
				rawText,
			};
		}

		// /status [executionId]
		const statusMatch = trimmed.match(/^\/?status(?:\s+(\d+))?\b/i);
		if (statusMatch) {
			return {
				type: CommandType.STATUS,
				executionId: statusMatch[1]
					? Number.parseInt(statusMatch[1], 10)
					: undefined,
				rawText,
			};
		}

		// /cancel [executionId]
		const cancelMatch = trimmed.match(/^\/?cancel(?:\s+(\d+))?\b/i);
		if (cancelMatch) {
			return {
				type: CommandType.CANCEL,
				executionId: cancelMatch[1]
					? Number.parseInt(cancelMatch[1], 10)
					: undefined,
				rawText,
			};
		}

		// /pause [executionId]
		const pauseMatch = trimmed.match(/^\/?pause(?:\s+(\d+))?\b/i);
		if (pauseMatch) {
			return {
				type: CommandType.PAUSE,
				executionId: pauseMatch[1]
					? Number.parseInt(pauseMatch[1], 10)
					: undefined,
				rawText,
			};
		}

		// /resume [executionId] [feedback]
		const resumeMatch = trimmed.match(/^\/?resume(?:\s+(.+))?$/is);
		if (resumeMatch) {
			const args = resumeMatch[1]?.trim() ?? "";
			const argMatch = args.match(/^(\d+)(?:\s+([\s\S]+))?$/);
			return {
				type: CommandType.RESUME,
				executionId: argMatch
					? Number.parseInt(argMatch[1], 10)
					: undefined,
				feedback: argMatch ? argMatch[2]?.trim() : args || undefined,
				rawText,
			};
		}

		// /devices
		if (/^\/?devices?\b/i.test(trimmed)) {
			return { type: CommandType.DEVICES, rawText };
		}

		// /help
		if (/^\/?help\b/i.test(trimmed)) {
			return { type: CommandType.HELP, rawText };
		}


		if (/^(?:task\s+list|\u4efb\u52a1\u5217\u8868)$/i.test(trimmed)) {
			return { type: CommandType.LIST_TASKS, rawText };
		}

		const cnRunMatch = trimmed.match(/^(?:\u6267\u884c|\u8fd0\u884c)\s*[:\uff1a]?\s*(\d+)/);
		if (cnRunMatch) {
			return {
				type: CommandType.RUN_TASK,
				taskId: Number.parseInt(cnRunMatch[1], 10),
				rawText,
			};
		}

		const cnDoMatch = trimmed.match(/^\u505a\s*[:\uff1a]?\s*(.+)/s);
		if (cnDoMatch) {
			return {
				type: CommandType.DO_TASK,
				description: cnDoMatch[1].trim(),
				rawText,
			};
		}

		if (/^\u72b6\u6001$/.test(trimmed)) {
			return { type: CommandType.STATUS, rawText };
		}
		if (/^\u53d6\u6d88$/.test(trimmed)) {
			return { type: CommandType.CANCEL, rawText };
		}
		if (/^\u6682\u505c$/.test(trimmed)) {
			return { type: CommandType.PAUSE, rawText };
		}
		if (/^\u6062\u590d$/.test(trimmed)) {
			return { type: CommandType.RESUME, rawText };
		}
		if (/^\u5e2e\u52a9$/.test(trimmed)) {
			return { type: CommandType.HELP, rawText };
		}


		return { type: CommandType.FREE_TEXT, rawText: trimmed };
	}

	private stripCommandPrefix(text: string, prefix: string): string {
		const trimmed = text.trim();
		if (!prefix) return trimmed;

		const lowerText = trimmed.toLowerCase();
		const lowerPrefix = prefix.toLowerCase();
		if (lowerText !== lowerPrefix && !lowerText.startsWith(`${lowerPrefix} `)) {
			return trimmed;
		}

		const withoutPrefix = trimmed.slice(prefix.length).trim();
		return withoutPrefix || "help";
	}
}
