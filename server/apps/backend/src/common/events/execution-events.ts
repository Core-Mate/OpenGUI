export const EXECUTION_EVENTS = {
	SUSPENDED: "execution.suspended",
	FINISHED: "execution.finished",
	PHASE_CHANGED: "execution.phase_changed",
	ACTION_THOUGHT: "execution.action_thought",
} as const;

export interface ExecutionSuspendedEvent {
	executionId: number;
	userId: number;
	reason: string;
}

export interface ExecutionFinishedEvent {
	executionId: number;
	userId: number;
	result: "SUCCEED" | "FAILED" | "CANCELLED";
	summary?: string;
	errorMessage?: string;
}

export interface ExecutionPhaseChangedEvent {
	executionId: number;
	phase: string; // plan_supervisor | executor | summarizer
}

export interface ExecutionActionThoughtEvent {
	executionId: number;
	content: string;
}
