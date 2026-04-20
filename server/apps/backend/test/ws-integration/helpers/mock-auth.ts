/**
 * Mock Better-Auth
 *
 * 替代 src/lib/auth 中的 auth 对象。
 * 通过控制 getSession 返回值来模拟不同认证场景。
 */

/** 当前模拟的 session 返回值 */
let currentSession: any = null;

/** 按 token 映射的 session（支持多用户测试） */
const tokenSessionMap = new Map<string, any>();

export const mockAuth = {
	api: {
		getSession: jest.fn(async (opts: { headers: Headers }) => {
			// 优先按 token 查找
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
 * 设置默认 session（所有 token 生效）
 */
export function setMockSession(session: any) {
	currentSession = session;
}

/**
 * 为特定 token 设置 session
 */
export function setMockSessionForToken(token: string, session: any) {
	tokenSessionMap.set(token, session);
}

/**
 * 创建一个标准的用户 session
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
 * 重置所有 mock 状态
 */
export function resetMockAuth() {
	currentSession = null;
	tokenSessionMap.clear();
	mockAuth.api.getSession.mockClear();
}
