import { Global, Module } from "@nestjs/common";
import { LeaseService } from "./lease.service";

/**
 * 租约模块
 *
 * 提供心跳租约机制，用于检测客户端是否存活。
 * 使用 @Global 装饰器使 LeaseService 在整个应用中可用。
 */
@Global()
@Module({
	providers: [LeaseService],
	exports: [LeaseService],
})
export class LeaseModule {}
