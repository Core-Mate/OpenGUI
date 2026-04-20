/**
 * 扩展Express Request接口
 */
declare global {
    namespace Express {
        interface Request {
            user?: { id: string }
        }
    }
}
