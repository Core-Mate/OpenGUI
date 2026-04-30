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
 */
export class CreationContextDto {
	@ApiPropertyOptional({ description: "Original post or article content" })
	@IsOptional()
	@IsString()
	@MaxLength(50000)
	originalContent?: string;

	@ApiPropertyOptional({ description: "Comment discussion content", type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	comments?: string[];

	@ApiProperty({ description: "Target platform", enum: ContentPlatform })
	@IsEnum(ContentPlatform)
	platform: ContentPlatform;

	@ApiProperty({ description: "Creation scenario", enum: CreationScenario })
	@IsEnum(CreationScenario)
	scenario: CreationScenario;

	@ApiPropertyOptional({ description: "Additional background information" })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	background?: string;

	@ApiPropertyOptional({ description: "Target audience description" })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	targetAudience?: string;

	@ApiPropertyOptional({ description: "Desired tone or style", enum: ContentTone })
	@IsOptional()
	@IsEnum(ContentTone)
	tone?: ContentTone;

	@ApiPropertyOptional({ description: "Language", enum: ["zh", "en", "auto"] })
	@IsOptional()
	@IsString()
	language?: "zh" | "en" | "auto";
}

/**
 */
export class CreateContentDto {
	@ApiProperty({ description: "Creation topic or requirement description" })
	@IsString()
	@MaxLength(2000)
	topic: string;

	@ApiProperty({ description: "Creation context", type: CreationContextDto })
	@ValidateNested()
	@Type(() => CreationContextDto)
	context: CreationContextDto;

	@ApiPropertyOptional({ description: "Additional instructions" })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	instructions?: string;

	@ApiPropertyOptional({ description: "Reference URL list", type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	referenceUrls?: string[];

	@ApiPropertyOptional({ description: "Maximum word count", minimum: 50, maximum: 10000 })
	@IsOptional()
	@IsInt()
	@Min(50)
	@Max(10000)
	maxLength?: number;

	@ApiPropertyOptional({ description: "Whether research is needed", default: false })
	@IsOptional()
	@IsBoolean()
	needResearch?: boolean;
}

/**
 */
export class PolishContentDto {
	@ApiProperty({ description: "Original content" })
	@IsString()
	@MaxLength(50000)
	content: string;

	@ApiProperty({ description: "Target platform", enum: ContentPlatform })
	@IsEnum(ContentPlatform)
	platform: ContentPlatform;

	@ApiPropertyOptional({ description: "Polishing instructions" })
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	instructions?: string;

	@ApiPropertyOptional({ description: "Desired tone", enum: ContentTone })
	@IsOptional()
	@IsEnum(ContentTone)
	tone?: ContentTone;

	@ApiPropertyOptional({ description: "Language", enum: ["zh", "en"] })
	@IsOptional()
	@IsString()
	language?: "zh" | "en";
}

/**
 */
export class ResearchContentDto {
	@ApiProperty({ description: "Research topic" })
	@IsString()
	@MaxLength(500)
	topic: string;

	@ApiPropertyOptional({ description: "Target platform", enum: ContentPlatform })
	@IsOptional()
	@IsEnum(ContentPlatform)
	platform?: ContentPlatform;

	@ApiPropertyOptional({ description: "Reference URL list", type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	referenceUrls?: string[];

	@ApiPropertyOptional({ description: "Maximum number of research sources", minimum: 1, maximum: 10 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(10)
	maxSources?: number;
}
