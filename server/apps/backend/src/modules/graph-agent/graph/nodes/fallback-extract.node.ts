import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import type { AgentConfigProvider } from "../../config/agent-config.provider";
import { AgentName } from "../../config/types";
import type { SkillProvider } from "../../skill/skill.provider";
import { SkillDTO, SkillNodeType } from "../../skill/skill.types";
import type { WorkingMemoryService } from "../../working-memory/working-memory.service";
import type { AgentState, SupervisorTodo } from "../state/state.types";

const logger = new Logger("FallbackExtractNode");

/** 提取失败时最大重试次数 */
const MAX_EXTRACT_RETRIES = 2;

/**
 * Todo 提取 Schema — 与 supervisor-todos.tool.ts 的 TodoSchema 保持一致
 */
const FallbackExtractSchema = z.object({
	todos: z
		.array(
			z.object({
				content: z.string().describe("任务内容"),
				status: z
					.enum(["pending", "in_progress", "completed", "failed"])
					.describe("任务状态"),
				required_skills: z
					.array(z.string())
					.optional()
					.describe("执行此任务所需的 Skill 名称列表（可选）"),
			}),
		)
		.describe("完整的子任务列表"),
});

/**
 * 创建 Fallback Extract 节点函数
 *
 * 职责：
 * - 当 Supervisor 未通过 write_todos 工具写入 Todo 列表时的兜底方案
 * - 始终基于 planDocument（完整计划文档）提取子任务，避免重试时丢失上下文
 * - 从数据库读取已有 todo 列表，与计划文档一起传递给 LLM
 * - 提取成功后将 todos 持久化到数据库，确保后续循环 extract_todo 能读取
 *
 * @param configProvider 配置提供者（复用 Supervisor 的 API 凭证）
 * @param workingMemoryService 工作记忆服务（读取/写入 todos）
 * @param skillProvider Skill 提供者（解析 required_skills）
 * @returns Fallback Extract 节点函数
 */
export function createFallbackExtractNode(
	configProvider: AgentConfigProvider,
	workingMemoryService: WorkingMemoryService,
	skillProvider: SkillProvider,
) {
	return async (
		state: AgentState,
		runnableConfig?: LangGraphRunnableConfig,
	): Promise<Partial<AgentState>> => {
		logger.log(
			`Fallback extract node invoked for task ${state.taskExecutionId}`,
		);

		// 从 runnableConfig 提取 threadId
		const threadId = (
			runnableConfig?.configurable as Record<string, unknown>
		)?.thread_id as string | undefined;

		// 输入始终优先使用 planDocument（完整计划），避免重试时从简短的 supervisorStreamOutput 丢失上下文
		const inputText =
			state.planDocument ||
			state.supervisorStreamOutput ||
			state.userInput;

		try {
			// 获取 Supervisor 的 API 配置（复用 apiKey 和 baseURL）
			const config = await configProvider.getModelConfig(
				AgentName.PLAN_SUPERVISOR,
				state.userRegion,
			);

			const model = new ChatAnthropic({
				model: "claude-haiku-4-5-20251001",
				apiKey: config.apiKey,
				temperature: 0,
				clientOptions: {
					baseURL: config.baseURL,
					maxRetries: 2,
					timeout: 15000,
					authToken: null,
				},
			});

			const structuredModel = model.withStructuredOutput(
				FallbackExtractSchema,
				{ name: "extract_todos" },
			);

			// 从数据库读取已有 todos（如果有的话），作为上下文传递给 LLM
			let existingTodosContext = "";
			if (threadId) {
				try {
					const existingTodos =
						await workingMemoryService.getTodos(threadId);
					if (existingTodos && existingTodos.length > 0) {
						existingTodosContext = `\n\n## 已有的任务列表（来自上一轮执行）\n${JSON.stringify(existingTodos, null, 2)}\n\n请基于以上已有进度，更新任务列表状态。已完成的任务标记为 completed，失败的标记为 failed，下一个待执行的标记为 in_progress。`;
					}
				} catch (error) {
					logger.warn(
						`Failed to read existing todos: ${(error as Error).message}`,
					);
				}
			}

			// 带重试的 LLM 调用
			let result: z.infer<typeof FallbackExtractSchema> | null = null;

			for (let attempt = 0; attempt <= MAX_EXTRACT_RETRIES; attempt++) {
				try {
					result = await structuredModel.invoke(
						[
							new SystemMessage(
								"你是一个任务提取助手。从给定的任务规划文本中，提取完整的子任务列表。\n\n" +
									"## 要求\n" +
									"- 每个子任务必须是完整的、自包含的执行指令，包含足够的上下文信息（如目标 App、搜索关键词等）\n" +
									"- 第一个待执行的子任务标记为 in_progress，其余未开始的标记为 pending\n" +
									"- 如果提供了已有任务列表，请基于其状态更新（保留已完成/失败的状态）\n" +
									"- 如果文本中没有明确的子任务分解，则将整个任务作为一个 in_progress 子任务返回",
							),
							new HumanMessage(
								`请从以下规划文本中提取子任务列表：\n\n${inputText}${existingTodosContext}`,
							),
						],
						runnableConfig,
					);
					break; // 提取成功，跳出重试循环
				} catch (error) {
					if (attempt < MAX_EXTRACT_RETRIES) {
						logger.warn(
							`Extract attempt ${attempt + 1} failed: ${(error as Error).message}, retrying...`,
						);
					} else {
						throw error; // 最后一次重试也失败，抛出异常进入 catch
					}
				}
			}

			if (!result || result.todos.length === 0) {
				throw new Error("Extracted empty todos list");
			}

			logger.log(
				`Extracted ${result.todos.length} todos from plan document`,
			);

			// 持久化到数据库
			if (threadId) {
				try {
					await workingMemoryService.updateTodos(
						threadId,
						result.todos as SupervisorTodo[],
					);
					logger.log(
						`Persisted ${result.todos.length} todos to database for thread ${threadId}`,
					);
				} catch (error) {
					logger.error(
						`Failed to persist todos: ${(error as Error).message}`,
					);
					// 持久化失败不影响返回结果
				}
			}

			// 提取第一个 in_progress 或 pending 的 todo
			const currentTodo =
				result.todos.find((t) => t.status === "in_progress") ||
				result.todos.find((t) => t.status === "pending");

			if (!currentTodo) {
				// fallback_extract 有固定边到 executor，必须返回有效的 executorInput
				// 所有 todo 都已完成/失败时，用 userInput 兜底
				logger.warn(
					"All extracted todos are completed/failed, falling back to userInput",
				);
				return {
					todoFound: true,
					executorEntered: true,
					planTodoComplete: false,
					executorInput: {
						instruction: state.userInput,
					},
				};
			}

			logger.log(
				`Selected todo: "${currentTodo.content.substring(0, 100)}..."`,
			);

			// 解析 required_skills → SkillDTO[]
			let selectedSkills: SkillDTO[] = [];
			if (
				currentTodo.required_skills &&
				currentTodo.required_skills.length > 0
			) {
				try {
					const tenantId = state.tenantId ?? -1;
					const executorSkills =
						await skillProvider.getSkillsForNode(
							SkillNodeType.EXECUTOR_VLM,
							tenantId,
							state.userRegion,
						);

					selectedSkills = currentTodo.required_skills
						.map((name) =>
							executorSkills.find((s) => s.name === name),
						)
						.filter((s): s is SkillDTO => s !== undefined);

					if (selectedSkills.length > 0) {
						logger.debug(
							`Selected ${selectedSkills.length} skills for executor: ${selectedSkills.map((s) => s.name).join(", ")}`,
						);
					}
				} catch (error) {
					logger.warn(
						`Failed to resolve skills: ${(error as Error).message}`,
					);
				}
			}

			return {
				todoFound: true,
				executorEntered: true,
				planTodoComplete: false,
				executorInput: {
					instruction: currentTodo.content,
					skills:
						selectedSkills.length > 0
							? selectedSkills
							: undefined,
				},
			};
		} catch (error) {
			logger.error(
				`Fallback extract failed: ${(error as Error).message}`,
			);

			// 最终兜底：直接使用 userInput 作为 instruction
			return {
				todoFound: true,
				executorEntered: true,
				executorInput: {
					instruction: state.userInput,
				},
			};
		}
	};
}
