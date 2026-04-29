import { tool } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { KNOWLEDGE_BASE_ID } from "../../../common/base/constant";
import { KnowledgeService } from "../../knowledge/knowledge.service";
import type { KnowledgeChunk } from "../../knowledge/rag/rag.interface";

/**
 */
const KnowledgeSearchInputSchema = z.object({
	query: z.string().describe("Search query text used to retrieve relevant information from the knowledge base"),
	limit: z.number().default(3).describe("Maximum number of results to return"),
});

/**
 */
export interface KnowledgeSearchOutput {
	success: boolean;
	chunks?: KnowledgeChunk[];
	error?: string;
}

/**
 */
@Injectable()
export class KnowledgeToolService {
	private readonly logger = new Logger(KnowledgeToolService.name);

	constructor(private readonly knowledgeService: KnowledgeService) {}

	/**
	 */
	createTool(defaultKnowledgeBaseId?: number) {
		return tool(
			async (input: z.infer<typeof KnowledgeSearchInputSchema>): Promise<KnowledgeSearchOutput> => {
				try {
					const knowledgeBaseId = defaultKnowledgeBaseId || KNOWLEDGE_BASE_ID;

					if (!knowledgeBaseId) {
						return {
							success: false,
							error: "Knowledge base ID was not specified",
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
						error: `Knowledge base search failed: ${error.message}`,
					};
				}
			},
			{
				name: "search_knowledge",
				description:
					"Use RAG to search relevant information from the knowledge base. Use this to find specific information for answering questions or completing tasks.",
				schema: KnowledgeSearchInputSchema,
			},
		);
	}
}
