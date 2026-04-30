import { ApiProperty } from "@nestjs/swagger";

/**
 * Tenant subscription status response DTO
 */
export class TenantSubscriptionStatusDto {
	@ApiProperty({ description: "Tenant ID" })
	tenantId: number;

	@ApiProperty({ description: "Tenant name" })
	tenantName: string;

	@ApiProperty({ description: "Whether active" })
	isActive: boolean;

	@ApiProperty({ description: "Whether expired" })
	isExpired: boolean;

	@ApiProperty({ description: "Expiration date" })
	expirationDate: Date;

	@ApiProperty({ description: "Days remaining; negative when expired" })
	daysRemaining: number;
}
