/**
 * Socket.IO Client 辅助工具
 *
 * 提供创建认证 Socket.IO 客户端、等待事件、收集事件等辅助方法。
 */
import { io, type Socket } from "socket.io-client";

/** 跟踪所有创建的客户端以便 afterEach 清理 */
const activeSockets: Socket[] = [];

export interface ClientOptions {
	token?: string;
	executionId?: number;
	/** 额外传给 socket.io-client 的选项 */
	extraAuth?: Record<string, any>;
}

/**
 * 创建已认证的 Socket.IO 客户端并等待连接成功
 */
export function createClient(
	port: number,
	opts: ClientOptions,
): Socket {
	const socket = io(`http://localhost:${port}`, {
		transports: ["websocket"],
		autoConnect: false,
		auth: {
			token: opts.token ?? "valid-token",
			executionId: opts.executionId?.toString() ?? "1",
			...opts.extraAuth,
		},
	});
	activeSockets.push(socket);
	return socket;
}

/**
 * 连接客户端并等待 connect 事件
 */
export function connectClient(socket: Socket, timeout = 5000): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`Socket connect timeout after ${timeout}ms`));
		}, timeout);

		socket.once("connect", () => {
			clearTimeout(timer);
			resolve();
		});

		socket.once("connect_error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		socket.connect();
	});
}

/**
 * 等待指定事件，返回事件 payload
 */
export function waitForEvent<T = any>(
	socket: Socket,
	event: string,
	timeout = 5000,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off(event, handler);
			reject(new Error(`Timeout waiting for event "${event}" after ${timeout}ms`));
		}, timeout);

		function handler(data: T) {
			clearTimeout(timer);
			resolve(data);
		}

		socket.once(event, handler);
	});
}

/**
 * 等待 disconnect 事件
 */
export function waitForDisconnect(
	socket: Socket,
	timeout = 5000,
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!socket.connected) {
			resolve("already_disconnected");
			return;
		}

		const timer = setTimeout(() => {
			reject(new Error(`Timeout waiting for disconnect after ${timeout}ms`));
		}, timeout);

		socket.once("disconnect", (reason) => {
			clearTimeout(timer);
			resolve(reason);
		});
	});
}

/**
 * 收集指定事件的所有 payload（持续一段时间）
 */
export function collectEvents<T = any>(
	socket: Socket,
	event: string,
	duration: number,
): Promise<T[]> {
	return new Promise((resolve) => {
		const collected: T[] = [];

		function handler(data: T) {
			collected.push(data);
		}

		socket.on(event, handler);

		setTimeout(() => {
			socket.off(event, handler);
			resolve(collected);
		}, duration);
	});
}

/**
 * 断开所有活跃的测试客户端
 */
export function disconnectAll(): void {
	for (const socket of activeSockets) {
		if (socket.connected) {
			socket.disconnect();
		}
		socket.removeAllListeners();
	}
	activeSockets.length = 0;
}

/**
 * 辅助方法：发送 execution:ready 并等待 execution:started
 */
export async function emitReadyAndWaitStarted(
	socket: Socket,
	executionId: number,
	timeout = 5000,
): Promise<any> {
	const startedPromise = waitForEvent(socket, "execution:started", timeout);
	socket.emit("execution:ready", { executionId });
	return startedPromise;
}

/**
 * 小延迟，用于等待异步操作完成
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
