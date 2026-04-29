import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	IsArray,
	IsEnum,
	IsOptional,
	IsString,
	ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
	Industry,
	TargetAudience,
	UserGoal,
	ServiceRegionDto,
} from "./onboarding.dto";

/**
 */
export class ExecutionPreferenceDto {
	@ApiPropertyOptional({
		description: "App usage goals (multiple selection)",
		enum: UserGoal,
		isArray: true,
		example: [UserGoal.SELF_MEDIA_OPERATION, UserGoal.EFFICIENT_ACQUISITION],
	})
	@IsArray()
	@IsEnum(UserGoal, { each: true })
	@IsOptional()
	goals?: UserGoal[];

	@ApiPropertyOptional({
		description: "Goal other value, used when Other is selected",
		example: "Other goal description",
	})
	@IsString()
	@IsOptional()
	goalsOther?: string;

	@ApiPropertyOptional({
		description: "Industry",
		enum: Industry,
		example: Industry.EDUCATION,
	})
	@IsEnum(Industry)
	@IsOptional()
	industry?: Industry;

	@ApiPropertyOptional({
		description: "Industry other value, used when Other is selected",
		example: "Other industry description",
	})
	@IsString()
	@IsOptional()
	industryOther?: string;

	@ApiPropertyOptional({
		description: "Service target audience (multiple selection)",
		enum: TargetAudience,
		isArray: true,
		example: [TargetAudience.YOUNG_WORKERS, TargetAudience.SMALL_BUSINESS],
	})
	@IsArray()
	@IsEnum(TargetAudience, { each: true })
	@IsOptional()
	targetAudience?: TargetAudience[];

	@ApiPropertyOptional({
		description: "Target audience other value, used when Other is selected",
		example: "Other target audience description",
	})
	@IsString()
	@IsOptional()
	targetAudienceOther?: string;

	@ApiPropertyOptional({
		description: "Sales product description",
		example: "Provides high-quality education and training services at affordable prices",
	})
	@IsString()
	@IsOptional()
	productInfo?: string;

	@ApiPropertyOptional({
		description: "Target service region",
		type: [ServiceRegionDto],
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ServiceRegionDto)
	@IsOptional()
	serviceRegion?: ServiceRegionDto[];
}

/**
 */
export class ExecutionPreferenceResponseDto {
	@ApiProperty({ description: "User ID" })
	userId: number;

	@ApiPropertyOptional({
		description: "App usage goals",
		type: [String],
	})
	goals?: string[];

	@ApiPropertyOptional({ description: "Other goals" })
	goalsOther?: string | null;

	@ApiPropertyOptional({ description: "Industry", enum: Industry })
	industry?: Industry | null;

	@ApiPropertyOptional({ description: "Other industry" })
	industryOther?: string | null;

	@ApiPropertyOptional({
			description: "Service target audience",
		type: [String],
	})
	targetAudience?: string[];

	@ApiPropertyOptional({ description: "Other service target audience" })
	targetAudienceOther?: string | null;

	@ApiPropertyOptional({ description: "Sales product description" })
	productInfo?: string | null;

	@ApiPropertyOptional({
		description: "Target service region",
		type: [ServiceRegionDto],
	})
	serviceRegion?: ServiceRegionDto[] | null;
}

/**
 */
export class ExecutionPreferenceOperationResponseDto {
	@ApiProperty({ description: "Operation success flag" })
	success: boolean;

	@ApiProperty({ description: "Message" })
	message: string;
}
