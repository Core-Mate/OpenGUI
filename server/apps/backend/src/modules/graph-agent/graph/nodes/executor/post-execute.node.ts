import { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import {
	AgentEventSource,
	AgentEventType,
} from "../../../../../common/base/enum";
import { ExecutionGateway } from "../../../../../common/ws";
import type { AgentConfigProvider } from "../../../config/agent-config.provider";
import { createConfiguredChatModel } from "../../../config/chat-model.factory";
import { AgentName } from "../../../config/types";
import {
	type AgentState,
	type ExecutorInternalState,
	type ParsedActionRecord,
	type SemanticRecord,
	VLM_AGENT_DEFAULTS,
} from "../../state/executor-state.types";
import { hammingDistance } from "../../utils/phash";

const logger = new Logger("PostExecuteNode");

const completedSummaries = new Map<number, string[]>();

const summaryGenerations = new Map<number, number>();

export function getSummaryGeneration(executionId: number): number {
	return summaryGenerations.get(executionId) ?? 0;
}

export function clearCompletedSummaries(executionId: number): void {
	completedSummaries.delete(executionId);
	summaryGenerations.set(executionId, (summaryGenerations.get(executionId) ?? 0) + 1);
}

// ============================================================

// ============================================================

const ACTION_WINDOW_SIZE = 10;
const ACTION_REPETITION_THRESHOLD = 5;
const COORD_SIMILARITY_THRESHOLD = 50;
const SCREENSHOT_CONSECUTIVE_WINDOW = 3;
const SCREENSHOT_CYCLE_WINDOW = 6;
const SCREENSHOT_HASH_STORE_SIZE = SCREENSHOT_CYCLE_WINDOW;
const HASH_SIMILARITY_THRESHOLD = 5;
const HASH_IDENTICAL_THRESHOLD = 0;
const PASSIVE_ACTIONS = new Set(["wait", "scroll", "finished", "press_back", "press_home"]);
const CYCLE_MIN_REPETITIONS = 3;
const MAX_CYCLE_LENGTH = 3;
const CONSECUTIVE_SCROLL_EXIT_THRESHOLD = 8;

export function detectActionRepetition(
	recentActions: ParsedActionRecord[],
): { detected: boolean; reason: string | null } {
	const window = recentActions.slice(-ACTION_WINDOW_SIZE);
	if (window.length < ACTION_REPETITION_THRESHOLD) {
		return { detected: false, reason: null };
	}

	const tail = window.slice(-ACTION_REPETITION_THRESHOLD);
	const first = tail[0];
	const allSimilar = tail.every((a) => isSimilarAction(first, a));

	if (allSimilar) {
		return {
			detected: true,
			reason: `Executed similar ${first.action_type} actions ${ACTION_REPETITION_THRESHOLD} times in a row; possible loop`,
		};
	}
	return { detected: false, reason: null };
}

function isSimilarAction(a: ParsedActionRecord, b: ParsedActionRecord): boolean {
	if (a.action_type !== b.action_type) return false;

	if (a.start_coords.length !== 2 || b.start_coords.length !== 2) {
		return !PASSIVE_ACTIONS.has(a.action_type);
	}
	const dist =
		Math.abs(a.start_coords[0] - b.start_coords[0]) +
		Math.abs(a.start_coords[1] - b.start_coords[1]);
	return dist <= COORD_SIMILARITY_THRESHOLD;
}

/**
 */
function isSimilarActionStrict(a: ParsedActionRecord, b: ParsedActionRecord): boolean {
	if (a.action_type !== b.action_type) return false;
	if (a.start_coords.length !== 2 || b.start_coords.length !== 2) {
		return true;
	}
	const dist =
		Math.abs(a.start_coords[0] - b.start_coords[0]) +
		Math.abs(a.start_coords[1] - b.start_coords[1]);
	return dist <= COORD_SIMILARITY_THRESHOLD;
}

/**
 *
 */
export function detectActionCycle(
	recentActions: ParsedActionRecord[],
): { detected: boolean; reason: string | null } {
	for (let cycleLen = 2; cycleLen <= MAX_CYCLE_LENGTH; cycleLen++) {
		const needed = cycleLen * CYCLE_MIN_REPETITIONS;
		if (recentActions.length < needed) continue;

		const tail = recentActions.slice(-needed);
		let isCycle = true;

		for (let i = cycleLen; i < needed && isCycle; i++) {
			if (!isSimilarActionStrict(tail[i % cycleLen], tail[i])) {
				isCycle = false;
			}
		}

		if (!isCycle) continue;


		const cycleTypes = new Set(tail.slice(0, cycleLen).map((a) => a.action_type));
		if (cycleTypes.size < 2) continue;

		const cycleDesc = tail
			.slice(0, cycleLen)
			.map((a) => a.action_type)
			.join(" → ");
		return {
			detected: true,
			reason: `Detected a ${cycleLen}-step action cycle repeated ${CYCLE_MIN_REPETITIONS} times (${cycleDesc}); possible loop`,
		};
	}
	return { detected: false, reason: null };
}

function detectConsecutiveActionType(
	recentActions: ParsedActionRecord[],
	actionType: string,
	threshold: number,
): { detected: boolean; reason: string | null } {
	if (recentActions.length < threshold) {
		return { detected: false, reason: null };
	}

	const tail = recentActions.slice(-threshold);
	const allSameType = tail.every((a) => a.action_type === actionType);
	if (!allSameType) {
		return { detected: false, reason: null };
	}

	return {
		detected: true,
		reason: `Executed ${actionType} ${threshold} times in a row; the current search strategy is not making progress and needs replanning`,
	};
}

function detectScreenshotAnomaly(
	recentHashes: string[],
	isPassiveAction: boolean,
): { detected: boolean; reason: string | null } {
	if (recentHashes.length < SCREENSHOT_CONSECUTIVE_WINDOW) {
		return { detected: false, reason: null };
	}

	const recent = recentHashes.slice(-SCREENSHOT_CONSECUTIVE_WINDOW);
	const first = recent[0];

	const allIdentical = recent.every(
		(h) => hammingDistance(first, h) <= HASH_IDENTICAL_THRESHOLD,
	);
	if (allIdentical && !isPassiveAction) {
			return {
				detected: true,
				reason: `${SCREENSHOT_CONSECUTIVE_WINDOW} consecutive screenshots are identical; the page did not respond to actions`,
		};
	}

	const allSimilar = recent.every(
		(h) => hammingDistance(first, h) <= HASH_SIMILARITY_THRESHOLD,
	);
	if (allSimilar && !isPassiveAction) {
			return {
				detected: true,
				reason: `${SCREENSHOT_CONSECUTIVE_WINDOW} consecutive screenshots are highly similar; possible loop`,
		};
	}

	return { detected: false, reason: null };
}

/**
 *
 */
export function detectScreenshotCycle(
	recentHashes: string[],
	isPassiveAction: boolean,
): { detected: boolean; reason: string | null } {
	if (isPassiveAction || recentHashes.length < SCREENSHOT_CYCLE_WINDOW) {
		return { detected: false, reason: null };
	}

	const recent = recentHashes.slice(-SCREENSHOT_CYCLE_WINDOW);


	const evenHashes = recent.filter((_, i) => i % 2 === 0);
	const oddHashes = recent.filter((_, i) => i % 2 === 1);

	const evenAllSimilar = evenHashes.every(
		(h) => hammingDistance(evenHashes[0], h) <= HASH_SIMILARITY_THRESHOLD,
	);
	const oddAllSimilar = oddHashes.every(
		(h) => hammingDistance(oddHashes[0], h) <= HASH_SIMILARITY_THRESHOLD,
	);
	const evenOddDifferent =
		hammingDistance(evenHashes[0], oddHashes[0]) > HASH_SIMILARITY_THRESHOLD;

	if (evenAllSimilar && oddAllSimilar && evenOddDifferent) {
		return {
			detected: true,
			reason: "Screenshots show an alternating repeat pattern (A-B-A-B); the page is switching between two states.",
		};
	}

	return { detected: false, reason: null };
}

// ============================================================
// Part 2: history summary constants and trigger conditions
// ============================================================

const HISTORY_SUMMARY_SYSTEM_PROMPT = `You summarize operation history for a mobile GUI automation agent.

You will receive a history of interactions between the GUI Agent and the phone. Each record represents one loop and may include:
- loop number
- channel marker, where [GUI] means visual mode
- Summary: operation summary
- Thought: reasoning
- Action: executed action

Condense the history into a concise English narrative of about 100 words.

Requirements:
1. Describe what the Agent did in chronological order, including opened apps, visited pages, key actions, and typed content.
2. Omit repetitive screenshot or wait steps unless they affected progress.
3. Briefly mention repeated actions or stuck behavior when present.
4. Use compact prose, not lists or Markdown.
5. Do not judge whether the overall task is complete; only describe executed actions.

Output:
Return only the summary text. Do not include any prefix or label.`;

const MESSAGE_HISTORY_LIMIT = 50;
const UNSUMMARIZED_LOOP_THRESHOLD = 50;
const INTERVAL_FALLBACK = 80;

function shouldTriggerSummary(
	exec: ExecutorInternalState,
): { trigger: boolean; reason: string } {
	if (
		exec.lastSummarizedAppName &&
		exec.currentAppName &&
		exec.currentAppName !== exec.lastSummarizedAppName
	) {
		return { trigger: true, reason: "app_switch" };
	}
	if (exec.loopCount - exec.lastSummarizedLoopCount > UNSUMMARIZED_LOOP_THRESHOLD) {
		return { trigger: true, reason: "message_count" };
	}
	if (exec.loopCount > 0 && exec.loopCount % INTERVAL_FALLBACK === 0) {
		return { trigger: true, reason: "interval" };
	}
	return { trigger: false, reason: "" };
}

/**
 *
 */
function serializeSemanticHistory(
	records: SemanticRecord[],
	limit: number,
): string {
	const recent = records
		.slice(-limit)
		.filter((r) => r.summary || r.thought || r.action);
	return recent
		.map((r) => {
			const prefix = r.channel === "gui" ? "[GUI] " : "";
			const parts = [
				r.summary && `Summary: ${r.summary}`,
				r.thought && `Thought: ${r.thought}`,
				r.action && `Action: ${r.action}`,
			].filter(Boolean);
				return `[Loop ${r.loopIndex}] ${prefix}${parts.join("\n")}`;
		})
		.join("\n");
}

// ============================================================

// ============================================================

/**
 *
 *
 */
export function createPostExecuteNode(
	executionGateway: ExecutionGateway,
	configProvider: AgentConfigProvider,
) {
	return async (
		state: AgentState,
		config?: RunnableConfig,
	): Promise<Partial<AgentState>> => {
		const exec = state.executor;
		const parsed = exec.parsedPrediction;
		const signal = config?.signal;


		if (state.isCancelled) {
			logger.log("Task cancelled by user, skipping post-execute, exiting");
			return {
				executor: { status: "finished" },
			} as Partial<AgentState>;
		}

		// ============================================================

		// ============================================================


		const summaryText = parsed?.summary || parsed?.thought;
		if (summaryText) {
			executionGateway.sendAgentEvent(state.taskExecutionId, {
				type: AgentEventType.GUI_ACTION_THOUGHT,
				taskExecutionId: state.taskExecutionId,
				from: AgentEventSource.EXECUTOR,
				content: summaryText,
			});
		}


		const currentAction: ParsedActionRecord = {
			action_type: parsed?.action_type || "",
			start_coords: parsed?.action_inputs?.start_coords || [],
		};
		const isPassive = PASSIVE_ACTIONS.has(currentAction.action_type);


		const semanticActions = (exec.semanticHistory || [])
			.filter((r) => r.parsedAction != null)
			.map((r) => r.parsedAction!);
		const updatedRecentActions = [
			...semanticActions.slice(-(ACTION_WINDOW_SIZE - 1)),
			...(currentAction.action_type ? [currentAction] : []),
		].slice(-ACTION_WINDOW_SIZE);


		const repetitionResult = currentAction.action_type
			? detectActionRepetition(updatedRecentActions)
			: { detected: false, reason: null as string | null };


		const cycleResult = currentAction.action_type
			? detectActionCycle(updatedRecentActions)
			: { detected: false, reason: null as string | null };

		const consecutiveScrollResult = currentAction.action_type
			? detectConsecutiveActionType(
					updatedRecentActions,
					"scroll",
					CONSECUTIVE_SCROLL_EXIT_THRESHOLD,
				)
			: { detected: false, reason: null as string | null };


		let screenshotResult = { detected: false, reason: null as string | null };
		let screenshotCycleResult = { detected: false, reason: null as string | null };
		let updatedHashes = exec.recentScreenshotHashes;

		if (exec.currentScreenshotHash) {
			updatedHashes = [
				...exec.recentScreenshotHashes.slice(-(SCREENSHOT_HASH_STORE_SIZE - 1)),
				exec.currentScreenshotHash,
			];
			screenshotResult = detectScreenshotAnomaly(updatedHashes, isPassive);
			screenshotCycleResult = detectScreenshotCycle(updatedHashes, isPassive);
		}


		const anomalyDetected =
			repetitionResult.detected ||
			cycleResult.detected ||
			consecutiveScrollResult.detected ||
			screenshotResult.detected ||
			screenshotCycleResult.detected;
		const anomalyReason =
			[
				repetitionResult.reason,
				cycleResult.reason,
				consecutiveScrollResult.reason,
				screenshotResult.reason,
				screenshotCycleResult.reason,
			]
				.filter(Boolean)
				.join("; ") || null;

		if (anomalyDetected) {
			logger.warn(`Anomaly detected at loop ${exec.loopCount}: ${anomalyReason}`);
		}


		const anomalyUpdate: Partial<AgentState["executor"]> = {
			recentActions: updatedRecentActions,
			recentScreenshotHashes: updatedHashes,
			...(anomalyDetected && {
				needRemind: true,
				remindReason: anomalyReason,
			}),
			executionMetrics: {
				anomalyDetectionCount: anomalyDetected ? 1 : 0,
			},
		};

		// ============================================================

		// ============================================================

		let summaryUpdate: Partial<AgentState> = {};


		const collected = completedSummaries.get(state.taskExecutionId);
		if (collected?.length) {
			summaryUpdate = { actionSummaryList: collected };
			completedSummaries.delete(state.taskExecutionId);
			logger.log(`Collected ${collected.length} async history summaries`);
		}

		const { trigger, reason } = shouldTriggerSummary(exec);
		if (trigger && !signal?.aborted) {
			logger.log(`History summary triggered at loop ${exec.loopCount} (reason: ${reason}), scheduling async`);


			summaryUpdate = {
				...summaryUpdate,
				executor: {
					lastSummarizedLoopCount: exec.loopCount,
					lastSummarizedAppName: exec.currentAppName,
				},
			} as Partial<AgentState>;


			const execId = state.taskExecutionId;
			const messageHistory = serializeSemanticHistory(
				exec.semanticHistory || [],
				MESSAGE_HISTORY_LIMIT,
			);

			if (!messageHistory) {
				logger.log("Skipping summary: no semantic history to summarize");
			} else {
				const instruction = state.executorInput?.instruction || "";
				const loopCountSnapshot = exec.loopCount;
				const region = state.userRegion;
				const generation = getSummaryGeneration(execId);

				void (async () => {
					try {
						const modelConfig = await configProvider.getModelConfig(
							AgentName.ACTION_SUMMARIZER,
							region,
						);

						const primaryModel = createConfiguredChatModel(modelConfig, {
							maxTokens: 512,
							temperature: modelConfig.temperature,
							maxRetries: 3,
							timeout: 15000,
						});

						const response = await primaryModel.invoke([
							{
								role: "system",
								content: modelConfig.systemPrompt || HISTORY_SUMMARY_SYSTEM_PROMPT,
							},
							{
								role: "user",
									content: `User task: ${instruction}\n\nCompleted ${loopCountSnapshot} loops so far\n\nOperation history:\n${messageHistory}`,
							},
						]);

						const summary =
							typeof response.content === "string" ? response.content : "";

						if (summary) {

							if (getSummaryGeneration(execId) !== generation) {
								logger.log(
									`Discarding stale async summary (gen ${generation}) at loop ${loopCountSnapshot}`,
								);
								return;
							}
							const existing = completedSummaries.get(execId) || [];
							existing.push(summary);
							completedSummaries.set(execId, existing);
							logger.log(
								`Async history summary ready (${summary.length} chars) at loop ${loopCountSnapshot} (reason: ${reason})`,
							);
						}
					} catch (err) {
						logger.warn(`Async history summary failed: ${(err as Error).message}`);
					}
				})();
			}
		}

		// ============================================================

		// ============================================================

		const { loopCount, status } = exec;
		const maxLoopCount = VLM_AGENT_DEFAULTS.MAX_LOOP_COUNT;

		logger.log(
			`Post-execute: loop=${loopCount}/${maxLoopCount}, status=${status}, isCancelled=${state.isCancelled}`,
		);

		let loopUpdate: Partial<AgentState["executor"]> = {};

		if (status !== "running") {

		} else if (consecutiveScrollResult.detected) {
			logger.warn("Consecutive scroll limit reached, exiting executor for replanning");
				loopUpdate = {
					status: "error",
					errorMessage:
						`${consecutiveScrollResult.reason}. Try another path, such as open_app, tapping a home-screen folder, using the app-list search box to enter the target app name, or searching in another direction.`,
				};
		} else if (loopCount >= maxLoopCount) {
			logger.warn("Max loop count reached");
				loopUpdate = {
					status: "error",
					errorMessage: `Reached maximum loop count ${maxLoopCount}`,
				};
		}

		// ============================================================

		// ============================================================

		const summaryExecutor = (summaryUpdate as any).executor || {};

		return {
			...summaryUpdate,
			executor: {
				...anomalyUpdate,
				...summaryExecutor,
				...loopUpdate,
			},
		} as Partial<AgentState>;
	};
}
