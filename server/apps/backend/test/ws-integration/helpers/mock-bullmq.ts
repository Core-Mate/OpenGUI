/**
 * Mock BullMQ Queue
 *
 * 模拟 @nestjs/bullmq 注入的 Queue 对象，
 * 记录 add() 调用并提供可编程的 getJob() 返回。
 */
export function createMockQueue() {
	const jobs = new Map<string, any>();

	return {
		add: jest.fn(async (name: string, data: any, opts?: any) => {
			const jobId = opts?.jobId ?? `${name}-${Date.now()}`;
			const job = {
				id: jobId,
				name,
				data,
				opts,
				remove: jest.fn(),
			};
			jobs.set(jobId, job);
			return job;
		}),
		getJob: jest.fn(async (jobId: string) => {
			return jobs.get(jobId) ?? null;
		}),
		remove: jest.fn(),
		close: jest.fn(),
		_jobs: jobs,
		_reset() {
			jobs.clear();
			this.add.mockClear();
			this.getJob.mockClear();
		},
	};
}

export type MockQueue = ReturnType<typeof createMockQueue>;
