import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { AppLogger } from "../log";
import type { ExecutionConnection, ExecutionSocket } from "./types";
import { executionRoom } from "./types";

/**
 *
 */
@Injectable()
export class ExecutionSocketService implements OnModuleDestroy {
	/** executionId → connection metadata */
	private readonly connections = new Map<number, ExecutionConnection>();

	/** executionId → socket reference */
	private readonly sockets = new Map<number, ExecutionSocket>();

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
	 */
	storeConnection(executionId: number, socket: ExecutionSocket): void {
		let previousSeq = 0;


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
	 */
	getSocketForExecution(executionId: number): ExecutionSocket | null {
		return this.sockets.get(executionId) ?? null;
	}

	/**
	 */
	getConnection(executionId: number): ExecutionConnection | null {
		return this.connections.get(executionId) ?? null;
	}

	/**
	 */
	isConnected(executionId: number): boolean {
		return this.sockets.has(executionId);
	}

	/**
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
	 */
	getActiveCount(): number {
		return this.connections.size;
	}
}
