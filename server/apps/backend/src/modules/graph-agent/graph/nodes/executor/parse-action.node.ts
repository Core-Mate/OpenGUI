import { HumanMessage } from "@langchain/core/messages";
import { Logger } from "@nestjs/common";
import { RunnableConfig } from "@langchain/core/runnables";
import type { PrismaService } from "../../../../../prisma/prisma.service";
import type { WorkingMemoryService } from "../../../working-memory/working-memory.service";
import type { AgentState, PredictionParsed, SemanticRecord } from "../../state/executor-state.types";
import type { ActionInputs } from "../../state/state.types";
import { CoordinateTransformer } from "../../utils/coordinate-transformer";
import { ErrorSeverity } from "../../utils/error-classification";

const logger = new Logger("ParseActionNode");

/** @internal exported for testing */
export function parseVlmPrediction(
	text: string,
	screenWidth: number,
	screenHeight: number,
	channel: "gui" = "gui",
): PredictionParsed[] {
	text = text.trim();

	// Strip markdown code block wrappers (e.g., ```\n...\n```)
	text = text
		.replace(/^```[\w]*\s*\n?/, "")
		.replace(/\n?\s*```\s*$/, "")
		.trim();

	let reflection: string | null = null;
	let thought: string | null = null;
	let summary: string | null = null;
	let actionStr = "";

	// Parse Summary: line
	const summaryMatch = text.match(
		/Summary:\s*(.+?)(?=\s*(?:Thought|Reflection|Action_Summary|Action)[:：]|$)/,
	);
	if (summaryMatch) {
		summary = summaryMatch[1].trim();
	}

	// Parse thought/reflection based on different text patterns
	if (text.includes("Thought:")) {
		const thoughtMatch = text.match(/Thought: ([\s\S]+?)(?=\s*Action[:：]|$)/);

		if (thoughtMatch) {
			thought = thoughtMatch[1].trim();
		}
	} else if (text.startsWith("Reflection:")) {
		const reflectionMatch = text.match(
			/Reflection: ([\s\S]+?)Action_Summary: ([\s\S]+?)(?=\s*Action[:：]|$)/,
		);
		if (reflectionMatch) {
			thought = reflectionMatch[2].trim();
			reflection = reflectionMatch[1].trim();
		}
	} else if (text.startsWith("Action_Summary:")) {
		const summaryMatch = text.match(
			/Action_Summary: (.+?)(?=\s*Action[:：]|$)/,
		);
		if (summaryMatch) {
			thought = summaryMatch[1].trim();
		}
	}

	if (!["Action:", "Action："].some((keyword) => text.includes(keyword))) {
		//   throw new Error('No Action found in text');
		actionStr = text;
	} else {
		const actionParts = text.split(/Action[:：]/);
		actionStr = actionParts[actionParts.length - 1];
	}

	// Parse actions - split by lines and recombine multi-line arguments
	const lines = actionStr.split("\n");
	const actionChunks: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		// A new function call starts with word characters followed by (
		if (/^\w+\(/.test(trimmed)) {
			actionChunks.push(trimmed);
		} else if (actionChunks.length > 0) {
			// Continuation of previous action's arguments
			actionChunks[actionChunks.length - 1] += "\n" + trimmed;
		}
	}

	const actions: PredictionParsed[] = [];
	const factors: [number, number] = [1000, 1000];
	const transformer = screenWidth && screenHeight
		? new CoordinateTransformer(screenWidth, screenHeight)
		: null;

	for (const rawStr of actionChunks) {
		// prettier-ignore
		const actionInstance = parseAction(
			rawStr.replace(/\n/g, String.raw`\n`).trimStart(),
		);
		if (!actionInstance) continue;

		const actionType = actionInstance.function;
		const actionInputs: ActionInputs = {};
		const params = actionInstance.args;

		for (const [paramName, param] of Object.entries(params)) {
			if (!param) continue;
			const trimmedParam = (param as string).trim();

			if (paramName.includes("start_box") || paramName.includes("end_box")) {
				const oriBox = trimmedParam;
				// Remove parentheses and split
				const numbers = oriBox
					.replace(/[()[\]]/g, "")
					.split(",")
					.filter((ori) => ori !== "");

				// Convert to float and scale
				const floatNumbers = numbers.map((num, idx) => {
					const val = Number.parseFloat(num);
					// GUI: normalized 0-1000, divide by factor
					const factorIndex = idx % 2;
					return val / factors[factorIndex];
				});

				if (floatNumbers.length === 2) {
					floatNumbers.push(floatNumbers[0], floatNumbers[1]);
				}

				// 保留原始 box 值用于 JSON 存储
				actionInputs[
					paramName.trim() as keyof Omit<
						ActionInputs,
						"start_coords" | "end_coords"
					>
				] = JSON.stringify(floatNumbers);

				// 使用 CoordinateTransformer 统一坐标转换
				if (transformer) {
					const boxKey = paramName.includes("start_box")
						? "start_coords"
						: "end_coords";
					const [x1, y1, x2 = x1, y2 = y1] = floatNumbers;
					actionInputs[boxKey] = transformer.fromChannel(channel, x1, y1, x2, y2);
				}
			} else {
				actionInputs[
					paramName.trim() as keyof Omit<
						ActionInputs,
						"start_coords" | "end_coords"
					>
				] = trimmedParam;
			}
		}

		actions.push({
			reflection: reflection,
			thought: thought || "",
			action_type: actionType,
			action_inputs: actionInputs,
			summary: summary,
		});
	}

	// Ensure at least one result (preserve existing behavior for downstream consumers)
	if (actions.length === 0) {
		actions.push({
			reflection: reflection,
			thought: thought || "",
			action_type: "",
			action_inputs: {},
			summary: summary,
		});
	}

	return actions;
}

function parseAction(actionStr: string) {
	try {
		// Support format: click(start_box='<|box_start|>(x1,y1)<|box_end|>')
		actionStr = actionStr.replace(/<\|box_start\|>|<\|box_end\|>/g, "");

		// Support format: click(point='<point>510 150</point>') => click(start_box='<point>510 150</point>')
		// Support format: drag(start_point='<point>458 328</point>', end_point='<point>350 309</point>') => drag(start_box='<point>458 328</point>', end_box='<point>350 309</point>')
		actionStr = actionStr
			.replace(/(?<!start_|end_)point=/g, "start_box=")
			.replace(/start_point=/g, "start_box=")
			.replace(/end_point=/g, "end_box=");

		// Match function name and arguments using regex
		const functionPattern = /^(\w+)\((.*)\)$/;
		const match = actionStr.trim().match(functionPattern);

		if (!match) {
			throw new Error("Not a function call");
		}

		const [_, functionName, argsStr] = match;

		// Parse keyword arguments
		const kwargs = {};

		if (argsStr.trim()) {
			// Split on commas that aren't inside quotes or parentheses
			const argPairs = argsStr.match(/([^,']|'[^']*')+/g) || [];

			for (const pair of argPairs) {
				const [key, ...valueParts] = pair.split("=");
				if (!key) continue;

				let value = valueParts
					.join("=")
					.trim()
					.replace(/^['"]|['"]$/g, ""); // Remove surrounding quotes

				// Support format: click(start_box='<bbox>637 964 637 964</bbox>')
				if (value.includes("<bbox>")) {
					value = value.replace(/<bbox>|<\/bbox>/g, "").replace(/\s+/g, ",");
					value = `(${value})`;
				}

				// Support format: click(point='<point>510 150</point>')
				if (value.includes("<point>")) {
					value = value.replace(/<point>|<\/point>/g, "").replace(/\s+/g, ",");
					value = `(${value})`;
				}

				//@ts-ignore
				kwargs[key.trim()] = value;
			}
		}

		return {
			function: functionName,
			args: kwargs,
		};
	} catch (e) {
		console.error(`Failed to parse action '${actionStr}': ${e}`);
		return null;
	}
}

/**
 * 构建语义历史记录
 */
function buildSemanticRecord(
	state: AgentState,
	parsed: PredictionParsed,
): SemanticRecord {
	return {
		channel: state.executor.currentChannel,
		loopIndex: state.executor.loopCount,
		timestamp: new Date().toISOString(),
		summary: parsed.summary || "",
		thought: parsed.thought || "",
		action: parsed.action_type
			? `${parsed.action_type}(${JSON.stringify(parsed.action_inputs)})`
			: "",
		parsedAction:
			parsed.action_type &&
			parsed.action_type !== "request_visual"
				? {
						action_type: parsed.action_type,
						start_coords: parsed.action_inputs?.start_coords || [],
					}
				: null,
		appName: state.executor.currentAppName,
		screenshotKey:
			state.executor.currentChannel === "gui"
				? state.executor.screenshotUri
				: undefined,
	};
}

/**
 * 从 action_inputs 中提取 working memory 内容
 * 兼容模型输出 content=xxx / facts=xxx 等各种参数名
 */
function extractWorkingMemoryContent(inputs: ActionInputs): string | null {
	if (!inputs) return null;
	// 优先取 content 字段
	if (inputs.content) return inputs.content;
	// 兜底：取所有非坐标/非控制字段的值拼接
	const values = Object.entries(inputs)
		.filter(([key]) => !["start_coords", "end_coords", "direction", "app_name"].includes(key))
		.map(([_, val]) => (typeof val === "string" ? val : ""))
		.filter(Boolean);
	return values.length > 0 ? values.join("\n") : null;
}

/**
 * 创建解析动作节点
 *
 * @returns 解析动作节点函数
 */
export function createParseActionNode(
	prismaService: PrismaService,
	workingMemoryService: WorkingMemoryService,
) {
	return async (state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> => {
		const exec = state.executor;
		logger.log("Parsing action from prediction");

		try {
			const prediction = exec.currentPrediction;
			const { screenWidth, screenHeight } = exec;

			const parsedPredictions = parseVlmPrediction(
				prediction,
				screenWidth,
				screenHeight,
				"gui",
			);
			// 先只取一个 应该没啥问题
			if (parsedPredictions.length > 1) {
				logger.error(
					"multi predictions, only use the first one",
					JSON.stringify(parsedPredictions),
				);
			}
			const parsedPrediction = parsedPredictions[0];

			logger.log(`Parsed action: ${parsedPrediction.action_type}`);

			// 检查特殊动作类型
			if (parsedPrediction.action_type === "finished") {
				return {
					executor: {
						parsedPrediction,
						status: "finished",
						semanticHistory: [buildSemanticRecord(state, parsedPrediction)],
					},
				} as Partial<AgentState>;
			}

			if (parsedPrediction.action_type === "call_user") {
				return {
					executor: {
						parsedPrediction,
						status: "call_user",
						callUserThought: parsedPrediction.thought,
						semanticHistory: [buildSemanticRecord(state, parsedPrediction)],
					},
				} as Partial<AgentState>;
			}

			// request_visual is a no-op in GUI-only mode
			if (parsedPrediction.action_type === "request_visual") {
				logger.log(`Ignoring no-op action: ${parsedPrediction.action_type}`);
				return {
					executor: {
						parsedPrediction: null,
						status: "running",
						semanticHistory: [buildSemanticRecord(state, parsedPrediction)],
					},
				} as Partial<AgentState>;
			}

			// 拦截 working memory 文本动作（兼容模型未走 tool_call 的情况）
			if (parsedPrediction.action_type === "update_working_memory") {
				const rawContent = extractWorkingMemoryContent(parsedPrediction.action_inputs);
				if (rawContent) {
					logger.debug(`update_working_memory content: ${rawContent}`);
					const threadId = (config?.configurable as Record<string, unknown>)?.thread_id as string;
					if (threadId) {
						try {
							await workingMemoryService.updateWorkingMemory(threadId, rawContent, "append");
							logger.log(`Intercepted text-action update_working_memory, saved to thread ${threadId}`);
						} catch (err) {
							logger.error(`Failed to intercept update_working_memory: ${(err as Error).message}`);
						}
					}
				}
				return {
					executor: {
						parsedPrediction: null,
						status: "running",
						semanticHistory: [buildSemanticRecord(state, parsedPrediction)],
					},
				} as Partial<AgentState>;
			}

			if (parsedPrediction.action_type === "get_working_memory") {
				const threadId = (config?.configurable as Record<string, unknown>)?.thread_id as string;
				let memMessages: HumanMessage[] = [];
				if (threadId) {
					try {
						const content = await workingMemoryService.getWorkingMemory(threadId);
						if (content) {
							memMessages = [new HumanMessage({
								content: `[Working Memory]\n${content}`,
								additional_kwargs: { created_at: new Date().toISOString() },
							})];
						}
						logger.log(`Intercepted text-action get_working_memory for thread ${threadId}`);
					} catch (err) {
						logger.error(`Failed to intercept get_working_memory: ${(err as Error).message}`);
					}
				}
				return {
					executor: {
						parsedPrediction: null,
						status: "running",
						...(memMessages.length > 0 && { sharedMessages: memMessages }),
						semanticHistory: [buildSemanticRecord(state, parsedPrediction)],
					},
				} as Partial<AgentState>;
			}

			return {
				executor: {
					parsedPrediction,
					status: "running",
					semanticHistory: [buildSemanticRecord(state, parsedPrediction)],
				},
			} as Partial<AgentState>;
		} catch (error: any) {
			logger.error(`Parse action failed: ${error.message}`);
			return {
				executor: {
					status: "running",
					parsedPrediction: null,
					lastError: {
						severity: ErrorSeverity.RECOVERABLE,
						code: "PARSE_FAILED",
						message: `解析动作失败: ${error.message}`,
					},
				},
			} as Partial<AgentState>;
		}
	};
}
