/**
 * create-test-app.ts
 *
 * NestJS Testing Module factory for creating a minimal WS test app.
 * Uses the real ExecutionGateway + ExecutionSocketService + WsAuthMiddleware,
 * but all external dependencies (Prisma, Redis, GraphRunner, BullMQ, Auth) are mocked.
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
// Note: jest.mock in this file must take effect before imports at the top of the test file
// Because jest.mock is hoisted, this is handled at the top of the test file

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

	// Mock Lease Service; all methods succeed by default
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

	// Mock TaskExecutionService; core methods are programmable
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

	// Get the Gateway and manually inject lazy-resolved dependencies
	// (In the real app these are resolved through Module Ref in on Module Init)
	const gateway = moduleFixture.get(ExecutionGateway);
	const socketService = moduleFixture.get(ExecutionSocketService);

	// Manually set Gateway lazy dependencies, bypassing Module Ref dynamic import
	(gateway as any).taskExecutionService = mockTaskExecutionService;
	(gateway as any).graphRunnerService = mockGraphRunner;

	await app.init();

	// Get the HTTP server and port
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
 * Reset all mock state, called from afterEach
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

	// Clean up Gateway internal state
	(testApp.gateway as any).readyReceived?.clear();
}
