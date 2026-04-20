/**
 * 命令类型定义
 */
export enum CommandType {
	LIST_TASKS = "LIST_TASKS",
	RUN_TASK = "RUN_TASK",
	DO_TASK = "DO_TASK",
	STATUS = "STATUS",
	CANCEL = "CANCEL",
	PAUSE = "PAUSE",
	RESUME = "RESUME",
	DEVICES = "DEVICES",
	HELP = "HELP",
	/** 非命令文本（HITL 场景下作为用户回复） */
	FREE_TEXT = "FREE_TEXT",
}

export interface ParsedCommand {
	type: CommandType;
	taskId?: number;
	description?: string;
	executionId?: number;
	rawText: string;
}
