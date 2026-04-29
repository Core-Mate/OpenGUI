import { Socket } from "socket.io";
import type { AgentEventSource, AgentEventType } from "../base/enum";

// ============================================================
// Connection Types
// ============================================================

/**
 */
export interface ExecutionConnection {
	executionId: number;
	userId: number;
	socketId: string;
	connectedAt: Date;
	seq: number;
}

/**
 */
export interface ExecutionSocket extends Socket {
	userId?: string;
	executionId?: number;
	connectedAt?: Date;
}

/**
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
 */
export interface AgentStreamEvent {
	type: AgentEventType | string;
	taskExecutionId: number;
	from: AgentEventSource;
	content: string;
	extra?: any;
	seq: number;
	timestamp: number;
}

/**
 */
export interface ActionReqPayload {
	executionId: number;
	actionType: string;
	actionInputs: any;
}

/**
 */
export interface ActionRespPayload {
	success: boolean;
	error?: string;
}

/**
 */
export interface ScreenshotRespPayload {
	success: boolean;
	screenshot_uri: string;
	scale_factor: number;
	screen_width: number;
	screen_height: number;
	current_app_name?: string;
	phash?: string;
	error?: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 */
export function executionRoom(executionId: number): string {
	return `execution:${executionId}`;
}
