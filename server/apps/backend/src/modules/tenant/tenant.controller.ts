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
 * Tenant controller.
 * Provides tenant-related APIs.
 */
@ApiTags("Tenant")
@Controller("tenant")
export class TenantController {
	constructor(
		private readonly tenantService: TenantService,
		private readonly logger: AppLogger,
	) {
		this.logger.setContext(TenantController.name);
	}

	/**
	 * Get the current tenant subscription status.
	 */
	@Get("subscription")
	@ApiOperation({
		summary: "Get tenant subscription status",
		description:
			"Get subscription status for the tenant associated with the current user",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Tenant subscription status",
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
