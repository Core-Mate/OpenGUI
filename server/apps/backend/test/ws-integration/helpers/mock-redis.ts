/**
 * Mock RedisService
 *
 * In-memory Map implementation with TTL simulation.
 * Covers all Redis methods used by LeaseService and TaskExecutionService.
 */

interface Entry {
	value: string;
	expiresAt: number | null; // epoch ms, null = no expiry
}

export function createMockRedis() {
	const store = new Map<string, Entry>();

	function isExpired(entry: Entry): boolean {
		return entry.expiresAt !== null && Date.now() >= entry.expiresAt;
	}

	function getEntry(key: string): Entry | null {
		const entry = store.get(key);
		if (!entry) return null;
		if (isExpired(entry)) {
			store.delete(key);
			return null;
		}
		return entry;
	}

	const pipeline = () => {
		const commands: Array<() => any> = [];
		return {
			expire(key: string, seconds: number) {
				commands.push(() => {
					const entry = getEntry(key);
					if (!entry) return 0;
					entry.expiresAt = Date.now() + seconds * 1000;
					return 1;
				});
				return this;
			},
			exec() {
				return Promise.resolve(
					commands.map((cmd) => {
						try {
							return [null, cmd()];
						} catch (e) {
							return [e, null];
						}
					}),
				);
			},
		};
	};

	const mock = {
		async set(key: string, value: string, ttl?: number): Promise<void> {
			store.set(key, {
				value,
				expiresAt: ttl ? Date.now() + ttl * 1000 : null,
			});
		},

		async get(key: string): Promise<string | null> {
			const entry = getEntry(key);
			return entry?.value ?? null;
		},

		async del(key: string): Promise<number> {
			return store.delete(key) ? 1 : 0;
		},

		async exists(key: string): Promise<boolean> {
			return getEntry(key) !== null;
		},

		async expire(key: string, seconds: number): Promise<boolean> {
			const entry = getEntry(key);
			if (!entry) return false;
			entry.expiresAt = Date.now() + seconds * 1000;
			return true;
		},

		async ttl(key: string): Promise<number> {
			const entry = store.get(key);
			if (!entry) return -2;
			if (isExpired(entry)) {
				store.delete(key);
				return -2;
			}
			if (entry.expiresAt === null) return -1;
			return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
		},

		async ping(): Promise<boolean> {
			return true;
		},

		getClient() {
			return {
				pipeline,
				set: mock.set.bind(mock),
				get: mock.get.bind(mock),
				del: mock.del.bind(mock),
				exists: mock.exists.bind(mock),
				expire: mock.expire.bind(mock),
			};
		},

		// Test helpers
		_store: store,
		_reset() {
			store.clear();
		},
	};

	return mock;
}

export type MockRedis = ReturnType<typeof createMockRedis>;
