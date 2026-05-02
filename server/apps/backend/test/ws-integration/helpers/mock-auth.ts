/**
 * Mock Better-Auth
 *
 * Replace the auth object from src/lib/auth.
 * Simulate authentication scenarios by controlling get Session return values.
 */

/** Current simulated session return value */
let currentSession: any = null;

/** Map sessions by token; supports multi-user tests */
const tokenSessionMap = new Map<string, any>();

export const mockAuth = {
	api: {
		getSession: jest.fn(async (opts: { headers: Headers }) => {
			// Prefer lookup by token
			const authHeader = opts.headers.get("Authorization");
			if (authHeader) {
				const token = authHeader.replace("Bearer ", "");
				const mapped = tokenSessionMap.get(token);
				if (mapped !== undefined) return mapped;
			}
			return currentSession;
		}),
	},
};

/**
 * Set the default session for all tokens
 */
export function setMockSession(session: any) {
	currentSession = session;
}

/**
 * Set the session for a specific token
 */
export function setMockSessionForToken(token: string, session: any) {
	tokenSessionMap.set(token, session);
}

/**
 * Create a standard user session
 */
export function createUserSession(userId: number | string) {
	return {
		user: {
			id: String(userId),
			name: `User ${userId}`,
			email: `user${userId}@test.com`,
		},
		session: {
			id: `session-${userId}`,
			userId: String(userId),
		},
	};
}

/**
 * Reset all mock state
 */
export function resetMockAuth() {
	currentSession = null;
	tokenSessionMap.clear();
	mockAuth.api.getSession.mockClear();
}
