import { BaseMessage } from "@langchain/core/messages";
import {
	StateSchema,
	ReducedValue,
	MessagesValue,
	messagesStateReducer,
} from "@langchain/langgraph";
import { z } from "zod";
import type { SkillDTO } from "../../skill/skill.types";
import type { ExecutorError } from "../utils/error-classification";
import {
	type ExecutionMetrics,
	DEFAULT_EXECUTION_METRICS,
	mergeMetrics,
} from "../utils/execution-metrics";

/**
 * GUI Agent 运行状态
 */
export type ExecutorStatus =
	| "running"
	| "finished"
	| "error"
	| "call_user"
	| "paused"
	| "cancelled";

/**
 * 解析后的预测结果
 */
export type Coords = [number, number] | [];

export type ActionInputs = Partial<{
	start_coords?: Coords;
	end_coords?: Coords;
	content?: string;
	app_name?: string;
	direction?: string;
}>;

export interface PredictionParsed {
	/** `<action_inputs>` parsed from action_type(`action_inputs`) */
	action_inputs: ActionInputs;
	/** `<reflection>` parsed from Reflection: `<reflection>` */
	reflection: string | null;
	/** `<action_type>` parsed from `<action_type>`(action_inputs) */
	action_type: string;
	/** `<thought>` parsed from Thought: `<thought>` */
	thought: string;
	/** `<summary>` parsed from Summary: `<summary>` — 当前操作的简短摘要 */
	summary: string | null;
}

/**
 * 异常检测用的动作记录（轻量级）
 */
export interface ParsedActionRecord {
	action_type: string;
	start_coords: Coords;
}

/**
 * 统一语义历史记录（跨通道共享推理链）
 */
export interface SemanticRecord {
	/** 该步使用的感知通道 */
	channel: "gui";
	/** 循环序号 */
	loopIndex: number;
	/** 时间戳 */
	timestamp: string;
	/** 模型推理输出 */
	summary: string;
	thought: string;
	action: string;
	/** 解析后的动作（用于异常检测衍生） */
	parsedAction: ParsedActionRecord | null;
	/** 当前 APP 名称 */
	appName: string;
	/** 截图 TOS key（仅 channel=gui） */
	screenshotKey?: string;
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

/**
 * Supervisor Todo 项（用于 write_todos 工具持久化）
 */
export interface SupervisorTodo {
	/** 任务内容 */
	content: string;
	/** 任务状态 */
	status: "pending" | "in_progress" | "completed" | "failed";
	/** 执行此任务所需的 Skill 名称列表（可选） */
	required_skills?: string[];
}

/**
 * Executor 输入 (父图 → 子图)
 */
export interface ExecutorInput {
	/** 要执行的指令 */
	instruction: string;
	/** Plan Supervisor 选择的技能列表（可选） */
	skills?: SkillDTO[];
	/** Task 级别长期记忆上下文（可选） */
	memory?: string;
}

/**
 * Executor 输出 (子图 → 父图)
 */
export interface ExecutorOutput {
	/** 执行是否成功 */
	success: boolean;
	/** 执行的任务描述 */
	task: string;
	/** 失败原因 */
	fail_reason?: string;
	/** 执行过程中收集的备注 */
	notes?: string;
}

/**
 * Executor 内部状态 (子图专属，命名空间隔离)
 *
 * 使用 sharedMessages 历史（不含 SystemMessage）。
 * 调用时 model 节点做运行时适配，prepend SystemMessage。
 */
export interface ExecutorInternalState {
	// === 截图相关 ===
	/** 截图 URI (TOS key) */
	screenshotUri: string;
	/** 屏幕宽度 */
	screenWidth: number;
	/** 屏幕高度 */
	screenHeight: number;
	currentAppName: string;

	// === 预测相关 ===
	/** 当前预测文本 */
	currentPrediction: string;
	/** 解析后的预测结果 */
	parsedPrediction: PredictionParsed | null;

	// === 循环控制 ===
	/** 当前循环次数 */
	loopCount: number;
	/** 是否需要跳出循环（陷入死循环或者任务偏离） */
	needRemind: boolean;
	/** 跳出循环的原因 */
	remindReason: string | null;

	// === 执行状态 ===
	/** 当前状态 */
	status: ExecutorStatus;
	/** 错误信息 */
	errorMessage: string;
	/** 结构化错误（统一错误分类） */
	lastError: ExecutorError | null;
	/** call_user 时的思考内容 */
	callUserThought: string;

	// === 共享消息历史 (不含 SystemMessage，仅 Human/AI) ===
	/** A11Y 和 VLM 共享的对话历史，model 节点调用时各自 prepend SystemMessage */
	sharedMessages: BaseMessage[];

	// === System Prompt 模板 (entry.node 构建，model 节点消费) ===
	/** VLM 的 system prompt 文本 */
	guiSystemPrompt: string;

	// === Token 统计 ===
	/** 子图内 token 消耗 */
	totalTokens: number;

	// === 执行指标 ===
	/** 结构化执行指标（各节点可提供 Partial 更新，reducer 逐字段累加合并） */
	executionMetrics: Partial<ExecutionMetrics>;

	// === 异常检测 ===
	/** 最近动作的滑动窗口（用于重复检测） */
	recentActions: ParsedActionRecord[];
	/** 最近截图的 pHash 列表（用于相似截图检测） */
	recentScreenshotHashes: string[];
	/** 当前截图的 pHash（由 sense 节点计算，anomaly-detect 读取） */
	currentScreenshotHash: string;

	// === 图像 URL 刷新 ===
	/** Fork resume 后需要刷新图片 URL（TOS 签名可能过期） */
	needRefreshImageUrls: boolean;

	// === 通道路由 ===
	/** 当前活跃通道 (GUI only in open-source release) */
	currentChannel: "gui";

	// === 历史摘要 ===
	/** 上次生成摘要时的 loopCount */
	lastSummarizedLoopCount: number;
	/** 上次生成摘要时的 appName */
	lastSummarizedAppName: string;

	// === 重置标志 ===
	/** 显式重置信号：entry.node 正常入口设为 true，reducer 检测后执行全量重置并剔除此字段 */
	_reset?: boolean;

	// === 语义历史（仅用于异常检测） ===
	/** 跨通道语义历史（每步记录 channel + summary + thought + action） */
	semanticHistory: SemanticRecord[];
}

/**
 * ExecutorInternalState 默认值
 */
const DEFAULT_EXECUTOR_INTERNAL_STATE: ExecutorInternalState = {
	remindReason: "",
	needRemind: false,
	screenHeight: 0,
	screenWidth: 0,
	screenshotUri: "",
	currentAppName: "",
	currentPrediction: "",
	parsedPrediction: null,
	loopCount: 0,
	status: "running",
	errorMessage: "",
	lastError: null,
	callUserThought: "",
	sharedMessages: [],
	guiSystemPrompt: "",
	totalTokens: 0,
	executionMetrics: { ...DEFAULT_EXECUTION_METRICS },
	lastSummarizedLoopCount: 0,
	lastSummarizedAppName: "",
	recentActions: [],
	recentScreenshotHashes: [],
	currentScreenshotHash: "",
	needRefreshImageUrls: false,
	currentChannel: "gui" as const,
	semanticHistory: [],
};

/**
 * Executor 子图字段（供父图组合使用）
 *
 * 重置机制：
 * - entry.node 正常入口设置 _reset: true 触发重置
 * - 此时 messages 和 totalTokens 会被直接替换而非累加
 * - _reset 字段在重置后被剔除，不持久到状态中
 * - 这确保每次进入 executor subgraph 时都是全新的上下文
 */
const executorStateFields = {
	executorInput: z.custom<ExecutorInput>(),
	executorOutput: z.custom<ExecutorOutput>(),
	executor: new ReducedValue(
		z
			.custom<ExecutorInternalState>()
			.default(() => ({ ...DEFAULT_EXECUTOR_INTERNAL_STATE })),
		{
			reducer: (
				current: ExecutorInternalState,
				update: ExecutorInternalState,
			) => {
				if (update == null) {
					return current;
				}

				// 检测显式重置信号：entry.node 正常入口设置 _reset: true
				const isReset = update._reset === true;

				if (isReset) {
					const { _reset, ...cleanUpdate } = update;
					return {
						...DEFAULT_EXECUTOR_INTERNAL_STATE,
						...cleanUpdate,
						sharedMessages: cleanUpdate.sharedMessages ?? [],
						totalTokens: cleanUpdate.totalTokens ?? 0,
						semanticHistory: cleanUpdate.semanticHistory ?? [],
					};
				}

				// 正常合并逻辑（subgraph 内部循环时使用）
				const mergedMessages =
					update.sharedMessages !== undefined
						? messagesStateReducer(
								current.sharedMessages,
								update.sharedMessages,
							)
						: current.sharedMessages;

				// 滑动窗口上限保护（精细窗口由 model 节点在调用时构建）
				const windowSize = VLM_AGENT_DEFAULTS.MESSAGE_WINDOW_SIZE;
				const finalMessages =
					mergedMessages.length > windowSize
						? mergedMessages.slice(-windowSize)
						: mergedMessages;

				// semanticHistory append 合并
				const mergedSemanticHistory =
					update.semanticHistory !== undefined
						? [...current.semanticHistory, ...update.semanticHistory]
						: current.semanticHistory;

				const semanticWindowSize = VLM_AGENT_DEFAULTS.SEMANTIC_HISTORY_WINDOW_SIZE;
				const finalSemanticHistory =
					mergedSemanticHistory.length > semanticWindowSize
						? mergedSemanticHistory.slice(-semanticWindowSize)
						: mergedSemanticHistory;

				return {
					...current,
					...update,
					sharedMessages: finalMessages,
					semanticHistory: finalSemanticHistory,
					totalTokens: current.totalTokens + (update.totalTokens || 0),
					executionMetrics: update.executionMetrics
						? mergeMetrics(
								{
									...DEFAULT_EXECUTION_METRICS,
									...current.executionMetrics,
								},
								update.executionMetrics,
							)
						: current.executionMetrics,
				};
			},
		},
	),
};

export const ExecutorStateSchema = new StateSchema(executorStateFields);

/**
 * 统一 Agent 状态 Schema
 *
 * 支持父图和子图共享状态，子图可直接作为节点添加
 * 使用 executorStateFields 组合 Executor 字段
 */
export const AgentStateSchema = new StateSchema({
	// === 任务基本信息 ===
	userId: z.custom<number>(),
	taskId: z.custom<number>(),
	taskExecutionId: z.custom<number>(),
	userInput: z.custom<string>(),
	/** 用户地区 (CN/US) */
	userRegion: z.custom<string>(),
	/** 用户所属租户 ID（从 users.tenant_id 获取，-1 表示无租户） */
	tenantId: z.custom<number>(),

	// === 消息历史 (父图级别) ===
	messages: MessagesValue,
	plannerMessages: MessagesValue,

	// === Supervisor 输出 ===
	/** Supervisor 每轮流式输出文本（用于 fallback_extract 节点解析） */
	supervisorStreamOutput: z.string().default(""),

	// === extract_todo 节点结果 ===
	/** extract_todo 是否成功提取到待执行 todo */
	todoFound: z.boolean().default(false),

	// === Planner 所有待办都已完成 ===
	planTodoComplete: z.custom<boolean>(),

	// === Plan Generator / Supervisor 输出 ===
	/** 计划文档 (Markdown 格式)，supervisor 首次调用时设置 */
	planDocument: z.string().default(""),

	// === Executor Sub Graph (组合) ===
	...executorStateFields,

	// === 中断状态 ===
	interruptReason: z.custom<string | null>(),
	isCancelled: z.custom<boolean>(),
	isPaused: z.custom<boolean>(),

	// === Supervisor 错误标记 ===
	/** Supervisor 节点是否发生不可恢复错误（LLM 调用失败等），用于路由到 summarizer 生成补救总结 */
	supervisorError: z.boolean().default(false),

	// === Executor 进入标记 ===
	/** 是否进入过 executor 子图（用于取消时判断是否需要跳转 summarizer） */
	executorEntered: z.custom<boolean>(),

	// === summarizer 输出的最终总结 ===
	/** 最终总结，使用显式 reducer 避免并发更新时的 LastValue 冲突 */
	finalSummary: new ReducedValue(
		z.string().nullable().default(null),
		{
			reducer: (current: string | null, update: string | null) =>
				update ?? current,
		},
	),

	// 每 50 轮总结一次，记录下来用于最终总结
	actionSummaryList: new ReducedValue(
		z.array(z.string()).default(() => []),
		{
			reducer: (current: string[], update: string[]) => [
				...current,
				...update,
			],
		},
	),

	// === 元数据 ===
	tokenUsage: z.custom<TokenUsage>(),
	startTime: z.custom<number>(),

	// === Fork 执行相关 ===
	/** 原始执行 ID（用于 fork 场景，summarizer 会读取原执行的 summary 进行综合） */
	originExecutionId: z.custom<number | null>(),
	/** Fork Resume 标志：entry 节点检测后清除，指示保留 executor 状态继续执行 */
	forkResume: z.custom<boolean>(),
});

export type AgentState = typeof AgentStateSchema.State;

/** @deprecated 使用 AgentStateSchema 替代 */
export const AgentStateAnnotation = AgentStateSchema;
/** @deprecated 使用 ExecutorStateSchema 替代 */
export const ExecutorStateAnnotation = ExecutorStateSchema;

/** VLM Agent 默认配置 */
export const VLM_AGENT_DEFAULTS = {
	MAX_LOOP_COUNT: 500,
	MESSAGE_WINDOW_SIZE: 100,
	/** VLM 调用时的消息窗口（不含图片占位消息） */
	VLM_MODEL_WINDOW_SIZE: 10,
	/** VLM 调用时保留的截图数量 */
	VLM_IMAGE_WINDOW_SIZE: 3,
	SEMANTIC_HISTORY_WINDOW_SIZE: 100,
	DEFAULT_SCALE_FACTOR: 1,
} as const;
