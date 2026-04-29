import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ContentPlatform, CreationScenario } from "../types";

/**
 */
export class ResearchResultDto {
	@ApiProperty({ description: "Source URL" })
	sourceUrl: string;

	@ApiProperty({ description: "Source title" })
	sourceTitle: string;

	@ApiProperty({ description: "Summary content" })
	summary: string;

	@ApiProperty({ description: "Key points", type: [String] })
	keyPoints: string[];

	@ApiProperty({ description: "Relevance score, 0-1" })
	relevanceScore: number;
}

/**
 */
export class TokenUsageDto {
	@ApiProperty({ description: "Input token count" })
	input: number;

	@ApiProperty({ description: "Output token count" })
	output: number;
}

/**
 */
export class ContentMetadataDto {
	@ApiProperty({ description: "Target platform", enum: ContentPlatform })
	platform: ContentPlatform;

	@ApiProperty({ description: "Creation scenario", enum: CreationScenario })
	scenario: CreationScenario;

	@ApiProperty({ description: "Generated time" })
	generatedAt: Date;

	@ApiProperty({ description: "Model used" })
	model: string;

	@ApiPropertyOptional({ description: "Token usage", type: TokenUsageDto })
	tokenUsage?: TokenUsageDto;
}

/**
 */
export class ContentOutputDto {
	@ApiProperty({ description: "Generated content" })
	content: string;

	@ApiPropertyOptional({ description: "Content summary" })
	summary?: string;

	@ApiPropertyOptional({ description: "Research material used", type: [ResearchResultDto] })
	researchUsed?: ResearchResultDto[];

	@ApiProperty({ description: "Word count" })
	wordCount: number;

	@ApiPropertyOptional({ description: "Estimated reading time in seconds" })
	readingTime?: number;

	@ApiProperty({ description: "Creation metadata", type: ContentMetadataDto })
	metadata: ContentMetadataDto;
}

/**
 */
export class ResearchResponseDto {
	@ApiProperty({ description: "Research topic" })
	topic: string;

	@ApiProperty({ description: "Research results", type: [ResearchResultDto] })
	results: ResearchResultDto[];

	@ApiProperty({ description: "Combined summary" })
	summary: string;

	@ApiProperty({ description: "Generated time" })
	generatedAt: Date;
}

/**
 */
export class StreamMessageDto {
	@ApiProperty({
		description: "Message type",
		enum: ["text", "research", "draft", "final", "error", "progress"],
	})
	type: "text" | "research" | "draft" | "final" | "error" | "progress";

	@ApiProperty({ description: "Message content" })
	content: string;

	@ApiPropertyOptional({ description: "Metadata" })
	metadata?: Record<string, unknown>;
}
