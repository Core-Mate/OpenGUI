/**
 * Creator Agent Types
 * 内容创作 Agent 类型定义
 */

/**
 * 支持的创作平台
 */
export enum ContentPlatform {
	/** 微信公众号文章 */
	WECHAT_ARTICLE = "wechat_article",
	/** 微信评论 */
	WECHAT_COMMENT = "wechat_comment",
	/** X (Twitter) 帖子 */
	TWITTER_POST = "twitter_post",
	/** X (Twitter) 回复 */
	TWITTER_REPLY = "twitter_reply",
	/** Reddit 帖子 */
	REDDIT_POST = "reddit_post",
	/** Reddit 评论 */
	REDDIT_COMMENT = "reddit_comment",
	/** 私信/DM */
	DIRECT_MESSAGE = "direct_message",
	/** 通用社媒评论 */
	SOCIAL_COMMENT = "social_comment",
}

/**
 * 创作场景类型
 */
export enum CreationScenario {
	/** 原创内容 */
	ORIGINAL = "original",
	/** 回复/评论 */
	REPLY = "reply",
	/** 转发/引用 */
	REPOST = "repost",
	/** 润色改写 */
	POLISH = "polish",
	/** 翻译 */
	TRANSLATE = "translate",
}

/**
 * 创作上下文
 */
export interface CreationContext {
	/** 原帖/文章内容 */
	originalContent?: string;
	/** 评论区讨论内容 */
	comments?: string[];
	/** 目标平台 */
	platform: ContentPlatform;
	/** 创作场景 */
	scenario: CreationScenario;
	/** 补充背景信息 */
	background?: string;
	/** 目标受众描述 */
	targetAudience?: string;
	/** 期望的语气/风格 */
	tone?: ContentTone;
	/** 语言 */
	language?: "zh" | "en" | "auto";
}

/**
 * 内容语气/风格
 */
export enum ContentTone {
	/** 专业正式 */
	PROFESSIONAL = "professional",
	/** 轻松幽默 */
	CASUAL = "casual",
	/** 友好亲切 */
	FRIENDLY = "friendly",
	/** 严肃权威 */
	AUTHORITATIVE = "authoritative",
	/** 热情激励 */
	ENTHUSIASTIC = "enthusiastic",
	/** 中立客观 */
	NEUTRAL = "neutral",
}

/**
 * 创作请求
 */
export interface CreateContentRequest {
	/** 创作主题/需求描述 */
	topic: string;
	/** 创作上下文 */
	context: CreationContext;
	/** 额外指令 */
	instructions?: string;
	/** 参考资料URL列表 */
	referenceUrls?: string[];
	/** 最大字数限制 */
	maxLength?: number;
	/** 是否需要研究 */
	needResearch?: boolean;
}

/**
 * 研究结果
 */
export interface ResearchResult {
	/** 来源URL */
	sourceUrl: string;
	/** 来源标题 */
	sourceTitle: string;
	/** 摘要内容 */
	summary: string;
	/** 关键要点 */
	keyPoints: string[];
	/** 相关性评分 0-1 */
	relevanceScore: number;
}

/**
 * 创作输出
 */
export interface ContentOutput {
	/** 生成的内容 */
	content: string;
	/** 内容摘要 */
	summary?: string;
	/** 使用的研究资料 */
	researchUsed?: ResearchResult[];
	/** 字数统计 */
	wordCount: number;
	/** 预估阅读时间(秒) */
	readingTime?: number;
	/** 创作元数据 */
	metadata: ContentMetadata;
}

/**
 * 内容元数据
 */
export interface ContentMetadata {
	/** 目标平台 */
	platform: ContentPlatform;
	/** 创作场景 */
	scenario: CreationScenario;
	/** 生成时间 */
	generatedAt: Date;
	/** 使用的模型 */
	model: string;
	/** Token 使用量 */
	tokenUsage?: {
		input: number;
		output: number;
	};
}

/**
 * 润色请求
 */
export interface PolishContentRequest {
	/** 原始内容 */
	content: string;
	/** 目标平台 */
	platform: ContentPlatform;
	/** 润色指令 */
	instructions?: string;
	/** 期望的语气 */
	tone?: ContentTone;
	/** 语言 */
	language?: "zh" | "en";
}

/**
 * 流式输出消息类型
 */
export interface StreamMessage {
	type: "text" | "research" | "draft" | "final" | "error" | "progress";
	content: string;
	metadata?: Record<string, unknown>;
}

/**
 * Agent 配置
 */
export interface CreatorAgentConfig {
	/** Anthropic API Key */
	apiKey: string;
	/** 默认模型 */
	defaultModel?: string;
	/** 最大轮次 */
	maxTurns?: number;
	/** 默认语言 */
	defaultLanguage?: "zh" | "en";
}
