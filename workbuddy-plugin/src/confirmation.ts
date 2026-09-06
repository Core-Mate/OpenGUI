import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'

export interface ConfirmationRequired {
  status: 'confirmation_required'
  requestId: string
  confirmationUrl: string
  expiresAt: string
}
interface Approval {
  sessionId: string
  digest: string
  token: string
  csrf: string
  expires: number
  state: 'pending' | 'approved' | 'rejected' | 'consumed'
  action: Record<string, unknown>
  image: Buffer
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
const digest = (action: Record<string, unknown>): string => createHash('sha256').update(canonical(action)).digest('hex')
const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** A local human approval channel, separate from read-only device-wall capabilities. */
export class ConfirmationServer {
  private readonly approvals = new Map<string, Approval>()
  private server: Server | undefined
  private starting: Promise<void> | undefined
  private origin = ''
  constructor(private readonly now = Date.now) {}

  private async start(): Promise<void> {
    this.starting ??= new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        // Keep form POST Origin intact without exposing the capability-bearing path.
        res.setHeader('Referrer-Policy', 'strict-origin')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
        const reply = (code: number, value: string | Buffer, type = 'text/plain; charset=utf-8'): void => { res.writeHead(code, { 'Content-Type': type }); res.end(value) }
        if (`http://${req.headers.host}` !== this.origin || (req.headers.origin && req.headers.origin !== this.origin)) { reply(403, 'Forbidden'); return }
        let url: URL
        try {
          if (!req.url?.startsWith('/') || req.url.startsWith('//')) { reply(400, 'Invalid request target'); return }
          url = new URL(req.url, this.origin)
          if (url.origin !== this.origin) { reply(400, 'Invalid request target'); return }
        } catch { reply(400, 'Invalid request target'); return }
        const [, id, token, route = ''] = url.pathname.split('/')
        const approval = id ? this.approvals.get(id) : undefined
        if (!approval || token !== approval.token) { reply(404, 'Not found'); return }
        if (approval.expires <= this.now()) { this.approvals.delete(id!); reply(410, 'Approval expired. Observe again.'); return }
        if (req.method === 'GET' && route === 'frame') { reply(200, approval.image, 'image/jpeg'); return }
        if (req.method === 'GET' && route === '') {
          const pending = approval.state === 'pending'
          reply(200, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OpenGUI 操作确认</title><style>body{font:16px system-ui;max-width:760px;margin:32px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:320px;max-height:480px}button{padding:12px;margin:12px}</style><h1>确认这一次手机操作</h1><p>请核对手机、目标和内容。只授权下列一步操作，不授权后续操作。不要让 AI 代替你点击。</p><pre>${escape(JSON.stringify(approval.action, null, 2))}</pre><img src="${url.pathname}/frame" alt="操作依据截图"><p>状态：${approval.state} · 有效期至 ${new Date(approval.expires).toISOString()}</p>${pending ? `<form method="post"><input type="hidden" name="csrf" value="${approval.csrf}"><button name="decision" value="reject">拒绝</button><button name="decision" value="approve">批准这一步</button></form>` : '<p>可返回 WorkBuddy 继续，重复提交不会再次授权。</p>'}</html>`, 'text/html; charset=utf-8')
          return
        }
        if (req.method !== 'POST' || route !== '' || req.headers.origin !== this.origin || req.headers['sec-fetch-site'] === 'cross-site') { reply(403, 'Forbidden'); return }
        let body = ''
        req.on('data', chunk => { body += String(chunk); if (body.length > 2048) req.destroy() })
        req.on('end', () => {
          const form = new URLSearchParams(body)
          if (form.get('csrf') !== approval.csrf || !['approve', 'reject'].includes(form.get('decision') ?? '')) { reply(403, 'Forbidden'); return }
          if (this.approvals.get(id!) !== approval || approval.expires <= this.now() || approval.state !== 'pending') { reply(409, 'Approval no longer pending'); return }
          approval.state = form.get('decision') === 'approve' ? 'approved' : 'rejected'
          reply(200, approval.state === 'approved' ? '已批准这一步，请返回 WorkBuddy 继续。' : '已拒绝，手机未执行操作。')
        })
      })
      this.server = server
      server.requestTimeout = 10_000
      server.headersTimeout = 10_000
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') { reject(new Error('Approval server failed to bind')); return }
        this.origin = `http://127.0.0.1:${address.port}`
        resolve()
      })
    }).catch(error => { this.starting = undefined; throw error })
    return this.starting
  }

  async request(sessionId: string, action: Record<string, unknown>, image: Buffer, isCurrent: () => boolean = () => true): Promise<ConfirmationRequired> {
    await this.start()
    if (!isCurrent()) throw new Error('opengui: confirmation context changed before creation; observe again')
    for (const [id, item] of this.approvals) if (item.expires <= this.now()) this.approvals.delete(id)
    const hash = digest(action)
    for (const [id, item] of this.approvals) if (item.sessionId === sessionId && item.digest === hash && item.state === 'pending') return this.result(id, item)
    if (this.approvals.size >= 100) throw new Error('opengui: too many pending approvals')
    this.invalidate(sessionId)
    const id = randomUUID()
    const item: Approval = { sessionId, digest: hash, token: randomBytes(32).toString('base64url'), csrf: randomBytes(32).toString('base64url'), expires: this.now() + 300_000, state: 'pending', action, image }
    this.approvals.set(id, item)
    return this.result(id, item)
  }

  consume(id: string, sessionId: string, action: Record<string, unknown>): void {
    const item = this.approvals.get(id)
    if (!item || item.sessionId !== sessionId || item.digest !== digest(action) || item.expires <= this.now() || item.state !== 'approved') {
      throw new Error('opengui: confirmation invalid, expired, changed, or not approved by the user')
    }
    item.state = 'consumed'
    this.approvals.delete(id)
  }
  invalidate(sessionId: string, requestId?: string): void {
    for (const [id, item] of this.approvals) if (item.sessionId === sessionId && (!requestId || id === requestId)) this.approvals.delete(id)
  }
  pending(sessionId: string): boolean { return [...this.approvals.values()].some(item => item.sessionId === sessionId && item.expires > this.now()) }
  private result(id: string, item: Approval): ConfirmationRequired {
    return { status: 'confirmation_required', requestId: id, confirmationUrl: `${this.origin}/${id}/${item.token}`, expiresAt: new Date(item.expires).toISOString() }
  }
  async close(): Promise<void> {
    await this.starting?.catch(() => undefined)
    this.approvals.clear()
    this.server?.closeAllConnections()
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()))
  }
}
