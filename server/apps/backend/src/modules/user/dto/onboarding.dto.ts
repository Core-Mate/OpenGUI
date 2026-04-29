import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsEnum, IsOptional, IsString } from "class-validator";

/**
 */
export enum Industry {
	EDUCATION = "EDUCATION", // Education and Training
	REAL_ESTATE = "REAL_ESTATE", // Real Estate Agency
	INSURANCE = "INSURANCE", // Insurance and Finance
	MEDICAL_BEAUTY = "MEDICAL_BEAUTY", // Medical Aesthetics
	AUTO_SALES = "AUTO_SALES", // Auto Sales
	DECORATION = "DECORATION", // Renovation and Building Materials
	FOOD = "FOOD", // Food and Dining
	OVERSEAS_STUDY = "OVERSEAS_STUDY", // Study Abroad Consulting
	OTHER = "OTHER", // Other
}

/**
 */
export const IndustryLabels: Record<Industry, string> = {
	[Industry.EDUCATION]: "Education and Training",
	[Industry.REAL_ESTATE]: "Real Estate Agency",
	[Industry.INSURANCE]: "Insurance and Finance",
	[Industry.MEDICAL_BEAUTY]: "Medical Aesthetics",
	[Industry.AUTO_SALES]: "Auto Sales",
	[Industry.DECORATION]: "Renovation and Building Materials",
	[Industry.FOOD]: "Food and Dining",
	[Industry.OVERSEAS_STUDY]: "Study Abroad Consulting",
	[Industry.OTHER]: "Other",
};

/**
 */
export enum UserGoal {
	SELF_MEDIA_OPERATION = "SELF_MEDIA_OPERATION", // Automated creator account operations
	EFFICIENT_ACQUISITION = "EFFICIENT_ACQUISITION", // Efficient lead acquisition on online platforms
	CUSTOMER_CARE = "CUSTOMER_CARE", // Existing customer care
	DORMANT_USER_ACTIVATION = "DORMANT_USER_ACTIVATION", // Dormant user activation
	DATA_REVIEW = "DATA_REVIEW", // Core data review
	OTHER = "OTHER", // Other
}

/**
 */
export const UserGoalLabels: Record<UserGoal, string> = {
	[UserGoal.SELF_MEDIA_OPERATION]: "Automated creator account operations",
	[UserGoal.EFFICIENT_ACQUISITION]: "Efficient lead acquisition on online platforms",
	[UserGoal.CUSTOMER_CARE]: "Existing customer care",
	[UserGoal.DORMANT_USER_ACTIVATION]: "Dormant user activation",
	[UserGoal.DATA_REVIEW]: "Core data review",
	[UserGoal.OTHER]: "Other",
};

/**
 */
export enum TargetAudience {
	SMALL_BUSINESS = "SMALL_BUSINESS", // Small business owners / sole proprietors
	HIGH_NET_WORTH = "HIGH_NET_WORTH", // High-net-worth individuals
	MOTHERS = "MOTHERS", // Mothers / homemakers
	YOUNG_WORKERS = "YOUNG_WORKERS", // Young professionals
	ELDERLY = "ELDERLY", // Older adults
	NEWLYWEDS = "NEWLYWEDS", // Newlyweds
	OTHER = "OTHER", // Other
}

/**
 */
export const TargetAudienceLabels: Record<TargetAudience, string> = {
	[TargetAudience.SMALL_BUSINESS]: "Small business owners / sole proprietors",
	[TargetAudience.HIGH_NET_WORTH]: "High-net-worth individuals",
	[TargetAudience.MOTHERS]: "Mothers / homemakers",
	[TargetAudience.YOUNG_WORKERS]: "Young professionals",
	[TargetAudience.ELDERLY]: "Older adults",
	[TargetAudience.NEWLYWEDS]: "Newlyweds",
	[TargetAudience.OTHER]: "Other",
};

/**
 */
export class ServiceRegionDto {
	@ApiProperty({ description: "Province", example: "Beijing" })
	@IsString()
	province: string;

	@ApiProperty({ description: "City", example: "Beijing" })
	@IsString()
	city: string;

	@ApiPropertyOptional({ description: "District", example: "Chaoyang District" })
	@IsString()
	@IsOptional()
	district?: string;
}

/**
 */
export class OnboardingDto {
	@ApiProperty({
		description: "User goals (multiple selection, up to 6)",
		enum: UserGoal,
		isArray: true,
		example: [UserGoal.SELF_MEDIA_OPERATION, UserGoal.EFFICIENT_ACQUISITION],
	})
	@IsArray()
	@IsEnum(UserGoal, { each: true })
	goals: UserGoal[];

	@ApiPropertyOptional({
		description: "Goal other value, used when Other is selected",
		example: "Other goal description",
	})
	@IsString()
	@IsOptional()
	goalsOther?: string;

	@ApiProperty({
		description: "Industry",
		enum: Industry,
		example: Industry.EDUCATION,
	})
	@IsEnum(Industry)
	industry: Industry;

	@ApiPropertyOptional({
		description: "Industry other value, used when Other is selected",
		example: "Other industry description",
	})
	@IsString()
	@IsOptional()
	industryOther?: string;

	@ApiPropertyOptional({
		description: "Product or service description",
		example: "Provides high-quality education and training services at affordable prices",
	})
	@IsString()
	@IsOptional()
	productInfo?: string;
}

/**
 */
export class OnboardingResponseDto {
	@ApiProperty({ description: "Operation success flag" })
	success: boolean;

	@ApiProperty({ description: "Message" })
	message: string;
}

/**
 */
export class UserProfileResponseDto {
	@ApiProperty({ description: "User ID" })
	userId: number;

	@ApiPropertyOptional({
		description: "User goals",
		type: [String],
	})
	goals?: string[];

	@ApiPropertyOptional({ description: "Other goals" })
	goalsOther?: string | null;

	@ApiPropertyOptional({ description: "Industry", enum: Industry })
	industry?: Industry | null;

	@ApiPropertyOptional({ description: "Other industry" })
	industryOther?: string | null;

	@ApiPropertyOptional({ description: "Product or service description" })
	productInfo?: string | null;

	@ApiProperty({ description: "Whether onboarding is complete" })
	onboardingCompleted: boolean;
}
