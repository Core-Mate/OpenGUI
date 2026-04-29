/**
 * Creator Agent Types
 */

/**
 */
export enum ContentPlatform {
	WECHAT_ARTICLE = "wechat_article",
	WECHAT_COMMENT = "wechat_comment",
	TWITTER_POST = "twitter_post",
	TWITTER_REPLY = "twitter_reply",
	REDDIT_POST = "reddit_post",
	REDDIT_COMMENT = "reddit_comment",
	DIRECT_MESSAGE = "direct_message",
	SOCIAL_COMMENT = "social_comment",
}

/**
 */
export enum CreationScenario {
	ORIGINAL = "original",
	REPLY = "reply",
	REPOST = "repost",
	POLISH = "polish",
	TRANSLATE = "translate",
}

/**
 */
export interface CreationContext {
	originalContent?: string;
	comments?: string[];
	platform: ContentPlatform;
	scenario: CreationScenario;
	background?: string;
	targetAudience?: string;
	tone?: ContentTone;
	language?: "zh" | "en" | "auto";
}

/**
 */
export enum ContentTone {
	PROFESSIONAL = "professional",
	CASUAL = "casual",
	FRIENDLY = "friendly",
	AUTHORITATIVE = "authoritative",
	ENTHUSIASTIC = "enthusiastic",
	NEUTRAL = "neutral",
}

/**
 */
export interface CreateContentRequest {
	topic: string;
	context: CreationContext;
	instructions?: string;
	referenceUrls?: string[];
	maxLength?: number;
	/** Whether research is needed */
	needResearch?: boolean;
}

/**
 */
export interface ResearchResult {
	sourceUrl: string;
	sourceTitle: string;
	summary: string;
	keyPoints: string[];
	relevanceScore: number;
}

/**
 */
export interface ContentOutput {
	/** Generated content */
	content: string;
	summary?: string;
	researchUsed?: ResearchResult[];
	wordCount: number;
	readingTime?: number;
	metadata: ContentMetadata;
}

/**
 */
export interface ContentMetadata {
	platform: ContentPlatform;
	scenario: CreationScenario;
	generatedAt: Date;
	model: string;
	tokenUsage?: {
		input: number;
		output: number;
	};
}

/**
 */
export interface PolishContentRequest {
	content: string;
	platform: ContentPlatform;
	instructions?: string;
	tone?: ContentTone;
	language?: "zh" | "en";
}

/**
 */
export interface StreamMessage {
	type: "text" | "research" | "draft" | "final" | "error" | "progress";
	content: string;
	metadata?: Record<string, unknown>;
}

/**
 */
export interface CreatorAgentConfig {
	/** Anthropic API Key */
	apiKey: string;
	defaultModel?: string;
	maxTurns?: number;
	defaultLanguage?: "zh" | "en";
}
