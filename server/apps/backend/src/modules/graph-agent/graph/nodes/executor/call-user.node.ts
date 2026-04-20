import { Logger } from "@nestjs/common";
import { HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState } from "../../state/executor-state.types";
import { interrupt } from "@langchain/langgraph";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {CallUserResponse} from "../../../graph-runner.service";

const logger = new Logger("CallUserNode");

/**
 * 执行状态枚举（与 task.enums.ts 保持一致）
 */
const ExecutionStatus = {
	SUSPENDED: "SUSPENDED",
} as const;

/**
 * 根据用户响应构建通知消息
 */
function buildUserResponseMessage(response: CallUserResponse): string {
    const feedback = response.feedback ? `\n用户反馈: ${response.feedback}` : "";
    return `用户已完成手动操作。${feedback}\n请继续执行后续任务。`;
}

/**
 * 创建 CallUser 节点
 *
 * 职责：
 * 1. 更新 task_execution 状态为 SUSPENDED（使 resume API 可立即工作）
 * 2. 触发 interrupt 等待用户输入
 * 3. 用户恢复后插入通知消息，继续执行
 *
 * 注意：
 * - 客户端通知（call_user 动作下发）由上游 execute_action 节点负责，
 *   路由路径：parse_action → execute_action → call_user。
 *   sendActionReq 不能放在此节点中，因为 LangGraph resume 时会从节点头部
 *   重新执行，导致客户端收到重复的 call_user 通知。
 * - DB SUSPENDED 更新是幂等的：resume 重放时再写一次 SUSPENDED 不会
 *   导致可见问题（不会触发客户端弹窗），且 task-execution.service 在
 *   graph.invoke() 返回后有兜底逻辑。
 *
 * @param prismaService - Prisma 数据库服务
 * @returns CallUser 节点函数
 */
export function createCallUserNode(prismaService: PrismaService) {
	return async (state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> => {
		const exec = state.executor;
		const { taskExecutionId } = state;

		// 检查是否已被 abort
		if (config?.signal?.aborted) {
			logger.log("[CallUser] Execution aborted, skipping call_user");
			return {
				executor: { status: "cancelled" },
			} as Partial<AgentState>;
		}

		logger.log(
			`[CallUser] Preparing to suspend execution ${taskExecutionId}, reason: ${exec.callUserThought}`,
		);

		// 在 interrupt 之前更新 task_execution 状态为 SUSPENDED
		// 这样 resume API 可以立即工作，不需要等待 graph.invoke() 返回（checkpoint 保存可能耗时数十秒）
		// 注意：这是幂等操作 — resume 时节点重入会再写一次 SUSPENDED，但不影响正确性
		try {
			await prismaService.task_execution.update({
				where: { id: taskExecutionId },
				data: {
					execution_status: ExecutionStatus.SUSPENDED,
					status_message: exec.callUserThought,
					updated_at: new Date(),
				},
			});
			logger.log(
				`[CallUser] Updated execution ${taskExecutionId} status to SUSPENDED`,
			);
		} catch (error) {
			logger.error(
				`[CallUser] Failed to update execution status: ${(error as Error).message}`,
				(error as Error).stack,
			);
			// 即使更新失败也继续执行 interrupt，task-execution.service 有兜底逻辑
		}

		// 触发 interrupt，等待用户输入
		logger.log(
			`[CallUser] Triggering interrupt for execution ${taskExecutionId}...`,
		);
		const userResponse = interrupt(exec.callUserThought) as CallUserResponse;

		logger.log(
			`[CallUser] User response received for execution ${taskExecutionId}: ${JSON.stringify(userResponse)}`,
		);

		// 恢复后插入一条 message，告知模型用户已操作完毕
		const responseMessage = buildUserResponseMessage(userResponse);
		const notificationMessage = new HumanMessage({
			content: responseMessage,
			additional_kwargs: {
				created_at: new Date().toISOString(),
			},
		});

		logger.log(
			`[CallUser] Inserting notification message: ${responseMessage}`,
		);

		// 用户恢复后，继续执行
		return {
			executor: {
				status: "running",
				callUserThought: "",
				sharedMessages: [notificationMessage],
			},
		} as Partial<AgentState>;
	};
}
