import { type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
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
import { createAdapter } from "@socket.io/redis-streams-adapter";
import { createClient } from "redis";
import { Server } from "socket.io";
import { AgentEventSource, AgentEventType } from "../base/enum";
import { LeaseService } from "../lease/lease.service";
import { AppLogger } from "../log";
import { ExecutionSocketService } from "./execution-socket.service";
import type {
	ActionReqPayload,
	ActionRespPayload,
	AgentStreamEvent,
	ExecutionSocket,
	ScreenshotRespPayload,
} from "./types";
import { WsEvents, executionRoom } from "./types";
import { WsAuthMiddleware } from "./ws-auth.middleware";
import { TaskExecutionService } from "../../modules/task/task-execution.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { EXECUTION_EVENTS } from "../events/execution-events";
import type {
	CancelExecutionResult,
	GraphRunnerService,
} from "../../modules/graph-agent/graph-runner.service";

/**
 * Execution WebSocket 网关
 *
 * 统一替代原有的 SocketGateway（设备操作 ACK）和 SseService（流式事件推送），
 * 以 executionId 为维度管理连接。
 *
 * 生命周期：
 * 1. 客户端 POST /task/:id/execute → 创建 execution (PENDING)
 * 2. 客户端携带 { token, executionId } 建立 WS 连接
 * 3. 客户端 emit("execution:ready") → 服务端启动 GraphRunner
 * 4. 服务端通过 WS 推送 agent:event / device:screenshot / device:action
 * 5. 任务完成 → emit execution:finished → 客户端断开
 */
@WebSocketGateway({
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
	transports: ["websocket", "polling"],
	// Socket.IO v4 连接状态恢复：断线 2 分钟内重连可自动补发丢失事件
	connectionStateRecovery: {
		maxDisconnectionDuration: 2 * 60 * 1000,
		skipMiddlewares: false,
	},
	pingInterval: 25000,
	pingTimeout: 20000,
})
export class ExecutionGateway
	implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
	@WebSocketServer()
	server: Server;

	/**
	 * 延迟解析的 TaskExecutionService 引用
	 * 通过 ModuleRef 在 onModuleInit 中懒加载，打破循环依赖
	 */
	private taskExecutionService: TaskExecutionService | null = null;

	/** node-redis 客户端，用于 Socket.IO Redis Streams Adapter */
	private redisClient: ReturnType<typeof createClient> | null = null;

	/** 延迟解析的 GraphRunnerService 引用 */
	private graphRunnerService: GraphRunnerService | null = null;

	/** Redis Streams Adapter 是否已挂载 */
	private adapterAttached = false;

	/** 已接收 execution:ready 的执行 ID 集合，防止重复启动 */
	private readonly readyReceived = new Set<number>();

	/** 跟踪每个 execution 的当前阶段，用于检测阶段变化 */
	private readonly lastPhase = new Map<number, string>();

	constructor(
		private readonly logger: AppLogger,
		private readonly executionSocketService: ExecutionSocketService,
		private readonly wsAuthMiddleware: WsAuthMiddleware,
		private readonly leaseService: LeaseService,
		private readonly moduleRef: ModuleRef,
		private readonly eventEmitter: EventEmitter2,
	) {
		this.logger.setContext(ExecutionGateway.name);
	}

	async onModuleInit() {
		// 延迟解析 TaskExecutionService，避免循环依赖
		this.taskExecutionService = this.moduleRef.get(TaskExecutionService, {
			strict: false,
		});
		this.logger.log("TaskExecutionService resolved via ModuleRef");

		// 延迟解析 GraphRunnerService（用于跨实例中继时检查本地执行）
		try {
			const grModule = await import(
				"../../modules/graph-agent/graph-runner.service.js"
			);
			this.graphRunnerService = this.moduleRef.get(
				grModule.GraphRunnerService,
				{ strict: false },
			);
			this.logger.log("GraphRunnerService resolved via ModuleRef");
		} catch {
			this.logger.warn(
				"GraphRunnerService not available — cross-instance relay disabled",
			);
		}

		// 创建 node-redis 客户端用于 Socket.IO Redis Streams Adapter
		// 注意：@socket.io/redis-streams-adapter 需要 node-redis（不能用 ioredis）
		// Redis 不可用时退化为单实例模式（跨实例中继不可用，其余功能不受影响）
		try {
			const encodedPassword = process.env.REDIS_PASSWORD
				? encodeURIComponent(process.env.REDIS_PASSWORD)
				: null;
			const redisUrl = `redis://${encodedPassword ? `:${encodedPassword}@` : ""}${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}/${process.env.REDIS_DB || "0"}`;
			this.redisClient = createClient({ url: redisUrl });
			this.redisClient.on("error", (err) =>
				this.logger.error(`Redis adapter client error: ${err.message}`),
			);
			await this.redisClient.connect();
			this.logger.log("Redis client connected for Socket.IO adapter");
		} catch (err) {
			this.logger.warn(
				`Redis adapter client connection failed: ${(err as Error).message} — running in single-instance mode`,
			);
			this.redisClient = null;
		}

		// 尝试挂载 adapter（afterInit 可能先于 onModuleInit 执行，此时 server 已就绪但 Redis 未连接）
		this.tryAttachAdapter();
	}

	afterInit(server: Server) {
		// 尝试挂载 adapter（onModuleInit 可能先于 afterInit 执行，此时 Redis 已连接）
		this.tryAttachAdapter();

		// 挂载认证中间件
		server.use(this.wsAuthMiddleware.createAuthMiddleware());
		this.logger.log(
			"ExecutionGateway initialized with auth middleware + connection state recovery",
		);
	}

	/**
	 * 挂载 Redis Streams Adapter + 注册跨实例事件监听
	 *
	 * 兼容 NestJS 生命周期的不确定顺序：
	 * - afterInit(server) 先执行 → Redis 未就绪，跳过；onModuleInit 后补挂
	 * - onModuleInit() 先执行 → server 未就绪，跳过；afterInit 后补挂
	 */
	private tryAttachAdapter() {
		if (this.adapterAttached || !this.redisClient || !this.server) return;

		this.server.adapter(createAdapter(this.redisClient));
		this.adapterAttached = true;
		this.logger.log("Redis Streams Adapter attached");

		// 监听跨实例取消请求（serverSideEmit 中继）
		this.server.on(
			"internal:cancel-execution",
			async (
				data: {
					executionId: number;
					userId: number;
					taskId: number;
					skipSummary: boolean;
				},
				callback: (result: RelayResult) => void,
			) => {
				if (!this.graphRunnerService?.hasExecution(data.executionId)) {
					callback({ success: false, handled: false });
					return;
				}
				try {
					const result = await this.graphRunnerService.cancelExecution(
						data.executionId,
						data.userId,
						data.taskId,
						data.skipSummary,
					);
					callback({ ...result, handled: true });
				} catch (err) {
					callback({
						success: false,
						error: (err as Error).message,
						handled: true,
					});
				}
			},
		);

		// 监听跨实例暂停请求（serverSideEmit 中继）
		this.server.on(
			"internal:pause-execution",
			async (
				data: { executionId: number; userId: number; taskId: number },
				callback: (result: { success: boolean; handled: boolean }) => void,
			) => {
				if (!this.graphRunnerService?.hasExecution(data.executionId)) {
					callback({ success: false, handled: false });
					return;
				}
				try {
					const result = await this.graphRunnerService.pauseExecution(data.executionId);
					callback({ success: result, handled: true });
				} catch {
					callback({ success: false, handled: true });
				}
			},
		);
	}

	async onModuleDestroy() {
		if (this.redisClient) {
			await this.redisClient.quit();
			this.logger.log("Redis adapter client disconnected");
		}
	}

	// ============================================================
	// Connection Lifecycle
	// ============================================================

	async handleConnection(client: ExecutionSocket) {
		const executionId = client.executionId;
		const userId = client.userId;

		if (!executionId || !userId) {
			this.logger.error(
				`Client ${client.id} missing executionId or userId after auth`,
			);
			client.disconnect(true);
			return;
		}

		try {
			// 先存储连接（可回滚），再加入 room
			this.executionSocketService.storeConnection(executionId, client);

			client.join(executionRoom(executionId));

			client.connectedAt = new Date();

			this.logger.log(
				`Client connected: socket=${client.id}, execution=${executionId}, user=${userId}`,
			);
		} catch (error) {
			const err = error as Error;
			this.logger.error(
				`Failed to handle connection for execution ${executionId}: ${err.message}`,
				{},
				err.stack,
			);
			client.disconnect(true);
		}
	}

	async handleDisconnect(client: ExecutionSocket) {
		const executionId = client.executionId;
		this.logger.log(
			`Client disconnected: socket=${client.id}, execution=${executionId ?? "unknown"}`,
		);

		// 清理 readyReceived 标志
		if (executionId) {
			this.readyReceived.delete(executionId);
		}

		// 始终按 socketId 清理，避免旧 socket 的 disconnect 回调误删新连接映射
		this.executionSocketService.removeConnectionBySocketId(client.id);
	}

	// ============================================================
	// Client → Server Events
	// ============================================================

	/**
	 * 客户端发送就绪信号，触发 GraphRunner 启动
	 */
	@SubscribeMessage(WsEvents.EXECUTION_READY)
	async handleExecutionReady(
		@ConnectedSocket() client: ExecutionSocket,
		@MessageBody() data: { executionId: number },
	) {
		const executionId = client.executionId;
		if (!executionId) {
			this.logger.error("execution:ready received but no executionId on socket");
			return;
		}

		this.logger.log(`execution:ready received for execution=${executionId}`);

		// 幂等保护：防止 client 重发 execution:ready 触发双重 startExecution
		if (this.readyReceived.has(executionId)) {
			this.logger.warn(`execution:ready already received for execution=${executionId}, ignoring duplicate`);
			return;
		}
		this.readyReceived.add(executionId);

		try {
			if (!this.taskExecutionService) {
				throw new Error("TaskExecutionService not injected");
			}

			// Check execution type to determine which start method to call
			const execution =
				await this.taskExecutionService.getExecutionRecord(executionId);
			if (!execution) {
				throw new Error(`Execution ${executionId} not found`);
			}

			if (execution.originExecutionId) {
				// Fork execution
				await this.taskExecutionService.startForkExecution(executionId);
			} else if (
				execution.statusMessage?.startsWith("resume_hitl:") ||
				execution.statusMessage?.startsWith("resume_pause:")
			) {
				// Resume execution
				const resumeType = execution.statusMessage.startsWith("resume_hitl:")
					? ("hitl" as const)
					: ("pause" as const);
				await this.taskExecutionService.startResumeExecution(
					executionId,
					resumeType,
				);
			} else {
				// Normal execution
				await this.taskExecutionService.startExecution(executionId);
			}

			// 通知客户端已启动
			this.server
				.to(executionRoom(executionId))
				.emit(WsEvents.EXECUTION_STARTED, {
					executionId,
					timestamp: Date.now(),
				});

			// 发送 connected agent:event，触发客户端创建初始 UIMessageBean
			this.sendAgentEvent(executionId, {
				type: AgentEventType.CONNECTED,
				taskExecutionId: executionId,
				from: AgentEventSource.SYSTEM,
				content: "",
			});
		} catch (error) {
			const err = error as Error;
			this.logger.error(
				`Failed to start execution ${executionId}: ${err.message}`,
				{},
				err.stack,
			);

			// CAS 失败且执行已在 RUNNING 状态（如 resume 竞态场景）：
			// 发送 execution:started 而非 error，因为执行实际在正常运行
			if (
				err.message?.includes("expected PENDING") &&
				this.taskExecutionService
			) {
				try {
					const current =
						await this.taskExecutionService.getExecutionRecord(executionId);
					if (current?.executionStatus === "RUNNING") {
						this.logger.log(
							`Execution ${executionId} already RUNNING, sending started instead of error`,
						);
						this.server
							.to(executionRoom(executionId))
							.emit(WsEvents.EXECUTION_STARTED, {
								executionId,
								timestamp: Date.now(),
							});
						return;
					}
				} catch {
					// Fall through to error emission
				}
			}

			this.server
				.to(executionRoom(executionId))
				.emit(WsEvents.EXECUTION_ERROR, {
					executionId,
					message: err.message,
					timestamp: Date.now(),
				});
		}
	}

	/**
	 * 客户端心跳续约
	 *
	 * 使用 EXPIRE 续租；如果 key 已过期（重连场景），尝试用 SET 重建 lease，
	 * 前提是执行仍处于活跃状态（RUNNING/SUSPENDED/USER_PAUSED）。
	 */
	@SubscribeMessage(WsEvents.LEASE_HEARTBEAT)
	async handleLeaseHeartbeat(
		@ConnectedSocket() client: ExecutionSocket,
		@MessageBody() data: { executionId: number },
	): Promise<{ renewed: boolean }> {
		const executionId = client.executionId;
		if (!executionId) return { renewed: false };

		try {
			const renewed = await this.leaseService.renewLease(executionId);
			if (!renewed) {
				// Lease key 已过期 — 客户端可能在重连后发来的心跳
				// 检查执行是否仍在活跃状态，如果是则重建 lease
				const userId = client.userId ? Number(client.userId) : null;
				if (userId && this.taskExecutionService) {
					const execution = await this.taskExecutionService.getExecutionRecord(executionId);
					const activeStatuses = ["RUNNING", "SUSPENDED", "USER_PAUSED", "SUMMARIZING"];
					if (execution && activeStatuses.includes(execution.executionStatus)) {
						// 执行仍在活跃状态，重建 lease
						const rebuilt = await this.leaseService.createLease(
							executionId, userId, execution.taskId,
						);
						if (rebuilt) {
							this.logger.log(
								`Heartbeat for execution ${executionId}: lease rebuilt after expiry`,
							);
							return { renewed: true };
						}
					}
				}
				this.logger.warn(
					`Heartbeat for execution ${executionId}: lease not found and cannot rebuild, disconnecting client`,
				);
				client.disconnect(true);
				return { renewed: false };
			}
			return { renewed: true };
		} catch (error) {
			const err = error as Error;
			this.logger.warn(
				`Heartbeat renewal failed for execution ${executionId}: ${err.message}`,
			);
			return { renewed: false };
		}
	}

	// ============================================================
	// Server → Client: Agent Events (replaces SseService.sendAgentEvent)
	// ============================================================

	/**
	 * 发送 Agent 流式事件到客户端
	 *
	 * 替代原 sseService.sendAgentEvent(userId, event)
	 * 用法：executionGateway.sendAgentEvent(executionId, { type, taskExecutionId, from, content, extra })
	 */
	sendAgentEvent(
		executionId: number,
		event: {
			type: AgentEventType | string;
			taskExecutionId: number;
			from: AgentEventSource;
			content: string;
			extra?: any;
		},
	): boolean {
		const seq = this.executionSocketService.nextSeq(executionId);
		if (seq < 0) {
			this.logger.warn(
				`Cannot send agent event to execution ${executionId}: no active connection`,
			);
			return false;
		}

		const fullEvent: AgentStreamEvent = {
			...event,
			seq,
			timestamp: Date.now(),
		};

		this.server
			.to(executionRoom(executionId))
			.emit(WsEvents.AGENT_EVENT, fullEvent);

		// 检测阶段变化，发射进度事件给 IM 模块
		const fromStr = String(event.from);
		if (fromStr && fromStr !== this.lastPhase.get(executionId)) {
			this.lastPhase.set(executionId, fromStr);
			this.eventEmitter.emit(EXECUTION_EVENTS.PHASE_CHANGED, {
				executionId,
				phase: fromStr,
			});
		}

		// 检测 GUI 动作思考（真实操作描述）
		if (String(event.type) === "gui-action-thought" && event.content) {
			this.eventEmitter.emit(EXECUTION_EVENTS.ACTION_THOUGHT, {
				executionId,
				content: event.content,
			});
		}

		return true;
	}

	/**
	 * 发送执行完成通知
	 */
	sendExecutionFinished(
		executionId: number,
		result: { status: string; message?: string },
	): void {
		this.server
			.to(executionRoom(executionId))
			.emit(WsEvents.EXECUTION_FINISHED, {
				executionId,
				...result,
				timestamp: Date.now(),
			});
		this.lastPhase.delete(executionId);
	}

	/**
	 * 发送执行错误通知
	 */
	sendExecutionError(executionId: number, message: string): void {
		this.server
			.to(executionRoom(executionId))
			.emit(WsEvents.EXECUTION_ERROR, {
				executionId,
				message,
				timestamp: Date.now(),
			});
	}

	// ============================================================
	// Server → Client: Device Requests (replaces SocketGateway methods)
	// ============================================================

	/**
	 * 请求客户端截屏（通过 ACK 回传结果）
	 *
	 * 替代原 socketGateway.sendScreenShotReq(socketId)
	 */
	async sendScreenshotReq(executionId: number): Promise<{
		success: boolean;
		screenshotUri: string;
		scaleFactor: number;
		screenWidth: number;
		screenHeight: number;
		currentAppName: string;
		phash?: string;
		error?: string;
	}> {
		const socket = this.executionSocketService.getSocketForExecution(executionId);
		if (!socket) {
			throw new Error(
				`No connection for execution ${executionId}, cannot send screenshot request`,
			);
		}

		const startTime = Date.now();
		this.logger.debug(
			`Sending screenshot request: execution=${executionId}, socket=${socket.id}`,
		);

		try {
			const response = (await socket
				.timeout(15000)
				.emitWithAck(
					WsEvents.DEVICE_SCREENSHOT,
					{ executionId },
				)) as ScreenshotRespPayload;

			const duration = Date.now() - startTime;

			if (!response.success) {
				this.logger.error(
					`Screenshot request failed after ${duration}ms: ${response.error}`,
				);
				throw new Error(response.error || "Screenshot capture failed");
			}

			return {
				success: true,
				screenshotUri: response.screenshot_uri,
				scaleFactor: response.scale_factor ?? 1.0,
				screenWidth: response.screen_width,
				screenHeight: response.screen_height,
				currentAppName: response.current_app_name ?? "",
				phash: response.phash,
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			const err = error as Error;
			this.logger.error(
				`Screenshot request error after ${duration}ms for execution ${executionId}: ${err.message}`,
			);
			throw error;
		}
	}

	/**
	 * 请求客户端执行动作（通过 ACK 回传结果）
	 *
	 * 替代原 socketGateway.sendActionReq(socketId, actionReq)
	 */
	async sendActionReq(
		executionId: number,
		actionReq: ActionReqPayload,
	): Promise<{ success: boolean; error?: string }> {
		const socket = this.executionSocketService.getSocketForExecution(executionId);
		if (!socket) {
			throw new Error(
				`No connection for execution ${executionId}, cannot send action request`,
			);
		}

		const startTime = Date.now();
		this.logger.debug(
			`Sending action request: execution=${executionId}, type=${actionReq.actionType}`,
		);

		try {
			const response = (await socket
				.timeout(10000)
				.emitWithAck(
					WsEvents.DEVICE_ACTION,
					actionReq,
				)) as ActionRespPayload;

			const duration = Date.now() - startTime;

			if (!response.success) {
				this.logger.error(
					`Action request failed after ${duration}ms: ${response.error}`,
				);
				throw new Error(response.error || "Action execution failed");
			}

			return { success: true };
		} catch (error) {
			const duration = Date.now() - startTime;
			const err = error as Error;
			this.logger.error(
				`Action request error after ${duration}ms for execution ${executionId}: ${err.message}`,
			);
			throw error;
		}
	}

	// ============================================================
	// Cross-Instance Relay (多实例取消/暂停中继)
	// ============================================================

	/**
	 * 中继取消命令到其他实例
	 *
	 * 当 REST cancel 请求落在非 GraphRunner 实例时，通过 serverSideEmitWithAck
	 * 将命令广播到所有其他实例，由持有该执行的实例处理。
	 */
	async relayCancelExecution(
		executionId: number,
		userId: number,
		taskId: number,
		skipSummary = false,
	): Promise<CancelExecutionResult> {
		if (!this.adapterAttached) {
			return { success: false, error: "Cross-instance relay not available (single-instance mode)" };
		}
		try {
			const responses = await this.server.serverSideEmitWithAck(
				"internal:cancel-execution",
				{ executionId, userId, taskId, skipSummary },
			);
			const handled = responses.find((r: any) => r.handled);
			if (handled) {
				return {
					success: handled.success,
					summary: handled.summary,
					error: handled.error,
				};
			}
			return { success: false, error: "No instance holds this execution" };
		} catch (err) {
			this.logger.error(
				`Relay cancel failed for execution ${executionId}: ${(err as Error).message}`,
			);
			return { success: false, error: "Relay cancel failed" };
		}
	}

	/**
	 * 中继暂停命令到其他实例
	 */
	async relayPauseExecution(
		executionId: number,
		userId: number,
		taskId: number,
	): Promise<boolean> {
		if (!this.adapterAttached) {
			return false;
		}
		try {
			const responses = await this.server.serverSideEmitWithAck(
				"internal:pause-execution",
				{ executionId, userId, taskId },
			);
			const handled = responses.find((r: any) => r.handled);
			return handled?.success ?? false;
		} catch (err) {
			this.logger.error(
				`Relay pause failed for execution ${executionId}: ${(err as Error).message}`,
			);
			return false;
		}
	}
}

/** 跨实例中继结果 */
interface RelayResult {
	success: boolean;
	summary?: string;
	error?: string;
	handled: boolean;
}
