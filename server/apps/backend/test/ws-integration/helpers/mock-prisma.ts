/**
 * Mock PrismaService
 *
 * In-memory storage with CAS semantics for task_execution table operations.
 * Supports find Unique, find First, create, update, and update Many (CAS).
 */

export interface MockExecution {
	id: number;
	user_id: number;
	task_id: number;
	execution_status: string;
	execution_result: string | null;
	error_message: string | null;
	status_message: string | null;
	result_summary: string | null;
	origin_execution_id: number | null;
	finished_at: Date | null;
	created_at: Date;
	updated_at: Date;
	token_usage: any;
	[key: string]: any;
}

let autoId = 1;

export function createMockPrisma() {
	const executions = new Map<number, MockExecution>();

	const task_execution = {
		findUnique: jest.fn(async (args: any) => {
			const id = args.where?.id;
			const exec = executions.get(id);
			if (!exec) return null;
			if (args.select) {
				const result: any = {};
				for (const key of Object.keys(args.select)) {
					// Map camelCase fields to snake_case stored values
					const snakeKey = camelToSnake(key);
					result[snakeKey] = (exec as any)[snakeKey];
				}
				return result;
			}
			return { ...exec };
		}),

		findFirst: jest.fn(async (args: any) => {
			const where = args.where || {};
			for (const exec of executions.values()) {
				if (matchesWhere(exec, where)) {
					return { ...exec };
				}
			}
			return null;
		}),

		create: jest.fn(async (args: any) => {
			const data = args.data;
			const id = data.id ?? autoId++;
			const exec: MockExecution = {
				id,
				user_id: data.user_id ?? 0,
				task_id: data.task_id ?? 0,
				execution_status: data.execution_status ?? "INITIAL",
				execution_result: data.execution_result ?? null,
				error_message: data.error_message ?? null,
				status_message: data.status_message ?? null,
				result_summary: data.result_summary ?? null,
				origin_execution_id: data.origin_execution_id ?? null,
				finished_at: data.finished_at ?? null,
				created_at: new Date(),
				updated_at: new Date(),
				token_usage: data.token_usage ?? null,
				...data,
			};
			executions.set(id, exec);
			return { ...exec };
		}),

		update: jest.fn(async (args: any) => {
			const id = args.where?.id;
			const exec = executions.get(id);
			if (!exec) throw new Error(`Execution ${id} not found`);
			Object.assign(exec, args.data, { updated_at: new Date() });
			return { ...exec };
		}),

		/**
 * CAS semantics: update only when every WHERE condition matches
 * Returns { count: 0 | 1 }
		 */
		updateMany: jest.fn(async (args: any) => {
			const where = args.where || {};
			let count = 0;
			for (const exec of executions.values()) {
				if (matchesWhere(exec, where)) {
					Object.assign(exec, args.data, { updated_at: new Date() });
					count++;
				}
			}
			return { count };
		}),

		findMany: jest.fn(async () => []),
		count: jest.fn(async () => 0),
	};

	const mock = {
		task_execution,
		// Stub other tables as needed
		user_task: {
			findUnique: jest.fn(async () => null),
			findFirst: jest.fn(async () => null),
			update: jest.fn(async () => ({})),
		},
		users: {
			findUnique: jest.fn(async () => ({
				id: 1,
				region: "cn",
				tenant_id: 1,
			})),
		},
		// Expose internal storage for test assertions
		_executions: executions,
		_reset() {
			executions.clear();
			autoId = 1;
			// Clear all mocks
			for (const method of Object.values(task_execution)) {
				if (typeof method === "function" && "mockClear" in method) {
					(method as jest.Mock).mockClear();
				}
			}
		},
		/**
 * Convenience method: insert one execution record
		 */
		seedExecution(overrides: Partial<MockExecution> & { id: number }): MockExecution {
			const exec: MockExecution = {
				user_id: 1,
				task_id: 1,
				execution_status: "PENDING",
				execution_result: null,
				error_message: null,
				status_message: null,
				result_summary: null,
				origin_execution_id: null,
				finished_at: null,
				created_at: new Date(),
				updated_at: new Date(),
				token_usage: null,
				...overrides,
			};
			executions.set(exec.id, exec);
			return exec;
		},
		getExecution(id: number): MockExecution | undefined {
			return executions.get(id);
		},
	};

	return mock;
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;

// ============================================================
// Helpers
// ============================================================

function camelToSnake(str: string): string {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function matchesWhere(exec: MockExecution, where: any): boolean {
	for (const [key, condition] of Object.entries(where)) {
		const value = (exec as any)[key];
		if (condition && typeof condition === "object" && !Array.isArray(condition)) {
			const cond = condition as any;
			if ("in" in cond) {
				if (!cond.in.includes(value)) return false;
			}
			if ("not" in cond) {
				if (value === cond.not) return false;
			}
			if ("equals" in cond) {
				if (value !== cond.equals) return false;
			}
		} else {
			if (value !== condition) return false;
		}
	}
	return true;
}
