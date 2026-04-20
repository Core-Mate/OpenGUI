import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { Logger } from "@nestjs/common";
import type { SkillProvider } from "../../skill/skill.provider";
import { SkillNodeType } from "../../skill/skill.types";
import type { WorkingMemoryService } from "../../working-memory/working-memory.service";
import type { AgentState, SupervisorTodo } from "../state/state.types";
import type { SkillDTO } from "../../skill/skill.types";

const logger = new Logger("ExtractTodoNode");

/**
 * 创建 Extract Todo 节点函数
 *
 * 职责：
 * - 从 WorkingMemoryService 读取 Supervisor 写入的 Todo 列表
 * - 提取第一个 in_progress 或 pending 状态的 Todo
 * - 解析 Todo 中的 required_skills 并映射为 SkillDTO
 * - 根据结果设置路由信号：todoFound / planTodoComplete
 *
 * @param workingMemoryService 工作记忆服务
 * @param skillProvider Skill 提供者
 * @returns Extract Todo 节点函数
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

		// 从数据库读取 todos
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

		// 检查是否全部完成
		const allComplete = todos.every(
			(t) => t.status === "completed" || t.status === "failed",
		);
		if (allComplete) {
			logger.log(
				`All ${todos.length} todos are completed/failed`,
			);
			return { todoFound: false, planTodoComplete: true };
		}

		// 优先找 in_progress 的 todo，其次找 pending
		const currentTodo =
			todos.find((t) => t.status === "in_progress") ||
			todos.find((t) => t.status === "pending");

		if (!currentTodo) {
			// 边界情况：有 todo 但没有 pending/in_progress
			logger.warn(
				"Todos exist but none are pending/in_progress, treating as complete",
			);
			return { todoFound: false, planTodoComplete: true };
		}

		logger.log(`Extracted todo: "${currentTodo.content.substring(0, 80)}..."`);

		// 解析 required_skills → SkillDTO[]
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
