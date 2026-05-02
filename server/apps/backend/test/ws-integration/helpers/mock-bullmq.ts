/**
 * Mock BullMQ Queue
 *
 * Mock the Queue object injected by @nestjs/bullmq,
 * Record add() calls and provide programmable get Job() responses.
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
