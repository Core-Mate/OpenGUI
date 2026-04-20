/**
 * Executor 执行指标
 *
 * 在各节点中逐步累加，exit 节点输出完整摘要
 */

export interface ExecutionMetrics {
	senseCount: number;
	totalSenseLatencyMs: number;
	modelCount: number;
	totalModelLatencyMs: number;
	channelSwitchCount: number;
	anomalyDetectionCount: number;
	actionSuccessCount: number;
	actionFailureCount: number;
}

export const DEFAULT_EXECUTION_METRICS: ExecutionMetrics = {
	senseCount: 0,
	totalSenseLatencyMs: 0,
	modelCount: 0,
	totalModelLatencyMs: 0,
	channelSwitchCount: 0,
	anomalyDetectionCount: 0,
	actionSuccessCount: 0,
	actionFailureCount: 0,
};

/**
 * 逐字段累加合并指标
 */
export function mergeMetrics(
	current: ExecutionMetrics,
	delta: Partial<ExecutionMetrics>,
): ExecutionMetrics {
	return {
		senseCount: current.senseCount + (delta.senseCount || 0),
		totalSenseLatencyMs: current.totalSenseLatencyMs + (delta.totalSenseLatencyMs || 0),
		modelCount: current.modelCount + (delta.modelCount || 0),
		totalModelLatencyMs: current.totalModelLatencyMs + (delta.totalModelLatencyMs || 0),
		channelSwitchCount: current.channelSwitchCount + (delta.channelSwitchCount || 0),
		anomalyDetectionCount: current.anomalyDetectionCount + (delta.anomalyDetectionCount || 0),
		actionSuccessCount: current.actionSuccessCount + (delta.actionSuccessCount || 0),
		actionFailureCount: current.actionFailureCount + (delta.actionFailureCount || 0),
	};
}
