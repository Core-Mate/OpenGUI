import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { AgentConfigProvider } from "../config/agent-config.provider";
import { createConfiguredChatModel } from "../config/chat-model.factory";
import { AgentName } from "../config/types";
import type { MemorySource } from "./task-memory.service";

/**
 * Extraction hints for each memory source.
 */
const SOURCE_EXTRACTION_HINTS: Record<MemorySource, string> = {
	feedback:
		"This is user feedback provided during task execution. Focus on user preferences, dissatisfaction, and expected improvements.",
	instruction:
		"This is an additional instruction provided when resuming task execution. Focus on new requirements, added context, and direction changes.",
	summary:
		"This is the summary after task execution. Focus on lessons learned, successful patterns, and reusable strategies.",
};

/**
 * Memory extraction service.
 *
 * Uses the ACTION_SUMMARIZER model configuration to extract task-related memory.
 */
@Injectable()
export class MemoryExtractorService {
	private readonly logger = new Logger(MemoryExtractorService.name);

	constructor(
		private readonly configProvider: AgentConfigProvider,
		private readonly prismaService: PrismaService,
	) {}

	/**
	 * Extract key memory from content.
	 *
	 * @param params extraction parameters
	 * @returns extracted key memory text
	 */
	async extractMemory(params: {
		userInput: string;
		content: string;
		source: MemorySource;
		userId: number;
	}): Promise<string> {
		const { userInput, content, source, userId } = params;

		if (!content || !content.trim()) {
			return "";
		}

		try {
			// Resolve user region by userId.
			const user = await this.prismaService.users.findUnique({
				where: { id: userId },
				select: { region: true },
			});
			const userRegion = user?.region || "CN";

			// Reuse ACTION_SUMMARIZER model configuration.
			const modelConfig = await this.configProvider.getModelConfig(
				AgentName.ACTION_SUMMARIZER,
				userRegion,
			);

			// Create the primary model.
			const primaryModel = createConfiguredChatModel(modelConfig, {
				temperature: modelConfig.temperature ?? 0.1,
				maxRetries: 2,
				timeout: 30000,
			});

			const model = primaryModel;

			const sourceHint = SOURCE_EXTRACTION_HINTS[source];

			const systemPrompt = `You are a task-execution memory extraction assistant. Extract key information from user feedback, additional instructions, or execution summaries that may help future runs of the same task.

Extraction principles:
1. Extract only task-execution-related information and ignore unrelated content.
2. Focus on user preferences, improvement suggestions, and next-action hints.
3. Keep the information concise and easy to reference.
4. Output plain text only. Do not include formatting markers or irrelevant content.`;

			const userPrompt = `${sourceHint}

## Original user task
${userInput}

## Content to extract from
${content}

---
Based on the content above, extract key memory that could help if the same task is run again. Keep it around 150 words and output plain text only.`;

			const response = await model.invoke([
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			]);

			// Get plain text response.
			const extractedMemory =
				typeof response.content === "string" ? response.content.trim() : "";

			if (extractedMemory) {
				this.logger.debug(
					`Extracted memory from ${source}: ${extractedMemory.substring(0, 100)}...`,
				);
			}

			return extractedMemory;
		} catch (error) {
			this.logger.warn(`Failed to extract memory: ${(error as Error).message}`);
			// If extraction fails, fall back to the first 300 characters.
			return content.length > 300 ? `${content.substring(0, 300)}...` : content;
		}
	}
}
