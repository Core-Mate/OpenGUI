import { ApiProperty } from "@nestjs/swagger";

/**
 * 租户订阅状态响应 DTO
 */
export class TenantSubscriptionStatusDto {
	@ApiProperty({ description: "租户ID" })
	tenantId: number;

	@ApiProperty({ description: "租户名称" })
	tenantName: string;

	@ApiProperty({ description: "是否激活" })
	isActive: boolean;

	@ApiProperty({ description: "是否已过期" })
	isExpired: boolean;

	@ApiProperty({ description: "过期日期" })
	expirationDate: Date;

	@ApiProperty({ description: "剩余天数（过期为负数）" })
	daysRemaining: number;
}
