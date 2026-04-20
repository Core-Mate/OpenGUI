import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { AppLogger } from "../log";
import { StandbySocketService } from "./standby-socket.service";
import type { StandbySocket } from "./types";

/**
 * 设备待命 WebSocket 网关
 *
 * 独立 namespace /standby，与执行 namespace 互不干扰。
 *
 * 生命周期：
 * 1. App 启动 → 连接 /standby，发送 standby:register { deviceId }
 * 2. 待命期间每 30s 发送 standby:heartbeat
 * 3. Server 收到 IM 命令 → 通过此 gateway emit standby:dispatch
 * 4. App 收到 dispatch → 断开 standby → 连接执行 WS → 执行完后重连 standby
 */
@WebSocketGateway({
	namespace: "/standby",
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
	transports: ["websocket", "polling"],
	pingInterval: 35000,
	pingTimeout: 30000,
})
export class StandbyGateway
	implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
	@WebSocketServer()
	server: Server;

	constructor(
		private readonly logger: AppLogger,
		private readonly standbySocketService: StandbySocketService,
	) {
		this.logger.setContext(StandbyGateway.name);
	}

	afterInit() {
		this.logger.log("Standby gateway initialized on /standby namespace");
	}

	handleConnection(socket: StandbySocket) {
		const deviceId = socket.handshake.auth?.deviceId;
		if (!deviceId) {
			this.logger.warn(
				`Standby connection rejected - missing deviceId: ${socket.id}`,
			);
			socket.disconnect(true);
			return;
		}
		this.logger.debug(`Standby socket connected: ${socket.id}, deviceId=${deviceId}`);
	}

	handleDisconnect(socket: StandbySocket) {
		const deviceId = this.standbySocketService.unregisterDevice(socket.id);
		if (deviceId) {
			this.logger.log(`Standby device disconnected: ${deviceId}`);
		}
	}

	/**
	 * 设备注册待命
	 */
	@SubscribeMessage("standby:register")
	handleRegister(
		@ConnectedSocket() socket: StandbySocket,
		@MessageBody() data: { deviceId: string; deviceName?: string },
	) {
		if (!data?.deviceId) {
			return { error: "missing deviceId" };
		}

		this.standbySocketService.registerDevice(
			data.deviceId,
			socket,
			data.deviceName,
		);

		return { success: true };
	}

	/**
	 * 心跳（保持在线状态）
	 */
	@SubscribeMessage("standby:heartbeat")
	handleHeartbeat(
		@ConnectedSocket() socket: StandbySocket,
		@MessageBody() data: { deviceId: string },
	) {
		this.logger.debug(`Standby heartbeat from ${data?.deviceId || socket.id}`);
		return { success: true };
	}

	/**
	 * 向待命设备派发任务
	 *
	 * 由 ImChannelService 调用，不是客户端消息。
	 */
	dispatchToDevice(
		socket: StandbySocket,
		payload: { executionId: number; taskId: number; taskName: string },
	): void {
		this.logger.log(
			`Dispatching to device ${socket.deviceId}: execution=${payload.executionId}, task="${payload.taskName}"`,
		);
		socket.emit("standby:dispatch", payload);
	}
}
