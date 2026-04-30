import { Logger } from "@nestjs/common";
import { HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState } from "../../state/executor-state.types";
import { interrupt } from "@langchain/langgraph";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {CallUserResponse} from "../../../graph-runner.service";

const logger = new Logger("CallUserNode");

/**
 */
const ExecutionStatus = {
	SUSPENDED: "SUSPENDED",
} as const;

/**
 */
function buildUserResponseMessage(response: CallUserResponse): string {
    const feedback = response.feedback ? `\nUser feedback: ${response.feedback}` : "";
    return `The user has completed the manual operation.${feedback}\nPlease continue the remaining task.`;
}

/**
 *
 *
 *
 */
export function createCallUserNode(prismaService: PrismaService) {
	return async (state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> => {
		const exec = state.executor;
		const { taskExecutionId } = state;


		if (config?.signal?.aborted) {
			logger.log("[CallUser] Execution aborted, skipping call_user");
			return {
				executor: { status: "cancelled" },
			} as Partial<AgentState>;
		}

		logger.log(
			`[CallUser] Preparing to suspend execution ${taskExecutionId}, reason: ${exec.callUserThought}`,
		);




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

		}


		logger.log(
			`[CallUser] Triggering interrupt for execution ${taskExecutionId}...`,
		);
		const userResponse = interrupt(exec.callUserThought) as CallUserResponse;

		logger.log(
			`[CallUser] User response received for execution ${taskExecutionId}: ${JSON.stringify(userResponse)}`,
		);


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


		return {
			executor: {
				status: "running",
				callUserThought: "",
				sharedMessages: [notificationMessage],
			},
		} as Partial<AgentState>;
	};
}
