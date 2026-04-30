import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LeaseModule } from "../lease";
import { RedisModule } from "../redis";
import { ExecutionGateway } from "./execution.gateway";
import { ExecutionSocketService } from "./execution-socket.service";
import { StandbyGateway } from "./standby.gateway";
import { StandbySocketService } from "./standby-socket.service";
import { WsAuthMiddleware } from "./ws-auth.middleware";

/**
 *
 */
@Global()
@Module({
	imports: [RedisModule, ConfigModule, LeaseModule],
	providers: [
		ExecutionGateway,
		ExecutionSocketService,
		WsAuthMiddleware,
		StandbyGateway,
		StandbySocketService,
	],
	exports: [
		ExecutionSocketService,
		ExecutionGateway,
		StandbySocketService,
		StandbyGateway,
	],
})
export class WsModule {}
