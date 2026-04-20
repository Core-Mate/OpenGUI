import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsEnum, IsOptional, IsString } from "class-validator";

/**
 * 行业枚举 - 与数据库 UserIndustry 枚举保持一致
 */
export enum Industry {
	EDUCATION = "EDUCATION", // 教育培训
	REAL_ESTATE = "REAL_ESTATE", // 房屋中介
	INSURANCE = "INSURANCE", // 保险理财
	MEDICAL_BEAUTY = "MEDICAL_BEAUTY", // 医疗美容
	AUTO_SALES = "AUTO_SALES", // 汽车销售
	DECORATION = "DECORATION", // 装修建材
	FOOD = "FOOD", // 餐饮美食
	OVERSEAS_STUDY = "OVERSEAS_STUDY", // 留学咨询
	OTHER = "OTHER", // 其他
}

/**
 * 行业枚举的中文显示名称映射
 */
export const IndustryLabels: Record<Industry, string> = {
	[Industry.EDUCATION]: "教育培训",
	[Industry.REAL_ESTATE]: "房屋中介",
	[Industry.INSURANCE]: "保险理财",
	[Industry.MEDICAL_BEAUTY]: "医疗美容",
	[Industry.AUTO_SALES]: "汽车销售",
	[Industry.DECORATION]: "装修建材",
	[Industry.FOOD]: "餐饮美食",
	[Industry.OVERSEAS_STUDY]: "留学咨询",
	[Industry.OTHER]: "其他",
};

/**
 * 用户目标枚举 - 与数据库 UserGoal 枚举保持一致
 */
export enum UserGoal {
	SELF_MEDIA_OPERATION = "SELF_MEDIA_OPERATION", // 自媒体账号自动运营
	EFFICIENT_ACQUISITION = "EFFICIENT_ACQUISITION", // 网络平台高效获客
	CUSTOMER_CARE = "CUSTOMER_CARE", // 老客户贴心维护
	DORMANT_USER_ACTIVATION = "DORMANT_USER_ACTIVATION", // 沉睡用户定期激活
	DATA_REVIEW = "DATA_REVIEW", // 核心数据精准复盘
	OTHER = "OTHER", // 其他
}

/**
 * 用户目标枚举的中文显示名称映射
 */
export const UserGoalLabels: Record<UserGoal, string> = {
	[UserGoal.SELF_MEDIA_OPERATION]: "自媒体账号自动运营",
	[UserGoal.EFFICIENT_ACQUISITION]: "网络平台高效获客",
	[UserGoal.CUSTOMER_CARE]: "老客户贴心维护",
	[UserGoal.DORMANT_USER_ACTIVATION]: "沉睡用户定期激活",
	[UserGoal.DATA_REVIEW]: "核心数据精准复盘",
	[UserGoal.OTHER]: "其他",
};

/**
 * 目标人群枚举 - 与数据库 TargetAudience 枚举保持一致
 */
export enum TargetAudience {
	SMALL_BUSINESS = "SMALL_BUSINESS", // 小微企业主/个体户
	HIGH_NET_WORTH = "HIGH_NET_WORTH", // 高净值富裕人群
	MOTHERS = "MOTHERS", // 宝妈/家庭主妇
	YOUNG_WORKERS = "YOUNG_WORKERS", // 年轻白领
	ELDERLY = "ELDERLY", // 银发长者
	NEWLYWEDS = "NEWLYWEDS", // 新婚夫妇
	OTHER = "OTHER", // 其他
}

/**
 * 目标人群枚举的中文显示名称映射
 */
export const TargetAudienceLabels: Record<TargetAudience, string> = {
	[TargetAudience.SMALL_BUSINESS]: "小微企业主/个体户",
	[TargetAudience.HIGH_NET_WORTH]: "高净值富裕人群",
	[TargetAudience.MOTHERS]: "宝妈/家庭主妇",
	[TargetAudience.YOUNG_WORKERS]: "年轻白领",
	[TargetAudience.ELDERLY]: "银发长者",
	[TargetAudience.NEWLYWEDS]: "新婚夫妇",
	[TargetAudience.OTHER]: "其他",
};

/**
 * 地区信息 DTO
 */
export class ServiceRegionDto {
	@ApiProperty({ description: "省份", example: "北京市" })
	@IsString()
	province: string;

	@ApiProperty({ description: "城市", example: "北京市" })
	@IsString()
	city: string;

	@ApiPropertyOptional({ description: "区县", example: "朝阳区" })
	@IsString()
	@IsOptional()
	district?: string;
}

/**
 * 用户信息收集请求 DTO
 */
export class OnboardingDto {
	@ApiProperty({
		description: "用户目标（多选，最多6个）",
		enum: UserGoal,
		isArray: true,
		example: [UserGoal.SELF_MEDIA_OPERATION, UserGoal.EFFICIENT_ACQUISITION],
	})
	@IsArray()
	@IsEnum(UserGoal, { each: true })
	goals: UserGoal[];

	@ApiPropertyOptional({
		description: "目标-其他（当选择其他时填写）",
		example: "其他目标描述",
	})
	@IsString()
	@IsOptional()
	goalsOther?: string;

	@ApiProperty({
		description: "所在行业",
		enum: Industry,
		example: Industry.EDUCATION,
	})
	@IsEnum(Industry)
	industry: Industry;

	@ApiPropertyOptional({
		description: "行业-其他（当选择其他时填写）",
		example: "其他行业描述",
	})
	@IsString()
	@IsOptional()
	industryOther?: string;

	@ApiPropertyOptional({
		description: "产品/服务描述",
		example: "提供优质的教育培训服务，课程价格实惠",
	})
	@IsString()
	@IsOptional()
	productInfo?: string;
}

/**
 * Onboarding 响应 DTO
 */
export class OnboardingResponseDto {
	@ApiProperty({ description: "操作是否成功" })
	success: boolean;

	@ApiProperty({ description: "提示信息" })
	message: string;
}

/**
 * 用户档案响应 DTO
 */
export class UserProfileResponseDto {
	@ApiProperty({ description: "用户ID" })
	userId: number;

	@ApiPropertyOptional({
		description: "用户目标",
		type: [String],
	})
	goals?: string[];

	@ApiPropertyOptional({ description: "目标-其他" })
	goalsOther?: string | null;

	@ApiPropertyOptional({ description: "所在行业", enum: Industry })
	industry?: Industry | null;

	@ApiPropertyOptional({ description: "行业-其他" })
	industryOther?: string | null;

	@ApiPropertyOptional({ description: "产品/服务描述" })
	productInfo?: string | null;

	@ApiProperty({ description: "是否已完成引导" })
	onboardingCompleted: boolean;
}
