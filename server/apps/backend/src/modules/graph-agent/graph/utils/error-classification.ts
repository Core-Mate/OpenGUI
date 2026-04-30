/**
 *
 */

export enum ErrorSeverity {
	RECOVERABLE = "RECOVERABLE",
	RETRYABLE = "RETRYABLE",
	FATAL = "FATAL",
}

export interface ExecutorError {
	severity: ErrorSeverity;
	code: string;
	message: string;
}
