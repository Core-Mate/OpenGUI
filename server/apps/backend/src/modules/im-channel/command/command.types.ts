/**
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
	FREE_TEXT = "FREE_TEXT",
}

export interface ParsedCommand {
	type: CommandType;
	taskId?: number;
	description?: string;
	executionId?: number;
	rawText: string;
}
