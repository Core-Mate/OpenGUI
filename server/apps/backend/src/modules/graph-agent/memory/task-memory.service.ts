import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import type { BaseStore } from "@langchain/langgraph";
import { MemoryExtractorService } from "./memory-extractor.service";

/**
 * 记忆来源类型
 */
export type MemorySource = "feedback" | "instruction" | "summary";

/**
 * 记忆来源权重配置
 * - feedback: 50% - 用户 HITL 恢复时的主动反馈，最重要
 * - summary: 40% - 执行总结，包含完整上下文
 * - instruction: 10% - fork 执行时的追加指令，通常较短
 */
const SOURCE_WEIGHTS: Record<MemorySource, number> = {
	feedback: 0.5,
	instruction: 0.1,
	summary: 0.4,
};

/**
 * 记忆来源标签（用于 prompt 展示）
 */
const SOURCE_LABELS: Record<MemorySource, string> = {
	feedback: "用户反馈",
	instruction: "追加指令",
	summary: "执行总结",
};

/**
 * 存储的记忆数据结构
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
 * 召回的记忆项
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
 * Task 级别长期记忆服务
 *
 * 提供 Task 级别的记忆存储和召回能力：
 * - 同一个 Task 的多次 Execution 共享记忆
 * - 使用 `task_memory:{taskId}` 作为命名空间
 * - 按来源权重对召回的记忆排序
 */
@Injectable()
export class TaskMemoryService {
	private readonly logger = new Logger(TaskMemoryService.name);

	constructor(
		private readonly memoryExtractorService: MemoryExtractorService,
	) {}

	/**
	 * 存储记忆到 Store（异步提取关键信息后存储）
	 *
	 * @param store BaseStore 实例（支持 PostgresStore 等实现）
	 * @param params 存储参数
	 */
	async storeMemory(
		store: BaseStore,
		params: {
			taskId: number;
			executionId: number;
			source: MemorySource;
			content: string;
			userInput: string; // 用户原始指令，用于提取上下文
			userId: number; // 用户 ID，用于获取地区选择模型配置
		},
	): Promise<void> {
		const { taskId, executionId, source, content, userInput, userId } = params;

		// 验证内容不为空
		if (!content || !content.trim()) {
			this.logger.debug(
				`Skipping empty ${source} memory for task ${taskId}, execution ${executionId}`,
			);
			return;
		}

		// 使用模型提取关键信息
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
			// 提取失败时使用原始内容
			extractedContent = content.trim();
		}

		// 如果提取后内容为空，跳过存储
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
	 * 召回记忆（全量 + 按权重排序）
	 *
	 * @param store BaseStore 实例（支持 PostgresStore 等实现）
	 * @param taskId 任务 ID
	 * @param limit 最大召回数量
	 * @returns 按权重降序排序的记忆列表
	 */
	async recallMemories(
		store: BaseStore,
		taskId: number,
		limit: number = 20,
	): Promise<TaskMemoryItem[]> {
		const namespace = ["task_memory", taskId.toString()];

		// 使用 search 获取所有记忆（不带 query 参数）
		const items = await store.search(namespace, { limit });

		// 按权重降序排序
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
	 * 格式化记忆为 prompt 文本
	 *
	 * @param memories 记忆列表
	 * @returns 格式化后的文本，可直接注入到 prompt 中
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
	 * 获取来源标签
	 */
	getSourceLabel(source: MemorySource): string {
		return SOURCE_LABELS[source] || source;
	}
}
