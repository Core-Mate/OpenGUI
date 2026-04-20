import { HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import { ExecutionGateway, type ActionReqPayload } from "../../../../../common/ws";
import { AgentState } from "../../state/executor-state.types";
import { ErrorSeverity } from "../../utils/error-classification";

const logger = new Logger("ExecuteActionNode");

/**
 * 移动端操作类型
 */
enum MobileActionType {
	CLICK = "click",
	LONG_PRESS = "long_press",
	TYPE = "type",
	SCROLL = "scroll",
	OPEN_APP = "open_app",
	DRAG = "drag",
	PRESS_HOME = "press_home",
	PRESS_BACK = "press_back",
	FINISHED = "finished",
	CALL_USER = "call_user",
	WAIT = "wait",
}

/**
 * 创建执行动作节点
 *
 * @param executionGateway - 执行网关，用于发送操作请求
 * @returns 执行动作节点函数
 */
export function createExecuteActionNode(
	executionGateway: ExecutionGateway,
) {
	return async (state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> => {
		const signal = config?.signal;
		const exec = state.executor;
		const { parsedPrediction } = exec;

		// 检查是否已被 abort
		if (signal?.aborted) {
			logger.log("Execution aborted, skipping action execution");
			return {
				executor: {
					status: "cancelled",
				},
			} as Partial<AgentState>;
		}

		if (!parsedPrediction) {
			return {
				executor: {
					status: "error",
					errorMessage: "无解析结果",
				},
			} as Partial<AgentState>;
		}

		const actionType = parsedPrediction.action_type;
		logger.log(`Executing action: ${actionType}`);

		try {
			// 检查是否为有效的移动端操作类型
			const validActionTypes = Object.values(MobileActionType) as string[];
			if (!validActionTypes.includes(actionType)) {
				logger.warn(`Unknown action type: ${actionType}`);
				const errorMsg = new HumanMessage({
					content: `未知操作类型: ${actionType}，请输出有效的动作类型`,
					additional_kwargs: { created_at: new Date().toISOString() },
				});
				return {
					executor: {
						status: "running",
						lastError: {
							severity: ErrorSeverity.RECOVERABLE,
							code: "UNKNOWN_ACTION_TYPE",
							message: `未知操作类型: ${actionType}`,
						},
						executionMetrics: { actionFailureCount: 1 },
						sharedMessages: [errorMsg],
					},
				} as Partial<AgentState>;
			}

			// 构建操作参数
			const actionInputs = parsedPrediction.action_inputs;
			const actionParams = {
				start_x: actionInputs?.start_coords?.[0] ?? 0,
				start_y: actionInputs?.start_coords?.[1] ?? 0,
				end_x: actionInputs?.end_coords?.[0] ?? 0,
				end_y: actionInputs?.end_coords?.[1] ?? 0,
				content: actionInputs?.content ?? "",
				direction: actionInputs?.direction ?? "",
				app_name: actionInputs?.app_name ?? "",
			};

			// 构建请求 DTO
			const actionReq: ActionReqPayload = {
				executionId: state.taskExecutionId,
				actionType: actionType,
				actionInputs: actionParams,
			};

			// 执行操作（重试由 LangGraph retryPolicy 处理）
			await executionGateway.sendActionReq(state.taskExecutionId, actionReq);

			logger.log(`Action ${actionType} executed successfully`);

			return {
				executor: {
					status: "running",
					executionMetrics: {
						actionSuccessCount: 1,
					},
				},
			} as Partial<AgentState>;
		} catch (error: any) {
			// 如果是 abort 错误，重新抛出让图停止执行
			if (error.name === "AbortError" || error.message?.includes("abort")) {
				logger.log("Execute action aborted, stopping execution");
				throw error;
			}

			logger.error(`Execute action failed: ${error.message}`, error.stack);
			// 返回错误状态，让 VLM 看到错误消息并决定是否重试
			const errorMsg = new HumanMessage({
				content: `执行操作${actionType}失败: ${error.message}`,
				additional_kwargs: {
					created_at: new Date().toISOString(),
				},
			});
			return {
				executor: {
					status: "running", // 保持 running 让 VLM 有机会重试
					lastError: {
						severity: ErrorSeverity.RECOVERABLE,
						code: "EXECUTE_FAILED",
						message: `执行操作${actionType}失败: ${error.message}`,
					},
					executionMetrics: {
						actionFailureCount: 1,
					},
					sharedMessages: [errorMsg],
				},
			} as Partial<AgentState>;
		}
	};
}
