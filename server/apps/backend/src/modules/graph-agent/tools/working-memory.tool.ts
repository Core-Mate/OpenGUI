import type { RunnableConfig } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { WorkingMemoryService } from "../working-memory/working-memory.service";
import type {
	ClearWorkingMemoryOutput,
	GetWorkingMemoryOutput,
	UpdateWorkingMemoryOutput,
} from "../working-memory/working-memory.types";

/**
 * Working Memory 工具服务
 *
 * 提供 LangChain 工具用于在 Agent 中管理工作记忆
 * 工具从 RunnableConfig.configurable.thread_id 获取会话隔离键
 */
@Injectable()
export class WorkingMemoryToolService {
	private readonly logger = new Logger(WorkingMemoryToolService.name);

	constructor(private readonly workingMemoryService: WorkingMemoryService) {}

	/**
	 * 创建所有工作记忆工具
	 * 工具从 RunnableConfig.configurable.thread_id 获取 thread_id
	 */
	createTools() {
		return [
			this.createGetTool(),
			this.createUpdateTool(),
			this.createClearTool(),
		];
	}

	/**
	 * 创建获取工作记忆工具
	 */
	public createGetTool() {
		return tool(
			async (_, config: RunnableConfig): Promise<GetWorkingMemoryOutput> => {
				try {
					const threadId = this.extractThreadId(config);
					if (!threadId) {
						return {
							success: false,
							error: "无法获取 thread_id，请确保在正确的会话上下文中调用",
						};
					}

					const content =
						await this.workingMemoryService.getWorkingMemory(threadId);

					this.logger.debug(
						`Retrieved working memory for thread ${threadId}: ${content ? "found" : "empty"}`,
					);

					return {
						success: true,
						content,
					};
				} catch (error) {
					this.logger.error(
						`Failed to get working memory: ${(error as Error).message}`,
					);
					return {
						success: false,
						error: `获取工作记忆失败: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "get_working_memory",
				description:
					"获取当前会话的工作记忆内容。工作记忆用于存储重要的上下文信息、用户偏好、目标等。在需要回顾之前存储的信息时使用此工具。",
				schema: z.preprocess(() => ({}), z.object({})),
			},
		);
	}

	/**
	 * 创建更新工作记忆工具
	 */
	private createUpdateTool() {
		return tool(
			async (
				input: { content: string; mode?: "append" | "replace" },
				config: RunnableConfig,
			): Promise<UpdateWorkingMemoryOutput> => {
				try {
					const threadId = this.extractThreadId(config);
					if (!threadId) {
						return {
							success: false,
							error: "无法获取 thread_id，请确保在正确的会话上下文中调用",
						};
					}

					await this.workingMemoryService.updateWorkingMemory(
						threadId,
						input.content,
						input.mode || "append",
					);

					this.logger.debug(
						`Updated working memory for thread ${threadId} (mode: ${input.mode || "append"})`,
					);

					return { success: true };
				} catch (error) {
					this.logger.error(
						`Failed to update working memory: ${(error as Error).message}`,
					);
					return {
						success: false,
						error: `更新工作记忆失败: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "update_working_memory",
				description: `写入工作记忆内容。工作记忆用于记录执行过程中收集到的重要信息与关键素材。

使用场景举例：
- 记录用户要求收集的素材和信息
- 保存关键的决策或结论
- 存储需要在后续对话中使用的信息
- 存储后续任务执行时需要用到的素材（比如用户要求总结 Feed 流中的热点话题，则需要在 working memory中记录执行过程中收集的 Feed 话题内容，方便后续总结）

更新模式：
- append（默认）：将新内容追加到现有内容后，使用分隔符分隔
- replace：完全替换现有内容，仅在需要重新组织全部内容时使用

格式：使用 Markdown 格式组织内容`,
				schema: z.object({
					content: z.string().describe("要存储的内容（Markdown 格式）"),
					mode: z
						.enum(["append", "replace"])
						.default("append")
						.describe("更新模式：append 追加内容，replace 替换内容"),
				}),
			},
		);
	}

	/**
	 * 创建清除工作记忆工具
	 */
	private createClearTool() {
		return tool(
			async (_, config: RunnableConfig): Promise<ClearWorkingMemoryOutput> => {
				try {
					const threadId = this.extractThreadId(config);
					if (!threadId) {
						return {
							success: false,
							error: "无法获取 thread_id，请确保在正确的会话上下文中调用",
						};
					}

					await this.workingMemoryService.clearWorkingMemory(threadId);

					this.logger.debug(`Cleared working memory for thread ${threadId}`);

					return { success: true };
				} catch (error) {
					this.logger.error(
						`Failed to clear working memory: ${(error as Error).message}`,
					);
					return {
						success: false,
						error: `清除工作记忆失败: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "clear_working_memory",
				description:
					"清除当前会话的所有工作记忆内容。仅在需要完全重置上下文时使用，此操作不可撤销。",
				schema: z.preprocess(() => ({}), z.object({})),
			},
		);
	}

	/**
	 * 从 RunnableConfig 中提取 thread_id
	 *
	 * @param config - LangChain RunnableConfig
	 * @returns thread_id 或 undefined
	 */
	private extractThreadId(config: RunnableConfig): string | undefined {
		// 尝试从 configurable.thread_id 获取（LangGraph 标准方式）
		const threadId = (config?.configurable as Record<string, unknown>)
			?.thread_id as string | undefined;

		if (!threadId) {
			this.logger.warn(
				"thread_id not found in config.configurable, working memory operations may fail",
			);
		}

		return threadId;
	}
}
