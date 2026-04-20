// src/knowledge/rag/rag.interface.ts

/**
 * 知识库召回的单个切片（chunk）的数据结构。
 * 这是一个标准化的格式，用于封装来自不同RAG服务商的召回结果。
 */
export interface KnowledgeChunk {
    content: string // 切片内容
    score: number // 检索得分
    source: string // 来源文档名称或ID
    docId: string // 来源文档的唯一ID
    chunkId: string // 切片在文档中的唯一ID
    rerank_score?: number // 重排得分
    url?: string // 来源文档链接
}
