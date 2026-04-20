import { Module } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { CreditsService } from "./credits.service";

@Module({
	providers: [CreditsService, BillingService],
	exports: [CreditsService, BillingService],
})
export class CreditsModule {}
