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
 * GUI Agent runtime status.
 */
export type ExecutorStatus =
	| "running"
	| "finished"
	| "error"
	| "call_user"
	| "paused"
	| "cancelled";

/**
 * Parsed prediction result.
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
	/** `<summary>` parsed from Summary: `<summary>`; a short summary of the current action. */
	summary: string | null;
}

/**
 * Lightweight action record for anomaly detection.
 */
export interface ParsedActionRecord {
	action_type: string;
	start_coords: Coords;
}

/**
 * Unified semantic history shared across reasoning chains.
 */
export interface SemanticRecord {
	/** Perception channel used by this step. */
	channel: "gui";
	/** Loop index. */
	loopIndex: number;
	/** Timestamp. */
	timestamp: string;
	/** Model reasoning output. */
	summary: string;
	thought: string;
	action: string;
	/** Parsed action used by anomaly detection. */
	parsedAction: ParsedActionRecord | null;
	/** Current app name. */
	appName: string;
	/** Screenshot TOS key for GUI channel. */
	screenshotKey?: string;
}

/**
 * Token usage.
 */
export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

/**
 * Supervisor todo item persisted by the write_todos tool.
 */
export interface SupervisorTodo {
	/** Todo content. */
	content: string;
	/** Todo status. */
	status: "pending" | "in_progress" | "completed" | "failed";
	/** Terminal result required for completed, failed, or refused todos. */
	result?: "success" | "failure" | "refused";
	/** Optional list of Skill names required to execute this todo. */
	required_skills?: string[];
}

/**
 * Executor input from parent graph to subgraph.
 */
export interface ExecutorInput {
	/** Instruction to execute. */
	instruction: string;
	/** Optional skills selected by Plan Supervisor. */
	skills?: SkillDTO[];
	/** Optional task-level long-term memory context. */
	memory?: string;
}

/**
 * Executor output from subgraph to parent graph.
 */
export interface ExecutorOutput {
	/** Execution success flag. */
	success: boolean;
	/** Executed task description. */
	task: string;
	/** Failure reason. */
	fail_reason?: string;
	/** Notes collected during execution. */
	notes?: string;
}

/**
 * Executor internal state, scoped to the subgraph namespace.
 *
 * Uses sharedMessages history without SystemMessage.
 * Model nodes adapt at runtime and prepend their own SystemMessage.
 */
export interface ExecutorInternalState {
	// === Screenshot ===
	/** Screenshot URI (TOS key). */
	screenshotUri: string;
	/** Screen width. */
	screenWidth: number;
	/** Screen height. */
	screenHeight: number;
	currentAppName: string;

	// === Prediction ===
	/** Current prediction text. */
	currentPrediction: string;
	/** Parsed prediction result. */
	parsedPrediction: PredictionParsed | null;

	// === Loop Control ===
	/** Current loop count. */
	loopCount: number;
	/** Whether execution should break out because it is looping or off-task. */
	needRemind: boolean;
	/** Reason for breaking out of the loop. */
	remindReason: string | null;

	// === Execution status ===
	/** Current status. */
	status: ExecutorStatus;
	/** Error message */
	errorMessage: string;
	/** Structured error using the unified error taxonomy. */
	lastError: ExecutorError | null;
	/** Thought content when calling the user. */
	callUserThought: string;

	// === Shared Message History (Human/AI only, no SystemMessage) ===
	/** Shared dialog history; model nodes prepend their own SystemMessage at runtime. */
	sharedMessages: BaseMessage[];

	// === System Prompt Template ===
	/** VLM system prompt text built by entry.node and consumed by model nodes. */
	guiSystemPrompt: string;

	// === Token Usage ===
	/** Token usage inside the subgraph. */
	totalTokens: number;

	// === Execution Metrics ===
	/** Structured execution metrics; reducers merge partial updates field by field. */
	executionMetrics: Partial<ExecutionMetrics>;

	// === Anomaly Detection ===
	/** Sliding window of recent actions for repetition detection. */
	recentActions: ParsedActionRecord[];
	/** Recent screenshot pHash list for similar-screenshot detection. */
	recentScreenshotHashes: string[];
	/** Current screenshot pHash computed by sense node and read by anomaly detection. */
	currentScreenshotHash: string;

	// === Image URL Refresh ===
	/** Refresh image URLs after fork resume because TOS signatures may expire. */
	needRefreshImageUrls: boolean;

	// === Channel Routing ===
	/** Current active channel; GUI only in the source-available release. */
	currentChannel: "gui";

	// === History Summary ===
	/** loopCount when the last summary was generated. */
	lastSummarizedLoopCount: number;
	/** appName when the last summary was generated. */
	lastSummarizedAppName: string;

	// === Reset Flag ===
	/** Explicit reset signal set by normal entry; reducer performs full reset and drops this field. */
	_reset?: boolean;

	// === Semantic History (Anomaly Detection Only) ===
	/** Semantic history recording channel, summary, thought, and action for each step. */
	semanticHistory: SemanticRecord[];
}

/**
 * Default ExecutorInternalState.
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
 * Executor subgraph fields used by the parent graph.
 *
 * Reset behavior:
 * - Normal entry in entry.node sets _reset: true.
 * - messages and totalTokens are replaced instead of accumulated.
 * - _reset is dropped after reset and is not persisted.
 * - Each executor subgraph entry starts with a fresh context.
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

				// Detect explicit reset signal set by normal entry in entry.node.
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

				// Normal merge logic used during subgraph loops.
				const mergedMessages =
					update.sharedMessages !== undefined
						? messagesStateReducer(
								current.sharedMessages,
								update.sharedMessages,
							)
						: current.sharedMessages;

				// Sliding-window cap; model nodes build the precise window at runtime.
				const windowSize = VLM_AGENT_DEFAULTS.MESSAGE_WINDOW_SIZE;
				const finalMessages =
					mergedMessages.length > windowSize
						? mergedMessages.slice(-windowSize)
						: mergedMessages;

				// Append-merge semanticHistory.
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
 * Unified Agent state schema.
 *
 * Supports shared parent/subgraph state and lets subgraphs be added as nodes.
 * Combines Executor fields through executorStateFields.
 */
export const AgentStateSchema = new StateSchema({
	// === Task Basics ===
	userId: z.custom<number>(),
	taskId: z.custom<number>(),
	taskExecutionId: z.custom<number>(),
	userInput: z.custom<string>(),
	/** User region (CN/US). */
	userRegion: z.custom<string>(),
	/** User tenant ID from users.tenant_id; -1 means no tenant. */
	tenantId: z.custom<number>(),

	// === Message History (Parent Graph) ===
	messages: MessagesValue,
	plannerMessages: MessagesValue,

	// === Supervisor Output ===
	/** Supervisor streaming text for each turn, parsed by fallback_extract. */
	supervisorStreamOutput: z.string().default(""),

	// === extract_todo Result ===
	/** Whether extract_todo found a todo to execute. */
	todoFound: z.boolean().default(false),

	// === Planner Todos Completed ===
	planTodoComplete: z.custom<boolean>(),

	// === Plan Generator / Supervisor Output ===
	/** Plan document in Markdown, set on the first supervisor invocation. */
	planDocument: z.string().default(""),

	// === Executor Subgraph ===
	...executorStateFields,

	// === Interrupt State ===
	interruptReason: z.custom<string | null>(),
	isCancelled: z.custom<boolean>(),
	isPaused: z.custom<boolean>(),

	// === Supervisor Error Flag ===
	/** Whether supervisor hit an unrecoverable error, used to route to summarizer for recovery. */
	supervisorError: z.boolean().default(false),

	// === Executor Entry Flag ===
	/** Whether executor subgraph was entered, used to decide if cancel should jump to summarizer. */
	executorEntered: z.custom<boolean>(),

	// === Final Summary from Summarizer ===
	/** Final summary, using an explicit reducer to avoid concurrent LastValue conflicts. */
	finalSummary: new ReducedValue(
		z.string().nullable().default(null),
		{
			reducer: (current: string | null, update: string | null) =>
				update ?? current,
		},
	),

	// Summary generated every 50 loops and collected for the final summary.
	actionSummaryList: new ReducedValue(
		z.array(z.string()).default(() => []),
		{
			reducer: (current: string[], update: string[]) => [
				...current,
				...update,
			],
		},
	),

	// === Metadata ===
	tokenUsage: z.custom<TokenUsage>(),
	startTime: z.custom<number>(),

	// === Fork Execution ===
	/** Original execution ID; summarizer reads its summary during fork flows. */
	originExecutionId: z.custom<number | null>(),
	/** Fork resume flag; entry node clears it after deciding to preserve executor state. */
	forkResume: z.custom<boolean>(),
});

export type AgentState = typeof AgentStateSchema.State;

/** @deprecated Use AgentStateSchema instead. */
export const AgentStateAnnotation = AgentStateSchema;
/** @deprecated Use ExecutorStateSchema instead. */
export const ExecutorStateAnnotation = ExecutorStateSchema;

/** Default VLM Agent configuration. */
export const VLM_AGENT_DEFAULTS = {
	MAX_LOOP_COUNT: 150,
	MESSAGE_WINDOW_SIZE: 100,
	/** VLM message window, excluding image placeholder messages. */
	VLM_MODEL_WINDOW_SIZE: 10,
	/** Number of screenshots retained for VLM calls. */
	VLM_IMAGE_WINDOW_SIZE: 3,
	SEMANTIC_HISTORY_WINDOW_SIZE: 100,
	DEFAULT_SCALE_FACTOR: 1,
} as const;
