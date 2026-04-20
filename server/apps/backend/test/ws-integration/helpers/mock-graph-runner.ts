/**
 * Mock GraphRunnerService
 *
 * 使用 Deferred 模式控制异步执行。
 * 暴露 hasExecution / preRegisterExecution / cancelExecution / pauseExecution 等方法。
 */
import { Deferred } from "./deferred";

export interface MockExecuteTaskResult {
	success: boolean;
	hitl_reason?: string;
	summary?: string;
	error?: string;
	cancelled?: boolean;
	abortReason?: "cancel" | "pause" | "lease_expired";
}

export interface MockCancelExecutionResult {
	success: boolean;
	summary?: string;
	error?: string;
}

export function createMockGraphRunner() {
	const registeredExecutions = new Set<number>();
	const executionDeferreds = new Map<number, Deferred<MockExecuteTaskResult>>();

	const mock = {
		hasExecution: jest.fn((taskExecutionId: number): boolean => {
			return registeredExecutions.has(taskExecutionId);
		}),

		preRegisterExecution: jest.fn((taskExecutionId: number) => {
			registeredExecutions.add(taskExecutionId);
			const ac = new AbortController();
			return ac;
		}),

		executeTask: jest.fn(async (input: any): Promise<MockExecuteTaskResult> => {
			const id = input.taskExecutionId;
			const d = new Deferred<MockExecuteTaskResult>();
			executionDeferreds.set(id, d);
			return d.promise;
		}),

		cancelExecution: jest.fn(
			async (
				taskExecutionId: number,
				_userId?: number,
				_taskId?: number,
				_skipSummary?: boolean,
			): Promise<MockCancelExecutionResult> => {
				registeredExecutions.delete(taskExecutionId);
				// 自动 resolve 任何悬挂的 execution deferred
				const d = executionDeferreds.get(taskExecutionId);
				if (d && !d.settled) {
					d.resolve({ success: false, cancelled: true, abortReason: "cancel" });
				}
				executionDeferreds.delete(taskExecutionId);
				return { success: true };
			},
		),

		pauseExecution: jest.fn(
			async (
				_taskExecutionId: number,
				_userId?: number,
				_taskId?: number,
			): Promise<boolean> => {
				return true;
			},
		),

		resumeExecution: jest.fn(async (input: any): Promise<MockExecuteTaskResult> => {
			const id = input.taskExecutionId ?? input;
			const d = new Deferred<MockExecuteTaskResult>();
			executionDeferreds.set(id, d);
			return d.promise;
		}),

		resumeFromPause: jest.fn(async (
			_taskId: number,
			executionId: number,
			_userId?: number,
		): Promise<MockExecuteTaskResult> => {
			const d = new Deferred<MockExecuteTaskResult>();
			executionDeferreds.set(executionId, d);
			return d.promise;
		}),

		forkExecution: jest.fn(async (input: any): Promise<MockExecuteTaskResult> => {
			const id = input.taskExecutionId;
			const d = new Deferred<MockExecuteTaskResult>();
			executionDeferreds.set(id, d);
			return d.promise;
		}),

		// Test controls
		getExecutionDeferred(executionId: number): Deferred<MockExecuteTaskResult> | undefined {
			return executionDeferreds.get(executionId);
		},

		resolveExecution(executionId: number, result: MockExecuteTaskResult) {
			const d = executionDeferreds.get(executionId);
			if (d) d.resolve(result);
		},

		rejectExecution(executionId: number, error: any) {
			const d = executionDeferreds.get(executionId);
			if (d) d.reject(error);
		},

		_registeredExecutions: registeredExecutions,
		_executionDeferreds: executionDeferreds,

		_reset() {
			registeredExecutions.clear();
			executionDeferreds.clear();
			mock.hasExecution.mockClear();
			mock.preRegisterExecution.mockClear();
			mock.executeTask.mockClear();
			mock.cancelExecution.mockClear();
			mock.pauseExecution.mockClear();
			mock.resumeExecution.mockClear();
			mock.resumeFromPause.mockClear();
			mock.forkExecution.mockClear();
		},
	};

	return mock;
}

export type MockGraphRunner = ReturnType<typeof createMockGraphRunner>;
