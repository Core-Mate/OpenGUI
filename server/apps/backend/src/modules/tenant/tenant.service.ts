import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { prisma } from "@repo/db";
import { AppLogger } from "../../common/log";
import type { TenantSubscriptionStatusDto } from "./dto/tenant.dto";

/**
 * 租户服务
 * 处理租户验证、订阅状态查询等核心逻辑
 */
@Injectable()
export class TenantService {
	constructor(private readonly logger: AppLogger) {
		this.logger.setContext(TenantService.name);
	}

	/**
	 * 验证用户所属租户状态
	 * 检查租户是否存在、是否被删除、是否被禁用、是否过期
	 * @param tenantId 租户 ID
	 * @throws ForbiddenException 租户验证失败时抛出
	 */
	async validateUserTenant(tenantId: number): Promise<void> {
		if (tenantId <= 0) {
			throw new ForbiddenException("用户未关联有效租户");
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
			throw new ForbiddenException("租户不存在");
		}

		if (tenant.is_deleted) {
			throw new ForbiddenException("租户已被删除");
		}

		if (!tenant.is_active) {
			throw new ForbiddenException("租户已被禁用，请联系管理员");
		}

		if (tenant.expiration_date < new Date()) {
			throw new ForbiddenException("租户已过期，请联系管理员续费");
		}

		this.logger.debug(`Tenant ${tenantId} validated successfully`);
	}

	/**
	 * 获取租户订阅状态
	 * @param tenantId 租户 ID
	 * @returns 租户订阅状态信息
	 */
	async getTenantSubscriptionStatus(
		tenantId: number,
	): Promise<TenantSubscriptionStatusDto> {
		if (tenantId <= 0) {
			throw new ForbiddenException("用户未关联有效租户");
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
			throw new NotFoundException("租户不存在");
		}

		if (tenant.is_deleted) {
			throw new ForbiddenException("租户已被删除");
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
