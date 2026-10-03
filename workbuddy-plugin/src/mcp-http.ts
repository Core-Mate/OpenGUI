import { createServer } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { startMcp, type ToolConnection } from './mcp-server.ts'
import { connectWorkBuddyBroker } from './broker-client.ts'

/** Loopback-only native App transport. It shares one broker connection across MCP sessions. */
export async function startHttpMcp(options: { connect?: () => Promise<ToolConnection>; maxSessions?: number; sessionIdleMs?: number; port?: number; token?: string } = {}) {
  const idleMs = options.sessionIdleMs ?? 10 * 60_000
  if (!Number.isFinite(idleMs) || idleMs < 50) throw new Error('Invalid MCP session idle timeout')
  const port = options.port ?? 0
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid MCP listen port')
  const token = options.token ?? randomBytes(32).toString('base64url')
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid MCP authentication token')
  const expectedAuth = Buffer.from('Bearer ' + token)
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; close: () => Promise<void>; lastActive: number; activeRequests: number; pendingCalls: () => number }>()
  let connection: Promise<ToolConnection> | undefined
  let closing = false
  let startingSessions = 0
  let origin = ''
  const broker = () => {
    if (closing) return Promise.reject(new Error('HTTP MCP closed'))
    if (!connection) {
      const pending = (options.connect ?? connectWorkBuddyBroker)().then(client => {
        client.onDisconnect?.(() => { if (connection === pending) connection = undefined })
        return client
      }).catch(error => { if (connection === pending) connection = undefined; throw error })
      connection = pending
    }
    return connection
  }
  // HTTP inspectors frequently close their MCP sessions. That must not interrupt phone tasks.
  const shared: ToolConnection = { call: async (...args) => (await broker()).call(...args), close: () => {} }
  const http = createServer((req, res) => {
    void (async () => {
      res.setHeader('Cache-Control', 'no-store')
      const reject = (status: number) => { res.writeHead(status); res.end() }
      if (closing) { reject(503); return }
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) { reject(403); return }
      if (req.url !== '/mcp') { reject(404); return }
      const auth = Buffer.from(req.headers.authorization ?? '')
      if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) { reject(401); return }
      const id = req.headers['mcp-session-id']
      if (id) {
        const session = typeof id === 'string' ? sessions.get(id) : undefined
        if (!session) { reject(404); return }
        session.activeRequests++
        let handled = false, responseClosed = false, released = false
        const release = () => {
          if (released || !handled || !responseClosed) return
          released = true; session.activeRequests--; session.lastActive = Date.now()
        }
        res.once('close', () => { responseClosed = true; release() })
        try { await session.transport.handleRequest(req, res) }
        finally { handled = true; release() }
        return
      }
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { reject(400); return }
      let body = ''
      for await (const chunk of req) {
        body += String(chunk)
        if (Buffer.byteLength(body) > 65536) { reject(413); return }
      }
      const message: unknown = JSON.parse(body)
      if (!isInitializeRequest(message)) { reject(400); return }
      if (sessions.size + startingSessions >= (options.maxSessions ?? 16)) { reject(429); return }
      startingSessions++
      let transport: StreamableHTTPServerTransport | undefined
      let server: Awaited<ReturnType<typeof startMcp>> | undefined
      let pendingCalls = 0
      try {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessionclosed: async sessionId => {
            const session = sessions.get(sessionId)
            sessions.delete(sessionId)
            await session?.close()
          },
        })
        // SDK 1.29 implements Transport but declares callback accessors as explicit undefined.
        const sessionConnection: ToolConnection = {
          close: () => {},
          call: async (...args) => {
            pendingCalls++
            try { return await shared.call(...args) }
            finally {
              pendingCalls--
              const session = sessions.get(transport?.sessionId ?? '')
              if (session) session.lastActive = Date.now()
            }
          },
        }
        server = await startMcp(transport as Transport, async () => sessionConnection, { nativeWorkbench: true })
        await transport.handleRequest(req, res, message)
        if (transport.sessionId && !closing) sessions.set(transport.sessionId, { transport, close: () => server!.close(), lastActive: Date.now(), activeRequests: 0, pendingCalls: () => pendingCalls })
        else await server.close()
      } catch {
        await server?.close()
        if (!res.headersSent) reject(500)
      } finally { startingSessions-- }
    })().catch(() => { if (!res.headersSent) res.writeHead(400); res.end() })
  })
  await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve) })
  const address = http.address()
  if (!address || typeof address === 'string') throw new Error('HTTP MCP bind failed')
  origin = `http://127.0.0.1:${address.port}`
  // Some host inspectors disconnect without DELETE. Reclaim only idle protocol
  // sessions; never expire in-flight tools or an open SSE response, and never
  // release the shared broker when a single protocol session expires.
  const reaper = setInterval(() => {
    for (const [id, session] of sessions) {
      if (session.activeRequests || session.pendingCalls() || Date.now() - session.lastActive < idleMs) continue
      sessions.delete(id)
      void session.close().catch(() => {})
    }
  }, Math.min(idleMs, 1000))
  reaper.unref()
  return {
    url: origin + '/mcp', token,
    async close() {
      closing = true
      clearInterval(reaper)
      const entries = [...sessions.values()]; sessions.clear()
      await Promise.allSettled(entries.map(entry => entry.close()))
      await connection?.then(client => client.close()).catch(() => {})
      http.closeAllConnections()
      await new Promise<void>(resolve => http.close(() => resolve()))
    },
  }
}
