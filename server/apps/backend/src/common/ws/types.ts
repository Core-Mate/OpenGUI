import { Socket } from "socket.io";
import type { AgentEventSource, AgentEventType } from "../base/enum";

// ============================================================
// Connection Types
// ============================================================

/**
 * 每个 execution 对应一个 WS 连接
 */
export interface ExecutionConnection {
	executionId: number;
	userId: number;
	socketId: string;
	connectedAt: Date;
	/** 单调递增序列号，每个 agent:event 递增 */
	seq: number;
}

/**
 * 扩展 Socket 接口，附加认证和执行上下文
 */
export interface ExecutionSocket extends Socket {
	userId?: string;
	executionId?: number;
	connectedAt?: Date;
}

/**
 * 待命设备 Socket，附加设备标识
 */
export interface StandbySocket extends Socket {
	deviceId?: string;
	deviceName?: string;
}

// ============================================================
// Event Names
// ============================================================

export enum WsEvents {
	// Client → Server
	EXECUTION_READY = "execution:ready",
	LEASE_HEARTBEAT = "lease:heartbeat",

	// Server → Client (streaming, replaces SSE)
	AGENT_EVENT = "agent:event",

	// Server → Client (lifecycle)
	EXECUTION_STARTED = "execution:started",
	EXECUTION_FINISHED = "execution:finished",
	EXECUTION_ERROR = "execution:error",

	// Server → Client (device requests, with ACK)
	DEVICE_SCREENSHOT = "device:screenshot",
	DEVICE_ACTION = "device:action",
}

// ============================================================
// Event Payloads
// ============================================================

/**
 * Agent 流式事件 — 统一格式，替代原 SSE AgentStreamEvent
 */
export interface AgentStreamEvent {
	type: AgentEventType | string;
	taskExecutionId: number;
	from: AgentEventSource;
	content: string;
	extra?: any;
	/** 单调递增序列号（每个 execution 独立） */
	seq: number;
	/** 服务端时间戳 (ms) */
	timestamp: number;
}

/**
 * Action 请求载荷（服务端 → 客户端，需 ACK）
 */
export interface ActionReqPayload {
	executionId: number;
	actionType: string;
	actionInputs: any;
}

/**
 * Action 响应（客户端 ACK 回传）
 */
export interface ActionRespPayload {
	success: boolean;
	error?: string;
}

/**
 * 截屏响应（客户端 ACK 回传）
 */
export interface ScreenshotRespPayload {
	success: boolean;
	screenshot_uri: string;
	scale_factor: number;
	screen_width: number;
	screen_height: number;
	current_app_name?: string;
	/** 客户端计算的 pHash（64 位二进制字符串），可选 — 旧客户端不传 */
	phash?: string;
	error?: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 * 生成 execution room 名称
 */
export function executionRoom(executionId: number): string {
	return `execution:${executionId}`;
}
