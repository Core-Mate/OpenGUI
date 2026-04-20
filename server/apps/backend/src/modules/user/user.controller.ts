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

@ApiTags("用户管理")
@Controller("users")
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly logger: AppLogger,
	) {
		this.logger.setContext(UserController.name);
	}

	/**
	 * 提交用户信息收集
	 */
	@Post("profile/onboarding")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "用户信息收集",
		description: "收集首次登录用户的基本信息（行业、目标人群、产品介绍、服务地区）",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "信息保存成功",
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
	 * 完成引导流程
	 */
	@Put("profile/onboarding-complete")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "完成引导",
		description: "标记用户已完成引导流程，将 is_active 设置为 true",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "引导完成",
		type: OnboardingResponseDto,
	})
	async completeOnboarding(): Promise<OnboardingResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`User ${userId} completing onboarding`);
		return this.userService.completeOnboarding(userId);
	}

	/**
	 * 获取用户 Onboarding 信息
	 */
	@Get("profile/onboarding")
	@ApiOperation({
		summary: "获取用户 Onboarding 信息",
		description: "获取用户的 onboarding 信息和完成状态",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "获取成功",
		type: UserProfileResponseDto,
	})
	async getOnboarding(): Promise<UserProfileResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`Getting onboarding info for user ${userId}`);
		return this.userService.getOnboarding(userId);
	}

	/**
	 * 获取用户执行偏好
	 */
	@Get("execution-preference")
	@ApiOperation({
		summary: "获取执行偏好",
		description: "获取用户的执行偏好设置",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "获取成功",
		type: ExecutionPreferenceResponseDto,
	})
	async getExecutionPreference(): Promise<ExecutionPreferenceResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`Getting execution preference for user ${userId}`);
		return this.userService.getExecutionPreference(userId);
	}

	/**
	 * 创建用户执行偏好
	 */
	@Post("execution-preference")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "创建执行偏好",
		description: "创建用户的执行偏好设置",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "创建成功",
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
	 * 修改用户执行偏好
	 */
	@Put("execution-preference")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "修改执行偏好",
		description: "修改用户的执行偏好设置（不存在则创建）",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "修改成功",
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
	 * 清空用户执行偏好
	 */
	@Delete("execution-preference")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "清空执行偏好",
		description: "清空用户的执行偏好设置（不删除记录，仅将所有字段置空）",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "清空成功",
		type: ExecutionPreferenceOperationResponseDto,
	})
	async clearExecutionPreference(): Promise<ExecutionPreferenceOperationResponseDto> {
		const userId = DEFAULT_USER_ID;
		this.logger.log(`User ${userId} clearing execution preference`);
		return this.userService.clearExecutionPreference(userId);
	}
}
