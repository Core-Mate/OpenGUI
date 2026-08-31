import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  assertAdbReady,
  managedAdbPath,
  parseDevices,
  runAdb,
} from '../adb.ts'
import type { FleetDeviceStatusView } from '../device-fleet.ts'
import { DeviceFleet } from '../device-fleet.ts'
import { AsyncSemaphore } from '../concurrency.ts'
import { OwnedForwardRegistry } from '../forward-registry.ts'
import { PhoneController } from '../phone-controller.ts'
import type { RawPhoneObservation } from '../phone-controller.ts'
import { resolveScrcpyAsset, ScrcpyInstaller, ScrcpyTextInput } from '../scrcpy.ts'
import { encodeCodexPhoneScreenshot } from './screenshot.ts'

export const CODEX_MAX_DEVICES = 4
export const CODEX_MAX_OPERATIONS = 100
const COMMAND_TIMEOUT_MS = 15_000

export interface CodexDeviceInfo {
  readonly id: string
  readonly name: string
  readonly model?: string
  readonly state: string
  readonly connected: boolean
  readonly authorized: boolean
}

export interface ResolvedCodexDevice extends CodexDeviceInfo {
  readonly serial: string
}

export interface CodexPhoneHost {
  listDevices(signal: AbortSignal): Promise<readonly CodexDeviceInfo[]>
  resolveDevices(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedCodexDevice[]>
  assignTarget(actor: object, serial: string): void
  observe(actor: object, signal: AbortSignal): Promise<RawPhoneObservation>
  act(actor: object, input: Record<string, unknown>, signal: AbortSignal): Promise<RawPhoneObservation>
  status(actor: object): { operations: number; observationId?: string }
  preview(device: ResolvedCodexDevice, signal: AbortSignal): Promise<Buffer>
  releaseDevice(serial: string): Promise<void>
  dispose(): Promise<void>
}

export interface LocalAdbPhoneHostOptions {
  readonly adbPath?: string
  readonly commandTimeoutMs?: number
  readonly stateDir?: string
}

function codexStateDir(override?: string): string {
  const configured = override ?? process.env.OPENGUI_CODEX_HOME?.trim()
  return configured ? resolve(configured) : join(homedir(), '.codex', 'opengui')
}

/** Local USB/ADB Host adapter shared by the Codex MCP and CLI transports. */
export class LocalAdbPhoneHost implements CodexPhoneHost {
  private readonly path: string
  private readonly repairAdbPermissions: boolean
  private readonly timeoutMs: number
  private readonly fleet: DeviceFleet
  private readonly controller: PhoneController
  private readonly textInput: ScrcpyTextInput
  private readonly forwardRegistry: OwnedForwardRegistry
  private readonly recovery: Promise<unknown>
  private readonly previewPermits = new AsyncSemaphore(2)

  constructor(options: LocalAdbPhoneHostOptions = {}) {
    const configuredAdbPath = (options.adbPath ?? process.env.OPENGUI_ADB_PATH)?.trim()
    this.path = managedAdbPath(configuredAdbPath)
    this.repairAdbPermissions = !configuredAdbPath
    this.timeoutMs = options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS
    const run = (args: readonly string[], signal: AbortSignal, buffer = false): Promise<string | Buffer> => this.run(args, signal, buffer)
    this.fleet = new DeviceFleet(async (signal) => parseDevices(String(await run(['devices', '-l'], signal))))
    const stateDir = codexStateDir(options.stateDir)
    this.forwardRegistry = new OwnedForwardRegistry(join(stateDir, 'owned-forwards.json'))
    const installer = new ScrcpyInstaller({ cacheDir: join(stateDir, 'scrcpy') })
    const asset = resolveScrcpyAsset()
    this.textInput = new ScrcpyTextInput({
      adbPath: () => this.path,
      runAdb: (args, signal) => run(args, signal),
      installer,
      forwardRegistry: this.forwardRegistry,
      ...(asset === undefined ? {} : { asset }),
    })
    this.recovery = this.forwardRegistry.recover((args, signal) => run(args, signal))
    this.controller = new PhoneController({
      runAdb: run,
      discoverTarget: async (signal) => {
        const selected = await this.fleet.selectedDevices(signal)
        if (selected.length !== 1) throw new Error('opengui: an unbound Codex phone operation requires exactly one selected device')
        return selected[0]!.serial
      },
      validateTarget: async (serial, signal) => {
        const devices = parseDevices(String(await run(['devices', '-l'], signal)))
        if (!devices.some(device => device.serial === serial && device.state === 'device')) {
          throw new Error('opengui: a phone frozen to this session disconnected or lost USB authorization')
        }
      },
      pasteUnicode: (serial, text, signal) => this.textInput.paste(serial, text, signal),
      encodeScreenshot: encodeCodexPhoneScreenshot,
      maxOperations: () => CODEX_MAX_OPERATIONS,
    })
  }

  async listDevices(signal: AbortSignal): Promise<readonly CodexDeviceInfo[]> {
    return (await this.fleet.inspect(signal)).map(device => this.publicDevice(device))
  }

  async resolveDevices(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedCodexDevice[]> {
    const snapshot = await this.fleet.snapshot(signal)
    let ids = [...new Set(deviceIds ?? [])]
    if (ids.length === 0) {
      if (snapshot.devices.length === 0) {
        throw new Error('opengui: no authorized Android device is connected; accept the USB debugging prompt first')
      }
      if (snapshot.devices.length > 1) {
        throw new Error('opengui: multiple authorized phones are connected; pass one to four deviceIds from opengui_list_devices')
      }
      ids = [snapshot.devices[0]!.id]
    }
    if (ids.length > CODEX_MAX_DEVICES) throw new Error(`opengui: a session can lock at most ${CODEX_MAX_DEVICES} phones`)
    const resolved = await this.fleet.resolveConnected(ids, signal)
    const statuses = new Map((await this.listDevices(signal)).map(device => [device.id, device]))
    return resolved.map((device) => {
      const status = statuses.get(device.id)
      if (status === undefined || !status.authorized) throw new Error('opengui: a selected phone is not currently authorized')
      return { ...status, serial: device.serial }
    })
  }

  assignTarget(actor: object, serial: string): void {
    this.controller.assignTarget(actor, serial)
  }

  observe(actor: object, signal: AbortSignal): Promise<RawPhoneObservation> {
    return this.controller.observe(actor, signal)
  }

  act(actor: object, input: Record<string, unknown>, signal: AbortSignal): Promise<RawPhoneObservation> {
    return this.controller.execute(actor, input, signal)
  }

  status(actor: object): { operations: number; observationId?: string } {
    const status = this.controller.status(actor)
    return {
      operations: status.operations,
      ...(status.observationId === undefined ? {} : { observationId: status.observationId }),
    }
  }

  async preview(device: ResolvedCodexDevice, signal: AbortSignal): Promise<Buffer> {
    const release = await this.previewPermits.acquire(signal)
    try {
      const source = await this.run(['-s', device.serial, 'exec-out', 'screencap', '-p'], signal, true)
      return (await encodeCodexPhoneScreenshot(Buffer.isBuffer(source) ? source : Buffer.from(source))).data
    } finally {
      release()
    }
  }

  async releaseDevice(serial: string): Promise<void> {
    await this.textInput.release(serial)
  }

  async dispose(): Promise<void> {
    await this.recovery.catch(() => undefined)
    await this.textInput.dispose()
    await this.forwardRegistry.recover((args, signal) => this.run(args, signal)).catch(() => undefined)
  }

  private publicDevice(device: FleetDeviceStatusView): CodexDeviceInfo {
    return {
      id: device.id,
      name: device.label,
      ...(device.model === undefined ? {} : { model: device.model }),
      state: device.state,
      connected: device.connected,
      authorized: device.authorized,
    }
  }

  private async run(args: readonly string[], signal: AbortSignal, buffer = false): Promise<string | Buffer> {
    await assertAdbReady(this.path, { repairPermissions: this.repairAdbPermissions })
    return runAdb(this.path, args, {
      signal,
      timeoutMs: this.timeoutMs,
      encoding: buffer ? 'buffer' : 'utf8',
    })
  }
}

export type ExternalSideEffect = 'none' | 'send' | 'publish' | 'purchase' | 'delete'
export type CodexSessionState = 'active' | 'cancelled' | 'closed'

interface SessionDevice {
  readonly device: ResolvedCodexDevice
  readonly actor: object
  connected: boolean
  authorized: boolean
}

interface SessionRecord {
  readonly id: string
  readonly createdAt: string
  readonly controller: AbortController
  readonly devices: readonly SessionDevice[]
  state: CodexSessionState
  lastError?: string
  closedAt?: string
}

export interface CodexSessionStatus {
  readonly sessionId: string
  readonly state: CodexSessionState
  readonly createdAt: string
  readonly closedAt?: string
  readonly lastError?: string
  readonly deviceWallUrl: string
  readonly devices: readonly {
    id: string
    name: string
    model?: string
    connected: boolean
    authorized: boolean
    operationCount: number
    observationId?: string
  }[]
}

export interface CodexObservation {
  readonly sessionId: string
  readonly deviceId: string
  readonly observationId: string
  readonly unchangedFromObservationId?: string
  readonly width: number
  readonly height: number
  readonly foregroundPackage: string
  readonly screenshot: {
    readonly data: string
    readonly mimeType: 'image/jpeg'
    readonly bytes: number
    readonly width: number
    readonly height: number
    readonly name: string
  }
}

export interface CodexOpenGuiServiceOptions {
  readonly host?: CodexPhoneHost
  readonly createSessionId?: () => string
}

/** Stateful session adapter consumed by both Codex transports. */
export class CodexOpenGuiService {
  private readonly host: CodexPhoneHost
  private readonly createSessionId: () => string
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly locks = new Map<string, string>()
  private readonly wall: DeviceWallServer

  constructor(options: CodexOpenGuiServiceOptions = {}) {
    this.host = options.host ?? new LocalAdbPhoneHost()
    this.createSessionId = options.createSessionId ?? randomUUID
    this.wall = new DeviceWallServer(
      (sessionId, signal) => this.status(sessionId, signal),
      (sessionId, deviceId, signal) => this.preview(sessionId, deviceId, signal),
    )
  }

  listDevices(signal: AbortSignal): Promise<readonly CodexDeviceInfo[]> {
    return this.host.listDevices(signal)
  }

  async openSession(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<CodexSessionStatus> {
    signal.throwIfAborted()
    const devices = await this.host.resolveDevices(deviceIds, signal)
    if (devices.length < 1 || devices.length > CODEX_MAX_DEVICES) {
      throw new Error(`opengui: a session must lock one to ${CODEX_MAX_DEVICES} phones`)
    }
    const conflicts = devices.filter(device => this.locks.has(device.serial))
    if (conflicts.length > 0) {
      throw new Error(`opengui: ${conflicts.map(device => device.name).join(', ')} is already locked by another session`)
    }
    const id = this.createSessionId()
    const record: SessionRecord = {
      id,
      createdAt: new Date().toISOString(),
      controller: new AbortController(),
      devices: devices.map(device => ({
        device,
        actor: {},
        connected: device.connected,
        authorized: device.authorized,
      })),
      state: 'active',
    }
    for (const item of record.devices) {
      this.host.assignTarget(item.actor, item.device.serial)
      this.locks.set(item.device.serial, id)
    }
    this.sessions.set(id, record)
    try {
      await this.wall.start()
      return this.snapshot(record)
    } catch (error) {
      record.state = 'closed'
      record.closedAt = new Date().toISOString()
      record.controller.abort(error)
      this.release(record)
      await this.releaseDeviceResources(record)
      this.sessions.delete(id)
      throw error
    }
  }

  async observe(sessionId: string, deviceId: string | undefined, signal: AbortSignal): Promise<CodexObservation> {
    return this.runPhoneOperation(sessionId, deviceId, signal, (item, combined) => this.host.observe(item.actor, combined))
  }

  async act(
    sessionId: string,
    deviceId: string | undefined,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<CodexObservation> {
    const sideEffect = this.externalSideEffect(input.externalSideEffect)
    if (sideEffect !== 'none' && input.confirmedExternalSideEffect !== true) {
      throw new Error(`opengui: ${sideEffect} requires explicit user confirmation immediately before this action`)
    }
    const action = { ...input }
    delete action.sessionId
    delete action.deviceId
    delete action.externalSideEffect
    delete action.confirmedExternalSideEffect
    return this.runPhoneOperation(sessionId, deviceId, signal, (item, combined) => this.host.act(item.actor, action, combined))
  }

  async status(sessionId: string, signal: AbortSignal): Promise<CodexSessionStatus> {
    const record = this.requireSession(sessionId)
    try {
      const current = new Map((await this.host.listDevices(signal)).map(device => [device.id, device]))
      for (const item of record.devices) {
        const device = current.get(item.device.id)
        item.connected = device?.connected ?? false
        item.authorized = device?.authorized ?? false
      }
    } catch (error) {
      record.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
    return this.snapshot(record)
  }

  private snapshot(record: SessionRecord): CodexSessionStatus {
    return {
      sessionId: record.id,
      state: record.state,
      createdAt: record.createdAt,
      ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
      ...(record.lastError === undefined ? {} : { lastError: record.lastError }),
      deviceWallUrl: this.wall.url(record.id),
      devices: record.devices.map(({ device, actor, connected, authorized }) => {
        const runtime = this.host.status(actor)
        return {
          id: device.id,
          name: device.name,
          ...(device.model === undefined ? {} : { model: device.model }),
          connected,
          authorized,
          operationCount: runtime.operations,
          ...(runtime.observationId === undefined ? {} : { observationId: runtime.observationId }),
        }
      }),
    }
  }

  async cancel(sessionId: string): Promise<CodexSessionStatus> {
    const record = this.requireSession(sessionId)
    if (record.state === 'active') {
      record.state = 'cancelled'
      record.closedAt = new Date().toISOString()
      record.controller.abort(new Error('opengui: session cancelled'))
      this.release(record)
      await this.releaseDeviceResources(record)
    }
    return this.snapshot(record)
  }

  async closeSession(sessionId: string): Promise<CodexSessionStatus> {
    const record = this.requireSession(sessionId)
    if (record.state === 'active') record.controller.abort(new Error('opengui: session closed'))
    record.state = 'closed'
    record.closedAt ??= new Date().toISOString()
    this.release(record)
    await this.releaseDeviceResources(record)
    this.pruneClosedSessions()
    return this.snapshot(record)
  }

  async dispose(): Promise<void> {
    for (const record of this.sessions.values()) {
      if (record.state === 'active') record.controller.abort(new Error('opengui: adapter shutting down'))
      this.release(record)
    }
    await this.wall.close()
    await this.host.dispose()
  }

  private async preview(sessionId: string, deviceId: string, signal: AbortSignal): Promise<Buffer> {
    const record = this.requireSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    return this.host.preview(item.device, signal)
  }

  private async runPhoneOperation(
    sessionId: string,
    deviceId: string | undefined,
    signal: AbortSignal,
    operation: (item: SessionDevice, combined: AbortSignal) => Promise<RawPhoneObservation>,
  ): Promise<CodexObservation> {
    const record = this.requireActiveSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    const combined = AbortSignal.any([record.controller.signal, signal])
    try {
      const value = await operation(item, combined)
      return this.publicObservation(record.id, item.device.id, value)
    } catch (error) {
      record.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  private publicObservation(sessionId: string, deviceId: string, value: RawPhoneObservation): CodexObservation {
    return {
      sessionId,
      deviceId,
      observationId: value.observationId,
      ...(value.unchangedFromObservationId === undefined ? {} : { unchangedFromObservationId: value.unchangedFromObservationId }),
      width: value.width,
      height: value.height,
      foregroundPackage: value.foregroundPackage,
      screenshot: {
        data: value.image.data.toString('base64'),
        mimeType: 'image/jpeg',
        bytes: value.image.bytes,
        width: value.image.width,
        height: value.image.height,
        name: value.image.name,
      },
    }
  }

  private requireSession(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId)
    if (record === undefined) throw new Error('opengui: unknown sessionId')
    return record
  }

  private requireActiveSession(sessionId: string): SessionRecord {
    const record = this.requireSession(sessionId)
    if (record.state !== 'active') throw new Error(`opengui: session is ${record.state}`)
    return record
  }

  private resolveDevice(record: SessionRecord, deviceId: string | undefined): SessionDevice {
    if (deviceId === undefined) {
      if (record.devices.length !== 1) throw new Error('opengui: deviceId is required for a multi-device session')
      return record.devices[0]!
    }
    const item = record.devices.find(candidate => candidate.device.id === deviceId)
    if (item === undefined) throw new Error('opengui: deviceId is not locked by this session')
    return item
  }

  private release(record: SessionRecord): void {
    for (const item of record.devices) {
      if (this.locks.get(item.device.serial) === record.id) this.locks.delete(item.device.serial)
    }
  }

  private async releaseDeviceResources(record: SessionRecord): Promise<void> {
    const results = await Promise.allSettled(record.devices.map(item => this.host.releaseDevice(item.device.serial)))
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure !== undefined) {
      record.lastError = failure.reason instanceof Error ? failure.reason.message : String(failure.reason)
    }
  }

  private externalSideEffect(value: unknown): ExternalSideEffect {
    if (value === undefined || value === 'none') return 'none'
    if (value === 'send' || value === 'publish' || value === 'purchase' || value === 'delete') return value
    throw new Error('opengui: externalSideEffect must be none, send, publish, purchase, or delete')
  }

  private pruneClosedSessions(): void {
    const closed = [...this.sessions.values()].filter(record => record.state !== 'active')
    for (const record of closed.slice(0, Math.max(0, closed.length - 100))) this.sessions.delete(record.id)
  }
}

type StatusReader = (sessionId: string, signal: AbortSignal) => Promise<CodexSessionStatus>
type PreviewReader = (sessionId: string, deviceId: string, signal: AbortSignal) => Promise<Buffer>

/** Loopback-only, read-only device wall used by the Codex Browser panel. */
class DeviceWallServer {
  private readonly token = randomBytes(24).toString('base64url')
  private server: Server | undefined
  private port: number | undefined
  private starting: Promise<void> | undefined

  constructor(private readonly readStatus: StatusReader, private readonly readPreview: PreviewReader) {}

  async start(): Promise<void> {
    if (this.port !== undefined) return Promise.resolve()
    if (this.starting !== undefined) return this.starting
    const starting = new Promise<void>((resolveStart, rejectStart) => {
      const server = createServer((request, response) => { void this.handle(request, response) })
      server.once('error', rejectStart)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        server.off('error', rejectStart)
        const address = server.address()
        if (address === null || typeof address === 'string') {
          server.close()
          rejectStart(new Error('opengui: device wall did not receive a loopback TCP port'))
          return
        }
        this.server = server
        this.port = address.port
        resolveStart()
      })
    })
    this.starting = starting
    try {
      await starting
    } finally {
      if (this.starting === starting) this.starting = undefined
    }
  }

  url(sessionId: string): string {
    if (this.port === undefined) return 'about:blank'
    return `http://127.0.0.1:${this.port}/${this.token}/?sessionId=${encodeURIComponent(sessionId)}`
  }

  async close(): Promise<void> {
    const server = this.server
    this.server = undefined
    this.port = undefined
    if (server === undefined) return
    await new Promise<void>(resolveClose => server.close(() => resolveClose()))
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const port = this.port
    if (port === undefined || request.headers.host !== `127.0.0.1:${port}`) {
      this.text(response, 403, 'Forbidden')
      return
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
    const base = `/${this.token}`
    if (!url.pathname.startsWith(`${base}/`)) {
      this.text(response, 404, 'Not found')
      return
    }
    const sessionId = url.searchParams.get('sessionId') ?? ''
    try {
      if (request.method === 'GET' && url.pathname === `${base}/`) {
        this.html(response, this.page(sessionId))
        return
      }
      if (request.method === 'GET' && url.pathname === `${base}/api/status`) {
        this.json(response, 200, await this.readStatus(sessionId, AbortSignal.timeout(10_000)))
        return
      }
      if (request.method === 'GET' && url.pathname === `${base}/api/preview`) {
        const deviceId = url.searchParams.get('deviceId') ?? ''
        const image = await this.readPreview(sessionId, deviceId, AbortSignal.timeout(10_000))
        response.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': image.byteLength,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(image)
        return
      }
      this.text(response, 404, 'Not found')
    } catch (error) {
      this.json(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  private page(sessionId: string): string {
    const encoded = JSON.stringify(sessionId)
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenGUI Device Wall</title><style>
:root{color-scheme:dark;background:#0a0a0b;color:#f5f5f5;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{margin:0;padding:24px}header{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:20px}h1{font-size:22px;margin:0}.state{color:#a3a3a3;font-size:13px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:#151517;border:1px solid #2b2b30;border-radius:16px;overflow:hidden}.meta{padding:12px 14px;display:flex;justify-content:space-between;gap:12px}.name{font-weight:650}.detail{font-size:12px;color:#a3a3a3;margin-top:3px}img{display:block;width:100%;aspect-ratio:9/16;object-fit:contain;background:#050506}.empty{padding:32px;border:1px dashed #3f3f46;border-radius:16px;color:#a3a3a3}</style></head>
<body><header><h1>OpenGUI Device Wall</h1><div class="state" id="state">连接中…</div></header><main class="grid" id="grid"></main>
<script>const sessionId=${encoded};const base=location.pathname.replace(/\/$/,'');const grid=document.getElementById('grid');const state=document.getElementById('state');
async function refresh(){try{const response=await fetch(base+'/api/status?sessionId='+encodeURIComponent(sessionId),{cache:'no-store'});const value=await response.json();if(!response.ok)throw new Error(value.error||'status failed');state.textContent=value.state+' · '+value.devices.length+' 台设备';grid.replaceChildren();for(const device of value.devices){const card=document.createElement('section');card.className='card';const meta=document.createElement('div');meta.className='meta';const left=document.createElement('div');const name=document.createElement('div');name.className='name';name.textContent=device.name;const detail=document.createElement('div');detail.className='detail';detail.textContent='操作 '+device.operationCount+(device.observationId?' · '+device.observationId:'');left.append(name,detail);const health=document.createElement('div');health.className='detail';health.textContent=device.authorized?'已授权':'未授权';meta.append(left,health);const image=document.createElement('img');image.alt=device.name+' screenshot';image.src=base+'/api/preview?sessionId='+encodeURIComponent(sessionId)+'&deviceId='+encodeURIComponent(device.id)+'&t='+Date.now();card.append(meta,image);grid.append(card)}if(value.devices.length===0){const empty=document.createElement('div');empty.className='empty';empty.textContent='当前会话没有设备。';grid.append(empty)}}catch(error){state.textContent=String(error)}}refresh();setInterval(refresh,1500);</script></body></html>`
  }

  private html(response: ServerResponse, body: string): void {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(body)
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    const body = JSON.stringify(value)
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(body)
  }

  private text(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(body)
  }
}

export async function ensureCodexStateDir(path = codexStateDir()): Promise<string> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  return path
}
