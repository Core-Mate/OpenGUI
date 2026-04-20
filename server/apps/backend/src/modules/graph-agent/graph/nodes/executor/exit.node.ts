import { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import { ExecutionGateway } from "../../../../../common/ws";
import { WorkingMemoryService } from "../../../working-memory/working-memory.service";
import { AgentState } from "../../state/executor-state.types";

const logger = new Logger("ExecutorExitNode");

/**
 * 创建 Executor 出口节点
 *
 * 从 executor 内部状态读取结果，写入 executorOutput
 * 读取 VLM 记录的 Working Memory 内容作为 notes 返回
 *
 * @param executionGateway 执行网关
 * @param workingMemoryService 工作记忆服务
 * @returns 出口节点函数
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

		// 输出执行指标摘要
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

		// 根据 executor 状态确定是否成功
		const success = exec.status === "finished";

		// 从 config 中提取 thread_id 并读取 Working Memory
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

		// 汇总本次 executor 的 token 消耗到父图级别
		// 这确保多次调用 executor 时 token 统计不会因重置而丢失
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
