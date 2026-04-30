import { END } from "@langchain/langgraph";
import { AgentState } from "../state/executor-state.types";

/**
 */
export const NODE_NAMES = {
	SENSE: "sense",
	VISION_MODEL: "vision_model",
	PARSE_ACTION: "parse_action",
	CALL_USER: "call_user",
	EXECUTE_ACTION: "execute_action",
	POST_EXECUTE: "post_execute",
} as const;

/**
 *
 * Always routes to vision_model (GUI channel only).
 */
export function routeAfterSense(state: AgentState): string | typeof END {
	if (state.executor.status === "error") {
		return END;
	}
	return NODE_NAMES.VISION_MODEL;
}

/**
 */
export function routeAfterVisionModel(state: AgentState): string | typeof END {
	if (state.executor.status === "error") {
		return END;
	}
	return NODE_NAMES.PARSE_ACTION;
}

/**
 *
 */
export function routeByAction(state: AgentState): string | typeof END {
	const { status, parsedPrediction } = state.executor;

	if (status === "error") {
		return END;
	}

	if (status === "finished") {
		return END;
	}



	if (!parsedPrediction?.action_type) {
		return NODE_NAMES.POST_EXECUTE;
	}

	// request_visual is a no-op in GUI-only mode, skip to post_execute
	if (parsedPrediction.action_type === "request_visual") {
		return NODE_NAMES.POST_EXECUTE;
	}




	return NODE_NAMES.EXECUTE_ACTION;
}

/**
 *
 */
export function routeAfterExecuteAction(
	state: AgentState,
): "call_user" | "post_execute" | typeof END {
	const { status } = state.executor;

	if (status === "error") {
		return END;
	}

	if (state.executor.parsedPrediction?.action_type === "call_user") {
		return NODE_NAMES.CALL_USER;
	}

	return NODE_NAMES.POST_EXECUTE;
}

/**
 *
 */
export function routeAfterPostExecute(state: AgentState): "sense" | typeof END {
	if (state.executor.status !== "running") {
		return END;
	}
	return NODE_NAMES.SENSE;
}
