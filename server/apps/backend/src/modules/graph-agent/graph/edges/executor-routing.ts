import { END } from "@langchain/langgraph";
import { AgentState } from "../state/executor-state.types";

/**
 * 节点名称常量
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
 * Sense 后的路由
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
 * Vision Model 后的路由
 */
export function routeAfterVisionModel(state: AgentState): string | typeof END {
	if (state.executor.status === "error") {
		return END;
	}
	return NODE_NAMES.PARSE_ACTION;
}

/**
 * 动作路由
 *
 * 根据解析后的动作状态决定下一步：
 * - error: 结束（会被 executor.graph.ts 重定向到 EXIT）
 * - finished: 结束（直接到 EXIT）
 * - action_type 为空（解析失败）: 跳过执行，直接到 POST_EXECUTE
 * - call_user: 走 execute_action 下发通知后，再路由到 call_user 节点触发 interrupt
 * - 其他: 走 execute_action 执行设备动作
 */
export function routeByAction(state: AgentState): string | typeof END {
	const { status, parsedPrediction } = state.executor;

	if (status === "error") {
		return END;
	}

	if (status === "finished") {
		return END;
	}

	// action_type 为空说明解析失败或模型未返回有效动作
	// 跳过 execute_action，直接到 post_execute
	if (!parsedPrediction?.action_type) {
		return NODE_NAMES.POST_EXECUTE;
	}

	// request_visual is a no-op in GUI-only mode, skip to post_execute
	if (parsedPrediction.action_type === "request_visual") {
		return NODE_NAMES.POST_EXECUTE;
	}

	// call_user 和其他设备动作都走 execute_action，
	// 由 execute_action 负责通过 WS 下发动作到客户端。
	// call_user 在 execute_action 之后由 routeAfterExecuteAction 路由到 call_user 节点触发 interrupt。
	return NODE_NAMES.EXECUTE_ACTION;
}

/**
 * 执行动作后的路由
 *
 * 根据状态决定下一步：
 * - error: 结束
 * - call_user: 路由到 call_user 节点触发 interrupt 等待用户操作
 * - 其他: 进入 post_execute（异常检测 + 历史摘要 + 循环控制）
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
 * POST_EXECUTE 后的路由
 *
 * 简化为：非 running → EXIT，否则 → SENSE 继续循环
 * （max loop 检查已移入 post_execute 节点内部）
 */
export function routeAfterPostExecute(state: AgentState): "sense" | typeof END {
	if (state.executor.status !== "running") {
		return END;
	}
	return NODE_NAMES.SENSE;
}
