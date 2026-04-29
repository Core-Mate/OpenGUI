import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import type { BaseStore } from "@langchain/langgraph";
import { MemoryExtractorService } from "./memory-extractor.service";

/**
 */
export type MemorySource = "feedback" | "instruction" | "summary";

/**
 * - feedback: 50% - User feedback during HITL resume, highest importance
 */
const SOURCE_WEIGHTS: Record<MemorySource, number> = {
	feedback: 0.5,
	instruction: 0.1,
	summary: 0.4,
};

/**
 */
const SOURCE_LABELS: Record<MemorySource, string> = {
	feedback: "User feedback",
	instruction: "Additional instruction",
	summary: "Execution summary",
};

/**
 */
export interface TaskMemoryValue {
	content: string;
	source: MemorySource;
	weight: number;
	executionId: number;
	createdAt: string;
	[key: string]: string | number; // Index signature for compatibility with Record<string, unknown>
}

/**
 */
export interface TaskMemoryItem {
	key: string;
	content: string;
	source: MemorySource;
	weight: number;
	executionId: number;
	createdAt: string;
}

/**
 *
 * - Uses `task_memory:{taskId}` as the namespace.
 */
@Injectable()
export class TaskMemoryService {
	private readonly logger = new Logger(TaskMemoryService.name);

	constructor(
		private readonly memoryExtractorService: MemoryExtractorService,
	) {}

	/**
	 *
	 */
	async storeMemory(
		store: BaseStore,
		params: {
			taskId: number;
			executionId: number;
			source: MemorySource;
			content: string;
			userInput: string;
			userId: number;
		},
	): Promise<void> {
		const { taskId, executionId, source, content, userInput, userId } = params;


		if (!content || !content.trim()) {
			this.logger.debug(
				`Skipping empty ${source} memory for task ${taskId}, execution ${executionId}`,
			);
			return;
		}


		let extractedContent: string;
		try {
			extractedContent = await this.memoryExtractorService.extractMemory({
				userInput,
				content,
				source,
				userId,
			});
		} catch (error) {
			this.logger.warn(
				`Memory extraction failed, using original content: ${(error as Error).message}`,
			);

			extractedContent = content.trim();
		}


		if (!extractedContent || !extractedContent.trim()) {
			this.logger.debug(
				`Skipping empty extracted ${source} memory for task ${taskId}, execution ${executionId}`,
			);
			return;
		}

		const namespace = ["task_memory", taskId.toString()];
		const key = uuidv4();
		const weight = SOURCE_WEIGHTS[source];

		const memoryValue: TaskMemoryValue = {
			content: extractedContent.trim(),
			source,
			weight,
			executionId,
			createdAt: new Date().toISOString(),
		};

		await store.put(namespace, key, memoryValue);

		this.logger.log(
			`Stored extracted ${source} memory for task ${taskId}, execution ${executionId}`,
		);
	}

	/**
	 *
	 */
	async recallMemories(
		store: BaseStore,
		taskId: number,
		limit: number = 20,
	): Promise<TaskMemoryItem[]> {
		const namespace = ["task_memory", taskId.toString()];


		const items = await store.search(namespace, { limit });


		const sorted = items.sort((a, b) => {
			const weightA = (a.value as TaskMemoryValue).weight || 0;
			const weightB = (b.value as TaskMemoryValue).weight || 0;
			return weightB - weightA;
		});

		return sorted.map((item) => {
			const value = item.value as TaskMemoryValue;
			return {
				key: item.key,
				content: value.content,
				source: value.source,
				weight: value.weight,
				executionId: value.executionId,
				createdAt: value.createdAt,
			};
		});
	}

	/**
	 *
	 */
	formatMemoriesForPrompt(memories: TaskMemoryItem[]): string {
		if (memories.length === 0) {
			return "";
		}

		return memories
			.map((m) => {
				const sourceLabel = SOURCE_LABELS[m.source] || m.source;
				return `[${sourceLabel}] ${m.content}`;
			})
			.join("\n\n---\n\n");
	}

	/**
	 */
	getSourceLabel(source: MemorySource): string {
		return SOURCE_LABELS[source] || source;
	}
}
