/**
 * Socket.IO client helpers
 *
 * Provides helpers for creating authenticated Socket.IO clients, waiting for events, and collecting events.
 */
import { io, type Socket } from "socket.io-client";

/** Track all created clients so afterEach can clean them up */
const activeSockets: Socket[] = [];

export interface ClientOptions {
	token?: string;
	executionId?: number;
	/** Extra options passed to socket.io-client */
	extraAuth?: Record<string, any>;
}

/**
 * Create an authenticated Socket.IO client and wait for connection
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
 * Connect the client and wait for the connect event
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
 * Wait for the given event and return its payload
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
 * Wait for the disconnect event
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
 * Collect all payloads for the given event over a short duration
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
 * Disconnect all active test clients
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
 * Helper: send execution:ready and wait for execution:started
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
 * Short delay for async operations to settle
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
