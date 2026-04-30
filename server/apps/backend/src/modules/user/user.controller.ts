import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Put,
	ValidationPipe,
} from "@nestjs/common";
import {
	ApiOperation,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AppLogger } from "../../common/log";
import { UserService } from "./user.service";
import {
	OnboardingDto,
	OnboardingResponseDto,
	UserProfileResponseDto,
} from "./dto/onboarding.dto";
import {
	ExecutionPreferenceDto,
	ExecutionPreferenceResponseDto,
	ExecutionPreferenceOperationResponseDto,
} from "./dto/execution-preference.dto";

const DEFAULT_USER_ID = 1;

@ApiTags("User Management")
@Controller("users")
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly logger: AppLogger,
	) {
		this.logger.setContext(UserController.name);
	}

	/**
	 */
	@Post("profile/onboarding")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Collect user information",
		description: "Collect first-login user information, including industry, target audience, product description, and service region",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Information saved",
		type: OnboardingResponseDto,
	})
	async submitOnboarding(
		@Body(ValidationPipe) dto: OnboardingDto,
	): Promise<OnboardingResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`User ${userId} submitting onboarding info`);
		return this.userService.submitOnboarding(userId, dto);
	}

	/**
	 */
	@Put("profile/onboarding-complete")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Complete onboarding",
		description: "Mark onboarding as completed and set is_active to true",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Onboarding completed",
		type: OnboardingResponseDto,
	})
	async completeOnboarding(): Promise<OnboardingResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`User ${userId} completing onboarding`);
		return this.userService.completeOnboarding(userId);
	}

	/**
	 * Get user onboarding information
	 */
	@Get("profile/onboarding")
	@ApiOperation({
		summary: "Get user onboarding information",
		description: "Get the user onboarding information and completion status",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Success",
		type: UserProfileResponseDto,
	})
	async getOnboarding(): Promise<UserProfileResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`Getting onboarding info for user ${userId}`);
		return this.userService.getOnboarding(userId);
	}

	/**
	 */
	@Get("execution-preference")
	@ApiOperation({
		summary: "Get execution preferences",
		description: "Get user execution preference settings",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Success",
		type: ExecutionPreferenceResponseDto,
	})
	async getExecutionPreference(): Promise<ExecutionPreferenceResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`Getting execution preference for user ${userId}`);
		return this.userService.getExecutionPreference(userId);
	}

	/**
	 */
	@Post("execution-preference")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Create execution preferences",
		description: "Create user execution preference settings",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Created",
		type: ExecutionPreferenceOperationResponseDto,
	})
	async createExecutionPreference(
		@Body(ValidationPipe) dto: ExecutionPreferenceDto,
	): Promise<ExecutionPreferenceOperationResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`User ${userId} creating execution preference`);
		return this.userService.createExecutionPreference(userId, dto);
	}

	/**
	 */
	@Put("execution-preference")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Update execution preferences",
		description: "Update user execution preferences, or create them if missing",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Updated",
		type: ExecutionPreferenceOperationResponseDto,
	})
	async updateExecutionPreference(
		@Body(ValidationPipe) dto: ExecutionPreferenceDto,
	): Promise<ExecutionPreferenceOperationResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`User ${userId} updating execution preference`);
		return this.userService.updateExecutionPreference(userId, dto);
	}

	/**
	 */
	@Delete("execution-preference")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Clear execution preferences",
		description: "Clear user execution preferences without deleting the record",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Cleared",
		type: ExecutionPreferenceOperationResponseDto,
	})
	async clearExecutionPreference(): Promise<ExecutionPreferenceOperationResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`User ${userId} clearing execution preference`);
		return this.userService.clearExecutionPreference(userId);
	}
}
