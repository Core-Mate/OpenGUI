import { Injectable } from "@nestjs/common";
import type { KnowledgeChunk } from "./rag/rag.interface";

/**
 * Stub KnowledgeService for source-available version.
 * Knowledge base (RAG) functionality is disabled - returns empty results.
 */
@Injectable()
export class KnowledgeService {
	async search(
		_query: string,
		_knowledgeBaseId: number,
		_topK?: number,
	): Promise<KnowledgeChunk[]> {
		return [];
	}

	async retrieveKnowledge(
		_query: string,
		_knowledgeBaseId: number,
	): Promise<KnowledgeChunk[]> {
		return [];
	}

	async retrieveKnowledgeChunks(
		_query: string,
		_knowledgeBaseId: number,
		_options?: unknown,
	): Promise<KnowledgeChunk[]> {
		return [];
	}
}
