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
 * 统一 WebSocket 模块
 *
 * 替代原 SocketModule + SseModule，提供：
 * - JWT 认证的 WebSocket 连接
 * - 以 executionId 为维度的连接管理
 * - Agent 流式事件推送（替代 SSE）
 * - 设备操作 ACK 请求（截屏、执行动作）
 * - Socket.IO Connection State Recovery（断线续传）
 * - 设备待命通道（/standby namespace）
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
