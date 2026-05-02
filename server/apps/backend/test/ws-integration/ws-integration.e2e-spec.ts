/**
 * WS communication + task execution integration tests
 *
 * Uses the real ExecutionGateway / ExecutionSocketService / WsAuthMiddleware,
 * Uses socket.io-client to simulate an Android client and verify:
 * 1. core path (execute -> ready -> streaming -> finish)
 * 2. pause/resume
 * 3. task cancellation
 * 4. connection mechanics and edge cases
 * 5. heartbeats and leases
 * 6. timeouts
 * 7. race conditions
 */

// jest.mock must appear before imports because it is hoisted
// ====== ESM-only dependency mocks to avoid transform issues under the pnpm monorepo======
jest.mock("uuid", () => ({
	v4: () => "test-uuid-" + Math.random().toString(36).slice(2, 10),
}));
jest.mock("better-auth/node", () => ({
	fromNodeHeaders: (headers: any) => new Headers(headers ?? {}),
	toNodeHandler: () => () => {},
}));
jest.mock("better-call/node", () => ({
	toNodeHandler: () => () => {},
}));
jest.mock("@repo/db", () => ({
	prisma: {},
	Prisma: {},
}));

// ====== Mock deep source modules to avoid recursively loading the full app dependency tree======
jest.mock("../../src/lib/auth", () => ({
	auth: require("./helpers/mock-auth").mockAuth,
}));
jest.mock("redis", () => ({
	createClient: jest.fn(() => {
		throw new Error("Redis not available in test");
	}),
}));
// Prisma Service — Export only the class token; the implementation is overridden in Testing Module
jest.mock("../../src/prisma/prisma.service", () => ({
	PrismaService: class PrismaService {},
}));
// RedisService
jest.mock("../../src/common/redis/redis.service", () => ({
	RedisService: class RedisService {},
}));
// Lease Service — export class token only
jest.mock("../../src/common/lease/lease.service", () => ({
	LeaseService: class LeaseService {},
}));
// TaskExecutionService — export class token only
jest.mock("../../src/modules/task/task-execution.service", () => ({
	TaskExecutionService: class TaskExecutionService {},
}));
// GraphRunnerService — export only the class token and interface
jest.mock("../../src/modules/graph-agent/graph-runner.service", () => ({
	GraphRunnerService: class GraphRunnerService {},
	CallUserResponse: class CallUserResponse {},
}));
// SLS service (AppLogger dependency)
jest.mock("../../src/common/sls", () => ({
	SlsService: class SlsService {},
}));

import {
	type TestApp,
	createTestApp,
	resetAllMocks,
} from "./helpers/create-test-app";
import {
	createClient,
	connectClient,
	waitForEvent,
	waitForDisconnect,
	collectEvents,
	emitReadyAndWaitStarted,
	disconnectAll,
	delay,
} from "./helpers/socket-client";
import {
	setMockSession,
	setMockSessionForToken,
	createUserSession,
} from "./helpers/mock-auth";
import { AgentEventSource, AgentEventType } from "../../src/common/base/enum";
import type { Socket } from "socket.io-client";

// ============================================================
// Test Suite
// ============================================================

describe("WS Integration Tests", () => {
	let testApp: TestApp;

	beforeAll(async () => {
		testApp = await createTestApp();
	});

	afterEach(() => {
		disconnectAll();
		resetAllMocks(testApp);
	});

	afterAll(async () => {
		disconnectAll();
		await testApp.cleanup();
	});

	// Helper: seed one PENDING execution and set the auth session
	function seedPendingExecution(
		id: number,
		userId = 1,
		overrides: Record<string, any> = {},
	) {
		testApp.mockPrisma.seedExecution({
			id,
			user_id: userId,
			task_id: 1,
			execution_status: "PENDING",
			...overrides,
		});
		setMockSession(createUserSession(userId));
	}

	// Helper: create a connected client
	async function createConnectedClient(
		executionId: number,
		token = "valid-token",
	): Promise<Socket> {
		const client = createClient(testApp.port, { token, executionId });
		await connectClient(client);
		return client;
	}

	// ============================================================
	// Category 1: core path
	// ============================================================

	describe("1. Core Happy Path", () => {
		it("1.1 full lifecycle: connect -> ready -> agent:event streaming -> finish", async () => {
			seedPendingExecution(1);
			const client = await createConnectedClient(1);

			// emit execution:ready -> wait for execution:started
			const started = await emitReadyAndWaitStarted(client, 1);
			expect(started.executionId).toBe(1);
			expect(testApp.mockTaskExecutionService.startExecution).toHaveBeenCalledWith(1);

			// Gateway also automatically sends a CONNECTED agent:event (seq=0)
			// Wait for that event, which may already have arrived
			await delay(50);

			// Send the first custom agent:event
			const eventPromise1 = waitForEvent(client, "agent:event");
			testApp.gateway.sendAgentEvent(1, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 1,
				from: AgentEventSource.COORDINATOR,
				content: "hello",
			});
			const event1 = await eventPromise1;
			// seq=1 because seq=0 was consumed by the CONNECTED event
			expect(event1.seq).toBe(1);
			expect(event1.content).toBe("hello");
			expect(event1.type).toBe(AgentEventType.TEXT_DELTA);
			expect(event1.timestamp).toBeDefined();

			// Send the second agent:event
			const eventPromise2 = waitForEvent(client, "agent:event");
			testApp.gateway.sendAgentEvent(1, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 1,
				from: AgentEventSource.COORDINATOR,
				content: "world",
			});
			const event2 = await eventPromise2;
			expect(event2.seq).toBe(2);
			expect(event2.content).toBe("world");

			// Send execution:finished
			const finishPromise = waitForEvent(client, "execution:finished");
			testApp.gateway.sendExecutionFinished(1, { status: "SUCCEED" });
			const finished = await finishPromise;
			expect(finished.executionId).toBe(1);
			expect(finished.status).toBe("SUCCEED");
		});

		it("1.2 screenshot ACK round trip", async () => {
			seedPendingExecution(2);
			testApp.mockPrisma.seedExecution({
				id: 2,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			const client = await createConnectedClient(2);

			// Client listens for device:screenshot and returns ACK
			client.on("device:screenshot", (_data, callback) => {
				callback({
					success: true,
					screenshot_uri: "oss://img.png",
					scale_factor: 2,
					screen_width: 1080,
					screen_height: 2400,
					current_app_name: "com.example.app",
				});
			});

			const result = await testApp.gateway.sendScreenshotReq(2);
			expect(result.success).toBe(true);
			expect(result.screenshotUri).toBe("oss://img.png");
			expect(result.scaleFactor).toBe(2);
			expect(result.screenWidth).toBe(1080);
			expect(result.screenHeight).toBe(2400);
			expect(result.currentAppName).toBe("com.example.app");
		});

		it("1.3 action ACK round trip", async () => {
			seedPendingExecution(3);
			testApp.mockPrisma.seedExecution({
				id: 3,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			const client = await createConnectedClient(3);

			client.on("device:action", (_data, callback) => {
				callback({ success: true });
			});

			const result = await testApp.gateway.sendActionReq(3, {
				executionId: 3,
				actionType: "click",
				actionInputs: { x: 100, y: 200 },
			});
			expect(result.success).toBe(true);
		});

		it("1.4 multiple events keep seq monotonic", async () => {
			seedPendingExecution(4);
			const client = await createConnectedClient(4);
			await emitReadyAndWaitStarted(client, 4);

			// The CONNECTED event consumed seq=0
			await delay(50);

			const events: any[] = [];
			client.on("agent:event", (data) => events.push(data));

			// Send 10 events quickly
			for (let i = 0; i < 10; i++) {
				testApp.gateway.sendAgentEvent(4, {
					type: AgentEventType.TEXT_DELTA,
					taskExecutionId: 4,
					from: AgentEventSource.COORDINATOR,
					content: `msg-${i}`,
				});
			}

			await delay(200);

			expect(events.length).toBe(10);
			const seqs = events.map((e) => e.seq);
			// seq starts from 1 because CONNECTED consumed 0
			expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		});

		it("1.5 throws when screenshot ACK returns failure", async () => {
			seedPendingExecution(5);
			testApp.mockPrisma.seedExecution({
				id: 5,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			const client = await createConnectedClient(5);

			client.on("device:screenshot", (_data, callback) => {
				callback({
					success: false,
					error: "Screen locked",
					screenshot_uri: "",
					scale_factor: 1,
					screen_width: 0,
					screen_height: 0,
				});
			});

			await expect(testApp.gateway.sendScreenshotReq(5)).rejects.toThrow(
				"Screen locked",
			);
		});
	});

	// ============================================================
	// Category 2:pause/resume
	// ============================================================

	describe("2. Pause/Resume", () => {
		it("2.1 execution:ready recognizes resume_pause and calls start Resume Execution", async () => {
			// Simulate resume after pause with status changed to PENDING + status Message="resume_pause"
			testApp.mockPrisma.seedExecution({
				id: 10,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
				status_message: "resume_pause",
			});
			setMockSession(createUserSession(1));

			// get Execution Record returns a record with status Message
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 10,
				executionStatus: "PENDING",
				statusMessage: "resume_pause",
				originExecutionId: null,
			});

			const client = await createConnectedClient(10);
			await emitReadyAndWaitStarted(client, 10);

			expect(
				testApp.mockTaskExecutionService.startResumeExecution,
			).toHaveBeenCalledWith(10, "pause");
			expect(
				testApp.mockTaskExecutionService.startExecution,
			).not.toHaveBeenCalled();
		});

		it("2.2 execution:ready recognizes resume_hitl: and calls start Resume Execution(hitl)", async () => {
			testApp.mockPrisma.seedExecution({
				id: 11,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
				status_message: "resume_hitl:approved",
			});
			setMockSession(createUserSession(1));

			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 11,
				executionStatus: "PENDING",
				statusMessage: "resume_hitl:approved",
				originExecutionId: null,
			});

			const client = await createConnectedClient(11);
			await emitReadyAndWaitStarted(client, 11);

			expect(
				testApp.mockTaskExecutionService.startResumeExecution,
			).toHaveBeenCalledWith(11, "hitl");
		});

		it("2.3 execution:ready recognizes forked execution with origin Execution Id", async () => {
			testApp.mockPrisma.seedExecution({
				id: 12,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
				origin_execution_id: 5,
			});
			setMockSession(createUserSession(1));

			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 12,
				executionStatus: "PENDING",
				statusMessage: null,
				originExecutionId: 5,
			});

			const client = await createConnectedClient(12);
			await emitReadyAndWaitStarted(client, 12);

			expect(
				testApp.mockTaskExecutionService.startForkExecution,
			).toHaveBeenCalledWith(12);
			expect(
				testApp.mockTaskExecutionService.startExecution,
			).not.toHaveBeenCalled();
		});

		it("2.4 after pause, WS disconnect -> resume -> reconnect -> ready routes correctly", async () => {
			// Phase 1: normal connect + ready
			seedPendingExecution(13);
			const client1 = await createConnectedClient(13);
			await emitReadyAndWaitStarted(client1, 13);

			// Phase 2: disconnect
			client1.disconnect();
			await delay(100);

			// Phase 3: simulate status becoming PENDING + resume_pause after resume
			testApp.mockPrisma.seedExecution({
				id: 13,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
				status_message: "resume_pause",
			});
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 13,
				executionStatus: "PENDING",
				statusMessage: "resume_pause",
				originExecutionId: null,
			});

			// Clear the Gateway idempotency set to simulate a new round
			(testApp.gateway as any).readyReceived.delete(13);
			testApp.mockTaskExecutionService.startResumeExecution.mockClear();

			// Phase 4: reconnect
			const client2 = await createConnectedClient(13);
			await emitReadyAndWaitStarted(client2, 13);

			expect(
				testApp.mockTaskExecutionService.startResumeExecution,
			).toHaveBeenCalledWith(13, "pause");
		});
	});

	// ============================================================
	// Category 3:task cancellation
	// ============================================================

	describe("3. Cancel Execution", () => {
		it("3.1 cancel in RUNNING state sends execution:finished(CANCELLED)", async () => {
			seedPendingExecution(20);
			const client = await createConnectedClient(20);
			await emitReadyAndWaitStarted(client, 20);

			// Simulate notification after server-side cancellation finishes
			const finishPromise = waitForEvent(client, "execution:finished");
			testApp.gateway.sendExecutionFinished(20, {
				status: "CANCELLED",
				message: "User cancelled",
			});
			const finished = await finishPromise;
			expect(finished.status).toBe("CANCELLED");
		});

		it("3.2 cancel in PENDING state sends execution:error", async () => {
			seedPendingExecution(21);
			const client = await createConnectedClient(21);
			// Do not send execution:ready

			const errorPromise = waitForEvent(client, "execution:error");
			testApp.gateway.sendExecutionError(
				21,
				"Execution cancelled before start",
			);
			const error = await errorPromise;
			expect(error.message).toBe("Execution cancelled before start");
		});

		it("3.3 after cancel, client receives execution:finished with summary", async () => {
			seedPendingExecution(22);
			const client = await createConnectedClient(22);
			await emitReadyAndWaitStarted(client, 22);

			const finishPromise = waitForEvent(client, "execution:finished");
			testApp.gateway.sendExecutionFinished(22, {
				status: "CANCELLED",
				message: "Task completed summary: did X, Y, Z",
			});
			const finished = await finishPromise;
			expect(finished.status).toBe("CANCELLED");
			expect(finished.message).toContain("summary");
		});

		it("3.4 execution:error event has the correct shape", async () => {
			seedPendingExecution(23);
			const client = await createConnectedClient(23);

			const errorPromise = waitForEvent(client, "execution:error");
			testApp.gateway.sendExecutionError(23, "Internal server error");
			const error = await errorPromise;
			expect(error.executionId).toBe(23);
			expect(error.message).toBe("Internal server error");
			expect(error.timestamp).toBeDefined();
		});

		it("3.5 new execution can connect immediately after cancellation", async () => {
			// Execution 24: cancelled
			seedPendingExecution(24);
			const client1 = await createConnectedClient(24);
			await emitReadyAndWaitStarted(client1, 24);
			client1.disconnect();
			await delay(50);

			// Execution 25: new
			testApp.mockPrisma.seedExecution({
				id: 25,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
			});
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 25,
				executionStatus: "PENDING",
				statusMessage: null,
				originExecutionId: null,
			});

			const client2 = await createConnectedClient(25);
			const started = await emitReadyAndWaitStarted(client2, 25);
			expect(started.executionId).toBe(25);
			expect(
				testApp.mockTaskExecutionService.startExecution,
			).toHaveBeenCalledWith(25);
		});
	});

	// ============================================================
	// Category 4:connection mechanics and edge cases
	// ============================================================

	describe("4. Connection & Edge Cases", () => {
		it("4.1 invalid token -> connect_error(Invalid authentication token)", async () => {
			testApp.mockPrisma.seedExecution({
				id: 30,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
			});
			// No session set -> get Session returns null
			setMockSession(null);

			const client = createClient(testApp.port, {
				token: "invalid-token",
				executionId: 30,
			});

			await expect(connectClient(client)).rejects.toThrow();
		});

		it("4.2 another user's execution -> connect_error", async () => {
			testApp.mockPrisma.seedExecution({
				id: 31,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
			});
			// Set the session for user 2
			setMockSession(createUserSession(2));

			const client = createClient(testApp.port, {
				token: "user2-token",
				executionId: 31,
			});

			await expect(connectClient(client)).rejects.toThrow();
		});

		it("4.3 finished execution -> connect_error(FINISHED status)", async () => {
			testApp.mockPrisma.seedExecution({
				id: 32,
				user_id: 1,
				task_id: 1,
				execution_status: "FINISHED",
			});
			setMockSession(createUserSession(1));

			const client = createClient(testApp.port, {
				token: "valid-token",
				executionId: 32,
			});

			await expect(connectClient(client)).rejects.toThrow();
		});

		it("4.4 missing execution Id -> connect_error", async () => {
			setMockSession(createUserSession(1));

			const client = createClient(testApp.port, {
				token: "valid-token",
				executionId: undefined as any,
			});

			await expect(connectClient(client)).rejects.toThrow();
		});

		it("4.5 duplicate execution:ready is idempotent and triggers start Execution once", async () => {
			seedPendingExecution(34);
			const client = await createConnectedClient(34);

			// first ready
			await emitReadyAndWaitStarted(client, 34);
			expect(
				testApp.mockTaskExecutionService.startExecution,
			).toHaveBeenCalledTimes(1);

			// second ready; should be ignored
			client.emit("execution:ready", { executionId: 34 });
			await delay(200);

			expect(
				testApp.mockTaskExecutionService.startExecution,
			).toHaveBeenCalledTimes(1);
		});

		it("4.6 old socket for the same execution is replaced and seq remains continuous", async () => {
			seedPendingExecution(35);

			// Socket A connects
			const clientA = await createConnectedClient(35);
			await emitReadyAndWaitStarted(clientA, 35);

			// CONNECTED Consume seq=0, then send two events (seq=1, seq=2)
			await delay(50);
			testApp.gateway.sendAgentEvent(35, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 35,
				from: AgentEventSource.COORDINATOR,
				content: "a1",
			});
			testApp.gateway.sendAgentEvent(35, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 35,
				from: AgentEventSource.COORDINATOR,
				content: "a2",
			});
			await delay(100);

			// Socket B connects to the same execution -> A should be disconnected
			const disconnectPromise = waitForDisconnect(clientA);

			// A fresh execution state is needed to allow connection while still RUNNING
			testApp.mockPrisma.seedExecution({
				id: 35,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});

			const clientB = await createConnectedClient(35);
			await disconnectPromise;

			// Socket B sends an event -> seq should start at 3, preserving A's seq
			const eventPromise = waitForEvent(clientB, "agent:event");
			testApp.gateway.sendAgentEvent(35, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 35,
				from: AgentEventSource.COORDINATOR,
				content: "b1",
			});
			const event = await eventPromise;
			expect(event.seq).toBe(3);
			expect(event.content).toBe("b1");
		});

		it("4.7 send Agent Event returns false with no connection", async () => {
			const result = testApp.gateway.sendAgentEvent(999, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 999,
				from: AgentEventSource.COORDINATOR,
				content: "nobody home",
			});
			expect(result).toBe(false);
		});

		it("4.8 send Screenshot Req throws with no connection", async () => {
			await expect(testApp.gateway.sendScreenshotReq(999)).rejects.toThrow(
				/No connection for execution 999/,
			);
		});

		it("4.9 send Action Req throws with no connection", async () => {
			await expect(
				testApp.gateway.sendActionReq(999, {
					executionId: 999,
					actionType: "click",
					actionInputs: {},
				}),
			).rejects.toThrow(/No connection for execution 999/);
		});

		it("4.10 next Seq returns -1 for an unknown execution", () => {
			const seq = testApp.socketService.nextSeq(888);
			expect(seq).toBe(-1);
		});

		it("4.11 remove Connection BySocket Id cleans up after disconnect", async () => {
			seedPendingExecution(36);
			const client = await createConnectedClient(36);

			expect(testApp.socketService.isConnected(36)).toBe(true);
			expect(testApp.socketService.getActiveCount()).toBeGreaterThanOrEqual(1);

			client.disconnect();
			await delay(200);

			expect(testApp.socketService.isConnected(36)).toBe(false);
		});
	});

	// ============================================================
	// Category 5:heartbeats and leases
	// ============================================================

	describe("5. Heartbeat & Lease", () => {
		it("5.1 heartbeat renews lease normally -> { renewed: true }", async () => {
			seedPendingExecution(40);
			const client = await createConnectedClient(40);

			const response = await new Promise<any>((resolve) => {
				client.emit(
					"lease:heartbeat",
					{ executionId: 40 },
					(resp: any) => resolve(resp),
				);
			});

			expect(response.renewed).toBe(true);
			expect(testApp.mockLeaseService.renewLease).toHaveBeenCalledWith(40);
		});

		it("5.2 heartbeat rebuilds expired lease while execution remains active", async () => {
			testApp.mockPrisma.seedExecution({
				id: 41,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			setMockSession(createUserSession(1));

			// renew Lease returns false because the lease expired
			testApp.mockLeaseService.renewLease.mockResolvedValue(false);

			// get Execution Record returns an active status
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 41,
				executionStatus: "RUNNING",
				taskId: 1,
			});

			const client = await createConnectedClient(41);

			const response = await new Promise<any>((resolve) => {
				client.emit(
					"lease:heartbeat",
					{ executionId: 41 },
					(resp: any) => resolve(resp),
				);
			});

			expect(response.renewed).toBe(true);
			expect(testApp.mockLeaseService.createLease).toHaveBeenCalled();
		});

		it("5.3 heartbeat failure with inactive execution disconnects the client", async () => {
			testApp.mockPrisma.seedExecution({
				id: 42,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING", // Auth middleware requires a connectable status.
			});
			setMockSession(createUserSession(1));

			// renew Lease returns false
			testApp.mockLeaseService.renewLease.mockResolvedValue(false);

			// get Execution Record returns FINISHED and is no longer active
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 42,
				executionStatus: "FINISHED",
				taskId: 1,
			});

			const client = await createConnectedClient(42);
			const disconnectPromise = waitForDisconnect(client);

			client.emit("lease:heartbeat", { executionId: 42 }, () => {});

			const reason = await disconnectPromise;
			expect(reason).toBeDefined();
		});

		it("5.4 heartbeat can rebuild lease in SUSPENDED state", async () => {
			testApp.mockPrisma.seedExecution({
				id: 43,
				user_id: 1,
				task_id: 1,
				execution_status: "SUSPENDED",
			});
			setMockSession(createUserSession(1));

			testApp.mockLeaseService.renewLease.mockResolvedValue(false);
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 43,
				executionStatus: "SUSPENDED",
				taskId: 1,
			});

			const client = await createConnectedClient(43);

			const response = await new Promise<any>((resolve) => {
				client.emit(
					"lease:heartbeat",
					{ executionId: 43 },
					(resp: any) => resolve(resp),
				);
			});

			expect(response.renewed).toBe(true);
			expect(testApp.mockLeaseService.createLease).toHaveBeenCalled();
		});
	});

	// ============================================================
	// Category 6:timeouts Test
	// ============================================================

	describe("6. Timeouts", () => {
		it("6.1 screenshot ACK timeout when the client does not respond", async () => {
			testApp.mockPrisma.seedExecution({
				id: 50,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			setMockSession(createUserSession(1));
			const client = await createConnectedClient(50);

			// Client listens for device:screenshot but does not call back

			// sendScreenshotReq has an internal 15s timeout
			// To avoid waiting that long in the test, verify the Promise behavior
			const screenshotPromise = testApp.gateway.sendScreenshotReq(50);

			// This Promise rejects on timeout, but that takes 15s
			// Test note: this test takes longer (~15s) and may need to be skipped in CI
			await expect(screenshotPromise).rejects.toThrow();
		}, 20000);

		it("6.2 action ACK timeout when the client does not respond", async () => {
			testApp.mockPrisma.seedExecution({
				id: 51,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			setMockSession(createUserSession(1));
			const client = await createConnectedClient(51);

			const actionPromise = testApp.gateway.sendActionReq(51, {
				executionId: 51,
				actionType: "click",
				actionInputs: { x: 0, y: 0 },
			});

			await expect(actionPromise).rejects.toThrow();
		}, 15000);

		it("6.3 sends execution:error when execution:ready fails", async () => {
			seedPendingExecution(52);

			testApp.mockTaskExecutionService.startExecution.mockRejectedValue(
				new Error("Graph initialization failed"),
			);
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 52,
				executionStatus: "PENDING",
				statusMessage: null,
				originExecutionId: null,
			});

			const client = await createConnectedClient(52);

			const errorPromise = waitForEvent(client, "execution:error");
			client.emit("execution:ready", { executionId: 52 });
			const error = await errorPromise;

			expect(error.executionId).toBe(52);
			expect(error.message).toBe("Graph initialization failed");
		});
	});

	// ============================================================
	// Category 7:race conditions
	// ============================================================

	describe("7. Race Conditions", () => {
		it("7.1 start Execution CAS fails with expected PENDING but already RUNNING -> sends started", async () => {
			seedPendingExecution(60);

			// start Execution throws a CAS failure
			testApp.mockTaskExecutionService.startExecution.mockRejectedValue(
				new Error("CAS failed: expected PENDING but found RUNNING"),
			);

			// get Execution Record returns RUNNING to simulate another starter
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 60,
				executionStatus: "RUNNING",
				statusMessage: null,
				originExecutionId: null,
			});

			const client = await createConnectedClient(60);

			// Should receive execution:started instead of error
			const startedPromise = waitForEvent(client, "execution:started");
			client.emit("execution:ready", { executionId: 60 });
			const started = await startedPromise;
			expect(started.executionId).toBe(60);
		});

		it("7.2 start Execution CAS fails and status is not RUNNING -> sends error", async () => {
			seedPendingExecution(61);

			testApp.mockTaskExecutionService.startExecution.mockRejectedValue(
				new Error("CAS failed: expected PENDING but found FINISHED"),
			);
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 61,
				executionStatus: "FINISHED",
				statusMessage: null,
				originExecutionId: null,
			});

			const client = await createConnectedClient(61);

			const errorPromise = waitForEvent(client, "execution:error");
			client.emit("execution:ready", { executionId: 61 });
			const error = await errorPromise;
			expect(error.executionId).toBe(61);
			expect(error.message).toContain("expected PENDING");
		});

		it("7.3 multiple clients quickly connect to the same execution -> only the last survives", async () => {
			seedPendingExecution(62);

			// Create 3 clients concurrently
			const clients = await Promise.all([
				createConnectedClient(62),
				(async () => {
					await delay(50);
					return createConnectedClient(62);
				})(),
				(async () => {
					await delay(100);
					return createConnectedClient(62);
				})(),
			]);

			await delay(300);

			// Only the last one should remain connected
			const connectedCount = clients.filter((c) => c.connected).length;
			expect(connectedCount).toBe(1);

			// The last connected client should receive events
			const lastClient = clients[2];
			if (lastClient.connected) {
				const eventPromise = waitForEvent(lastClient, "agent:event");
				testApp.gateway.sendAgentEvent(62, {
					type: AgentEventType.TEXT_DELTA,
					taskExecutionId: 62,
					from: AgentEventSource.COORDINATOR,
					content: "only-last",
				});
				const event = await eventPromise;
				expect(event.content).toBe("only-last");
			}
		});

		it("7.4 disconnect -> immediate reconnect -> execution:ready still works", async () => {
			seedPendingExecution(63);
			const client1 = await createConnectedClient(63);
			await emitReadyAndWaitStarted(client1, 63);

			// disconnect
			client1.disconnect();
			await delay(100);

			// Reconnect while execution is still RUNNING
			testApp.mockPrisma.seedExecution({
				id: 63,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});

			const client2 = await createConnectedClient(63);
			expect(client2.connected).toBe(true);

			// send Agent Event works normally
			const eventPromise = waitForEvent(client2, "agent:event");
			testApp.gateway.sendAgentEvent(63, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 63,
				from: AgentEventSource.COORDINATOR,
				content: "reconnected",
			});
			const event = await eventPromise;
			expect(event.content).toBe("reconnected");
		});
	});

	// ============================================================
	// Additional category: ExecutionSocketService unit-level tests
	// ============================================================

	describe("8. ExecutionSocketService Internals", () => {
		it("8.1 storeConnection + getConnection", async () => {
			seedPendingExecution(70);
			const client = await createConnectedClient(70);

			const conn = testApp.socketService.getConnection(70);
			expect(conn).not.toBeNull();
			expect(conn!.executionId).toBe(70);
			expect(conn!.seq).toBe(0);
		});

		it("8.2 is Connected returns correctly after connect/disconnect", async () => {
			seedPendingExecution(71);
			expect(testApp.socketService.isConnected(71)).toBe(false);

			const client = await createConnectedClient(71);
			expect(testApp.socketService.isConnected(71)).toBe(true);

			client.disconnect();
			await delay(200);
			expect(testApp.socketService.isConnected(71)).toBe(false);
		});

		it("8.3 get Active Count counts correctly", async () => {
			const initialCount = testApp.socketService.getActiveCount();

			seedPendingExecution(72);
			const client1 = await createConnectedClient(72);

			testApp.mockPrisma.seedExecution({
				id: 73,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
			});
			const client2 = await createConnectedClient(73);

			expect(testApp.socketService.getActiveCount()).toBe(initialCount + 2);

			client1.disconnect();
			await delay(200);
			expect(testApp.socketService.getActiveCount()).toBe(initialCount + 1);

			client2.disconnect();
			await delay(200);
			expect(testApp.socketService.getActiveCount()).toBe(initialCount);
		});

		it("8.4 get Socket For Execution returns a socket or null", async () => {
			expect(testApp.socketService.getSocketForExecution(999)).toBeNull();

			seedPendingExecution(74);
			const client = await createConnectedClient(74);

			const socket = testApp.socketService.getSocketForExecution(74);
			expect(socket).not.toBeNull();
			expect(socket!.id).toBeDefined();
		});
	});
});
