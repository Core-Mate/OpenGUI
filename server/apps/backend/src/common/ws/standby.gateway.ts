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
 *
 *
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
	 *
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
