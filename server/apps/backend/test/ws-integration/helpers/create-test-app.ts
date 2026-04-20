/**
 * create-test-app.ts
 *
 * NestJS TestingModule 工厂，创建一个最小的 WS 测试应用。
 * 使用真实的 ExecutionGateway + ExecutionSocketService + WsAuthMiddleware，
 * 但所有外部依赖（Prisma、Redis、GraphRunner、BullMQ、Auth）均为 mock。
 */
import { type INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Server } from "http";
import { ExecutionGateway } from "../../../src/common/ws/execution.gateway";
import { ExecutionSocketService } from "../../../src/common/ws/execution-socket.service";
import { WsAuthMiddleware } from "../../../src/common/ws/ws-auth.middleware";
import { AppLogger } from "../../../src/common/log/app-logger.service";
import { LeaseService } from "../../../src/common/lease/lease.service";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { TaskExecutionService } from "../../../src/modules/task/task-execution.service";
import { GraphRunnerService } from "../../../src/modules/graph-agent/graph-runner.service";
import { createMockPrisma, type MockPrisma } from "./mock-prisma";
import { createMockGraphRunner, type MockGraphRunner } from "./mock-graph-runner";
import { createMockQueue, type MockQueue } from "./mock-bullmq";
import {
	mockAuth,
	setMockSession,
	createUserSession,
	resetMockAuth,
} from "./mock-auth";

// ============================================================
// Module-level jest.mock for Better-Auth
// ============================================================
// 注意：此文件中的 jest.mock 必须在测试文件的顶部 import 前生效
// 由于 jest.mock 会被提升 (hoisted)，我们在测试文件顶部处理

export interface TestApp {
	app: INestApplication;
	httpServer: Server;
	port: number;
	gateway: ExecutionGateway;
	socketService: ExecutionSocketService;
	mockPrisma: MockPrisma;
	mockGraphRunner: MockGraphRunner;
	mockLeaseService: Record<string, jest.Mock>;
	mockTaskExecutionService: Record<string, jest.Mock>;
	mockQueue: MockQueue;
	cleanup: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
	const mockPrisma = createMockPrisma();
	const mockGraphRunner = createMockGraphRunner();
	const mockQueue = createMockQueue();

	// Mock LeaseService — 所有方法默认成功
	const mockLeaseService = {
		createLease: jest.fn().mockResolvedValue(true),
		renewLease: jest.fn().mockResolvedValue(true),
		releaseLease: jest.fn().mockResolvedValue(true),
		isLeaseValid: jest.fn().mockResolvedValue(true),
		getLeaseInfo: jest.fn().mockResolvedValue(null),
		getLeaseTTL: jest.fn().mockResolvedValue(120),
		getDefaultTTL: jest.fn().mockReturnValue(120),
		getRecommendedHeartbeatInterval: jest.fn().mockReturnValue(60),
		renewLeasesBatch: jest.fn().mockResolvedValue([]),
	};

	// Mock TaskExecutionService — 核心方法可编程
	const mockTaskExecutionService = {
		startExecution: jest.fn().mockResolvedValue(undefined),
		startForkExecution: jest.fn().mockResolvedValue(undefined),
		startResumeExecution: jest.fn().mockResolvedValue(undefined),
		getExecutionRecord: jest.fn().mockImplementation(async (id: number) => {
			return mockPrisma.getExecution(id) ?? null;
		}),
		executeTask: jest.fn(),
		cancelExecution: jest.fn().mockResolvedValue({ success: true }),
		cancelExecutionInternal: jest.fn().mockResolvedValue(undefined),
		pauseExecution: jest.fn().mockResolvedValue({ success: true }),
		resumeExecution: jest.fn().mockResolvedValue({ success: true }),
		completeExecution: jest.fn().mockResolvedValue(undefined),
		cancelAllExecutions: jest.fn().mockResolvedValue({ cancelled: [] }),
	};

	const moduleFixture: TestingModule = await Test.createTestingModule({
		imports: [ConfigModule.forRoot({ isGlobal: true })],
		providers: [
			// Real providers
			ExecutionGateway,
			ExecutionSocketService,
			WsAuthMiddleware,
			AppLogger,
			// Mock providers
			{
				provide: PrismaService,
				useValue: mockPrisma,
			},
			{
				provide: LeaseService,
				useValue: mockLeaseService,
			},
			{
				provide: TaskExecutionService,
				useValue: mockTaskExecutionService,
			},
			{
				provide: GraphRunnerService,
				useValue: mockGraphRunner,
			},
		],
	}).compile();

	const app = moduleFixture.createNestApplication();

	// 获取 Gateway 并手动注入 lazy-resolved 依赖
	// （在真实应用中这些是通过 ModuleRef 在 onModuleInit 解析的）
	const gateway = moduleFixture.get(ExecutionGateway);
	const socketService = moduleFixture.get(ExecutionSocketService);

	// 手动设置 Gateway 的 lazy 依赖（绕过 ModuleRef 动态 import）
	(gateway as any).taskExecutionService = mockTaskExecutionService;
	(gateway as any).graphRunnerService = mockGraphRunner;

	await app.init();

	// 获取 HTTP server 和端口
	const httpServer = app.getHttpServer() as Server;
	await new Promise<void>((resolve) => {
		httpServer.listen(0, () => resolve());
	});
	const address = httpServer.address();
	const port = typeof address === "object" && address ? address.port : 0;

	return {
		app,
		httpServer,
		port,
		gateway,
		socketService,
		mockPrisma,
		mockGraphRunner,
		mockLeaseService,
		mockTaskExecutionService,
		mockQueue,
		cleanup: async () => {
			await app.close();
		},
	};
}

/**
 * 重置所有 mock 状态（在 afterEach 中调用）
 */
export function resetAllMocks(testApp: TestApp) {
	testApp.mockPrisma._reset();
	testApp.mockQueue._reset();
	testApp.mockGraphRunner._reset();
	resetMockAuth();

	// Reset lease service mocks
	for (const fn of Object.values(testApp.mockLeaseService)) {
		if (typeof fn === "function" && "mockClear" in fn) {
			fn.mockClear();
		}
	}
	// Restore lease service defaults
	testApp.mockLeaseService.createLease.mockResolvedValue(true);
	testApp.mockLeaseService.renewLease.mockResolvedValue(true);
	testApp.mockLeaseService.releaseLease.mockResolvedValue(true);
	testApp.mockLeaseService.isLeaseValid.mockResolvedValue(true);

	// Reset task execution service mocks
	for (const fn of Object.values(testApp.mockTaskExecutionService)) {
		if (typeof fn === "function" && "mockClear" in fn) {
			fn.mockClear();
		}
	}
	testApp.mockTaskExecutionService.startExecution.mockResolvedValue(undefined);
	testApp.mockTaskExecutionService.startForkExecution.mockResolvedValue(undefined);
	testApp.mockTaskExecutionService.startResumeExecution.mockResolvedValue(undefined);
	testApp.mockTaskExecutionService.getExecutionRecord.mockImplementation(
		async (id: number) => testApp.mockPrisma.getExecution(id) ?? null,
	);

	// 清理 Gateway 内部状态
	(testApp.gateway as any).readyReceived?.clear();
}
