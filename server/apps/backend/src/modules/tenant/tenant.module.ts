import { Module } from "@nestjs/common";
import { LogModule } from "../../common/log";
import { TenantController } from "./tenant.controller";
import { TenantService } from "./tenant.service";

/**
 * 租户模块
 * 提供租户验证、订阅状态查询等功能
 */
@Module({
	imports: [LogModule],
	controllers: [TenantController],
	providers: [TenantService],
	exports: [TenantService],
})
export class TenantModule {}
