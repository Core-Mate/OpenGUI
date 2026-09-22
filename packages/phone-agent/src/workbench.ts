import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { workbenchPage } from '../../workbench/src/page.ts'
import type { PhoneRuntime } from './runtime.ts'
import { newestTaskFirst, type StartTask } from './contracts.ts'

export class Workbench {
  private embedOrigin: string | undefined
  allowEmbedding(origin: string): void {
    this.runtime.viewers.allowEmbedding(origin)
    this.embedOrigin = origin
  }
  private draft = ''
  private draftWrites = Promise.resolve()
  private lastRead = 0
  private pendingRequests = 0
  private maintenance = false
  get active(): boolean { return Date.now() - this.lastRead < 15000 }
  prepareMaintenance(): boolean {
    if (this.active || this.pendingRequests) return false
    this.maintenance = true
    return true
  }
  private server: Server | undefined
  private starting: Promise<string> | undefined
  private readonly sessionTokens = new Map<string, string>()
  private readonly requestTokens = new Map<string, string>()
  private readonly nativeOrigins = new Map<string, string>()
  constructor(readonly runtime: PhoneRuntime) {}
  async open(owner?: string): Promise<string> {
    this.starting ??= this.start()
    const base = await this.starting
    if (!owner) return base
    let token = this.sessionTokens.get(owner)
    if (!token) { token = randomBytes(32).toString('base64url'); this.sessionTokens.set(owner, token) }
    return base + 'session/' + token + '/'
  }
  async close(): Promise<void> { this.server?.closeAllConnections(); await new Promise<void>(resolve => this.server ? this.server.close(() => resolve()) : resolve()); await this.draftWrites }
  private async saveDraft(value: unknown): Promise<void> {
    if (typeof value !== 'string' || value.length > 8000) throw new Error('Bounded draft required')
    const next = this.draftWrites.then(async () => {
      const path = join(this.runtime.options.root, 'workbench-draft-v1.json')
      await writeFile(path + '.tmp', JSON.stringify({ goal: value }), { mode: 0o600 })
      await rename(path + '.tmp', path)
      this.draft = value
    })
    this.draftWrites = next.catch(() => {})
    await next
  }
  private async start(): Promise<string> {
    try {
      const saved = JSON.parse(await readFile(join(this.runtime.options.root, 'workbench-draft-v1.json'), 'utf8')) as { goal?: unknown }
      if (typeof saved.goal === 'string' && saved.goal.length <= 8000) this.draft = saved.goal
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }

    const token = randomBytes(32).toString('base64url')
    let origin = ''
    const prefix = '/' + token + '/'
    const server = createServer((req, res) => {
      if (this.maintenance) { res.writeHead(503); res.end(); return }
      this.pendingRequests++
      void (async () => {
        const requested = new URL(req.url ?? '/', origin)
        const nativeEntry = ((this.runtime.options.host === 'workbuddy' && requested.searchParams.get('mcpApp') === '1') || (this.runtime.options.host === 'codex' && requested.searchParams.get('mcpApp') === 'codex')) && req.method === 'GET' && /^session\/[A-Za-z0-9_-]+\/$/.test(requested.pathname.slice(prefix.length))
        let nativeOrigin = ''
        if (nativeEntry && requested.searchParams.has('hostOrigin')) {
          try {
            const parent = new URL(requested.searchParams.get('hostOrigin')!)
            if (parent.protocol === 'http:' && parent.hostname === '127.0.0.1' && parent.port && parent.origin === requested.searchParams.get('hostOrigin')) nativeOrigin = parent.origin
          } catch {}
        }
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; frame-src http://127.0.0.1:*; connect-src 'self'; frame-ancestors ${nativeOrigin ? `file: ${nativeOrigin}` : this.embedOrigin ?? "'none'"}; base-uri 'none'`)
        const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
        const embedded = req.method === 'GET' && req.headers['sec-fetch-dest'] === 'iframe' && this.embedOrigin && req.headers.referer?.startsWith(this.embedOrigin + '/')
        // A native MCP App may navigate to its owner-bound capability URL.
        // WorkBuddy uses a file renderer and a loopback sandbox ancestor. Only the
        // bound page GET may embed; API requests retain same-origin checks.
        const nativeDocument = nativeEntry && (req.headers['sec-fetch-dest'] === 'document' || (req.headers['sec-fetch-dest'] === 'iframe' && Boolean(nativeOrigin)))
        if (req.headers.host !== new URL(origin).host || !req.url?.startsWith(prefix) || (!embedded && !nativeDocument && req.headers['sec-fetch-site'] === 'cross-site') || (req.headers.origin && req.headers.origin !== origin)) { send(403, { error: 'Forbidden' }); return }
        this.lastRead = Date.now()
        let route = req.url.slice(prefix.length)
        let owner = 'workbench'
        if (route.startsWith('session/')) {
          const match = /^session\/([A-Za-z0-9_-]+)\/(.*)$/.exec(route)
          const session = match && [...this.sessionTokens].find(([, token]) => token === match[1])
          if (!session) { send(403, { error: 'Unknown workbench session' }); return }
          owner = session[0]; route = match![2]!
          if (nativeEntry) {
            route = ''
            if (nativeOrigin) {
              this.nativeOrigins.set(owner, nativeOrigin)
              if (!this.requestTokens.has(owner)) this.requestTokens.set(owner, randomBytes(32).toString('base64url'))
            }
          }
        }
        if (req.method === 'GET') {
          if (!route) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(workbenchPage); return }
          if (route === 'state') {
            const native = this.nativeOrigins.get(owner)
            const tasks = [...this.runtime.goals.list(), ...this.runtime.list()].sort(newestTaskFirst)
            if (native) for (const task of tasks) {
              if (task.owner === owner && task.viewerId && ['preparing', 'running', 'waiting', 'stopping'].includes(task.phase)) this.runtime.viewers.allowNativeEmbedding(task.viewerId, task.id, native)
            }
            send(200, { host: this.runtime.options.host, workbenchOwner: owner, nativeRequestToken: this.requestTokens.get(owner), embedOrigin: this.embedOrigin, executionMode: this.runtime.hostDriven ? 'host' : 'byok', draft: this.draft, tasks, profiles: this.runtime.hostDriven ? [] : [...this.runtime.profiles.values()] }); return
          }
          if (route === 'devices') { send(200, await this.runtime.options.hardware.listDevices(AbortSignal.timeout(10_000))); return }
          const history = /^events\/([a-f0-9-]+)$/.exec(route)
          if (history) { send(200, await (this.runtime.goals.tasks.has(history[1]!) ? this.runtime.goals : this.runtime).events(history[1]!)); return }
          const match = /^evidence\/([a-f0-9-]+)\/([a-f0-9-]+\.jpg)$/.exec(route)
          if (match && this.runtime.get(match[1]!).evidence.some(e => e.file === match[2])) {
            const bytes = await readFile(join(this.runtime.options.root, 'evidence-v1', match[2]!))
            res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(bytes); return
          }
          send(404, { error: 'Not found' }); return
        }
        // WorkBuddy's native container omits Origin on same-origin fetches.
        // A separate owner-bound token plus Fetch Metadata permits only that case.
        const nativePost = this.runtime.options.host === 'workbuddy' && this.nativeOrigins.has(owner) &&
          req.headers.origin === undefined && req.headers['sec-fetch-site'] === 'same-origin' &&
          req.headers['sec-fetch-dest'] === 'empty' && Boolean(this.requestTokens.get(owner)) &&
          req.headers['x-opengui-request-token'] === this.requestTokens.get(owner)
        if (req.method !== 'POST' || (req.headers.origin !== origin && !nativePost) || req.headers['content-type'] !== 'application/json') { send(403, { error: 'Same-origin JSON required' }); return }
        let body = ''
        for await (const part of req) { body += String(part); if (Buffer.byteLength(body) > 65536) { send(413, { error: 'Request too large' }); req.destroy(); return } }
        const args = JSON.parse(body) as Record<string, unknown>
        if (route === 'run') send(200, await this.runtime.goals.submit(args as unknown as StartTask, owner))
        else if (route === 'draft') { await this.saveDraft(args.goal); send(200, { saved: true }) }
        else if (route === 'preview') {
          const deviceId = String(args.deviceId ?? '')
          const preview = await this.runtime.preview(deviceId)
          const native = this.nativeOrigins.get(owner)
          if (native) this.runtime.viewers.allowNativeEmbedding(preview.viewerId, 'workbench-preview:' + deviceId, native)
          send(200, preview)
        }
        else if (route === 'manage') send(200, await (this.runtime.goals.tasks.has(String(args.taskId)) ? this.runtime.goals : this.runtime).manage(String(args.taskId), String(args.action), typeof args.text === 'string' ? args.text : undefined))
        else if (route === 'model') send(200, await this.runtime.saveModel(args as unknown as Parameters<PhoneRuntime['saveModel']>[0]))
        else send(404, { error: 'Not found' })
      })().catch(() => { if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: this.runtime.hostDriven ? '请求未完成，请检查手机连接和宿主任务状态。' : '请求未完成，请检查手机、模型配置与任务状态。' })) }).finally(() => { this.pendingRequests-- })
    })
    this.server = server
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Workbench bind failed')
    origin = `http://127.0.0.1:${address.port}`
    this.runtime.viewers.allowEmbedding(origin)
    return origin + prefix
  }
}
