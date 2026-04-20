/**
 * WS 通信 + 任务执行 集成测试
 *
 * 使用真实的 ExecutionGateway / ExecutionSocketService / WsAuthMiddleware，
 * 配合 socket.io-client 模拟 Android 客户端，验证：
 * 1. 核心主链路（execute → ready → streaming → finish）
 * 2. 暂停/恢复
 * 3. 取消任务
 * 4. 连接机制与边界情况
 * 5. 心跳与租约
 * 6. 超时
 * 7. 竞态条件
 */

// jest.mock 必须在 import 之前（会被 hoisted）
// ====== ESM-only 依赖 mock（避免 pnpm monorepo 下 transform 问题）======
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

// ====== Mock 深层源码模块（避免递归拉入整个应用依赖树）======
jest.mock("../../src/lib/auth", () => ({
	auth: require("./helpers/mock-auth").mockAuth,
}));
jest.mock("redis", () => ({
	createClient: jest.fn(() => {
		throw new Error("Redis not available in test");
	}),
}));
// PrismaService — 只导出类 token，实际实现在 TestingModule 中覆盖
jest.mock("../../src/prisma/prisma.service", () => ({
	PrismaService: class PrismaService {},
}));
// RedisService
jest.mock("../../src/common/redis/redis.service", () => ({
	RedisService: class RedisService {},
}));
// LeaseService — 只导出类 token
jest.mock("../../src/common/lease/lease.service", () => ({
	LeaseService: class LeaseService {},
}));
// TaskExecutionService — 只导出类 token
jest.mock("../../src/modules/task/task-execution.service", () => ({
	TaskExecutionService: class TaskExecutionService {},
}));
// GraphRunnerService — 只导出类 token 和接口
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

	// Helper: 种子化一条 PENDING execution 并设置 auth session
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

	// Helper: 创建已连接客户端
	async function createConnectedClient(
		executionId: number,
		token = "valid-token",
	): Promise<Socket> {
		const client = createClient(testApp.port, { token, executionId });
		await connectClient(client);
		return client;
	}

	// ============================================================
	// 类别 1：核心主链路
	// ============================================================

	describe("1. Core Happy Path", () => {
		it("1.1 完整生命周期: connect → ready → agent:event streaming → finish", async () => {
			seedPendingExecution(1);
			const client = await createConnectedClient(1);

			// emit execution:ready → 等待 execution:started
			const started = await emitReadyAndWaitStarted(client, 1);
			expect(started.executionId).toBe(1);
			expect(testApp.mockTaskExecutionService.startExecution).toHaveBeenCalledWith(1);

			// Gateway 还会自动发送 CONNECTED agent:event（seq=0）
			// 等待该事件（可能已经到了）
			await delay(50);

			// 发送第一个自定义 agent:event
			const eventPromise1 = waitForEvent(client, "agent:event");
			testApp.gateway.sendAgentEvent(1, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 1,
				from: AgentEventSource.COORDINATOR,
				content: "hello",
			});
			const event1 = await eventPromise1;
			// seq=1 因为 seq=0 已被 CONNECTED 事件消费
			expect(event1.seq).toBe(1);
			expect(event1.content).toBe("hello");
			expect(event1.type).toBe(AgentEventType.TEXT_DELTA);
			expect(event1.timestamp).toBeDefined();

			// 发送第二个 agent:event
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

			// 发送 execution:finished
			const finishPromise = waitForEvent(client, "execution:finished");
			testApp.gateway.sendExecutionFinished(1, { status: "SUCCEED" });
			const finished = await finishPromise;
			expect(finished.executionId).toBe(1);
			expect(finished.status).toBe("SUCCEED");
		});

		it("1.2 截屏 ACK 完整往返", async () => {
			seedPendingExecution(2);
			testApp.mockPrisma.seedExecution({
				id: 2,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			const client = await createConnectedClient(2);

			// 客户端监听 device:screenshot 并回传 ACK
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

		it("1.3 动作 ACK 完整往返", async () => {
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

		it("1.4 多事件 seq 单调递增", async () => {
			seedPendingExecution(4);
			const client = await createConnectedClient(4);
			await emitReadyAndWaitStarted(client, 4);

			// CONNECTED event 消费了 seq=0
			await delay(50);

			const events: any[] = [];
			client.on("agent:event", (data) => events.push(data));

			// 快速发送 10 个事件
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
			// seq 从 1 开始（0 被 CONNECTED 消费）
			expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		});

		it("1.5 截屏 ACK 返回失败时抛出错误", async () => {
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
	// 类别 2：暂停/恢复
	// ============================================================

	describe("2. Pause/Resume", () => {
		it("2.1 execution:ready 识别 resume_pause 并调用 startResumeExecution", async () => {
			// 模拟：暂停后恢复，状态已改为 PENDING + statusMessage="resume_pause"
			testApp.mockPrisma.seedExecution({
				id: 10,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
				status_message: "resume_pause",
			});
			setMockSession(createUserSession(1));

			// getExecutionRecord 返回带 statusMessage 的记录
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

		it("2.2 execution:ready 识别 resume_hitl: 并调用 startResumeExecution(hitl)", async () => {
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

		it("2.3 execution:ready 识别 fork execution（有 originExecutionId）", async () => {
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

		it("2.4 暂停后 WS 断开 → 恢复 → 重连 → ready 正确路由", async () => {
			// Phase 1: 正常连接 + ready
			seedPendingExecution(13);
			const client1 = await createConnectedClient(13);
			await emitReadyAndWaitStarted(client1, 13);

			// Phase 2: 断开
			client1.disconnect();
			await delay(100);

			// Phase 3: 模拟恢复后状态变为 PENDING + resume_pause
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

			// 清理 Gateway 幂等 Set，模拟新一轮
			(testApp.gateway as any).readyReceived.delete(13);
			testApp.mockTaskExecutionService.startResumeExecution.mockClear();

			// Phase 4: 重连
			const client2 = await createConnectedClient(13);
			await emitReadyAndWaitStarted(client2, 13);

			expect(
				testApp.mockTaskExecutionService.startResumeExecution,
			).toHaveBeenCalledWith(13, "pause");
		});
	});

	// ============================================================
	// 类别 3：取消任务
	// ============================================================

	describe("3. Cancel Execution", () => {
		it("3.1 RUNNING 状态取消 → 发送 execution:finished(CANCELLED)", async () => {
			seedPendingExecution(20);
			const client = await createConnectedClient(20);
			await emitReadyAndWaitStarted(client, 20);

			// 模拟服务端取消完成后发通知
			const finishPromise = waitForEvent(client, "execution:finished");
			testApp.gateway.sendExecutionFinished(20, {
				status: "CANCELLED",
				message: "User cancelled",
			});
			const finished = await finishPromise;
			expect(finished.status).toBe("CANCELLED");
		});

		it("3.2 PENDING 状态取消 → 发送 execution:error", async () => {
			seedPendingExecution(21);
			const client = await createConnectedClient(21);
			// 不发 execution:ready

			const errorPromise = waitForEvent(client, "execution:error");
			testApp.gateway.sendExecutionError(
				21,
				"Execution cancelled before start",
			);
			const error = await errorPromise;
			expect(error.message).toBe("Execution cancelled before start");
		});

		it("3.3 取消后客户端收到 execution:finished 包含 summary", async () => {
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

		it("3.4 execution:error 事件格式正确", async () => {
			seedPendingExecution(23);
			const client = await createConnectedClient(23);

			const errorPromise = waitForEvent(client, "execution:error");
			testApp.gateway.sendExecutionError(23, "Internal server error");
			const error = await errorPromise;
			expect(error.executionId).toBe(23);
			expect(error.message).toBe("Internal server error");
			expect(error.timestamp).toBeDefined();
		});

		it("3.5 取消后立即新建 execution 可正常连接", async () => {
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
	// 类别 4：连接机制与边界情况
	// ============================================================

	describe("4. Connection & Edge Cases", () => {
		it("4.1 无效 token → connect_error(Invalid authentication token)", async () => {
			testApp.mockPrisma.seedExecution({
				id: 30,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
			});
			// 不设置 session → getSession 返回 null
			setMockSession(null);

			const client = createClient(testApp.port, {
				token: "invalid-token",
				executionId: 30,
			});

			await expect(connectClient(client)).rejects.toThrow();
		});

		it("4.2 其他用户的 execution → connect_error", async () => {
			testApp.mockPrisma.seedExecution({
				id: 31,
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
			});
			// 设置 user 2 的 session
			setMockSession(createUserSession(2));

			const client = createClient(testApp.port, {
				token: "user2-token",
				executionId: 31,
			});

			await expect(connectClient(client)).rejects.toThrow();
		});

		it("4.3 已完成 execution → connect_error(FINISHED status)", async () => {
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

		it("4.4 缺少 executionId → connect_error", async () => {
			setMockSession(createUserSession(1));

			const client = createClient(testApp.port, {
				token: "valid-token",
				executionId: undefined as any,
			});

			await expect(connectClient(client)).rejects.toThrow();
		});

		it("4.5 重复 execution:ready 幂等（只触发一次 startExecution）", async () => {
			seedPendingExecution(34);
			const client = await createConnectedClient(34);

			// 第一次 ready
			await emitReadyAndWaitStarted(client, 34);
			expect(
				testApp.mockTaskExecutionService.startExecution,
			).toHaveBeenCalledTimes(1);

			// 第二次 ready — 应被忽略
			client.emit("execution:ready", { executionId: 34 });
			await delay(200);

			expect(
				testApp.mockTaskExecutionService.startExecution,
			).toHaveBeenCalledTimes(1);
		});

		it("4.6 同一 execution 旧 socket 被替换 + seq 保持连续", async () => {
			seedPendingExecution(35);

			// Socket A 连接
			const clientA = await createConnectedClient(35);
			await emitReadyAndWaitStarted(clientA, 35);

			// CONNECTED 消费了 seq=0，再发两个事件（seq=1, seq=2）
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

			// Socket B 连接同一 execution → A 应被断开
			const disconnectPromise = waitForDisconnect(clientA);

			// 需要新的 execution 状态允许连接（还在 RUNNING）
			testApp.mockPrisma.seedExecution({
				id: 35,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});

			const clientB = await createConnectedClient(35);
			await disconnectPromise;

			// Socket B 发送事件 → seq 应从 3 开始（保留了 A 的 seq）
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

		it("4.7 无连接时 sendAgentEvent 返回 false", async () => {
			const result = testApp.gateway.sendAgentEvent(999, {
				type: AgentEventType.TEXT_DELTA,
				taskExecutionId: 999,
				from: AgentEventSource.COORDINATOR,
				content: "nobody home",
			});
			expect(result).toBe(false);
		});

		it("4.8 无连接时 sendScreenshotReq 抛出错误", async () => {
			await expect(testApp.gateway.sendScreenshotReq(999)).rejects.toThrow(
				/No connection for execution 999/,
			);
		});

		it("4.9 无连接时 sendActionReq 抛出错误", async () => {
			await expect(
				testApp.gateway.sendActionReq(999, {
					executionId: 999,
					actionType: "click",
					actionInputs: {},
				}),
			).rejects.toThrow(/No connection for execution 999/);
		});

		it("4.10 nextSeq 对未知 execution 返回 -1", () => {
			const seq = testApp.socketService.nextSeq(888);
			expect(seq).toBe(-1);
		});

		it("4.11 断开后 removeConnectionBySocketId 正确清理", async () => {
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
	// 类别 5：心跳与租约
	// ============================================================

	describe("5. Heartbeat & Lease", () => {
		it("5.1 心跳正常续租 → { renewed: true }", async () => {
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

		it("5.2 心跳重建过期 lease（执行仍活跃）", async () => {
			testApp.mockPrisma.seedExecution({
				id: 41,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			setMockSession(createUserSession(1));

			// renewLease 返回 false（lease 过期）
			testApp.mockLeaseService.renewLease.mockResolvedValue(false);

			// getExecutionRecord 返回活跃状态
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

		it("5.3 心跳失败且 execution 非活跃 → 断开客户端", async () => {
			testApp.mockPrisma.seedExecution({
				id: 42,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING", // Auth middleware 需要可连接状态
			});
			setMockSession(createUserSession(1));

			// renewLease 返回 false
			testApp.mockLeaseService.renewLease.mockResolvedValue(false);

			// getExecutionRecord 返回 FINISHED（不再活跃）
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

		it("5.4 SUSPENDED 状态心跳可重建 lease", async () => {
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
	// 类别 6：超时测试
	// ============================================================

	describe("6. Timeouts", () => {
		it("6.1 截屏 ACK 超时（客户端不回复）", async () => {
			testApp.mockPrisma.seedExecution({
				id: 50,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});
			setMockSession(createUserSession(1));
			const client = await createConnectedClient(50);

			// 客户端监听 device:screenshot 但不回复 callback

			// sendScreenshotReq 内部有 15s 超时
			// 为了测试不等那么久，我们验证 Promise 行为
			const screenshotPromise = testApp.gateway.sendScreenshotReq(50);

			// 这个 Promise 会因超时 reject，但需要等 15s
			// 测试标注：此测试需要较长时间（~15s），在 CI 中可能需要跳过
			await expect(screenshotPromise).rejects.toThrow();
		}, 20000);

		it("6.2 动作 ACK 超时（客户端不回复）", async () => {
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

		it("6.3 execution:ready 失败时发送 execution:error", async () => {
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
	// 类别 7：竞态条件
	// ============================================================

	describe("7. Race Conditions", () => {
		it("7.1 startExecution CAS 失败（expected PENDING）但已 RUNNING → 发送 started", async () => {
			seedPendingExecution(60);

			// startExecution 抛出 CAS 失败错误
			testApp.mockTaskExecutionService.startExecution.mockRejectedValue(
				new Error("CAS failed: expected PENDING but found RUNNING"),
			);

			// getExecutionRecord 返回 RUNNING（模拟另一方已启动）
			testApp.mockTaskExecutionService.getExecutionRecord.mockResolvedValue({
				id: 60,
				executionStatus: "RUNNING",
				statusMessage: null,
				originExecutionId: null,
			});

			const client = await createConnectedClient(60);

			// 应该收到 execution:started 而不是 error
			const startedPromise = waitForEvent(client, "execution:started");
			client.emit("execution:ready", { executionId: 60 });
			const started = await startedPromise;
			expect(started.executionId).toBe(60);
		});

		it("7.2 startExecution CAS 失败且非 RUNNING → 发送 error", async () => {
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

		it("7.3 多个客户端快速连接同一 execution → 只有最后一个存活", async () => {
			seedPendingExecution(62);

			// 同时创建 3 个客户端
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

			// 只有最后一个应该保持连接
			const connectedCount = clients.filter((c) => c.connected).length;
			expect(connectedCount).toBe(1);

			// 最后连接的应该可以收到事件
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

		it("7.4 断开 → 立即重连 → execution:ready 正常工作", async () => {
			seedPendingExecution(63);
			const client1 = await createConnectedClient(63);
			await emitReadyAndWaitStarted(client1, 63);

			// 断开
			client1.disconnect();
			await delay(100);

			// 重连（execution 仍在 RUNNING）
			testApp.mockPrisma.seedExecution({
				id: 63,
				user_id: 1,
				task_id: 1,
				execution_status: "RUNNING",
			});

			const client2 = await createConnectedClient(63);
			expect(client2.connected).toBe(true);

			// sendAgentEvent 正常工作
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
	// 类别补充：ExecutionSocketService 单元级测试
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

		it("8.2 isConnected 在连接/断开后正确返回", async () => {
			seedPendingExecution(71);
			expect(testApp.socketService.isConnected(71)).toBe(false);

			const client = await createConnectedClient(71);
			expect(testApp.socketService.isConnected(71)).toBe(true);

			client.disconnect();
			await delay(200);
			expect(testApp.socketService.isConnected(71)).toBe(false);
		});

		it("8.3 getActiveCount 正确计数", async () => {
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

		it("8.4 getSocketForExecution 返回 socket 或 null", async () => {
			expect(testApp.socketService.getSocketForExecution(999)).toBeNull();

			seedPendingExecution(74);
			const client = await createConnectedClient(74);

			const socket = testApp.socketService.getSocketForExecution(74);
			expect(socket).not.toBeNull();
			expect(socket!.id).toBeDefined();
		});
	});
});
