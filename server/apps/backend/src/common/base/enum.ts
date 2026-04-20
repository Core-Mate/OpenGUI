/**
 * Agent 事件类型枚举
 * 统一管理项目中所有通过 WebSocket 发送的 Agent 事件类型
 */
export enum AgentEventType {
	// === 基础连接事件 ===
	/** SSE 连接确认事件 - 当客户端成功建立SSE连接时发送 */
	CONNECTED = "connected",
	/** 连接关闭事件 - 当SSE连接关闭时发送 */
	CLOSED = "closed",
	/** 无需理会 */
	Others = "others",

	// === 工作流状态机事件 ===
	/** 任务开始事件 - 当任务开始执行时发送 */
	TASK_STARTED = "task-started",
	/** 任务暂停事件 - 当任务被暂停时发送 */
	TASK_SUSPENDED = "task-suspended",
	/** 任务成功完成事件 - 当任务成功执行完成时发送 */
	TASK_SUCCEEDED = "task-succeeded",
	/** 任务执行失败事件 - 当任务执行失败时发送 */
	TASK_FAILED = "task-failed",
	/** 任务取消事件 - 当任务被用户或系统取消时发送 */
	TASK_CANCELLED = "task-cancelled",

	// === UI-TARS 相关事件 ===
	/** GUI Agent 开始执行事件 - 当 GUIAgent 开始执行任务时发送 */
	CALL_GUI_AGENT = "call_gui_agent",
	/** UI-TARS 思考过程事件 - 发送 UI-TARS 的推理思考内容 */
	GUI_ACTION_THOUGHT = "gui-action-thought",

	// === AI-SDK 标准事件（来自 Agent fullStream） ===
	/** 文本生成开始事件 */
	TEXT_START = "text-start",
	/** 文本生成结束事件 */
	TEXT_END = "text-end",
	/** 文本增量更新事件 - 流式文本生成过程中的增量内容 */
	TEXT_DELTA = "text-delta",

	/** 推理过程开始事件 */
	REASONING_START = "reasoning-start",
	/** 推理过程结束事件 */
	REASONING_END = "reasoning-end",
	/** 推理增量更新事件 - 推理过程中的增量内容 */
	REASONING_DELTA = "reasoning-delta",

	/** 工具输入开始事件 */
	TOOL_INPUT_START = "tool-input-start",
	/** 工具输入结束事件 */
	TOOL_INPUT_END = "tool-input-end",
	/** 工具输入增量更新事件 */
	TOOL_INPUT_DELTA = "tool-input-delta",

	/** 工具调用事件 - 当 Agent 调用工具时发送 */
	TOOL_CALL = "tool-call",
	/** 工具执行结果事件 - 工具执行完成后返回结果 */
	TOOL_RESULT = "tool-result",
	/** 工具执行错误事件 - 工具执行失败时发送错误信息 */
	TOOL_ERROR = "tool-error",

	/** 工作流步骤开始事件 */
	START_STEP = "start-step",
	/** 工作流步骤完成事件 */
	FINISH_STEP = "finish-step",
	/** 工作流开始事件 */
	START = "start",
	/** 工作流完成事件 */
	FINISH = "finish",
	/** 工作流中止事件 */
	ABORT = "abort",
	/** 工作流错误事件 */
	ERROR = "error",

	// === LangGraph 相关事件 ===
	/** LangGraph Agent 事件 - 通用 Agent 事件类型 */
	AGENT_EVENT = "agent-event",
}

/**
 * Agent 事件源标识枚举
 * 标识事件的来源 Agent 或模块
 */
export enum AgentEventSource {
	/** 协调器 - 负责任务协调和调度 */
	COORDINATOR = "coordinator",
	/** Supervisor - 任务规划、管理任务列表和执行决策 */
	PLAN_SUPERVISOR = "plan_supervisor",
	/** 执行器 - 负责具体任务执行 */
	EXECUTOR = "executor",
	/** 总结器 - 负责任务执行结果的最终总结 */
	SUMMARIZER = "summarizer",
	/** 通用系统事件 */
	SYSTEM = "system",
}
