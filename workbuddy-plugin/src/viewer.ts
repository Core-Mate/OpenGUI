import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { ScrcpyStreamSink, VideoDevice } from './scrcpy-stream.ts'
import { acceptStreamWebSocket } from './websocket.ts'
import { viewerPage } from './viewer-page.ts'

export interface ViewerDevice extends VideoDevice { readonly name: string }
export interface ViewerStreams {
  prepare(signal: AbortSignal): Promise<void>
  subscribe(device: VideoDevice, sink: ScrcpyStreamSink): Promise<() => void>
  dispose(): Promise<void>
}
type Phase = 'preparing' | 'waiting_for_frame' | 'ready' | 'disconnected' | 'error' | 'closed'
interface Connection {
  id: string; deviceId: string; sink: ScrcpyStreamSink; challenge: string
  issued: number; painted: number; connectedAt: number; media: boolean; release?: () => void
}
interface Viewer {
  id: string; token: string; owner: string; devices: readonly ViewerDevice[]
  phase: Phase; deadline: number; established: boolean; ended: boolean
  firstFrameMs?: number; error?: string; connections: Map<string, Connection>; pages: Set<ScrcpyStreamSink>; lastPage: number
  preparation?: Promise<void>; readyDevices: Set<string>
}

/** Watching grants never contain a control credential or renew a control lease. */
export class ViewerServer {
  private server: Server | undefined
  private starting: Promise<void> | undefined
  private origin = ''
  private readonly viewers = new Map<string, Viewer>()
  private readonly sweep: ReturnType<typeof setInterval>
  constructor(private readonly streams: ViewerStreams, private readonly now = Date.now) {
    this.sweep = setInterval(() => {
      for (const viewer of this.viewers.values()) {
        this.update(viewer)
        for (const connection of viewer.connections.values()) {
          if (this.now() - Math.max(connection.painted, connection.connectedAt) > 12_000) connection.sink.close(1001, 'page_inactive')
        }
        if (viewer.ended && viewer.pages.size === 0 && viewer.connections.size === 0 && this.now() - viewer.lastPage > 300_000) this.viewers.delete(viewer.id)
      }
    }, 1000)
    this.sweep.unref()
  }

  get active(): boolean {
    return [...this.viewers.values()].some(v => v.phase !== 'closed' && (v.pages.size > 0 || v.connections.size > 0 || this.now() - v.lastPage < 15_000))
  }

  async open(owner: string, devices: readonly ViewerDevice[], signal: AbortSignal) {
    if (!owner) throw new Error('host_task_required')
    if (devices.length < 1 || devices.length > 4 || new Set(devices.map(d => d.id)).size !== devices.length) throw new Error('invalid_viewer_devices')
    let viewer = [...this.viewers.values()].find(v => v.owner === owner && (!v.ended || Boolean(v.error)))
    if (viewer && !this.same(viewer, devices)) throw new Error('device_frozen')
    if (!viewer) {
      if (this.viewers.size >= 100) throw new Error('viewer_capacity')
      viewer = { id: randomUUID(), token: randomBytes(32).toString('base64url'), owner, devices: [...devices], phase: 'preparing', deadline: 0, established: false, ended: false, connections: new Map(), pages: new Set(), readyDevices: new Set(), lastPage: this.now() }
      this.viewers.set(viewer.id, viewer)
      const current = viewer
      viewer.preparation = (async () => { try {
        await this.streams.prepare(signal)
        await this.start()
        current.deadline = this.now() + 30_000
        current.phase = 'waiting_for_frame'
      } catch (error) {
        current.phase = 'error'
        current.error = `dependency_prepare_failed: ${String(error)}`
      } })()
    }
    await viewer.preparation
    if (viewer.phase === 'closed' && viewer.established) viewer.phase = 'disconnected'
    // A repeated tool call cannot reset a failed first-display deadline.
    return this.snapshot(viewer)
  }

  find(owner: string, devices: readonly ViewerDevice[], id?: string): string {
    const viewer = id ? this.require(id, owner) : [...this.viewers.values()].find(v => v.owner === owner && !v.ended && this.same(v, devices))
    if (!viewer || viewer.ended || !this.same(viewer, devices)) throw new Error('display_required: open the viewer for this task and these devices first')
    this.update(viewer)
    if (!viewer.established && ['closed', 'error'].includes(viewer.phase)) throw new Error(viewer.error ?? 'display_required')
    return viewer.id
  }

  assertReady(id: string): void {
    const viewer = this.require(id)
    this.update(viewer)
    if (!viewer.established) throw new Error(viewer.error ?? 'waiting_for_frame: visible decoded video is required before observation or action')
  }

  async status(id: string, owner: string, waitMs = 0, signal?: AbortSignal) {
    const viewer = this.require(id, owner)
    const end = this.now() + Math.min(30_000, Math.max(0, waitMs))
    while (true) {
      signal?.throwIfAborted()
      this.update(viewer)
      if (viewer.established || ['closed', 'error'].includes(viewer.phase) || this.now() >= end) break
      await new Promise(resolve => setTimeout(resolve, Math.min(100, end - this.now())))
    }
    return this.snapshot(viewer)
  }

  closeViewer(id: string, owner: string) {
    const viewer = this.require(id, owner)
    viewer.phase = 'closed'
    for (const c of viewer.connections.values()) c.sink.close(1000, 'viewer_closed')
    for (const page of viewer.pages) page.close(1000, 'viewer_closed')
    return this.snapshot(viewer)
  }
  endOwner(owner: string): void { for (const v of this.viewers.values()) if (v.owner === owner) v.ended = true }
  endTask(id: string): void { this.require(id).ended = true }
  url(id: string): string { const v = this.require(id); return `${this.origin}/${v.token}/` }
  async dispose(): Promise<void> {
    clearInterval(this.sweep)
    for (const v of this.viewers.values()) this.closeViewer(v.id, v.owner)
    await this.streams.dispose()
    this.server?.closeAllConnections()
    await new Promise<void>(resolve => this.server ? this.server.close(() => resolve()) : resolve())
  }

  private same(v: Viewer, devices: readonly ViewerDevice[]): boolean {
    return v.devices.length === devices.length && devices.every(d => v.devices.some(x => x.id === d.id && x.serial === d.serial))
  }
  private require(id: string, owner?: string): Viewer {
    const v = this.viewers.get(id)
    if (!v || (owner !== undefined && v.owner !== owner)) throw new Error('foreign_viewer')
    return v
  }
  private update(v: Viewer): void {
    if (!v.established && v.deadline && this.now() >= v.deadline && v.phase !== 'closed') {
      v.phase = 'error'; v.error = 'display_timeout: no visible first video frame within 30 seconds; stop this task'
    }
  }
  private snapshot(v: Viewer) {
    this.update(v)
    return { viewerId: v.id, url: this.url(v.id), state: v.phase, firstDisplayEstablished: v.established,
      ...(v.firstFrameMs === undefined ? {} : { firstFrameMs: v.firstFrameMs }),
      taskState: v.ended ? 'ended' : v.established ? 'executing' : 'preparing',
      ...(v.error ? { errorCode: v.error.split(':')[0], message: v.error } : {}),
      nextAction: v.phase === 'error' ? 'report_blocker' : v.established ? 'observe' : 'open_in_host_and_wait',
      devices: v.devices.map(d => ({ id: d.id, name: d.name, ready: v.readyDevices.has(d.id),
        state: v.phase === 'closed' ? 'closed' : [...v.connections.values()].some(c => c.deviceId === d.id && c.media && this.now() - c.painted < 12_000) ? (v.readyDevices.has(d.id) ? 'ready' : 'waiting_for_frame') : 'disconnected' })) }
  }
  private local(req: IncomingMessage, websocket = false): boolean {
    return req.headers.host === new URL(this.origin).host
      && (!req.headers.origin ? !websocket && req.method === 'GET' : req.headers.origin === this.origin)
      && !['cross-site'].includes(String(req.headers['sec-fetch-site']))
  }
  private start(): Promise<void> {
    this.starting ??= new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const handle = async (): Promise<void> => {
          if (!this.local(req)) { res.writeHead(403).end(); return }
          const url = new URL(req.url ?? '/', this.origin)
          const [token, route = ''] = url.pathname.slice(1).split('/')
          const v = [...this.viewers.values()].find(v => v.token === token)
          if (!v) { res.writeHead(404).end(); return }
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Referrer-Policy', 'no-referrer')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
          if (req.method === 'GET' && route === '') { v.lastPage = this.now(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(viewerPage()); return }
          if (req.method === 'GET' && route === 'status') { v.lastPage = this.now(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(this.snapshot(v))); return }
          if (req.method === 'POST' && route === 'frame' && req.headers.origin === this.origin) {
            let body = ''
            for await (const chunk of req) { body += String(chunk); if (body.length > 2048) { res.writeHead(413).end(); return } }
            const input = JSON.parse(body) as Record<string, unknown>
            const c = v.connections.get(String(input.connectionId))
            this.update(v)
            if (!c || !c.media || input.challenge !== c.challenge || input.deviceId !== c.deviceId || input.visible !== true || this.now() - c.issued > 10_000 || v.phase === 'closed') { res.writeHead(409).end(); return }
            c.painted = this.now()
            if (!v.error) {
              v.readyDevices.add(c.deviceId)
              if (v.devices.every(d => [...v.connections.values()].some(x => x.deviceId === d.id && x.media && this.now() - x.painted < 2000))) {
                v.firstFrameMs ??= this.now() - (v.deadline - 30_000)
                v.established = true; v.phase = 'ready'
              }
            }
            c.challenge = randomBytes(24).toString('base64url'); c.issued = this.now()
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ challenge: c.challenge })); return
          }
          res.writeHead(404).end()
        }
        void handle().catch(() => { if (!res.headersSent) res.writeHead(400); res.end() })
      })
      this.server = server
      server.on('upgrade', (req, socket, head) => {
        if (!this.local(req, true)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
        const url = new URL(req.url ?? '/', this.origin)
        const [token, route] = url.pathname.slice(1).split('/')
        const v = [...this.viewers.values()].find(v => v.token === token)
        if (v && route === 'presence' && v.phase !== 'closed' && v.pages.size < 16) {
          const page = acceptStreamWebSocket(req, socket, head)
          v.pages.add(page)
          page.onClose(() => v.pages.delete(page))
          return
        }
        const device = v?.devices.find(d => d.id === url.searchParams.get('deviceId'))
        if (!v || !device || route !== 'stream' || v.phase === 'closed' || v.connections.size >= 16) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
        const sink = acceptStreamWebSocket(req, socket, head)
        const c: Connection = { id: randomUUID(), deviceId: device.id, sink, challenge: randomBytes(24).toString('base64url'), issued: this.now(), painted: 0, connectedAt: this.now(), media: false }
        // The grace timestamp is not a rendered-frame receipt.
        v.connections.set(c.id, c)
        sink.sendText(JSON.stringify({ type: 'connection', connectionId: c.id, challenge: c.challenge }))
        let closed = false
        sink.onClose(() => {
          closed = true; c.release?.(); v.connections.delete(c.id)
          if (v.connections.size === 0 && v.phase !== 'closed' && !v.error) v.phase = 'disconnected'
        })
        const wrapped: ScrcpyStreamSink = { ...sink, sendBinary: data => { c.media = true; sink.sendBinary(data) }, sendText: text => {
          const event = JSON.parse(text) as { type: string; message?: string }
          if (event.type === 'error') { v.phase = 'disconnected'; sink.sendText(text); return }
          if (event.type === 'session' || event.type === 'reset') {
            c.media = false; c.challenge = randomBytes(24).toString('base64url'); c.issued = this.now()
            sink.sendText(JSON.stringify({ type: 'connection', connectionId: c.id, challenge: c.challenge }))
          }
          sink.sendText(text)
        } }
        void this.streams.subscribe(device, wrapped).then(release => { if (closed) release(); else c.release = release }).catch(error => {
          sink.sendText(JSON.stringify({ type: 'error', message: String(error) })); sink.close(1011, 'video_failed')
        })
      })
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') { reject(new Error('viewer_listen_failed')); return }
        this.origin = `http://127.0.0.1:${address.port}`; resolve()
      })
    })
    return this.starting
  }
}
