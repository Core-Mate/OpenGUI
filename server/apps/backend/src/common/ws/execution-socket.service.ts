import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { AppLogger } from "../log";
import type { ExecutionConnection, ExecutionSocket } from "./types";
import { executionRoom } from "./types";

/**
 * Execution ↔ Socket 映射管理
 *
 * 使用内存 Map 而非 Redis，因为：
 * - ACK 请求（截屏、动作）需要直接 socket 引用，必须本地持有
 * - 每个 execution 恰好在运行 GraphRunner 的服务器实例上
 * - Redis Streams Adapter 负责跨实例广播事件
 */
@Injectable()
export class ExecutionSocketService implements OnModuleDestroy {
	/** executionId → connection metadata */
	private readonly connections = new Map<number, ExecutionConnection>();

	/** executionId → socket reference */
	private readonly sockets = new Map<number, ExecutionSocket>();

	/** socketId → executionId (反向索引) */
	private readonly socketToExecution = new Map<string, number>();

	constructor(private readonly logger: AppLogger) {
		this.logger.setContext(ExecutionSocketService.name);
	}

	onModuleDestroy() {
		this.connections.clear();
		this.sockets.clear();
		this.socketToExecution.clear();
	}

	/**
	 * 存储 execution 连接
	 */
	storeConnection(executionId: number, socket: ExecutionSocket): void {
		let previousSeq = 0;

		// 如果已有同 executionId 的连接，先清理并断开旧 socket
		if (this.sockets.has(executionId)) {
			const oldConn = this.connections.get(executionId);
			if (oldConn) {
				previousSeq = oldConn.seq;
			}
			const old = this.sockets.get(executionId)!;
			this.logger.warn(
				`Replacing existing connection for execution ${executionId}: old=${old.id}, new=${socket.id}, preserving seq=${previousSeq}`,
			);
			this.socketToExecution.delete(old.id);
			try {
				old.leave(executionRoom(executionId));
				old.disconnect(true);
			} catch (e) {
				this.logger.warn(`Failed to disconnect old socket ${old.id}: ${(e as Error).message}`);
			}
		}

		const conn: ExecutionConnection = {
			executionId,
			userId: Number(socket.userId),
			socketId: socket.id,
			connectedAt: new Date(),
			seq: previousSeq,
		};

		this.connections.set(executionId, conn);
		this.sockets.set(executionId, socket);
		this.socketToExecution.set(socket.id, executionId);

		this.logger.log(
			`Connection stored: execution=${executionId}, socket=${socket.id}`,
		);
	}

	/**
	 * 移除 execution 连接
	 */
	removeConnection(executionId: number): void {
		const conn = this.connections.get(executionId);
		if (conn) {
			this.socketToExecution.delete(conn.socketId);
		}
		this.connections.delete(executionId);
		this.sockets.delete(executionId);
		this.logger.log(`Connection removed: execution=${executionId}`);
	}

	/**
	 * 通过 socketId 移除连接
	 */
	removeConnectionBySocketId(socketId: string): number | null {
		const executionId = this.socketToExecution.get(socketId);
		if (executionId !== undefined) {
			this.removeConnection(executionId);
			return executionId;
		}
		return null;
	}

	/**
	 * 获取 execution 的 socket 引用（用于 emitWithAck）
	 */
	getSocketForExecution(executionId: number): ExecutionSocket | null {
		return this.sockets.get(executionId) ?? null;
	}

	/**
	 * 获取 execution 连接元数据
	 */
	getConnection(executionId: number): ExecutionConnection | null {
		return this.connections.get(executionId) ?? null;
	}

	/**
	 * 检查 execution 是否已连接
	 */
	isConnected(executionId: number): boolean {
		return this.sockets.has(executionId);
	}

	/**
	 * 递增并返回下一个 seq
	 */
	nextSeq(executionId: number): number {
		const conn = this.connections.get(executionId);
		if (!conn) {
			this.logger.warn(
				`nextSeq called for unknown execution ${executionId}, no active connection`,
			);
			return -1;
		}
		return conn.seq++;
	}

	/**
	 * 获取活跃连接数
	 */
	getActiveCount(): number {
		return this.connections.size;
	}
}
