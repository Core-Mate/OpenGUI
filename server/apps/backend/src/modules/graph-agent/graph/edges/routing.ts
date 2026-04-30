import { Logger } from "@nestjs/common";
import { AgentState } from "../state/state.types";
import { isExecutionConnectionLostMessage } from "../utils/execution-connection";

const logger = new Logger("GraphRouting");

// ============================================================================

// ============================================================================

/**
 */
export const NODE_NAMES = {
	SUPERVISOR: "supervisor",
	EXTRACT_TODO: "extract_todo",
	FALLBACK_EXTRACT: "fallback_extract",
	EXECUTOR: "gui_executor",
	SUMMARIZER: "summarizer",
} as const;

// ============================================================================

// ============================================================================

/**
 *
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
 *
 * - isCancelled → summarizer
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
 *
 * - isCancelled=true → summarizer
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

	if (
		isExecutionConnectionLostMessage(state.executorOutput?.fail_reason) ||
		isExecutionConnectionLostMessage(state.executor?.errorMessage)
	) {
		logger.log(
			"Routing to summarizer: execution socket disconnected, stopping retry loop",
		);
		return NODE_NAMES.SUMMARIZER;
	}

	logger.log(
		"Routing to supervisor: returning execution result for evaluation",
	);
	return NODE_NAMES.SUPERVISOR;
}

// ============================================================================

// ============================================================================

/**
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
