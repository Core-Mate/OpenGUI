import type { RunnableConfig } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import type { SupervisorTodo } from "../graph/state/state.types";
import { WorkingMemoryService } from "../working-memory/working-memory.service";

/**
 * Result returned by the write_todos tool.
 */
export interface WriteTodosResult {
	todos: SupervisorTodo[];
	statusMessage: string;
}

/**
 * Result returned by the read_todos tool.
 */
export interface ReadTodosResult {
	todos: SupervisorTodo[];
	statusMessage: string;
}

/**
 * Todo status enum.
 */
const TodoStatusSchema = z
	.enum(["pending", "in_progress", "completed", "failed"])
	.describe("Todo status");

/**
 * Single todo item.
 */
const TodoSchema = z.object({
	content: z.string().describe("Todo content"),
	status: TodoStatusSchema,
	result: z
		.enum(["success", "failure", "refused"])
		.optional()
		.describe("Terminal result. Use success / failure / refused when status is completed or failed."),
	required_skills: z
		.array(z.string())
		.optional()
		.describe("Optional list of Skill names required for this todo."),
});

/**
 * Tool description for the Plan Supervisor.
 */
const WRITE_TODOS_DESCRIPTION = `Manage the subtask todo list used to track progress on complex tasks.

## When to use
- First call: break the user goal into subtasks.
- After a subtask completes: mark it completed and set the next subtask to in_progress.
- When the plan needs adjustment: edit or remove obsolete tasks.

## Status values
- pending: not started
- in_progress: currently executing; only one todo may be in_progress at a time
- completed: completed
- failed: failed

## required_skills
- Optional list of Skill names needed for the subtask.
- Only include Skills that were loaded through load_skill.
- Use an empty array [] when no special Skill is required.

## result
- Required only for terminal todos.
- Use result: success for completed work.
- Use result: failure for failed work.
- Use result: refused for refused work.

## Rules
1. Mark the first todo as in_progress when creating the list.
2. Update the status immediately after each subtask; do not batch-complete unrelated work.
3. Dynamically adjust the list when execution evidence changes.
4. Write todo descriptions in clear English by default. Preserve user-provided names, search terms, and target text exactly.`;

const READ_TODOS_DESCRIPTION = `Read the current subtask todo list.

## When to use
- Before deciding the next action.
- When you need to inspect completed, current, and pending work.

## Returns
- The full todo list and each status.
- Progress counts for completed, in-progress, pending, and failed todos.`;

/**
 */
function extractThreadId(config: RunnableConfig): string | undefined {
	const configurable = config?.configurable as
		| { thread_id?: string }
		| undefined;
	return configurable?.thread_id;
}

/**
 *
 */
@Injectable()
export class SupervisorTodosToolService {
	private readonly logger = new Logger(SupervisorTodosToolService.name);

	constructor(private readonly workingMemoryService: WorkingMemoryService) {}

	/**
	 *
	 *
	 */
	createWriteTodosTool() {
		return tool(
			async ({ todos }, config: RunnableConfig): Promise<WriteTodosResult> => {

				const stats = {
					total: todos.length,
					pending: todos.filter((t) => t.status === "pending").length,
					in_progress: todos.filter((t) => t.status === "in_progress").length,
					completed: todos.filter((t) => t.status === "completed").length,
					failed: todos.filter((t) => t.status === "failed").length,
				};


				const currentTask = todos.find((t) => t.status === "in_progress");

				const statusMessage =
					`Todo updated: ${stats.completed}/${stats.total} completed, ` +
					`${stats.in_progress} in_progress, ${stats.pending} pending` +
					(currentTask ? ` | Current: "${currentTask.content}"` : "");

				this.logger.log(statusMessage);


				const threadId = extractThreadId(config);
				if (threadId) {
					try {
						await this.workingMemoryService.updateTodos(threadId, todos);
						this.logger.debug(
							`Persisted todos to database for thread ${threadId}`,
						);
					} catch (error) {
						this.logger.error(
							`Failed to persist todos for thread ${threadId}: ${(error as Error).message}`,
						);

					}
				} else {
					this.logger.warn(
						"No thread_id in config, todos will not be persisted",
					);
				}


				this.logger.debug(`Todo list: ${JSON.stringify(todos, null, 2)}`);


				return {
					todos,
					statusMessage,
				};
			},
			{
				name: "write_todos",
				description: WRITE_TODOS_DESCRIPTION,
				schema: z.object({
					todos: z.array(TodoSchema).describe("Complete task list; replaces the full list"),
				}),
			},
		);
	}

	/**
	 *
	 */
	createReadTodosTool() {
		return tool(
			async (
				_input: object,
				config: RunnableConfig,
			): Promise<ReadTodosResult> => {
				const threadId = extractThreadId(config);

				if (!threadId) {
					this.logger.warn(
						"No thread_id in config, cannot read todos from database",
					);
					return {
						todos: [],
						statusMessage: "Unable to get task list: missing thread_id",
					};
				}

				try {
					const todos = await this.workingMemoryService.getTodos(threadId);

					if (!todos || todos.length === 0) {
						return {
							todos: [],
							statusMessage: "No task list yet",
						};
					}


					const stats = {
						total: todos.length,
						pending: todos.filter((t) => t.status === "pending").length,
						in_progress: todos.filter((t) => t.status === "in_progress").length,
						completed: todos.filter((t) => t.status === "completed").length,
						failed: todos.filter((t) => t.status === "failed").length,
					};


					const currentTask = todos.find((t) => t.status === "in_progress");

					const statusMessage =
						`Todo status: ${stats.completed}/${stats.total} completed, ` +
						`${stats.in_progress} in_progress, ${stats.pending} pending` +
						(currentTask ? ` | Current: "${currentTask.content}"` : "");

					this.logger.log(
						`Read todos for thread ${threadId}: ${statusMessage}`,
					);

					return {
						todos,
						statusMessage,
					};
				} catch (error) {
					this.logger.error(
						`Failed to read todos for thread ${threadId}: ${(error as Error).message}`,
					);
					return {
						todos: [],
						statusMessage: `Failed to get task list: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "read_todos",
				description: READ_TODOS_DESCRIPTION,
				schema: z.object({
					reason: z
						.string()
						.describe("Briefly explain why the task list needs to be read, for example: check progress"),
				}),
			},
		);
	}
}


export type { SupervisorTodo };
