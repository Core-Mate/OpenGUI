import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Socket } from "socket.io";
import { PrismaService } from "../../prisma/prisma.service";
import { AppLogger } from "../log";
import type { ExecutionSocket } from "./types";

/**
 * WebSocket auth middleware (source-available simplified build - no auth).
 *
 * 仅验证 executionId 的有效性和 execution 状态，不校验用户身份。
 *
 * 客户端连接示例：
 * ```javascript
 * const socket = io('ws://host:port', {
 *   auth: {
 *     executionId: '42',
 *   }
 * });
 * ```
 */
@Injectable()
export class WsAuthMiddleware {
	constructor(
		private readonly logger: AppLogger,
		private readonly configService: ConfigService,
		private readonly prismaService: PrismaService,
	) {
		this.logger.setContext(WsAuthMiddleware.name);
	}

	/**
	 * 返回 Socket.IO 中间件函数
	 */
	createAuthMiddleware() {
		return async (socket: Socket, next: (err?: Error) => void) => {
			try {
				// 1. 提取并验证 executionId
				const executionIdRaw = socket.handshake.auth?.executionId;
				if (!executionIdRaw) {
					this.logger.warn(
						`WS connection rejected - missing executionId: ${socket.id}`,
					);
					return next(new Error("Missing executionId in auth"));
				}

				const executionId = Number(executionIdRaw);
				if (Number.isNaN(executionId) || executionId <= 0) {
					this.logger.warn(
						`WS connection rejected - invalid executionId: ${executionIdRaw}`,
					);
					return next(new Error("Invalid executionId"));
				}

				// 2. 验证 execution 存在
				const execution =
					await this.prismaService.task_execution.findUnique({
						where: { id: executionId },
						select: { execution_status: true },
					});

				if (!execution) {
					this.logger.warn(
						`WS connection rejected - execution ${executionId} not found: ${socket.id}`,
					);
					return next(new Error("Execution not found"));
				}

				// 3. 验证 execution 处于可连接状态
				const connectableStatuses = ["PENDING", "RUNNING", "SUSPENDED", "USER_PAUSED", "SUMMARIZING"];
				if (!connectableStatuses.includes(execution.execution_status)) {
					this.logger.warn(
						`WS connection rejected - execution ${executionId} in non-connectable status ${execution.execution_status}: ${socket.id}`,
					);
					return next(new Error(`Execution is in ${execution.execution_status} status`));
				}

				// 4. 挂载信息到 socket
				const execSocket = socket as ExecutionSocket;
				execSocket.userId = "1";
				execSocket.executionId = executionId;

				this.logger.debug(
					`WS connected: execution=${executionId}, socket=${socket.id}`,
				);
				next();
			} catch (error) {
				this.logger.error(
					`WS auth failed for ${socket.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
					{},
					error instanceof Error ? error.stack : undefined,
				);
				next(new Error("Authentication failed"));
			}
		};
	}
}
