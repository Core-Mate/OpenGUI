/**
 * Executor 状态类型
 *
 * 重新导出统一状态中的 Executor 相关类型
 * 保持向后兼容，同时使用新的统一状态结构
 */

// 类型导出
export type {
	// GUI Agent 状态类型
	ExecutorStatus,
	PredictionParsed,
	ParsedActionRecord,
	SemanticRecord,

	// Executor 通信层
	ExecutorInput,
	ExecutorOutput,

	// Executor 内部状态
	ExecutorInternalState,

	// 统一状态（子图使用）
	AgentState,
} from "./state.types";

// 值导出
export {
	AgentStateSchema,
	AgentStateAnnotation,
	ExecutorStateSchema,
	VLM_AGENT_DEFAULTS,
} from "./state.types";

import type { AgentState } from "./state.types";

/**
 * @deprecated 使用 UnifiedAgentState 替代
 * 保留用于向后兼容
 */
export type GUIAgentState = AgentState;

import { AgentStateAnnotation } from "./state.types";

/**
 * @deprecated 使用 UnifiedAgentStateAnnotation 替代
 * 保留用于向后兼容
 */
export const GUIAgentStateAnnotation = AgentStateAnnotation;
