/**
 * Agent event type enum.
 * Centralizes all Agent event types sent over WebSocket.
 */
export enum AgentEventType {
	// === Base Connection Events ===
	/** SSE connection confirmation event, sent after the client establishes an SSE connection. */
	CONNECTED = "connected",
	/** Connection close event, sent when the SSE connection closes. */
	CLOSED = "closed",
	/** Miscellaneous event type that can be ignored. */
	Others = "others",

	// === Workflow State Events ===
	/** Task started event, sent when task execution starts. */
	TASK_STARTED = "task-started",
	/** Task suspended event, sent when a task is paused. */
	TASK_SUSPENDED = "task-suspended",
	/** Task succeeded event, sent when a task completes successfully. */
	TASK_SUCCEEDED = "task-succeeded",
	/** Task failed event, sent when execution fails. */
	TASK_FAILED = "task-failed",
	/** Task cancelled event, sent when the user or system cancels a task. */
	TASK_CANCELLED = "task-cancelled",

	// === GUI Agent Events ===
	/** GUI Agent execution event, sent when the GUI Agent starts executing a task. */
	CALL_GUI_AGENT = "call_gui_agent",
	/** GUI action thought event, carrying reasoning content from the GUI agent. */
	GUI_ACTION_THOUGHT = "gui-action-thought",

	// === AI SDK Standard Events from Agent fullStream ===
	/** Text generation started. */
	TEXT_START = "text-start",
	/** Text generation ended. */
	TEXT_END = "text-end",
	/** Text delta event for streamed text generation. */
	TEXT_DELTA = "text-delta",

	/** Reasoning started. */
	REASONING_START = "reasoning-start",
	/** Reasoning ended. */
	REASONING_END = "reasoning-end",
	/** Reasoning delta event. */
	REASONING_DELTA = "reasoning-delta",

	/** Tool input started. */
	TOOL_INPUT_START = "tool-input-start",
	/** Tool input ended. */
	TOOL_INPUT_END = "tool-input-end",
	/** Tool input delta event. */
	TOOL_INPUT_DELTA = "tool-input-delta",

	/** Tool call event, sent when the Agent calls a tool. */
	TOOL_CALL = "tool-call",
	/** Tool result event, sent after tool execution completes. */
	TOOL_RESULT = "tool-result",
	/** Tool error event, sent when tool execution fails. */
	TOOL_ERROR = "tool-error",

	/** Workflow step started. */
	START_STEP = "start-step",
	/** Workflow step finished. */
	FINISH_STEP = "finish-step",
	/** Workflow started. */
	START = "start",
	/** Workflow finished. */
	FINISH = "finish",
	/** Workflow aborted. */
	ABORT = "abort",
	/** Workflow error. */
	ERROR = "error",

	// === LangGraph Events ===
	/** Generic LangGraph Agent event. */
	AGENT_EVENT = "agent-event",
}

/**
 * Agent event source enum.
 * Identifies the Agent or module that emitted an event.
 */
export enum AgentEventSource {
	/** Coordinator, responsible for task coordination and dispatch. */
	COORDINATOR = "coordinator",
	/** Supervisor, responsible for planning, todo management, and execution decisions. */
	PLAN_SUPERVISOR = "plan_supervisor",
	/** Executor, responsible for concrete task execution. */
	EXECUTOR = "executor",
	/** Summarizer, responsible for the final execution summary. */
	SUMMARIZER = "summarizer",
	/** Generic system event. */
	SYSTEM = "system",
}
