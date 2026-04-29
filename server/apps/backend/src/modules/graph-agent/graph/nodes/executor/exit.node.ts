import { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import { ExecutionGateway } from "../../../../../common/ws";
import { WorkingMemoryService } from "../../../working-memory/working-memory.service";
import { AgentState } from "../../state/executor-state.types";

const logger = new Logger("ExecutorExitNode");

/**
 *
 *
 */
export function createExecutorExitNode(
	executionGateway: ExecutionGateway,
	workingMemoryService: WorkingMemoryService,
) {
	return async (
		state: AgentState,
		config?: RunnableConfig,
	): Promise<Partial<AgentState>> => {
		const exec = state.executor;
		logger.log(`Executor exit: status=${exec.status}`);


		const m = exec.executionMetrics;
		const sc = m?.senseCount ?? 0;
		if (sc > 0) {
			const avgSense = Math.round((m?.totalSenseLatencyMs ?? 0) / sc);
			const mc = m?.modelCount ?? 0;
			const avgModel = mc > 0 ? Math.round((m?.totalModelLatencyMs ?? 0) / mc) : 0;
			logger.log(
				`Execution metrics: loops=${exec.loopCount}, ` +
				`sense=${sc} (avg ${avgSense}ms), ` +
				`model=${mc} (avg ${avgModel}ms), ` +
				`channelSwitch=${m?.channelSwitchCount ?? 0}, ` +
				`anomaly=${m?.anomalyDetectionCount ?? 0}, ` +
				`actions=${m?.actionSuccessCount ?? 0}ok/${m?.actionFailureCount ?? 0}fail, ` +
				`tokens=${exec.totalTokens}`,
			);
		}


		const success = exec.status === "finished";


		let notes = "";
		const threadId = (config?.configurable as Record<string, unknown>)
			?.thread_id as string | undefined;

		if (threadId) {
			try {
				const workingMemory =
					await workingMemoryService.getWorkingMemory(threadId);
				if (workingMemory) {
					notes = workingMemory;
					logger.log(
						`Retrieved working memory for notes (${workingMemory.length} chars)`,
					);
				}
			} catch (error) {
				logger.warn(
					`Failed to retrieve working memory: ${(error as Error).message}`,
				);
			}
		} else {
			logger.warn(
				"thread_id not found in config, skipping working memory read",
			);
		}



		const currentTokenUsage = state.tokenUsage || {
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
		};
		const updatedTokenUsage = {
			...currentTokenUsage,
			totalTokens: currentTokenUsage.totalTokens + (exec.totalTokens || 0),
		};

		return {
			executorOutput: {
				success,
				fail_reason: exec?.errorMessage ?? "",
				task: state.executorInput?.instruction || "",
				notes: notes,
			},
			tokenUsage: updatedTokenUsage,
		};
	};
}
