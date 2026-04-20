import {
	IsString,
	IsEnum,
	IsOptional,
	IsArray,
	IsInt,
	IsBoolean,
	ValidateNested,
	Min,
	Max,
	MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	ContentPlatform,
	CreationScenario,
	ContentTone,
} from "../types";

/**
 * 创作上下文 DTO
 */
export class CreationContextDto {
	@ApiPropertyOptional({ description: "原帖/文章内容" })
	@IsOptional()
	@IsString()
	@MaxLength(50000)
	originalContent?: string;

	@ApiPropertyOptional({ description: "评论区讨论内容", type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	comments?: string[];

	@ApiProperty({ description: "目标平台", enum: ContentPlatform })
	@IsEnum(ContentPlatform)
	platform: ContentPlatform;

	@ApiProperty({ description: "创作场景", enum: CreationScenario })
	@IsEnum(CreationScenario)
	scenario: CreationScenario;

	@ApiPropertyOptional({ description: "补充背景信息" })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	background?: string;

	@ApiPropertyOptional({ description: "目标受众描述" })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	targetAudience?: string;

	@ApiPropertyOptional({ description: "期望的语气/风格", enum: ContentTone })
	@IsOptional()
	@IsEnum(ContentTone)
	tone?: ContentTone;

	@ApiPropertyOptional({ description: "语言", enum: ["zh", "en", "auto"] })
	@IsOptional()
	@IsString()
	language?: "zh" | "en" | "auto";
}

/**
 * 创建内容请求 DTO
 */
export class CreateContentDto {
	@ApiProperty({ description: "创作主题/需求描述" })
	@IsString()
	@MaxLength(2000)
	topic: string;

	@ApiProperty({ description: "创作上下文", type: CreationContextDto })
	@ValidateNested()
	@Type(() => CreationContextDto)
	context: CreationContextDto;

	@ApiPropertyOptional({ description: "额外指令" })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	instructions?: string;

	@ApiPropertyOptional({ description: "参考资料URL列表", type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	referenceUrls?: string[];

	@ApiPropertyOptional({ description: "最大字数限制", minimum: 50, maximum: 10000 })
	@IsOptional()
	@IsInt()
	@Min(50)
	@Max(10000)
	maxLength?: number;

	@ApiPropertyOptional({ description: "是否需要研究", default: false })
	@IsOptional()
	@IsBoolean()
	needResearch?: boolean;
}

/**
 * 润色内容请求 DTO
 */
export class PolishContentDto {
	@ApiProperty({ description: "原始内容" })
	@IsString()
	@MaxLength(50000)
	content: string;

	@ApiProperty({ description: "目标平台", enum: ContentPlatform })
	@IsEnum(ContentPlatform)
	platform: ContentPlatform;

	@ApiPropertyOptional({ description: "润色指令" })
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	instructions?: string;

	@ApiPropertyOptional({ description: "期望的语气", enum: ContentTone })
	@IsOptional()
	@IsEnum(ContentTone)
	tone?: ContentTone;

	@ApiPropertyOptional({ description: "语言", enum: ["zh", "en"] })
	@IsOptional()
	@IsString()
	language?: "zh" | "en";
}

/**
 * 研究请求 DTO
 */
export class ResearchContentDto {
	@ApiProperty({ description: "研究主题" })
	@IsString()
	@MaxLength(500)
	topic: string;

	@ApiPropertyOptional({ description: "目标平台", enum: ContentPlatform })
	@IsOptional()
	@IsEnum(ContentPlatform)
	platform?: ContentPlatform;

	@ApiPropertyOptional({ description: "参考资料URL列表", type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	referenceUrls?: string[];

	@ApiPropertyOptional({ description: "最大研究来源数量", minimum: 1, maximum: 10 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(10)
	maxSources?: number;
}
