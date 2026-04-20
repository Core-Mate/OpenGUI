import { tool } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { KNOWLEDGE_BASE_ID } from "../../../common/base/constant";
import { KnowledgeService } from "../../knowledge/knowledge.service";
import type { KnowledgeChunk } from "../../knowledge/rag/rag.interface";

/**
 * Knowledge 工具输入 Schema
 */
const KnowledgeSearchInputSchema = z.object({
	query: z.string().describe("搜索查询文本，用于在知识库中检索相关信息"),
	limit: z.number().default(3).describe("返回结果数量限制"),
});

/**
 * Knowledge 工具输出类型
 */
export interface KnowledgeSearchOutput {
	success: boolean;
	chunks?: KnowledgeChunk[];
	error?: string;
}

/**
 * Knowledge 工具服务
 * 使用 RAG 从知识库中检索相关信息
 */
@Injectable()
export class KnowledgeToolService {
	private readonly logger = new Logger(KnowledgeToolService.name);

	constructor(private readonly knowledgeService: KnowledgeService) {}

	/**
	 * 创建知识库搜索工具
	 */
	createTool(defaultKnowledgeBaseId?: number) {
		return tool(
			async (input: z.infer<typeof KnowledgeSearchInputSchema>): Promise<KnowledgeSearchOutput> => {
				try {
					const knowledgeBaseId = defaultKnowledgeBaseId || KNOWLEDGE_BASE_ID;

					if (!knowledgeBaseId) {
						return {
							success: false,
							error: "未指定知识库ID",
						};
					}

					this.logger.log(
						`Searching knowledge base ${knowledgeBaseId} with query: ${input.query}`,
					);

					const chunks = await this.knowledgeService.retrieveKnowledgeChunks(
						input.query,
						knowledgeBaseId,
						{
							limit: input.limit,
							rerank_switch: true,
							rerank_model: "base-multilingual-rerank",
							retrieve_count: input.limit * 2,
							dense_weight: 0.8,
						},
					);

					this.logger.log(`Found ${chunks?.length || 0} relevant chunks`);

					return {
						success: true,
						chunks: chunks || [],
					};
				} catch (error) {
					this.logger.error(
						`Knowledge search failed: ${error.message}`,
						error.stack,
					);
					return {
						success: false,
						error: `知识库搜索失败: ${error.message}`,
					};
				}
			},
			{
				name: "search_knowledge",
				description:
					"使用 RAG (检索增强生成) 从知识库中搜索相关信息。用于查找特定信息以帮助回答问题或完成任务。",
				schema: KnowledgeSearchInputSchema,
			},
		);
	}
}
