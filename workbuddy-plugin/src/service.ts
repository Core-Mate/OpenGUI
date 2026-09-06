import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { workbuddyStateDir } from './state.ts'
import { DeviceWallServer } from './wall.ts'
import {
  assertAdbReady,
  managedAdbPath,
  parseDevices,
  runAdb,
} from './adb.ts'
import type { FleetDeviceStatusView } from './device-fleet.ts'
import { DeviceFleet } from './device-fleet.ts'
import { AsyncSemaphore } from './concurrency.ts'
import { OwnedForwardRegistry } from './forward-registry.ts'
import { PhoneController } from './phone-controller.ts'
import type { RawPhoneObservation } from './phone-controller.ts'
import { resolveScrcpyAsset, ScrcpyInstaller, ScrcpyTextInput } from './scrcpy.ts'
import { encodeWorkBuddyPhoneScreenshot } from './screenshot.ts'
import { NativeMirror, type MirrorStatus } from './mirror.ts'
import { ConfirmationServer, type ConfirmationRequired } from './confirmation.ts'

export const WORKBUDDY_MAX_DEVICES = 4
export const WORKBUDDY_MAX_OPERATIONS = 100
const COMMAND_TIMEOUT_MS = 15_000

export interface WorkBuddyDeviceInfo {
  readonly id: string
  readonly name: string
  readonly model?: string
  readonly state: string
  readonly connected: boolean
  readonly authorized: boolean
}

export interface ResolvedWorkBuddyDevice extends WorkBuddyDeviceInfo {
  readonly serial: string
}

export interface WorkBuddyPhoneHost {
  activateMirrors?(signal: AbortSignal): Promise<void>
  inspectMirror?(serial: string): Promise<MirrorStatus>
  hasMirrors?(): boolean
  invalidate?(actor: object): void
  onDeviceUnavailable?: (serial: string) => void
  openMirror?(device: ResolvedWorkBuddyDevice, signal: AbortSignal): Promise<void>
  closeMirror?(serial: string): Promise<void>
  mirrorStatus?(serial: string): MirrorStatus
  onMirrorEnded?: (serial: string) => void
  listDevices(signal: AbortSignal): Promise<readonly WorkBuddyDeviceInfo[]>
  resolveDevices(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]>
  assignTarget(actor: object, serial: string): void
  observe(actor: object, signal: AbortSignal): Promise<RawPhoneObservation>
  act(actor: object, input: Record<string, unknown>, signal: AbortSignal): Promise<RawPhoneObservation>
  status(actor: object): { operations: number; observationId?: string }
  preview(device: ResolvedWorkBuddyDevice, signal: AbortSignal): Promise<Buffer>
  releaseDevice(serial: string): Promise<void>
  dispose(): Promise<void>
}

export interface LocalAdbPhoneHostOptions {
  readonly adbPath?: string
  readonly commandTimeoutMs?: number
  readonly stateDir?: string
}


/** Local USB/ADB Host adapter shared by the WorkBuddy MCP and CLI transports. */
export class LocalAdbPhoneHost implements WorkBuddyPhoneHost {
  onDeviceUnavailable?: (serial: string) => void
  private readonly lifetime = new AbortController()
  private watching: ReturnType<typeof setTimeout> | undefined
  private readonly connectedMirrors = new Set<string>()
  private reconciliation: Promise<void> = Promise.resolve()
  onMirrorEnded?: (serial: string) => void
  private readonly mirror: NativeMirror
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
    const stateDir = workbuddyStateDir(options.stateDir)
    this.forwardRegistry = new OwnedForwardRegistry(join(stateDir, 'owned-forwards.json'))
    const installer = new ScrcpyInstaller({ cacheDir: join(stateDir, 'scrcpy') })
    this.mirror = new NativeMirror({ adbPath: this.path, installer, onEnded: serial => this.onMirrorEnded?.(serial) })
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
        if (selected.length !== 1) throw new Error('opengui: an unbound WorkBuddy phone operation requires exactly one selected device')
        return selected[0]!.serial
      },
      validateTarget: async (serial, signal) => {
        const devices = parseDevices(String(await run(['devices', '-l'], signal)))
        if (!devices.some(device => device.serial === serial && device.state === 'device')) {
          this.onDeviceUnavailable?.(serial)
          throw new Error('opengui: a phone frozen to this session disconnected or lost USB authorization')
        }
      },
      pasteUnicode: (serial, text, signal) => this.textInput.paste(serial, text, signal),
      encodeScreenshot: encodeWorkBuddyPhoneScreenshot,
      maxOperations: () => WORKBUDDY_MAX_OPERATIONS,
    })
  }

  async listDevices(signal: AbortSignal): Promise<readonly WorkBuddyDeviceInfo[]> {
    return (await this.fleet.inspect(signal)).map(device => this.publicDevice(device))
  }

  async resolveDevices(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]> {
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
    if (ids.length > WORKBUDDY_MAX_DEVICES) throw new Error(`opengui: a session can lock at most ${WORKBUDDY_MAX_DEVICES} phones`)
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

  async preview(device: ResolvedWorkBuddyDevice, signal: AbortSignal): Promise<Buffer> {
    const release = await this.previewPermits.acquire(signal)
    try {
      const source = await this.run(['-s', device.serial, 'exec-out', 'screencap', '-p'], signal, true)
      return (await encodeWorkBuddyPhoneScreenshot(Buffer.isBuffer(source) ? source : Buffer.from(source))).data
    } finally {
      release()
    }
  }

  async releaseDevice(serial: string): Promise<void> {
    await this.textInput.release(serial)
  }

  invalidate(actor: object): void { this.controller.invalidate(actor) }
  hasMirrors(): boolean { return this.mirror.active() }
  inspectMirror(serial: string): Promise<MirrorStatus> { return this.mirror.inspect(serial) }

  async activateMirrors(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    await this.scheduleReconciliation(true)
    if (!this.watching) this.watchMirrors()
  }

  private watchMirrors(): void {
    if (this.lifetime.signal.aborted) return
    this.watching = setTimeout(() => {
      void this.scheduleReconciliation(false).catch(() => {
        for (const serial of this.connectedMirrors) this.onDeviceUnavailable?.(serial)
      }).finally(() => this.watchMirrors())
    }, 1000)
    this.watching.unref()
  }

  private scheduleReconciliation(explicit: boolean): Promise<void> {
    const next = this.reconciliation.catch(() => undefined).then(() => {
      this.lifetime.signal.throwIfAborted()
      return this.reconcileMirrors(explicit)
    })
    this.reconciliation = next
    return next
  }

  private async reconcileMirrors(explicit: boolean): Promise<void> {
    const devices = await this.listDevices(this.lifetime.signal)
    const online = new Set<string>()
    for (const device of devices.filter(d => d.connected && d.authorized)) {
      const [resolved] = await this.resolveDevices([device.id], this.lifetime.signal)
      if (!resolved) continue
      online.add(resolved.serial)
      if (explicit || !this.connectedMirrors.has(resolved.serial)) {
        await this.mirror.open(resolved.serial, resolved.name, this.lifetime.signal)
      }
      await this.mirror.inspect(resolved.serial)
    }
    for (const serial of this.connectedMirrors) if (!online.has(serial)) {
      this.onDeviceUnavailable?.(serial)
      await this.mirror.stop(serial)
    }
    this.connectedMirrors.clear()
    for (const serial of online) this.connectedMirrors.add(serial)
  }

  async openMirror(device: ResolvedWorkBuddyDevice, signal: AbortSignal): Promise<void> {
    await assertAdbReady(this.path, { repairPermissions: this.repairAdbPermissions })
    await this.mirror.open(device.serial, device.name, signal)
  }
  closeMirror(serial: string): Promise<void> { return this.mirror.stop(serial) }
  mirrorStatus(serial: string): MirrorStatus { return this.mirror.status(serial) }

  async dispose(): Promise<void> {
    this.lifetime.abort()
    clearTimeout(this.watching)
    await this.reconciliation.catch(() => undefined)
    await this.mirror.dispose()
    await this.recovery.catch(() => undefined)
    await this.textInput.dispose()
    await this.forwardRegistry.recover((args, signal) => this.run(args, signal)).catch(() => undefined)
  }

  private publicDevice(device: FleetDeviceStatusView): WorkBuddyDeviceInfo {
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
export type WorkBuddySessionState = 'active' | 'cancelled' | 'closed'

interface SessionDevice {
  readonly device: ResolvedWorkBuddyDevice
  readonly actor: object
  connected: boolean
  authorized: boolean
  observation?: RawPhoneObservation
  needsObservation?: boolean
  connectionEpoch?: number
  connectionController: AbortController
  /** Initial display verification is sticky for this task, not a continuous visibility gate. */
  displayEstablished?: boolean
}

interface SessionRecord {
  readonly purpose: 'control' | 'mirror'
  mirrorRequested: boolean
  readonly id: string
  readonly createdAt: string
  readonly controller: AbortController
  readonly devices: readonly SessionDevice[]
  state: WorkBuddySessionState
  lastError?: string
  closedAt?: string
  readonly pending: Set<Promise<unknown>>
  cleanup?: Promise<void>
  resultUnknown?: boolean
}

export interface WorkBuddySessionStatus {
  readonly activity: 'waiting_for_display' | 'ready' | 'waiting_for_confirmation' | 'paused' | 'ended' | 'result_unknown'
  readonly purpose: 'control' | 'mirror'
  readonly sessionId: string
  readonly state: WorkBuddySessionState
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
    mirror?: MirrorStatus
  }[]
}

export interface WorkBuddyObservation {
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

export interface WorkBuddyOpenGuiServiceOptions {
  readonly host?: WorkBuddyPhoneHost
  readonly createSessionId?: () => string
}

/** Stateful session adapter consumed by both WorkBuddy transports. */
export class WorkBuddyOpenGuiService {
  private readonly confirmations = new ConfirmationServer()
  private readonly host: WorkBuddyPhoneHost
  private readonly createSessionId: () => string
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly locks = new Map<string, string>()
  private readonly wall: DeviceWallServer
  private disposed = false

  constructor(options: WorkBuddyOpenGuiServiceOptions = {}) {
    this.host = options.host ?? new LocalAdbPhoneHost()
    this.host.onDeviceUnavailable = serial => {
      const id = this.locks.get(serial)
      const record = id ? this.sessions.get(id) : undefined
      const item = record?.devices.find(item => item.device.serial === serial)
      if (item) {
        item.connectionController.abort(new Error('opengui: device disconnected; observe again after reconnecting'))
        item.connectionController = new AbortController()
        this.host.invalidate?.(item.actor)
        item.needsObservation = true
        item.connectionEpoch = (item.connectionEpoch ?? 0) + 1
        if (record) this.confirmations.invalidate(record.id)
      }
    }
    this.host.onMirrorEnded = serial => {
      for (const record of this.sessions.values()) {
        if (record.purpose === 'mirror' && record.devices.some(item => item.device.serial === serial)) {
          void this.finishMirrorSession(record).catch(error => { record.lastError = String(error) })
        }
      }
    }
    this.createSessionId = options.createSessionId ?? randomUUID
    this.wall = new DeviceWallServer(
      (sessionId, signal) => this.status(sessionId, signal),
      (sessionId, deviceId, signal) => this.preview(sessionId, deviceId, signal),
    )
  }

  listDevices(signal: AbortSignal): Promise<readonly WorkBuddyDeviceInfo[]> {
    return this.host.listDevices(signal)
  }

  hasPersistentMirrors(): boolean { return this.host.hasMirrors?.() ?? false }

  async start(signal: AbortSignal): Promise<{ devices: readonly (WorkBuddyDeviceInfo & { mirror?: MirrorStatus })[] }> {
    await this.host.activateMirrors?.(signal)
    return this.displayStatus(signal)
  }

  async displayStatus(signal: AbortSignal): Promise<{ devices: readonly (WorkBuddyDeviceInfo & { mirror?: MirrorStatus })[] }> {
    const devices = await this.host.listDevices(signal)
    return { devices: await Promise.all(devices.map(async device => {
      if (!device.connected || !device.authorized) return device
      const [resolved] = await this.host.resolveDevices([device.id], signal)
      const mirror = resolved ? await this.host.inspectMirror?.(resolved.serial) ?? this.host.mirrorStatus?.(resolved.serial) : undefined
      return { ...device, ...(mirror ? { mirror } : {}) }
    })) }
  }

  async deviceMirror(deviceId: string, close: boolean, signal: AbortSignal, owned: ReadonlySet<string> = new Set()): Promise<unknown> {
    const [device] = await this.host.resolveDevices([deviceId], signal)
    if (!device) throw new Error('opengui: unknown device')
    const owner = this.locks.get(device.serial)
    if (close && owner && !owned.has(owner)) throw new Error('opengui: another task is controlling this phone; cannot close its display')
    if (close) {
      await this.host.closeMirror?.(device.serial)
    } else if (this.host.activateMirrors) await this.host.activateMirrors(signal)
    else await this.host.openMirror?.(device, signal)
    return this.displayStatus(signal)
  }

  retainsMirror(sessionId: string): boolean {
    const record = this.sessions.get(sessionId)
    return record?.state === 'active' && record.purpose === 'mirror' && record.mirrorRequested
      && record.devices.some(item => {
        const phase = this.host.mirrorStatus?.(item.device.serial).phase
        return phase !== undefined && !['idle', 'error'].includes(phase)
      })
  }

  async openSession(deviceIds: readonly string[] | undefined, signal: AbortSignal, purpose: 'control' | 'mirror' = 'control'): Promise<WorkBuddySessionStatus> {
    signal.throwIfAborted()
    if (this.disposed) throw new Error('opengui: runtime is shutting down')
    const devices = await this.host.resolveDevices(deviceIds, signal)
    signal.throwIfAborted()
    if (this.disposed) throw new Error('opengui: runtime is shutting down')
    if ([...this.sessions.values()].filter(item => item.state === 'active').length >= 100) {
      throw new Error('opengui: too many active sessions; close an existing session first')
    }
    if (devices.length < 1 || devices.length > WORKBUDDY_MAX_DEVICES) {
      throw new Error(`opengui: a session must lock one to ${WORKBUDDY_MAX_DEVICES} phones`)
    }
    const conflicts = purpose === 'control' ? devices.filter(device => this.locks.has(device.serial)) : []
    if (conflicts.length > 0) {
      throw new Error(`opengui: ${conflicts.map(device => device.name).join(', ')} is already locked by another session`)
    }
    const id = this.createSessionId()
    const record: SessionRecord = {
      purpose,
      mirrorRequested: false,
      id,
      createdAt: new Date().toISOString(),
      controller: new AbortController(),
      devices: devices.map(device => ({
        device,
        actor: {},
        connectionController: new AbortController(),
        connected: device.connected,
        authorized: device.authorized,
      })),
      state: 'active',
      pending: new Set(),
    }
    for (const item of record.devices) {
      this.host.assignTarget(item.actor, item.device.serial)
      if (purpose === 'control') this.locks.set(item.device.serial, id)
    }
    this.sessions.set(id, record)
    try {
      await this.wall.start()
      signal.throwIfAborted()
      if (this.disposed) throw new Error('opengui: runtime is shutting down')
      if (this.host.activateMirrors) {
        await this.host.activateMirrors(signal)
        record.mirrorRequested = true
      } else if (purpose === 'control' && this.host.openMirror) {
        record.mirrorRequested = true
        const launchSignal = AbortSignal.any([signal, record.controller.signal])
        const results = await Promise.allSettled(record.devices.map(item => this.track(record,
          () => this.host.openMirror!(item.device, launchSignal))))
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) record.lastError = `Automatic mirror unavailable: ${String(failure.reason)}`
        signal.throwIfAborted()
        record.controller.signal.throwIfAborted()
      }
      return this.snapshot(record)
    } catch (error) {
      record.state = 'closed'
      record.closedAt = new Date().toISOString()
      record.controller.abort(error)
      await this.releaseDeviceResources(record)
      this.release(record)
      this.sessions.delete(id)
      throw error
    }
  }

  async observe(sessionId: string, deviceId: string | undefined, signal: AbortSignal): Promise<WorkBuddyObservation> {
    this.confirmations.invalidate(sessionId)
    return this.runPhoneOperation(sessionId, deviceId, signal, (item, combined) => this.host.observe(item.actor, combined))
  }

  async openMirror(sessionId: string, deviceId: string | undefined, signal: AbortSignal): Promise<WorkBuddySessionStatus> {
    const record = this.requireActiveSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    if (!this.host.openMirror) throw new Error('opengui: native mirroring is unavailable')
    await this.host.resolveDevices([item.device.id], signal)
    record.mirrorRequested = true
    try {
      signal.throwIfAborted()
      if (this.host.activateMirrors) await this.host.activateMirrors(signal)
      else await this.track(record, () => this.host.openMirror!(item.device, record.controller.signal))
    } catch (error) {
      record.lastError = String(error)
      await this.finishMirrorSession(record)
      throw error
    }
    return this.snapshot(record)
  }

  async closeMirror(sessionId: string, deviceId: string | undefined): Promise<WorkBuddySessionStatus> {
    const record = this.requireSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    const owner = this.locks.get(item.device.serial)
    if (owner && owner !== record.id) throw new Error('opengui: another task is controlling this phone; cannot close its display')
    if (record.state === 'active') {
      await this.host.closeMirror?.(item.device.serial)
      await this.finishMirrorSession(record)
    }
    return this.snapshot(record)
  }

  private async finishMirrorSession(record: SessionRecord): Promise<void> {
    if (record.state !== 'active' || record.purpose !== 'mirror' || !record.mirrorRequested) return
    const states = record.devices.map(item => this.host.mirrorStatus?.(item.device.serial))
    if (states.some(state => state && !['idle', 'error'].includes(state.phase))) return
    const message = states.find(state => state?.message)?.message
    if (message) record.lastError = message
    await this.closeSession(record.id)
  }

  async act(
    sessionId: string,
    deviceId: string | undefined,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<WorkBuddyObservation | ConfirmationRequired> {
    const sideEffect = this.externalSideEffect(input.externalSideEffect)
    const record = this.requireActiveSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    if (item.needsObservation) throw new Error('opengui: device connection was interrupted; observe again before acting')
    const binding: Record<string, unknown> = { ...input, sessionId, deviceId: item.device.id }
    delete binding.confirmedExternalSideEffect
    delete binding.confirmationRequestId
    if (sideEffect !== 'none') {
      if (!item.observation || item.observation.observationId !== input.observationId) throw new Error('opengui: observe the current phone before requesting confirmation')
      if (input.confirmedExternalSideEffect !== true) {
        if (typeof input.confirmationRequestId !== 'string') {
          const observation = item.observation
          const connectionEpoch = item.connectionEpoch ?? 0
          const isCurrent = (): boolean => !signal.aborted && record.state === 'active' && item.observation === observation && !item.needsObservation && (item.connectionEpoch ?? 0) === connectionEpoch && this.host.status(item.actor).observationId === input.observationId
          const result = await this.confirmations.request(sessionId, binding, item.observation.image.data, isCurrent)
          if (signal.aborted || record.state !== 'active') {
            this.confirmations.invalidate(sessionId, result.requestId)
            throw new Error('opengui: confirmation request cancelled')
          }
          if (!isCurrent()) {
            this.confirmations.invalidate(sessionId, result.requestId)
            throw new Error('opengui: observation changed while creating confirmation; observe again')
          }
          return result
        }
        this.confirmations.consume(input.confirmationRequestId, sessionId, binding)
      }
    }
    const action = { ...input }
    delete action.sessionId
    delete action.deviceId
    delete action.externalSideEffect
    delete action.confirmedExternalSideEffect
    delete action.confirmationRequestId
    if (sideEffect !== 'none') action.verifyCurrentFrame = true
    try {
      return await this.runPhoneOperation(sessionId, deviceId, signal, (item, combined) => this.host.act(item.actor, action, combined))
    } catch (error) {
      record.resultUnknown = true
      this.confirmations.invalidate(sessionId)
      throw error
    }
  }

  async status(sessionId: string, signal: AbortSignal): Promise<WorkBuddySessionStatus> {
    const record = this.requireSession(sessionId)
    try {
      const current = new Map((await this.host.listDevices(signal)).map(device => [device.id, device]))
      for (const item of record.devices) {
        const device = current.get(item.device.id)
        item.connected = device?.connected ?? false
        item.authorized = device?.authorized ?? false
        if (!item.connected || !item.authorized) this.host.onDeviceUnavailable?.(item.device.serial)
        await this.host.inspectMirror?.(item.device.serial)
      }
    } catch (error) {
      record.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
    return this.snapshot(record)
  }

  private snapshot(record: SessionRecord): WorkBuddySessionStatus {
    for (const item of record.devices) {
      if (this.host.mirrorStatus?.(item.device.serial).ready) item.displayEstablished = true
    }
    return {
      activity: record.state !== 'active' ? 'ended'
        : record.resultUnknown ? 'result_unknown'
        : this.confirmations.pending(record.id) ? 'waiting_for_confirmation'
        : record.devices.some(item => item.needsObservation) ? 'paused'
        : record.devices.some(item => this.host.inspectMirror && !item.displayEstablished) ? 'waiting_for_display' : 'ready',
      sessionId: record.id,
      purpose: record.purpose,
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
          ...(this.host.mirrorStatus ? { mirror: this.host.mirrorStatus(device.serial) } : {}),
          ...(runtime.observationId === undefined ? {} : { observationId: runtime.observationId }),
        }
      }),
    }
  }

  async cancel(sessionId: string): Promise<WorkBuddySessionStatus> {
    this.confirmations.invalidate(sessionId)
    const record = this.requireSession(sessionId)
    if (record.state === 'active') {
      record.state = 'cancelled'
      record.closedAt = new Date().toISOString()
      record.controller.abort(new Error('opengui: session cancelled'))
    }
    await this.cleanup(record)
    this.pruneClosedSessions()
    return this.snapshot(record)
  }

  async closeSession(sessionId: string): Promise<WorkBuddySessionStatus> {
    this.confirmations.invalidate(sessionId)
    const record = this.requireSession(sessionId)
    if (record.state === 'active') record.controller.abort(new Error('opengui: session closed'))
    record.state = 'closed'
    record.closedAt ??= new Date().toISOString()
    await this.cleanup(record)
    this.pruneClosedSessions()
    return this.snapshot(record)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.allSettled([...this.sessions.keys()].map(id => this.closeSession(id)))
    await this.wall.close()
    await this.confirmations.close()
    await this.host.dispose()
  }

  private async preview(sessionId: string, deviceId: string, signal: AbortSignal): Promise<Buffer> {
    const record = this.requireActiveSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    return this.track(record, () => this.host.preview(item.device, AbortSignal.any([record.controller.signal, signal])))
  }

  private async runPhoneOperation(
    sessionId: string,
    deviceId: string | undefined,
    signal: AbortSignal,
    operation: (item: SessionDevice, combined: AbortSignal) => Promise<RawPhoneObservation>,
  ): Promise<WorkBuddyObservation> {
    const record = this.requireActiveSession(sessionId)
    if (record.purpose === 'mirror') throw new Error('opengui: mirror-only sessions cannot capture model images or control phones')
    const item = this.resolveDevice(record, deviceId)
    const combined = AbortSignal.any([record.controller.signal, item.connectionController.signal, signal])
    const connectionEpoch = item.connectionEpoch ?? 0
    try {
      combined.throwIfAborted()
      if (this.host.inspectMirror && !item.displayEstablished) {
        const display = await this.host.inspectMirror(item.device.serial)
        if (!display.ready) {
          throw new Error(`opengui: waiting_for_display: ${display.message ?? display.phase}; initial display has not been verified; retry opening the window before continuing`)
        }
        item.displayEstablished = true
      }
      this.confirmations.invalidate(record.id)
      const value = await this.track(record, () => operation(item, combined))
      combined.throwIfAborted()
      if ((item.connectionEpoch ?? 0) !== connectionEpoch) {
        this.host.invalidate?.(item.actor)
        throw new Error('opengui: device disconnected during operation; outcome may be unknown; observe again')
      }
      item.observation = value
      this.confirmations.invalidate(record.id)
      item.needsObservation = false
      record.resultUnknown = false
      return this.publicObservation(record.id, item.device.id, value)
    } catch (error) {
      record.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  private publicObservation(sessionId: string, deviceId: string, value: RawPhoneObservation): WorkBuddyObservation {
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

  private async track<T>(record: SessionRecord, operation: () => Promise<T>): Promise<T> {
    const pending = Promise.resolve().then(() => {
      record.controller.signal.throwIfAborted()
      return operation()
    })
    record.pending.add(pending)
    try { return await pending } finally { record.pending.delete(pending) }
  }

  /** Keep leases until in-flight work and owned resource cleanup have both drained. */
  private cleanup(record: SessionRecord): Promise<void> {
    record.cleanup ??= (async () => {
      await Promise.allSettled([...record.pending])
      await this.releaseDeviceResources(record)
      this.release(record)
    })()
    return record.cleanup
  }

  private async releaseDeviceResources(record: SessionRecord): Promise<void> {
    if (record.purpose === 'mirror') return
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
    for (const record of closed.slice(0, Math.max(0, closed.length - 100))) {
      this.sessions.delete(record.id)
      this.wall.forget(record.id)
    }
  }
}
