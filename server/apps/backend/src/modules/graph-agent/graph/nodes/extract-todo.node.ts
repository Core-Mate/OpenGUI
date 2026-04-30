import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import type { SkillProvider } from "../../skill/skill.provider";
import { SkillNodeType } from "../../skill/skill.types";
import type { WorkingMemoryService } from "../../working-memory/working-memory.service";
import type { AgentState, SupervisorTodo } from "../state/state.types";
import type { SkillDTO } from "../../skill/skill.types";

const logger = new Logger("ExtractTodoNode");

/**
 *
 *
 */
export function createExtractTodoNode(
	workingMemoryService: WorkingMemoryService,
	skillProvider: SkillProvider,
) {
	return async (
		state: AgentState,
		runnableConfig?: LangGraphRunnableConfig,
	): Promise<Partial<AgentState>> => {
		logger.log(
			`Extract todo node invoked for task ${state.taskExecutionId}`,
		);

		const threadId = (
			runnableConfig?.configurable as Record<string, unknown>
		)?.thread_id as string | undefined;

		if (!threadId) {
			logger.warn("No thread_id in config, cannot read todos");
			return { todoFound: false, planTodoComplete: false };
		}


		let todos: SupervisorTodo[] = [];
		try {
			todos =
				(await workingMemoryService.getTodos(threadId)) || [];
		} catch (error) {
			logger.error(
				`Failed to read todos: ${(error as Error).message}`,
			);
			return { todoFound: false, planTodoComplete: false };
		}

		if (todos.length === 0) {
			logger.log("No todos found in DB, routing to fallback_extract");
			return { todoFound: false, planTodoComplete: false };
		}


		const allComplete = todos.every(
			(t) => t.status === "completed" || t.status === "failed",
		);
		if (allComplete) {
			logger.log(
				`All ${todos.length} todos are completed/failed`,
			);
			return { todoFound: false, planTodoComplete: true };
		}


		const currentTodo =
			todos.find((t) => t.status === "in_progress") ||
			todos.find((t) => t.status === "pending");

		if (!currentTodo) {

			logger.warn(
				"Todos exist but none are pending/in_progress, treating as complete",
			);
			return { todoFound: false, planTodoComplete: true };
		}

		logger.log(`Extracted todo: "${currentTodo.content.substring(0, 80)}..."`);


		let selectedSkills: SkillDTO[] = [];
		if (
			currentTodo.required_skills &&
			currentTodo.required_skills.length > 0
		) {
			try {
				const tenantId = state.tenantId ?? -1;
				const executorSkills = await skillProvider.getSkillsForNode(
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
			executorInput: {
				instruction: currentTodo.content,
				skills:
					selectedSkills.length > 0 ? selectedSkills : undefined,
			},
			planTodoComplete: false,
		};
	};
}
