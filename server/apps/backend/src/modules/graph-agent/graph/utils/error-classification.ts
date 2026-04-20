/**
 * 统一错误分类
 *
 * 为 executor 节点提供标准化的错误严重级别和结构
 */

export enum ErrorSeverity {
	/** VLM 可自行重试（如解析失败、执行失败） */
	RECOVERABLE = "RECOVERABLE",
	/** retryPolicy 已处理，此处为最终失败 */
	RETRYABLE = "RETRYABLE",
	/** 必须退出执行器 */
	FATAL = "FATAL",
}

export interface ExecutorError {
	severity: ErrorSeverity;
	code: string;
	message: string;
}
