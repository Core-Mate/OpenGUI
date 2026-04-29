// src/knowledge/rag/rag.interface.ts

/**
 */
export interface KnowledgeChunk {
    content: string
    score: number
    source: string
    docId: string
    chunkId: string
    rerank_score?: number
    url?: string
}
