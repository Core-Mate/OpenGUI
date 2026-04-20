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
 * 执行偏好请求 DTO
 */
export class ExecutionPreferenceDto {
	@ApiPropertyOptional({
		description: "APP使用目标（多选）",
		enum: UserGoal,
		isArray: true,
		example: [UserGoal.SELF_MEDIA_OPERATION, UserGoal.EFFICIENT_ACQUISITION],
	})
	@IsArray()
	@IsEnum(UserGoal, { each: true })
	@IsOptional()
	goals?: UserGoal[];

	@ApiPropertyOptional({
		description: "目标-其他（当选择其他时填写）",
		example: "其他目标描述",
	})
	@IsString()
	@IsOptional()
	goalsOther?: string;

	@ApiPropertyOptional({
		description: "所在行业",
		enum: Industry,
		example: Industry.EDUCATION,
	})
	@IsEnum(Industry)
	@IsOptional()
	industry?: Industry;

	@ApiPropertyOptional({
		description: "行业-其他（当选择其他时填写）",
		example: "其他行业描述",
	})
	@IsString()
	@IsOptional()
	industryOther?: string;

	@ApiPropertyOptional({
		description: "服务目标人群（多选）",
		enum: TargetAudience,
		isArray: true,
		example: [TargetAudience.YOUNG_WORKERS, TargetAudience.SMALL_BUSINESS],
	})
	@IsArray()
	@IsEnum(TargetAudience, { each: true })
	@IsOptional()
	targetAudience?: TargetAudience[];

	@ApiPropertyOptional({
		description: "服务目标人群-其他（当选择其他时填写）",
		example: "其他人群描述",
	})
	@IsString()
	@IsOptional()
	targetAudienceOther?: string;

	@ApiPropertyOptional({
		description: "销售产品介绍",
		example: "提供优质的教育培训服务，课程价格实惠",
	})
	@IsString()
	@IsOptional()
	productInfo?: string;

	@ApiPropertyOptional({
		description: "目标服务地区",
		type: [ServiceRegionDto],
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ServiceRegionDto)
	@IsOptional()
	serviceRegion?: ServiceRegionDto[];
}

/**
 * 执行偏好响应 DTO
 */
export class ExecutionPreferenceResponseDto {
	@ApiProperty({ description: "用户ID" })
	userId: number;

	@ApiPropertyOptional({
		description: "APP使用目标",
		type: [String],
	})
	goals?: string[];

	@ApiPropertyOptional({ description: "目标-其他" })
	goalsOther?: string | null;

	@ApiPropertyOptional({ description: "所在行业", enum: Industry })
	industry?: Industry | null;

	@ApiPropertyOptional({ description: "行业-其他" })
	industryOther?: string | null;

	@ApiPropertyOptional({
		description: "服务目标人群",
		type: [String],
	})
	targetAudience?: string[];

	@ApiPropertyOptional({ description: "服务目标人群-其他" })
	targetAudienceOther?: string | null;

	@ApiPropertyOptional({ description: "销售产品介绍" })
	productInfo?: string | null;

	@ApiPropertyOptional({
		description: "目标服务地区",
		type: [ServiceRegionDto],
	})
	serviceRegion?: ServiceRegionDto[] | null;
}

/**
 * 执行偏好操作响应 DTO
 */
export class ExecutionPreferenceOperationResponseDto {
	@ApiProperty({ description: "操作是否成功" })
	success: boolean;

	@ApiProperty({ description: "提示信息" })
	message: string;
}
