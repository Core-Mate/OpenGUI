import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AppLogger } from "../../common/log";
import {
	OnboardingDto,
	OnboardingResponseDto,
	UserProfileResponseDto,
	type ServiceRegionDto,
} from "./dto/onboarding.dto";
import {
	ExecutionPreferenceDto,
	ExecutionPreferenceResponseDto,
	ExecutionPreferenceOperationResponseDto,
} from "./dto/execution-preference.dto";

@Injectable()
export class UserService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly logger: AppLogger,
	) {
		this.logger.setContext(UserService.name);
	}

	/**
	 */
	async submitOnboarding(
		userId: number,
		dto: OnboardingDto,
	): Promise<OnboardingResponseDto> {
		this.logger.log(`User ${userId} submitting onboarding info`);


		await this.prismaService.user_profile.upsert({
			where: { user_id: userId },
			update: {
				goals: dto.goals,
				goals_other: dto.goalsOther || null,
				industry: dto.industry,
				industry_other: dto.industryOther || null,
				product_info: dto.productInfo || null,
				updated_at: new Date(),
			},
			create: {
				user_id: userId,
				goals: dto.goals,
				goals_other: dto.goalsOther || null,
				industry: dto.industry,
				industry_other: dto.industryOther || null,
				product_info: dto.productInfo || null,
			},
		});

		this.logger.log(`User ${userId} onboarding info saved successfully`);

		return {
			success: true,
			message: "User information saved",
		};
	}

	/**
	 */
	async completeOnboarding(userId: number): Promise<OnboardingResponseDto> {
		this.logger.log(`User ${userId} completing onboarding`);

		await this.prismaService.users.update({
			where: { id: userId },
			data: {
				is_active: true,
				finish_onboarding: true,
				updatedAt: new Date(),
			},
		});

		this.logger.log(`User ${userId} onboarding completed`);

		return {
			success: true,
			message: "Onboarding completed",
		};
	}

	/**
	 * Get user onboarding information
	 */
	async getOnboarding(userId: number): Promise<UserProfileResponseDto> {
		this.logger.log(`Getting onboarding info for user ${userId}`);


		const user = await this.prismaService.users.findUnique({
			where: { id: userId },
			select: { is_active: true },
		});


		const profile = await this.prismaService.user_profile.findUnique({
			where: { user_id: userId },
		});

		if (!profile) {
			return {
				userId,
				goals: [],
				goalsOther: null,
				industry: null,
				industryOther: null,
				productInfo: null,
				onboardingCompleted: user?.is_active ?? false,
			};
		}

		return {
			userId,
			goals: profile.goals,
			goalsOther: profile.goals_other,
			industry: profile.industry as any,
			industryOther: profile.industry_other,
			productInfo: profile.product_info,
			onboardingCompleted: user?.is_active ?? false,
		};
	}

	/**
	 */
	async getExecutionPreference(
		userId: number,
	): Promise<ExecutionPreferenceResponseDto> {
		this.logger.log(`Getting execution preference for user ${userId}`);

		const preference =
			await this.prismaService.user_execution_preference.findUnique({
				where: { user_id: userId },
			});

		if (!preference) {
			return {
				userId,
				goals: [],
				goalsOther: null,
				industry: null,
				industryOther: null,
				targetAudience: [],
				targetAudienceOther: null,
				productInfo: null,
				serviceRegion: null,
			};
		}

		return {
			userId,
			goals: preference.goals,
			goalsOther: preference.goals_other,
			industry: preference.industry as any,
			industryOther: preference.industry_other,
			targetAudience: preference.target_audience,
			targetAudienceOther: preference.target_audience_other,
			productInfo: preference.product_info,
			serviceRegion: preference.service_region as ServiceRegionDto[] | null,
		};
	}

	/**
	 */
	async createExecutionPreference(
		userId: number,
		dto: ExecutionPreferenceDto,
	): Promise<ExecutionPreferenceOperationResponseDto> {
		this.logger.log(`User ${userId} creating execution preference`);

		await this.prismaService.user_execution_preference.create({
			data: {
				user_id: userId,
				goals: dto.goals || [],
				goals_other: dto.goalsOther || null,
				industry: dto.industry,
				industry_other: dto.industryOther || null,
				target_audience: dto.targetAudience || [],
				target_audience_other: dto.targetAudienceOther || null,
				product_info: dto.productInfo || null,
				service_region: dto.serviceRegion
					? JSON.parse(JSON.stringify(dto.serviceRegion))
					: null,
			},
		});

		this.logger.log(`User ${userId} execution preference created successfully`);

		return {
			success: true,
			message: "Execution preferences created",
		};
	}

	/**
	 */
	async updateExecutionPreference(
		userId: number,
		dto: ExecutionPreferenceDto,
	): Promise<ExecutionPreferenceOperationResponseDto> {
		this.logger.log(`User ${userId} updating execution preference`);

		await this.prismaService.user_execution_preference.upsert({
			where: { user_id: userId },
			update: {
				goals: dto.goals || [],
				goals_other: dto.goalsOther || null,
				industry: dto.industry,
				industry_other: dto.industryOther || null,
				target_audience: dto.targetAudience || [],
				target_audience_other: dto.targetAudienceOther || null,
				product_info: dto.productInfo || null,
				service_region: dto.serviceRegion
					? JSON.parse(JSON.stringify(dto.serviceRegion))
					: null,
				updated_at: new Date(),
			},
			create: {
				user_id: userId,
				goals: dto.goals || [],
				goals_other: dto.goalsOther || null,
				industry: dto.industry,
				industry_other: dto.industryOther || null,
				target_audience: dto.targetAudience || [],
				target_audience_other: dto.targetAudienceOther || null,
				product_info: dto.productInfo || null,
				service_region: dto.serviceRegion
					? JSON.parse(JSON.stringify(dto.serviceRegion))
					: null,
			},
		});

		this.logger.log(`User ${userId} execution preference updated successfully`);

		return {
			success: true,
			message: "Execution preferences updated",
		};
	}

	/**
	 */
	async clearExecutionPreference(
		userId: number,
	): Promise<ExecutionPreferenceOperationResponseDto> {
		this.logger.log(`User ${userId} clearing execution preference`);

		const existing =
			await this.prismaService.user_execution_preference.findUnique({
				where: { user_id: userId },
			});

		if (!existing) {
			return {
				success: true,
				message: "Execution preferences do not exist; nothing to clear",
			};
		}

		await this.prismaService.user_execution_preference.update({
			where: { user_id: userId },
			data: {
				goals: [],
				goals_other: null,
				industry: null,
				industry_other: null,
				target_audience: [],
				target_audience_other: null,
				product_info: null,
				service_region: null,
				updated_at: new Date(),
			},
		});

		this.logger.log(`User ${userId} execution preference cleared successfully`);

		return {
			success: true,
			message: "Execution preferences cleared",
		};
	}
}
