import { Controller, Get, HttpStatus } from "@nestjs/common";
import {
	ApiOperation,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AppLogger } from "../../common/log";
import { TenantSubscriptionStatusDto } from "./dto/tenant.dto";
import { TenantService } from "./tenant.service";

const DEFAULT_TENANT_ID = 0;

/**
 * 租户控制器
 * 提供租户相关接口
 */
@ApiTags("租户")
@Controller("tenant")
export class TenantController {
	constructor(
		private readonly tenantService: TenantService,
		private readonly logger: AppLogger,
	) {
		this.logger.setContext(TenantController.name);
	}

	/**
	 * 获取当前租户订阅状态
	 */
	@Get("subscription")
	@ApiOperation({
		summary: "获取租户订阅状态",
		description: "获取当前登录用户所属租户的订阅状态信息",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "租户订阅状态",
		type: TenantSubscriptionStatusDto,
	})
	async getSubscriptionStatus(): Promise<TenantSubscriptionStatusDto> {
		const tenantId = DEFAULT_TENANT_ID;
		this.logger.log(
			`Requesting tenant subscription status for tenant ${tenantId}`,
		);
		return this.tenantService.getTenantSubscriptionStatus(tenantId);
	}
}
