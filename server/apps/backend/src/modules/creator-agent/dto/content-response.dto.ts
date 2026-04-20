import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ContentPlatform, CreationScenario } from "../types";

/**
 * 研究结果响应 DTO
 */
export class ResearchResultDto {
	@ApiProperty({ description: "来源URL" })
	sourceUrl: string;

	@ApiProperty({ description: "来源标题" })
	sourceTitle: string;

	@ApiProperty({ description: "摘要内容" })
	summary: string;

	@ApiProperty({ description: "关键要点", type: [String] })
	keyPoints: string[];

	@ApiProperty({ description: "相关性评分 0-1" })
	relevanceScore: number;
}

/**
 * Token 使用量响应 DTO
 */
export class TokenUsageDto {
	@ApiProperty({ description: "输入 Token 数" })
	input: number;

	@ApiProperty({ description: "输出 Token 数" })
	output: number;
}

/**
 * 内容元数据响应 DTO
 */
export class ContentMetadataDto {
	@ApiProperty({ description: "目标平台", enum: ContentPlatform })
	platform: ContentPlatform;

	@ApiProperty({ description: "创作场景", enum: CreationScenario })
	scenario: CreationScenario;

	@ApiProperty({ description: "生成时间" })
	generatedAt: Date;

	@ApiProperty({ description: "使用的模型" })
	model: string;

	@ApiPropertyOptional({ description: "Token 使用量", type: TokenUsageDto })
	tokenUsage?: TokenUsageDto;
}

/**
 * 内容输出响应 DTO
 */
export class ContentOutputDto {
	@ApiProperty({ description: "生成的内容" })
	content: string;

	@ApiPropertyOptional({ description: "内容摘要" })
	summary?: string;

	@ApiPropertyOptional({ description: "使用的研究资料", type: [ResearchResultDto] })
	researchUsed?: ResearchResultDto[];

	@ApiProperty({ description: "字数统计" })
	wordCount: number;

	@ApiPropertyOptional({ description: "预估阅读时间(秒)" })
	readingTime?: number;

	@ApiProperty({ description: "创作元数据", type: ContentMetadataDto })
	metadata: ContentMetadataDto;
}

/**
 * 研究响应 DTO
 */
export class ResearchResponseDto {
	@ApiProperty({ description: "研究主题" })
	topic: string;

	@ApiProperty({ description: "研究结果列表", type: [ResearchResultDto] })
	results: ResearchResultDto[];

	@ApiProperty({ description: "综合摘要" })
	summary: string;

	@ApiProperty({ description: "生成时间" })
	generatedAt: Date;
}

/**
 * 流式消息响应 DTO (用于 SSE)
 */
export class StreamMessageDto {
	@ApiProperty({
		description: "消息类型",
		enum: ["text", "research", "draft", "final", "error", "progress"],
	})
	type: "text" | "research" | "draft" | "final" | "error" | "progress";

	@ApiProperty({ description: "消息内容" })
	content: string;

	@ApiPropertyOptional({ description: "元数据" })
	metadata?: Record<string, unknown>;
}
