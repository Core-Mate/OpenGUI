import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { prisma } from "@repo/db";
import { AppLogger } from "../../common/log";
import type { TenantSubscriptionStatusDto } from "./dto/tenant.dto";

/**
 */
@Injectable()
export class TenantService {
	constructor(private readonly logger: AppLogger) {
		this.logger.setContext(TenantService.name);
	}

	/**
	 */
	async validateUserTenant(tenantId: number): Promise<void> {
		if (tenantId <= 0) {
			throw new ForbiddenException("User is not linked to a valid tenant");
		}

		const tenant = await prisma.tenants.findFirst({
			where: { id: tenantId },
			select: {
				id: true,
				is_deleted: true,
				is_active: true,
				expiration_date: true,
			},
		});

		if (!tenant) {
			throw new ForbiddenException("Tenant does not exist");
		}

		if (tenant.is_deleted) {
			throw new ForbiddenException("Tenant has been deleted");
		}

		if (!tenant.is_active) {
			throw new ForbiddenException("Tenant is disabled. Contact an administrator.");
		}

		if (tenant.expiration_date < new Date()) {
			throw new ForbiddenException("Tenant has expired. Contact an administrator to renew.");
		}

		this.logger.debug(`Tenant ${tenantId} validated successfully`);
	}

	/**
	 */
	async getTenantSubscriptionStatus(
		tenantId: number,
	): Promise<TenantSubscriptionStatusDto> {
		if (tenantId <= 0) {
			throw new ForbiddenException("User is not linked to a valid tenant");
		}

		const tenant = await prisma.tenants.findFirst({
			where: { id: tenantId },
			select: {
				id: true,
				tenant_name: true,
				is_active: true,
				is_deleted: true,
				expiration_date: true,
			},
		});

		if (!tenant) {
			throw new NotFoundException("Tenant does not exist");
		}

		if (tenant.is_deleted) {
			throw new ForbiddenException("Tenant has been deleted");
		}

		const now = new Date();
		const isExpired = tenant.expiration_date < now;
		const daysRemaining = Math.ceil(
			(tenant.expiration_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
		);

		this.logger.debug(
			`Tenant ${tenantId} subscription status retrieved: active=${tenant.is_active}, expired=${isExpired}, daysRemaining=${daysRemaining}`,
		);

		return {
			tenantId: tenant.id,
			tenantName: tenant.tenant_name,
			isActive: tenant.is_active,
			isExpired,
			expirationDate: tenant.expiration_date,
			daysRemaining,
		};
	}
}
