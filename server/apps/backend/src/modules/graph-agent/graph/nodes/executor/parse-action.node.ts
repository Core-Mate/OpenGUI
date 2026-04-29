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

const USER_INTERVENTION_ACTIONS = new Set([
	"need_login",
	"asset_risk",
	"delete_confirm",
]);

const USER_INTERVENTION_MESSAGES: Record<string, string> = {
	need_login: "User must complete login, registration, or identity verification",
	asset_risk: "Involves assets, payment, transfer, refund, or major asset changes and requires user confirmation",
	delete_confirm: "Involves important data deletion or irreversible operations and requires user confirmation",
};

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


				actionInputs[
					paramName.trim() as keyof Omit<
						ActionInputs,
						"start_coords" | "end_coords"
					>
				] = JSON.stringify(floatNumbers);


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
		actionStr = normalizeActionSyntax(actionStr.trim()).replace(
			/^Action[:：]\s*/i,
			"",
		);

		// Support format: click(start_box='<|box_start|>(x1,y1)<|box_end|>')
		actionStr = actionStr.replace(/<\|box_start\|>|<\|box_end\|>/g, "");

		// Support format: click(point='<point>510 150</point>') => click(start_box='<point>510 150</point>')
		// Support format: drag(start_point='<point>458 328</point>', end_point='<point>350 309</point>') => drag(start_box='<point>458 328</point>', end_box='<point>350 309</point>')
		actionStr = actionStr
			.replace(/(?<!start_|end_)point=/g, "start_box=")
			.replace(/start_point=/g, "start_box=")
			.replace(/end_point=/g, "end_box=");

		// Match function name and arguments. Allow trailing punctuation/text so
		// model outputs like click(start_box=(500, 420)). remain recoverable.
		const functionPattern = /^(\w+)\s*\(([\s\S]*)\)/;
		const match = actionStr.trim().match(functionPattern);

		if (!match) {
			throw new Error("Not a function call");
		}

		const [_, rawFunctionName, argsStr] = match;
		let functionName = rawFunctionName;

		// Parse keyword arguments
		const kwargs: Record<string, string> = {};

		if (argsStr.trim()) {
			const argPairs = splitKeywordArgs(argsStr);

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

				kwargs[key.trim()] = value;
			}
		}

		if (USER_INTERVENTION_ACTIONS.has(functionName)) {
			const originalContent = kwargs.content || USER_INTERVENTION_MESSAGES[functionName];
			kwargs.content = `[${functionName}] ${originalContent}`;
			functionName = "call_user";
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

function normalizeActionSyntax(input: string): string {
	let quote: "'" | '"' | null = null;
	let normalized = "";

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		const prev = input[i - 1];

		if ((ch === "'" || ch === '"') && prev !== "\\") {
			quote = quote === ch ? null : quote ?? ch;
			normalized += ch;
			continue;
		}

		if (!quote) {
			if (ch === "（") {
				normalized += "(";
				continue;
			}
			if (ch === "）") {
				normalized += ")";
				continue;
			}
			if (ch === "，") {
				normalized += ",";
				continue;
			}
		}

		normalized += ch;
	}

	return normalized;
}

function splitKeywordArgs(argsStr: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let depth = 0;

	for (let i = 0; i < argsStr.length; i++) {
		const ch = argsStr[i];
		const prev = argsStr[i - 1];

		if ((ch === "'" || ch === '"') && prev !== "\\") {
			quote = quote === ch ? null : quote || ch;
			current += ch;
			continue;
		}

		if (!quote) {
			if (ch === "(" || ch === "[") {
				depth++;
			} else if (ch === ")" || ch === "]") {
				depth = Math.max(0, depth - 1);
			} else if (ch === "," && depth === 0) {
				if (current.trim()) args.push(current.trim());
				current = "";
				continue;
			}
		}

		current += ch;
	}

	if (current.trim()) args.push(current.trim());
	return args;
}

/**
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
 */
function extractWorkingMemoryContent(inputs: ActionInputs): string | null {
	if (!inputs) return null;

	if (inputs.content) return inputs.content;

	const values = Object.entries(inputs)
		.filter(([key]) => !["start_coords", "end_coords", "direction", "app_name"].includes(key))
		.map(([_, val]) => (typeof val === "string" ? val : ""))
		.filter(Boolean);
	return values.length > 0 ? values.join("\n") : null;
}

/**
 *
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

			if (parsedPredictions.length > 1) {
				logger.error(
					"multi predictions, only use the first one",
					JSON.stringify(parsedPredictions),
				);
			}
			const parsedPrediction = parsedPredictions[0];

			logger.log(`Parsed action: ${parsedPrediction.action_type}`);


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

			if (parsedPrediction.action_type === "downgrade_to_a11y") {
				logger.log("Ignoring downgrade_to_a11y because this build is GUI-only");
				return {
					executor: {
						parsedPrediction: null,
						status: "running",
						sharedMessages: [
							new HumanMessage({
								content:
									"A11Y channel is unavailable in this build. Continue with GUI screenshot actions and output one valid GUI action.",
								additional_kwargs: { created_at: new Date().toISOString() },
							}),
						],
						semanticHistory: [buildSemanticRecord(state, parsedPrediction)],
					},
				} as Partial<AgentState>;
			}


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
							message: `Failed to parse action: ${error.message}`,
					},
				},
			} as Partial<AgentState>;
		}
	};
}
