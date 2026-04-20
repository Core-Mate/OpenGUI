import { ChatAnthropic } from "@langchain/anthropic";
import { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import {
	AgentEventSource,
	AgentEventType,
} from "../../../../../common/base/enum";
import { ExecutionGateway } from "../../../../../common/ws";
import type { AgentConfigProvider } from "../../../config/agent-config.provider";
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

/** 异步历史摘要结果缓存：executionId → 已完成的摘要列表 */
const completedSummaries = new Map<number, string[]>();

/** 异步摘要 generation 标记：executionId → 当前有效 generation */
const summaryGenerations = new Map<number, number>();

/** 获取当前有效的 generation（不存在则初始化为 0） */
export function getSummaryGeneration(executionId: number): number {
	return summaryGenerations.get(executionId) ?? 0;
}

/** 清理指定执行的异步摘要缓存并递增 generation（使旧异步任务失效） */
export function clearCompletedSummaries(executionId: number): void {
	completedSummaries.delete(executionId);
	summaryGenerations.set(executionId, (summaryGenerations.get(executionId) ?? 0) + 1);
}

// ============================================================
// Part 1: 异常检测常量 + 算法
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
			reason: `连续 ${ACTION_REPETITION_THRESHOLD} 次执行相似操作 ${first.action_type}，可能陷入死循环`,
		};
	}
	return { detected: false, reason: null };
}

function isSimilarAction(a: ParsedActionRecord, b: ParsedActionRecord): boolean {
	if (a.action_type !== b.action_type) return false;
	// 坐标缺失 → 按 action_type 判定，但被动动作（scroll/press_back 等）排除
	if (a.start_coords.length !== 2 || b.start_coords.length !== 2) {
		return !PASSIVE_ACTIONS.has(a.action_type);
	}
	const dist =
		Math.abs(a.start_coords[0] - b.start_coords[0]) +
		Math.abs(a.start_coords[1] - b.start_coords[1]);
	return dist <= COORD_SIMILARITY_THRESHOLD;
}

/**
 * 严格动作相似比较（包含被动动作），用于循环模式检测。
 * 与 isSimilarAction 的区别：不排除 scroll 等被动动作。
 */
function isSimilarActionStrict(a: ParsedActionRecord, b: ParsedActionRecord): boolean {
	if (a.action_type !== b.action_type) return false;
	if (a.start_coords.length !== 2 || b.start_coords.length !== 2) {
		return true; // 同类型、无坐标 → 视为相同
	}
	const dist =
		Math.abs(a.start_coords[0] - b.start_coords[0]) +
		Math.abs(a.start_coords[1] - b.start_coords[1]);
	return dist <= COORD_SIMILARITY_THRESHOLD;
}

/**
 * 检测动作循环模式（如 click→scroll→click→scroll 交替循环）
 *
 * 检测周期长度 2~MAX_CYCLE_LENGTH 的循环，需至少重复 CYCLE_MIN_REPETITIONS 次。
 * 典型场景：打开评论区 → 下滑关闭 → 打开评论区 → 下滑关闭 ...
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

		// 确保循环包含至少 2 种不同的动作类型（单一类型重复由 detectActionRepetition 处理）
		const cycleTypes = new Set(tail.slice(0, cycleLen).map((a) => a.action_type));
		if (cycleTypes.size < 2) continue;

		const cycleDesc = tail
			.slice(0, cycleLen)
			.map((a) => a.action_type)
			.join(" → ");
		return {
			detected: true,
			reason: `检测到 ${cycleLen} 步循环模式重复 ${CYCLE_MIN_REPETITIONS} 次（${cycleDesc}），可能陷入死循环`,
		};
	}
	return { detected: false, reason: null };
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
			reason: `连续 ${SCREENSHOT_CONSECUTIVE_WINDOW} 次截图完全相同，页面未响应操作`,
		};
	}

	const allSimilar = recent.every(
		(h) => hammingDistance(first, h) <= HASH_SIMILARITY_THRESHOLD,
	);
	if (allSimilar && !isPassiveAction) {
		return {
			detected: true,
			reason: `连续 ${SCREENSHOT_CONSECUTIVE_WINDOW} 次截图高度相似，可能陷入循环`,
		};
	}

	return { detected: false, reason: null };
}

/**
 * 检测截图交替循环模式（A-B-A-B）
 *
 * 页面在两个不同状态间反复切换时，连续截图不会相似，但隔一张的截图会相似。
 * 典型场景：评论区打开→关闭→打开→关闭，截图交替出现视频页和评论页。
 */
export function detectScreenshotCycle(
	recentHashes: string[],
	isPassiveAction: boolean,
): { detected: boolean; reason: string | null } {
	if (isPassiveAction || recentHashes.length < SCREENSHOT_CYCLE_WINDOW) {
		return { detected: false, reason: null };
	}

	const recent = recentHashes.slice(-SCREENSHOT_CYCLE_WINDOW);

	// 检测周期 2：偶数位截图相似、奇数位截图相似、偶奇之间不相似
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
			reason: "截图呈现交替重复模式（A-B-A-B），页面在两个状态间反复切换",
		};
	}

	return { detected: false, reason: null };
}

// ============================================================
// Part 2: 历史摘要常量 + 触发条件
// ============================================================

const HISTORY_SUMMARY_SYSTEM_PROMPT = `你是一个移动端 GUI 自动化任务的操作历史总结助手。

你会收到一段 GUI Agent 与手机交互的操作历史。每条记录对应一轮操作，包含：
- 轮次编号（[第N轮]）
- 通道标识（[GUI] 表示视觉模式，无标识表示无障碍模式）
- Summary: 操作摘要
- Thought: 思考过程
- Action: 执行的具体动作

你的任务是将这段操作历史浓缩为一段简明的中文叙述，100 字左右。

【要求】
1. 按时间顺序描述 Agent 做了什么，重点记录：打开了哪些应用、进入了哪些页面、执行了哪些关键操作、输入了什么内容
2. 省略重复的截图/等待步骤，只保留有实质推进的动作
3. 如果 Agent 出现了反复操作或卡住的情况，简要指出
4. 使用紧凑的叙述体，不要用列表或 Markdown 格式
5. 不要评价任务是否完成，只客观描述已执行的操作

【输出】
直接输出总结文本，不要包含任何前缀或标签。`;

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
 * 从 semanticHistory 构建紧凑的操作历史文本（给 Summarizer 用）
 *
 * 相比 serializeMessages，避免了每条 Human 消息重复嵌入 instruction + action_history
 * 导致的 O(n²) token 增长问题。
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
			return `[第${r.loopIndex}轮] ${prefix}${parts.join("\n")}`;
		})
		.join("\n");
}

// ============================================================
// POST_EXECUTE 节点工厂
// ============================================================

/**
 * 创建 POST_EXECUTE 合并节点
 *
 * 合并三段逻辑顺序执行：
 * 1. 异常检测（原 anomaly_detect）
 * 2. 历史摘要（原 history_summary）
 * 3. 循环控制（原 check_loop）
 *
 * @param executionGateway 执行网关（发送 SSE 事件）
 * @param configProvider 配置提供者（历史摘要模型配置）
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

		// 快速短路：已取消的任务跳过异常检测和历史摘要
		if (state.isCancelled) {
			logger.log("Task cancelled by user, skipping post-execute, exiting");
			return {
				executor: { status: "finished" },
			} as Partial<AgentState>;
		}

		// ============================================================
		// Part 1: 异常检测
		// ============================================================

		// 发送 SSE 事件
		const summaryText = parsed?.summary || parsed?.thought;
		if (summaryText) {
			executionGateway.sendAgentEvent(state.taskExecutionId, {
				type: AgentEventType.GUI_ACTION_THOUGHT,
				taskExecutionId: state.taskExecutionId,
				from: AgentEventSource.EXECUTOR,
				content: summaryText,
			});
		}

		// 构建当前动作记录
		const currentAction: ParsedActionRecord = {
			action_type: parsed?.action_type || "",
			start_coords: parsed?.action_inputs?.start_coords || [],
		};
		const isPassive = PASSIVE_ACTIONS.has(currentAction.action_type);

		// 更新动作滑动窗口（从 semanticHistory 衍生，跨通道共享）
		const semanticActions = (exec.semanticHistory || [])
			.filter((r) => r.parsedAction != null)
			.map((r) => r.parsedAction!);
		const updatedRecentActions = [
			...semanticActions.slice(-(ACTION_WINDOW_SIZE - 1)),
			...(currentAction.action_type ? [currentAction] : []),
		].slice(-ACTION_WINDOW_SIZE);

		// 动作重复检测（仅在本轮有有效动作时触发）
		const repetitionResult = currentAction.action_type
			? detectActionRepetition(updatedRecentActions)
			: { detected: false, reason: null as string | null };

		// 动作循环模式检测（如 click→scroll→click→scroll 交替）
		const cycleResult = currentAction.action_type
			? detectActionCycle(updatedRecentActions)
			: { detected: false, reason: null as string | null };

		// 截图 pHash 检测（读取 sense 节点预计算的 hash）
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

		// 合并检测结果
		const anomalyDetected =
			repetitionResult.detected ||
			cycleResult.detected ||
			screenshotResult.detected ||
			screenshotCycleResult.detected;
		const anomalyReason =
			[
				repetitionResult.reason,
				cycleResult.reason,
				screenshotResult.reason,
				screenshotCycleResult.reason,
			]
				.filter(Boolean)
				.join("; ") || null;

		if (anomalyDetected) {
			logger.warn(`Anomaly detected at loop ${exec.loopCount}: ${anomalyReason}`);
		}

		// 异常检测结果
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
		// Part 2: 历史摘要（异步生成，不阻塞主循环）
		// ============================================================

		let summaryUpdate: Partial<AgentState> = {};

		// 收集之前完成的异步摘要
		const collected = completedSummaries.get(state.taskExecutionId);
		if (collected?.length) {
			summaryUpdate = { actionSummaryList: collected };
			completedSummaries.delete(state.taskExecutionId);
			logger.log(`Collected ${collected.length} async history summaries`);
		}

		const { trigger, reason } = shouldTriggerSummary(exec);
		if (trigger && !signal?.aborted) {
			logger.log(`History summary triggered at loop ${exec.loopCount} (reason: ${reason}), scheduling async`);

			// 立即更新 lastSummarized 标记，防止重复触发
			summaryUpdate = {
				...summaryUpdate,
				executor: {
					lastSummarizedLoopCount: exec.loopCount,
					lastSummarizedAppName: exec.currentAppName,
				},
			} as Partial<AgentState>;

			// Fire-and-forget：不阻塞主循环
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

						const primaryModel = new ChatAnthropic({
							model: modelConfig.model,
							apiKey: modelConfig.apiKey,
							maxTokens: 512,
							temperature: modelConfig.temperature,
							clientOptions: {
								baseURL: modelConfig.baseURL,
								maxRetries: 3,
								timeout: 15000,
								authToken: null,
							},
						});

						const response = await primaryModel.invoke([
							{
								role: "system",
								content: modelConfig.systemPrompt || HISTORY_SUMMARY_SYSTEM_PROMPT,
							},
							{
								role: "user",
								content: `用户任务: ${instruction}\n\n当前已执行 ${loopCountSnapshot} 轮\n\n操作历史:\n${messageHistory}`,
							},
						]);

						const summary =
							typeof response.content === "string" ? response.content : "";

						if (summary) {
							// 写入前检查 generation 是否仍有效（resume/cancel 会递增 generation 使旧任务失效）
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
		// Part 3: 循环控制
		// ============================================================

		const { loopCount, status } = exec;
		const maxLoopCount = VLM_AGENT_DEFAULTS.MAX_LOOP_COUNT;

		logger.log(
			`Post-execute: loop=${loopCount}/${maxLoopCount}, status=${status}, isCancelled=${state.isCancelled}`,
		);

		let loopUpdate: Partial<AgentState["executor"]> = {};

		if (status !== "running") {
			// 非 running 状态，保持当前状态
		} else if (loopCount >= maxLoopCount) {
			logger.warn("Max loop count reached");
			loopUpdate = {
				status: "error",
				errorMessage: `达到最大循环次数 ${maxLoopCount}`,
			};
		}

		// ============================================================
		// 合并所有更新
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
