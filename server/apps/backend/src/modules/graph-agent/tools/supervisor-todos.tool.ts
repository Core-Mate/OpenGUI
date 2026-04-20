import type { RunnableConfig } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import type { SupervisorTodo } from "../graph/state/state.types";
import { WorkingMemoryService } from "../working-memory/working-memory.service";

/**
 * write_todos 工具的返回结果
 */
export interface WriteTodosResult {
	todos: SupervisorTodo[];
	statusMessage: string;
}

/**
 * read_todos 工具的返回结果
 */
export interface ReadTodosResult {
	todos: SupervisorTodo[];
	statusMessage: string;
}

/**
 * Todo 状态枚举
 */
const TodoStatusSchema = z
	.enum(["pending", "in_progress", "completed", "failed"])
	.describe("任务状态");

/**
 * 单个 Todo 项结构
 */
const TodoSchema = z.object({
	content: z.string().describe("任务内容"),
	status: TodoStatusSchema,
	required_skills: z
		.array(z.string())
		.optional()
		.describe("执行此任务所需的 Skill 名称列表（可选）"),
});

/**
 * 工具描述（简化版，Plan Supervisor 场景专用）
 */
const WRITE_TODOS_DESCRIPTION = `管理子任务列表，用于跟踪复杂任务的执行进度。

## 使用时机
- 首次调用时：根据计划文档拆解出子任务列表
- 子任务完成后：更新状态为 completed，标记下一个任务为 in_progress
- 需要调整时：修改、删除不再需要的任务

## 状态说明
- pending: 待处理
- in_progress: 正在执行（同一时刻只有一个）
- completed: 已完成
- failed: 执行失败

## required_skills 字段
- 可选字段，用于指定执行该子任务所需的 Skill 名称
- 仅填写已通过 load_skill 加载的 Skill 名称
- 如果子任务不需要特殊 Skill，可以省略此字段

## 使用规则
1. 首次创建列表时，将第一个任务标记为 in_progress
2. 完成一个任务后立即更新状态，不要批量更新
3. 可以根据执行情况动态调整任务列表
4. 所有任务描述必须使用中文字符，尤其是引号必须使用中文引号`;

const READ_TODOS_DESCRIPTION = `获取当前的子任务列表状态。

## 使用时机
- 需要查看当前任务进度时
- 在决策下一步操作前，了解已完成和待执行的任务

## 返回信息
- 完整的任务列表及其状态
- 统计信息：已完成/总数、进行中、待处理的数量`;

/**
 * 从 RunnableConfig 中提取 threadId
 * LangGraph 的 configurable 中包含 thread_id
 */
function extractThreadId(config: RunnableConfig): string | undefined {
	const configurable = config?.configurable as
		| { thread_id?: string }
		| undefined;
	return configurable?.thread_id;
}

/**
 * Supervisor Todos 工具服务
 *
 * 提供 write_todos 工具的创建，支持数据库持久化
 * 通过 WorkingMemoryService 将 todos 存储到 working_memory 表
 */
@Injectable()
export class SupervisorTodosToolService {
	private readonly logger = new Logger(SupervisorTodosToolService.name);

	constructor(private readonly workingMemoryService: WorkingMemoryService) {}

	/**
	 * 创建 write_todos 工具
	 *
	 * 返回一个 LangChain tool，调用时会：
	 * 1. 持久化 todos 到数据库（如果有 threadId）
	 * 2. 返回 WriteTodosResult 供调用方更新状态
	 *
	 * 与原版的区别：
	 * - 原版：todos 存储在 middleware 内部 stateSchema，每次 createAgent() 重置
	 * - 新版：todos 持久化到数据库，同时存储在 AgentState.supervisorTodos，跨循环持久化
	 */
	createWriteTodosTool() {
		return tool(
			async ({ todos }, config: RunnableConfig): Promise<WriteTodosResult> => {
				// 统计各状态数量
				const stats = {
					total: todos.length,
					pending: todos.filter((t) => t.status === "pending").length,
					in_progress: todos.filter((t) => t.status === "in_progress").length,
					completed: todos.filter((t) => t.status === "completed").length,
					failed: todos.filter((t) => t.status === "failed").length,
				};

				// 找出当前正在执行的任务
				const currentTask = todos.find((t) => t.status === "in_progress");

				const statusMessage =
					`Todo updated: ${stats.completed}/${stats.total} completed, ` +
					`${stats.in_progress} in_progress, ${stats.pending} pending` +
					(currentTask ? ` | Current: "${currentTask.content}"` : "");

				this.logger.log(statusMessage);

				// 持久化到数据库
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
						// 持久化失败不影响工具返回结果
					}
				} else {
					this.logger.warn(
						"No thread_id in config, todos will not be persisted",
					);
				}

				// 详细日志（debug 级别）
				this.logger.debug(`Todo list: ${JSON.stringify(todos, null, 2)}`);

				// 返回结构化结果，由调用方处理状态更新和 ToolMessage 创建
				return {
					todos,
					statusMessage,
				};
			},
			{
				name: "write_todos",
				description: WRITE_TODOS_DESCRIPTION,
				schema: z.object({
					todos: z.array(TodoSchema).describe("完整的任务列表（全量替换）"),
				}),
			},
		);
	}

	/**
	 * 创建 read_todos 工具
	 *
	 * 返回一个 LangChain tool，调用时会：
	 * 1. 从数据库读取当前的 todos 列表
	 * 2. 返回 ReadTodosResult 供 LLM 了解当前任务进度
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
						statusMessage: "无法获取任务列表：缺少 thread_id",
					};
				}

				try {
					const todos = await this.workingMemoryService.getTodos(threadId);

					if (!todos || todos.length === 0) {
						return {
							todos: [],
							statusMessage: "当前没有任务列表",
						};
					}

					// 统计各状态数量
					const stats = {
						total: todos.length,
						pending: todos.filter((t) => t.status === "pending").length,
						in_progress: todos.filter((t) => t.status === "in_progress").length,
						completed: todos.filter((t) => t.status === "completed").length,
						failed: todos.filter((t) => t.status === "failed").length,
					};

					// 找出当前正在执行的任务
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
						statusMessage: `获取任务列表失败: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "read_todos",
				description: READ_TODOS_DESCRIPTION,
				schema: z.object({
					reason: z
						.string()
						.describe("简述为何需要读取任务列表，例如：检查进度"),
				}),
			},
		);
	}
}

// 导出类型供外部使用
export type { SupervisorTodo };
