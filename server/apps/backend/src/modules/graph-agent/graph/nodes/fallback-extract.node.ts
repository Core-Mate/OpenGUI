import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import type { AgentConfigProvider } from "../../config/agent-config.provider";
import { createConfiguredChatModel } from "../../config/chat-model.factory";
import { AgentName } from "../../config/types";
import type { SkillProvider } from "../../skill/skill.provider";
import { SkillDTO, SkillNodeType } from "../../skill/skill.types";
import type { WorkingMemoryService } from "../../working-memory/working-memory.service";
import type { AgentState, SupervisorTodo } from "../state/state.types";

const logger = new Logger("FallbackExtractNode");

const MAX_EXTRACT_RETRIES = 2;

/**
 */
const FallbackExtractSchema = z.object({
	todos: z
		.array(
			z.object({
				content: z.string().describe("Task content"),
				status: z
					.enum(["pending", "in_progress", "completed", "failed"])
					.describe("Task status"),
				required_skills: z
					.array(z.string())
					.optional()
					.describe("Skill names required to execute this task; optional"),
			}),
		)
		.describe("Complete subtask list"),
});

/**
 *
 *
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


		const threadId = (
			runnableConfig?.configurable as Record<string, unknown>
		)?.thread_id as string | undefined;


		const inputText =
			state.planDocument ||
			state.supervisorStreamOutput ||
			state.userInput;

		try {

			const config = await configProvider.getModelConfig(
				AgentName.PLAN_SUPERVISOR,
				state.userRegion,
			);

			const model = createConfiguredChatModel(config, {
				model: config.fallbackModel ?? config.model,
				temperature: 0,
				maxRetries: 2,
				timeout: 15000,
			});

			const structuredModel = model.withStructuredOutput(
				FallbackExtractSchema,
				{ name: "extract_todos" },
			);


			let existingTodosContext = "";
			if (threadId) {
				try {
					const existingTodos =
						await workingMemoryService.getTodos(threadId);
					if (existingTodos && existingTodos.length > 0) {
						existingTodosContext = `\n\n## Existing task list from the previous run\n${JSON.stringify(existingTodos, null, 2)}\n\nUpdate the task list based on this progress. Keep completed tasks as completed, failed tasks as failed, and mark the next task to run as in_progress.`;
					}
				} catch (error) {
					logger.warn(
						`Failed to read existing todos: ${(error as Error).message}`,
					);
				}
			}


			let result: z.infer<typeof FallbackExtractSchema> | null = null;

			for (let attempt = 0; attempt <= MAX_EXTRACT_RETRIES; attempt++) {
				try {
					result = await structuredModel.invoke(
						[
							new SystemMessage(
								"You are a task extraction assistant. Extract a complete subtask list from the given task plan text.\n\n" +
									"## Requirements\n" +
									"- Each subtask must be a complete, self-contained execution instruction with enough context, such as target app and search keywords.\n" +
									"- Mark the first task to execute as in_progress and all not-yet-started tasks as pending.\n" +
									"- If an existing task list is provided, update based on its status and preserve completed or failed states.\n" +
									"- If the text does not clearly break down subtasks, return the whole task as one in_progress subtask.",
							),
							new HumanMessage(
								`Extract a subtask list from the following planning text:\n\n${inputText}${existingTodosContext}`,
							),
						],
						runnableConfig,
					);
					break;
				} catch (error) {
					if (attempt < MAX_EXTRACT_RETRIES) {
						logger.warn(
							`Extract attempt ${attempt + 1} failed: ${(error as Error).message}, retrying...`,
						);
					} else {
						throw error;
					}
				}
			}

			if (!result || result.todos.length === 0) {
				throw new Error("Extracted empty todos list");
			}

			logger.log(
				`Extracted ${result.todos.length} todos from plan document`,
			);


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

				}
			}


			const currentTodo =
				result.todos.find((t) => t.status === "in_progress") ||
				result.todos.find((t) => t.status === "pending");

			if (!currentTodo) {


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
