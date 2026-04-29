import { Module } from "@nestjs/common";
import { LogModule } from "../../common/log";
import { TenantController } from "./tenant.controller";
import { TenantService } from "./tenant.service";

/**
 */
@Module({
	imports: [LogModule],
	controllers: [TenantController],
	providers: [TenantService],
	exports: [TenantService],
})
export class TenantModule {}
