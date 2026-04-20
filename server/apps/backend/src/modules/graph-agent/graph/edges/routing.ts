import { Logger } from "@nestjs/common";
import { AgentState } from "../state/state.types";

const logger = new Logger("GraphRouting");

// ============================================================================
// 节点名称常量
// ============================================================================

/**
 * 节点名称常量
 */
export const NODE_NAMES = {
	SUPERVISOR: "supervisor",
	EXTRACT_TODO: "extract_todo",
	FALLBACK_EXTRACT: "fallback_extract",
	EXECUTOR: "gui_executor",
	SUMMARIZER: "summarizer",
} as const;

// ============================================================================
// 路由函数
// ============================================================================

/**
 * supervisor 后的路由决策
 *
 * - supervisorError=true → summarizer（LLM 调用失败，生成补救总结）
 * - else → extract_todo（正常流程）
 */
export function routeAfterSupervisor(
	state: AgentState,
): typeof NODE_NAMES.EXTRACT_TODO | typeof NODE_NAMES.SUMMARIZER {
	if (state.supervisorError) {
		logger.log(
			"Routing to summarizer: supervisor error, generating recovery summary",
		);
		return NODE_NAMES.SUMMARIZER;
	}

	return NODE_NAMES.EXTRACT_TODO;
}

/**
 * extract_todo 后的路由决策
 *
 * - isCancelled → summarizer
 * - planTodoComplete=true → summarizer（所有任务完成）
 * - todoFound=true → executor（找到待执行 todo）
 * - else → fallback_extract（没有 todo，使用 Haiku 兜底提取）
 */
export function routeAfterExtractTodo(
	state: AgentState,
):
	| typeof NODE_NAMES.EXECUTOR
	| typeof NODE_NAMES.SUMMARIZER
	| typeof NODE_NAMES.FALLBACK_EXTRACT {
	logger.debug(
		`routeAfterExtractTodo: todoFound=${state.todoFound}, planTodoComplete=${state.planTodoComplete}, isCancelled=${state.isCancelled}`,
	);

	if (state.isCancelled) {
		logger.log("Routing to summarizer: task cancelled by user");
		return NODE_NAMES.SUMMARIZER;
	}

	if (state.planTodoComplete) {
		logger.log("Routing to summarizer: all tasks completed");
		return NODE_NAMES.SUMMARIZER;
	}

	if (state.todoFound) {
		logger.log("Routing to executor: todo found");
		return NODE_NAMES.EXECUTOR;
	}

	logger.log("Routing to fallback_extract: no todos, using Haiku fallback");
	return NODE_NAMES.FALLBACK_EXTRACT;
}

/**
 * Executor 执行后的路由决策
 *
 * - isCancelled=true → summarizer
 * - else → supervisor（返回评估执行结果）
 */
export function routeAfterExecutor(
	state: AgentState,
): typeof NODE_NAMES.SUPERVISOR | typeof NODE_NAMES.SUMMARIZER {
	logger.debug(
		`routeAfterExecutor: executorSuccess=${state.executorOutput?.success}, isCancelled=${state.isCancelled}`,
	);

	if (state.isCancelled) {
		logger.log("Routing to summarizer: task cancelled by user");
		return NODE_NAMES.SUMMARIZER;
	}

	logger.log(
		"Routing to supervisor: returning execution result for evaluation",
	);
	return NODE_NAMES.SUPERVISOR;
}

// ============================================================================
// 路由路径常量
// ============================================================================

/**
 * 条件边映射类型
 */
export const ROUTING_PATHS = {
	SUPERVISOR: {
		[NODE_NAMES.EXTRACT_TODO]: NODE_NAMES.EXTRACT_TODO,
		[NODE_NAMES.SUMMARIZER]: NODE_NAMES.SUMMARIZER,
	} as const,
	EXTRACT_TODO: {
		[NODE_NAMES.EXECUTOR]: NODE_NAMES.EXECUTOR,
		[NODE_NAMES.SUMMARIZER]: NODE_NAMES.SUMMARIZER,
		[NODE_NAMES.FALLBACK_EXTRACT]: NODE_NAMES.FALLBACK_EXTRACT,
	} as const,
	EXECUTOR: {
		[NODE_NAMES.SUPERVISOR]: NODE_NAMES.SUPERVISOR,
		[NODE_NAMES.SUMMARIZER]: NODE_NAMES.SUMMARIZER,
	} as const,
};
