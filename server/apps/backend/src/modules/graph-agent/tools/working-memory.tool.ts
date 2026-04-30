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
 *
 */
@Injectable()
export class WorkingMemoryToolService {
	private readonly logger = new Logger(WorkingMemoryToolService.name);

	constructor(private readonly workingMemoryService: WorkingMemoryService) {}

	/**
	 */
	createTools() {
		return [
			this.createGetTool(),
			this.createUpdateTool(),
			this.createClearTool(),
		];
	}

	/**
	 */
	public createGetTool() {
		return tool(
			async (_, config: RunnableConfig): Promise<GetWorkingMemoryOutput> => {
				try {
					const threadId = this.extractThreadId(config);
					if (!threadId) {
						return {
							success: false,
							error: "Unable to get thread_id. Ensure the tool is called in the correct session context.",
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
						error: `Failed to get working memory: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "get_working_memory",
				description:
					"Get the current session working memory. Working memory stores important context, user preferences, goals, and collected facts. Use this when reviewing previously stored information.",
				schema: z.preprocess(() => ({}), z.object({})),
			},
		);
	}

	/**
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
							error: "Unable to get thread_id. Ensure the tool is called in the correct session context.",
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
						error: `Failed to update working memory: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "update_working_memory",
				description: `Write working memory content. Working memory records important information and key material collected during execution.

Example use cases:
- Record material and information the user asked to collect.
- Save key decisions or conclusions.
- Store information needed in later conversation turns.
- Store material needed for later execution, such as feed topics collected while summarizing trending posts.

Update modes:
- append (default): append new content after existing content with a separator.
- replace: replace all existing content; use only when reorganizing the whole memory.

Format: organize content with Markdown.`,
				schema: z.object({
					content: z.string().describe("Content to store in Markdown format"),
					mode: z
						.enum(["append", "replace"])
						.default("append")
						.describe("Update mode: append content or replace existing content"),
				}),
			},
		);
	}

	/**
	 */
	private createClearTool() {
		return tool(
			async (_, config: RunnableConfig): Promise<ClearWorkingMemoryOutput> => {
				try {
					const threadId = this.extractThreadId(config);
					if (!threadId) {
						return {
							success: false,
							error: "Unable to get thread_id. Ensure the tool is called in the correct session context.",
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
						error: `Failed to clear working memory: ${(error as Error).message}`,
					};
				}
			},
			{
				name: "clear_working_memory",
				description:
					"Clear all working memory for the current session. Use only when a full context reset is needed. This action is irreversible.",
				schema: z.preprocess(() => ({}), z.object({})),
			},
		);
	}

	/**
	 *
	 * @param config - LangChain RunnableConfig
	 */
	private extractThreadId(config: RunnableConfig): string | undefined {

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
