import { prepareApk, validatePreparedApk, type ApkRecord, type PreparedApk } from './apk.ts'
import { environmentSpec, environmentReady, environmentSetupAllowed, initialEnvironment, inspectAndroidEnvironment, type EnvironmentSpec, type EnvironmentState } from './environment.ts'
import type { TaskProgress } from './todos.ts'
import { ViewerServer, type ViewerStreams } from './viewer.ts'
import { connectionDiagnostic, inspectUsbInterfaces, type ConnectionDiagnostic, type UsbInterfaces } from './connection-diagnostics.ts'
import { ScrcpyVideoStreams } from './scrcpy-stream.ts'
import { createHash, randomUUID } from 'node:crypto'
import { waitForEvent, type ToolProgress } from './task-events.ts'
import { join } from 'node:path'
import { HUMAN_CONTROL_WAIT_MS, consoleKey, viewerPort, workbuddyStateDir } from './state.ts'
import { DeviceWallServer } from './wall.ts'
import {
  assertAdbReady,
  managedAdbPath,
  parseFocusedEditorSelection,
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
import { encodePhonePreview, encodeWorkBuddyPhoneScreenshot } from './screenshot.ts'
import { NativeMirror, type MirrorStatus } from './mirror.ts'
import { errorInfo, OpenGuiError, retryRead } from './errors.ts'
import type { BoardAction, CommentReview, ContentKind, HumanHandoff, ConnectionRecovery } from './workbench.ts'
import { TaskStore } from './task-store.ts'
import { CoreMateClient } from './coremate-client.ts'
import { runConfiguredPhone, transientModelFailure } from './configured-runner.ts'
import { actionLabel, deviceActionEvent, observationLabel } from './trace-labels.ts'
import { retestComparison, testSummary, type TestCaseCommand } from './test-cases.ts'
import { commentSummary, createCommentBudget, type CommentBudget, type CommentBudgetInput } from './comments.ts'
import { deviceSelectionStatus, type DeviceInfo, type DeviceChoice } from './device-info.ts'
import { deviceIdentity } from './device-identity.ts'
import { inputDiagnostic, isInputAction, type InputDiagnostic } from './input-diagnostics.ts'
import { requestsPreSubmitStop, violatesPreSubmitStop, requiresPreSubmitClassification, requiresContentClassification } from './stop-policy.ts'
import { IosSimulatorHost } from './ios-simulator.ts'
import { CombinedPhoneHost } from './phone-host.ts'
import { AndroidEmulatorManager } from './android-emulator.ts'
import { connectionHint } from './connection-status.ts'
import { BASE_EXECUTION_BUDGET, MAX_STORED_EXECUTION_BUDGET, executionBudgetInput, requestedOperationLimit, type ExecutionBudgetInput } from './execution-budget.ts'

export const WORKBUDDY_MAX_DEVICES = 4
export const WORKBUDDY_MAX_OPERATIONS = BASE_EXECUTION_BUDGET
const COMMAND_TIMEOUT_MS = 15_000
// Longest a control lease waits for a person (takeover, review, update approval) before release.
const USER_WAIT_LIMIT_MS = 2 * 60 * 60_000

export interface WorkBuddyDeviceInfo extends DeviceInfo {}

export interface ResolvedWorkBuddyDevice extends WorkBuddyDeviceInfo {
  readonly serial: string
}

export interface WorkBuddyPhoneHost {
  readonly videoStreams?: ViewerStreams
  activateMirrors?(signal: AbortSignal): Promise<void>
  inspectMirror?(serial: string): Promise<MirrorStatus>
  hasMirrors?(): boolean
  invalidate?(actor: object): void
  onDeviceUnavailable?: (serial: string) => void
  openMirror?(device: ResolvedWorkBuddyDevice, signal: AbortSignal): Promise<void>
  closeMirror?(serial: string): Promise<void>
  mirrorStatus?(serial: string): MirrorStatus
  onMirrorEnded?: (serial: string) => void
  listDevices(signal: AbortSignal, refresh?: boolean): Promise<readonly WorkBuddyDeviceInfo[]>
  diagnoseConnection?(signal: AbortSignal): Promise<ConnectionDiagnostic>
  resolveDevices(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]>
  resolveArchivedDevices?(devices: readonly { id: string; serial: string }[], signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]>
  installApk?(device: ResolvedWorkBuddyDevice, apk: PreparedApk, signal: AbortSignal): Promise<void>
  checkEnvironment?(device: ResolvedWorkBuddyDevice, spec: EnvironmentSpec, signal: AbortSignal): Promise<EnvironmentState>
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
  readonly inspectUsb?: (signal: AbortSignal) => Promise<UsbInterfaces>
}


/** Local USB/ADB Host adapter shared by the WorkBuddy MCP and CLI transports. */
export class LocalAdbPhoneHost implements WorkBuddyPhoneHost {
  readonly videoStreams: ScrcpyVideoStreams
  onDeviceUnavailable?: (serial: string) => void
  private readonly lifetime = new AbortController()
  private watching: ReturnType<typeof setTimeout> | undefined
  private readonly connectedMirrors = new Set<string>()
  private reconciliation: Promise<void> = Promise.resolve()
  discoveryError: string | undefined
  onMirrorEnded?: (serial: string) => void
  private readonly mirror: NativeMirror
  private readonly path: string
  private readonly repairAdbPermissions: boolean
  private readonly timeoutMs: number
  private readonly fleet: DeviceFleet
  private readonly inspectUsb: (signal: AbortSignal) => Promise<UsbInterfaces>
  private readonly controller: PhoneController
  private readonly textInput: ScrcpyTextInput
  private readonly forwardRegistry: OwnedForwardRegistry
  private readonly recovery: Promise<unknown>
  private readonly previewPermits = new AsyncSemaphore(2)
  private readonly metadataPermits = new AsyncSemaphore(2)
  private readonly metadata = new Map<string, { expiresAt: number; data: { manufacturer?: string; osVersion?: string; sdk?: number } }>()

  constructor(options: LocalAdbPhoneHostOptions = {}) {
    this.inspectUsb = options.inspectUsb ?? inspectUsbInterfaces
    const configuredAdbPath = (options.adbPath ?? process.env.OPENGUI_ADB_PATH)?.trim()
    this.path = managedAdbPath(configuredAdbPath)
    this.repairAdbPermissions = !configuredAdbPath
    this.timeoutMs = options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS
    const run = (args: readonly string[], signal: AbortSignal, buffer = false): Promise<string | Buffer> => this.run(args, signal, buffer)
    const stateDir = workbuddyStateDir(options.stateDir)
    let identity: Promise<(serial: string) => string> | undefined
    let identify: ((serial: string) => string) | undefined
    this.fleet = new DeviceFleet(async signal => {
      identify = await (identity ??= deviceIdentity(stateDir))
      signal.throwIfAborted()
      return parseDevices(String(await retryRead(() => run(['devices', '-l'], signal), signal)))
    }, serial => identify!(serial))
    this.forwardRegistry = new OwnedForwardRegistry(join(stateDir, 'owned-forwards.json'))
    const installer = new ScrcpyInstaller({ cacheDir: join(stateDir, 'scrcpy') })
    this.mirror = new NativeMirror({ adbPath: this.path, installer, onEnded: serial => this.onMirrorEnded?.(serial) })
    this.videoStreams = new ScrcpyVideoStreams({ adbPath: () => this.path, runAdb: (args, signal) => run(args, signal), installer, forwardRegistry: this.forwardRegistry, control: true })
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
      pasteUnicode: (serial, text, signal) => this.afterClipboard(serial, signal, () => this.textInput.paste(serial, text, signal)),
      replaceUnicode: (serial, text, signal) => this.afterClipboard(serial, signal, () => this.textInput.replace(serial, text, signal)),
      readFocusedText: (serial, signal) => this.afterClipboard(serial, signal, () => this.textInput.readFocusedText(serial, signal, async probe => {
        // Two consistent zero-length selections after select-all, read a moment apart.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) await new Promise(resolve => setTimeout(resolve, 150))
          const selection = parseFocusedEditorSelection(String(await run(['-s', serial, 'shell', 'dumpsys', 'input_method'], probe)))
          if (!selection || selection.start !== 0 || selection.end !== 0) return false
        }
        return true
      })),
      encodeScreenshot: encodeWorkBuddyPhoneScreenshot,
      maxOperations: () => MAX_STORED_EXECUTION_BUDGET,
    })
  }

  /**
   * Android 13+ previews every clipboard write in a floating system overlay, which would show
   * the user's restored clipboard in evidence screenshots and make the next action see a
   * changed screen. Dismiss it (system dialogs only; the keyboard stays) before capturing.
   */
  private async afterClipboard<T>(serial: string, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    try { return await operation() } finally {
      if (!signal.aborted) {
        try {
          if (await this.sdkLevel(serial, signal) >= 33) {
            // The preview appears a moment after the write: wait for it, dismiss it, then wait for it to go.
            const overlay = async () => /Window\{[^}]*ClipboardOverlay/u.test(String(await this.run(['-s', serial, 'shell', 'dumpsys', 'window', 'windows'], signal).catch(() => '')))
            const deadline = Date.now() + 1500
            let seen = false
            while (!signal.aborted && Date.now() < deadline + (seen ? 2000 : 0)) {
              const present = await overlay()
              if (present && !seen) { seen = true; await this.run(['-s', serial, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS'], signal) }
              if (seen && !present) break
              await new Promise(resolve => setTimeout(resolve, 150))
            }
          }
        } catch { /* Best effort: the regular screen-change guard still protects the next action. */ }
      }
    }
  }

  private readonly sdkLevels = new Map<string, number>()
  private async sdkLevel(serial: string, signal: AbortSignal): Promise<number> {
    const cached = this.sdkLevels.get(serial)
    if (cached !== undefined) return cached
    const sdk = Number(String(await this.run(['-s', serial, 'shell', 'getprop', 'ro.build.version.sdk'], signal)).trim())
    if (Number.isSafeInteger(sdk)) this.sdkLevels.set(serial, sdk)
    return Number.isSafeInteger(sdk) ? sdk : 0
  }

  async listDevices(signal: AbortSignal, refresh = false): Promise<readonly WorkBuddyDeviceInfo[]> {
    const devices = await this.fleet.inspect(signal)
    return Promise.all(devices.map(async device => {
      const serial = this.fleet.resolveInspected(device.id)
      if (!serial || !device.authorized) return this.publicDevice(device)
      const cached = this.metadata.get(device.id)
      if (!refresh && cached && cached.expiresAt > Date.now()) return { ...this.publicDevice(device), ...cached.data }
      const release = await this.metadataPermits.acquire(signal)
      try {
        const combined = AbortSignal.any([signal, AbortSignal.timeout(2000)])
        const properties = ['ro.product.manufacturer', 'ro.build.version.release', 'ro.build.version.sdk']
        const values = await Promise.allSettled(properties.map(property => this.run(['-s', serial, 'shell', 'getprop', property], combined)))
        signal.throwIfAborted()
        const value = (index: number) => { const result = values[index]!; return result.status === 'fulfilled' ? String(result.value).trim().replace(/[\u0000-\u001f]/gu, '').slice(0, 64) : '' }
        const manufacturer = value(0), osVersion = value(1), sdk = /^\d{1,3}$/u.test(value(2)) ? Number(value(2)) : undefined
        const data = { ...(manufacturer ? { manufacturer } : {}), ...(osVersion ? { osVersion } : {}), ...(sdk !== undefined ? { sdk } : {}) }
        if (this.metadata.size >= 128) this.metadata.delete(this.metadata.keys().next().value!)
        this.metadata.set(device.id, { expiresAt: Date.now() + (osVersion && sdk ? 60_000 : 5000), data })
        return { ...this.publicDevice(device), ...data }
      } finally { release() }
    }))
  }

  async diagnoseConnection(signal: AbortSignal): Promise<ConnectionDiagnostic> {
    // Inspection must not update the fleet's selection or allocate device identities.
    const readUsbAdb = async () => parseDevices(String(await this.run(['devices', '-l'], signal)))
      .filter(device => !device.serial.startsWith('emulator-') && !device.serial.includes(':') && !device.serial.includes('_adb-tls-'))
      .map(device => ({ connection: 'usb' as const, state: device.state, connected: device.state === 'device' || device.state === 'unauthorized', authorized: device.state === 'device' }))
    const results = await Promise.allSettled([readUsbAdb(), this.inspectUsb(signal)])
    signal.throwIfAborted()
    const adb = results[0], usb = results[1]
    return connectionDiagnostic(adb.status === 'fulfilled' ? adb.value : undefined, usb.status === 'fulfilled' ? usb.value : { status: 'unknown' })
  }

  async inspectDevices(signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]> {
    const devices = await this.listDevices(signal)
    return devices.map(device => {
      const serial = this.fleet.resolveInspected(device.id)
      if (!serial) throw new Error('opengui: discovery identity unavailable')
      return { ...device, serial }
    })
  }

  async resolveDevices(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]> {
    const discovered = await this.inspectDevices(signal)
    const snapshot = discovered.filter(device => device.connected && device.authorized)
    let ids = [...new Set(deviceIds ?? [])]
    if (ids.length === 0) {
      if (snapshot.length === 0) {
        if (discovered.some(device => device.connected && !device.authorized)) throw new OpenGuiError('device_unauthorized', 'opengui: accept the USB debugging prompt on the phone')
        throw new OpenGuiError('device_offline', 'opengui: no Android device is connected', 'not_executed', 'wait')
      }
      if (snapshot.length > 1) {
        throw new Error('opengui: multiple authorized phones are connected; pass one to four deviceIds from opengui_list_devices')
      }
      ids = [snapshot[0]!.id]
    }
    if (ids.length > WORKBUDDY_MAX_DEVICES) throw new Error(`opengui: a session can lock at most ${WORKBUDDY_MAX_DEVICES} phones`)
    return ids.map((id) => {
      const device = snapshot.find(item => item.id === id)
      if (!device) {
        if (discovered.some(item => item.id === id && item.connected && !item.authorized)) throw new OpenGuiError('device_unauthorized', 'opengui: selected phone requires USB authorization')
        throw new OpenGuiError('device_offline', 'opengui: selected phone is offline', 'not_executed', 'wait')
      }
      if (device.sdk !== undefined && device.sdk < 21) throw new OpenGuiError('device_version_conflict', 'opengui: Android 5.0 or newer is required', 'not_executed', 'stop')
      return device
    })
  }

  async resolveArchivedDevices(devices: readonly { id: string; serial: string }[], signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]> {
    const discovered = await this.inspectDevices(signal)
    return devices.map(original => {
      const device = discovered.find(current => current.serial === original.serial)
      if (!device?.connected) throw new OpenGuiError('device_offline', 'opengui: reconnect the original archived phone before recovery', 'not_executed', 'wait')
      if (!device.authorized) throw new OpenGuiError('device_unauthorized', 'opengui: the original archived phone requires USB authorization', 'not_executed', 'wait')
      if (device.sdk !== undefined && device.sdk < 21) throw new OpenGuiError('device_version_conflict', 'opengui: Android 5.0 or newer is required')
      return device
    })
  }

  async installApk(device: ResolvedWorkBuddyDevice, apk: PreparedApk, signal: AbortSignal): Promise<void> {
    const fresh = (await this.inspectDevices(signal)).find(item => item.id === device.id && item.serial === device.serial)
    if (!fresh?.connected || !fresh.authorized) throw new OpenGuiError('device_unavailable', 'opengui: reconnect and authorize the original phone')
    const sdkText = String(await this.run(['-s', device.serial, 'shell', 'getprop', 'ro.build.version.sdk'], signal)).trim()
    if (!/^\d{1,3}$/u.test(sdkText) || Number(sdkText) < Math.max(21, apk.record.minSdk)) throw new OpenGuiError('apk_sdk_incompatible', 'opengui: APK requires a known compatible Android SDK')
    const user = String(await this.run(['-s', device.serial, 'shell', 'am', 'get-current-user'], signal)).trim()
    if (!/^\d{1,5}$/u.test(user)) throw new OpenGuiError('apk_user_unknown', 'opengui: current Android user must be known before installation')
    const args = ['-s', device.serial, 'install', '--user', user, '-r', ...(apk.record.testOnly && apk.record.allowTestApk ? ['-t'] : []), apk.path]
    await assertAdbReady(this.path, { repairPermissions: this.repairAdbPermissions })
    signal.throwIfAborted()
    try {
      const output = String(await runAdb(this.path, args, { signal, timeoutMs: 60_000, encoding: 'utf8' }))
      if (!/^Success\s*$/mu.test(output) || /Failure\s*\[/u.test(output)) {
        const code = output.match(/\bINSTALL_FAILED_[A-Z0-9_]+\b/u)?.[0]
        throw new OpenGuiError(code ?? 'apk_install_unconfirmed', 'opengui: APK installation did not return a confirmed success', code ? 'not_executed' : 'outcome_unknown')
      }
    } catch (error) {
      if (error instanceof OpenGuiError) throw error
      const code = String(error).match(/\bINSTALL_FAILED_[A-Z0-9_]+\b/u)?.[0]
      throw new OpenGuiError(code ?? 'apk_install_unknown', code ? `opengui: APK installation failed (${code})` : 'opengui: installation was interrupted or unconfirmed; inspect the original phone, do not replay', code ? 'not_executed' : 'outcome_unknown', 'stop')
    }
  }

  async checkEnvironment(device: ResolvedWorkBuddyDevice, spec: EnvironmentSpec, signal: AbortSignal): Promise<EnvironmentState> {
    const fresh = (await this.inspectDevices(signal)).find(item => item.id === device.id && item.serial === device.serial)
    if (!fresh?.connected || !fresh.authorized) throw new OpenGuiError('device_unavailable', 'opengui: reconnect and authorize the original phone')
    return inspectAndroidEnvironment(fresh, spec, async args => String(await this.run(['-s', fresh.serial, ...args], signal)), signal)
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
      void this.scheduleReconciliation(false).catch(error => {
        // Discovery failure is not evidence that every individual phone disconnected.
        this.discoveryError = String(error)
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
    const devices = await this.inspectDevices(this.lifetime.signal)
    this.discoveryError = undefined
    const online = new Set<string>()
    for (const device of devices.filter(d => d.connected && d.authorized)) {
      online.add(device.serial)
      try {
        if (explicit || !this.connectedMirrors.has(device.serial)) {
          await this.mirror.open(device.serial, device.name, this.lifetime.signal)
        }
        await this.mirror.inspect(device.serial)
      } catch (error) {
        this.discoveryError = `Display ${device.name}: ${String(error)}`
      }
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
    signal.throwIfAborted()
    // Once accepted, the device display belongs to the broker, not the caller's turn.
    await this.mirror.open(device.serial, device.name, this.lifetime.signal)
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
    const serial = this.fleet.resolveInspected(device.id)
    return {
      os: 'android', connection: device.connection, ...(serial ? { serialSuffix: serial.slice(-4) } : {}),
      id: device.id,
      name: device.label,
      ...(device.model === undefined ? {} : { model: device.model }),
      state: device.state,
      connected: device.connected,
      authorized: device.authorized,
    }
  }

  /** The managed ADB for the emulator manager: listing emulators and waiting for boot. */
  async adb(args: readonly string[], signal: AbortSignal): Promise<string> { return String(await this.run(args, signal)) }

  private async run(args: readonly string[], signal: AbortSignal, buffer = false): Promise<string | Buffer> {
    await assertAdbReady(this.path, { repairPermissions: this.repairAdbPermissions })
    return runAdb(this.path, args, {
      signal,
      timeoutMs: this.timeoutMs,
      encoding: buffer ? 'buffer' : 'utf8',
    })
  }
}

export type ExternalSideEffect = 'none' | 'submit' | 'send' | 'publish' | 'purchase' | 'delete'
export type WorkBuddySessionState = 'active' | 'cancelled' | 'closed'

export interface ControlTask {
  stopBeforeSubmit?: true | undefined
  scenario?: 'general' | 'testing' | 'comments' | undefined
  commentBudget?: CommentBudgetInput | undefined
  viewerOwner?: string
  readonly operations: Map<string, number>
  readonly displaysEstablished: Set<string>
  readonly actors: Map<string, object>
  selectedDeviceIds?: readonly string[]
  objective?: string | undefined
  successCriteria?: string | undefined
  /** The person's original chat request (from the host prompt hook), shown before starting. */
  request?: string | undefined
  /** Set once the person clicked 开始执行 for this task. */
  startConfirmed?: boolean
}
export const createControlTask = (): ControlTask => ({ operations: new Map(), displaysEstablished: new Set(), actors: new Map() })
export interface SessionResult {
  outcome: 'completed' | 'blocked' | 'unknown' | 'cancelled' | 'stopped'
  summary?: string
  evidenceObservationIds?: readonly string[]
}
export interface OpenSessionOptions {
  onProgress?: ToolProgress | undefined
  executionBudget?: ExecutionBudgetInput | undefined
  stopBeforeSubmit?: true | undefined
  environment?: unknown
  commentBudget?: CommentBudgetInput | undefined
  scenario?: 'general' | 'testing' | 'comments' | undefined
  configuredRunner?: boolean
  resumeTaskId?: string | undefined
  owner?: string
  viewerId?: string | undefined
  task?: ControlTask
  objective?: string | undefined
  successCriteria?: string | undefined
  skipActivation?: boolean
}

interface SessionDevice {
  readonly device: ResolvedWorkBuddyDevice
  readonly actor: object
  connected: boolean
  authorized: boolean
  observation?: RawPhoneObservation
  needsObservation?: boolean
  resultUnknown?: boolean
  connectionEpoch?: number
  connectionController: AbortController
  /** Initial display verification is sticky for this task, not a continuous visibility gate. */
  displayEstablished?: boolean
}

interface SessionRecord {
  apk?: PreparedApk
  apkBusy?: boolean
  commentTimer?: ReturnType<typeof setTimeout>
  configured?: boolean
  runner?: Promise<void>
  lastExecuteEvent?: string
  controlMode: 'agent' | 'paused' | 'manual' | 'reconciling'
  /** Set only by the workbench pause button; a connection recheck must not undo it. */
  /** Start of the current wait for a person, bounding how long the lease may idle. */
  awaitingUserSince?: number
  controlController: AbortController
  viewerId?: string
  readonly task: ControlTask
  lastActivity: number
  leaseTimer?: ReturnType<typeof setTimeout>
  result?: SessionResult
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
  readonly event?: { cursor: string; changed: boolean; timedOut: boolean; message: string; delivery: 'progress' | 'event_wait' }
  readonly connectionRecovery?: ConnectionRecovery
  readonly stopBeforeSubmit?: true | undefined
  readonly inputDiagnostic?: InputDiagnostic
  readonly executionBudget?: { operationLimit: number; inferenceLimit: number; inferenceCount: number }
  readonly replacementPending?: boolean
  readonly apk?: ApkRecord
  readonly environment?: EnvironmentState
  readonly comments?: ReturnType<typeof commentSummary>
  readonly handoff?: HumanHandoff
  readonly reportExports?: { md?: string; pdf?: string; docx?: string; chatMarkdown?: string; error?: string } | undefined
  readonly tests?: ReturnType<typeof testSummary> & { activeCaseId?: string | undefined }
  readonly executor?: { mode: 'workbuddy' | 'configured'; model?: string; started: boolean }
  readonly controlMode?: string
  readonly reviews?: readonly CommentReview[]
  readonly progress?: TaskProgress | undefined
  readonly activity: 'waiting_for_display' | 'ready' | 'paused' | 'ended' | 'result_unknown'
  readonly purpose: 'control' | 'mirror'
  readonly sessionId: string
  readonly state: WorkBuddySessionState
  readonly createdAt: string
  readonly closedAt?: string
  readonly lastError?: string
  readonly result?: SessionResult
  readonly objective?: string
  readonly successCriteria?: string
  readonly leaseExpiresAt: string
  readonly deviceWallUrl: string
  readonly devices: readonly {
    id: string
    name: string
    model?: string
    connected: boolean
    authorized: boolean
    operationCount: number
    remainingOperations: number
    observationId?: string
    mirror?: MirrorStatus
  }[]
}

export interface WorkBuddyObservation {
  readonly inputRead?: RawPhoneObservation['inputRead']
  readonly progress?: TaskProgress | undefined
  readonly capturedAt?: string
  readonly settled?: boolean
  readonly connectionEpoch?: number
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
  readonly account?: CoreMateClient
  /** One-click Android emulator; created for the real local host only. */
  readonly emulators?: AndroidEmulatorManager
  readonly taskStore?: TaskStore
  readonly viewers?: ViewerServer
  readonly host?: WorkBuddyPhoneHost
  readonly createSessionId?: () => string
  readonly leaseMs?: number
  readonly now?: () => number
  /** Hold new tasks for an explicit 开始执行 in the workbench (default on for the real host). */
  readonly confirmStart?: boolean
}

/** Stateful session adapter consumed by both WorkBuddy transports. */
export class WorkBuddyOpenGuiService {
  private readonly confirmStart: boolean
  private readonly leaseMs: number
  private readonly now: () => number
  private readonly host: WorkBuddyPhoneHost
  private readonly createSessionId: () => string
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly locks = new Map<string, string>()
  private readonly viewerTasks = new Map<string, ControlTask>()
  readonly viewers: ViewerServer
  readonly account: CoreMateClient | undefined
  readonly emulators: AndroidEmulatorManager | undefined
  private readonly wall: DeviceWallServer
  private disposed = false

  constructor(options: WorkBuddyOpenGuiServiceOptions = {}) {
    this.leaseMs = options.leaseMs ?? 10 * 60_000
    this.confirmStart = options.confirmStart ?? !options.host
    this.now = options.now ?? Date.now
    const android = options.host ? undefined : new LocalAdbPhoneHost()
    this.host = options.host ?? new CombinedPhoneHost(android!, new IosSimulatorHost())
    this.emulators = options.emulators ?? (android ? new AndroidEmulatorManager({ stateDir: workbuddyStateDir(), runAdb: (args, signal) => android.adb(args, signal) }) : undefined)
    this.account = options.account ?? options.viewers?.account ?? (options.host ? undefined : new CoreMateClient(workbuddyStateDir()))
    this.viewers = options.viewers ?? new ViewerServer(this.host.videoStreams ?? {
      async prepare() { throw new Error('video_unavailable') },
      async subscribe() { throw new Error('video_unavailable') }, async dispose() {},
    }, this.now, options.taskStore ?? (options.host ? undefined : new TaskStore(join(workbuddyStateDir(), 'reports'))), this.account, options.host ? {} : { port: viewerPort(), consoleKey: consoleKey() })
    this.host.onDeviceUnavailable = serial => {
      const id = this.locks.get(serial)
      const record = id ? this.sessions.get(id) : undefined
      const item = record?.devices.find(item => item.device.serial === serial)
      if (item) {
        item.connected = false
        item.connectionController.abort(new OpenGuiError('device_offline', 'opengui: original device disconnected or lost authorization; recheck before observing again', 'outcome_unknown', 'wait'))
        item.connectionController = new AbortController()
        this.host.invalidate?.(item.actor)
        item.needsObservation = true
        delete item.observation
        item.connectionEpoch = (item.connectionEpoch ?? 0) + 1
        if (record?.viewerId && record.state === 'active' && record.purpose === 'control') {
          const board = this.viewers.board(record.viewerId)
          if (record.controlMode !== 'manual') record.controlMode = 'paused'
          board.control = record.controlMode
          record.controlController.abort(new OpenGuiError('device_offline', 'opengui: original device disconnected or lost authorization; wait for a human connection recheck', 'outcome_unknown', 'wait'))
          try {
            board.blockConnection(item.device.id)
            board.invalidateEnvironment()
            this.viewers.pauseNodes(record.viewerId)
            this.viewers.awaitUser(record.viewerId, true)
          } catch { record.lastError = 'connection_recovery_save_failed'; if (board.environment) board.environment.stale = true }
        }
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
    this.viewers.setBoardHandler((id, action) => this.boardAction(id, action))
    this.viewers.setBudgetHandler((id, additional, operationLimit, inferenceLimit) => this.extendBudget(id, additional, operationLimit, inferenceLimit))
    this.viewers.setDeviceHandlers((signal, refresh, viewerId) => this.deviceChoices(signal, refresh, viewerId), (id, deviceId) => this.selectViewerDevice(id, deviceId))
    this.viewers.setStartHandler((id, deviceId, request, comments) => this.startViewerTask(id, deviceId, request, comments))
    this.viewers.setNewTaskHandler(async () => {
      throw new Error('host_task_required')
    })
    this.viewers.setEmulatorHandlers(
      signal => this.emulators?.status(signal) ?? Promise.resolve({ supported: false, reason: '当前环境不支持一键安装模拟器', avds: [] }),
      input => this.emulatorAction(input),
    )
    this.viewers.setPreviewHandlers((id, deviceId, signal) => this.previewChoice(id, deviceId, signal), async (id, deviceId, signal) => encodePhonePreview(await this.host.preview(await this.previewChoice(id, deviceId, signal), signal)))
    this.viewers.setConnectionDiagnosticHandler(signal => this.host.diagnoseConnection?.(signal) ?? Promise.resolve(connectionDiagnostic(undefined, { status: 'unknown' })))
    this.wall = new DeviceWallServer(
      (sessionId, signal) => this.status(sessionId, signal),
      (sessionId, deviceId, signal) => this.preview(sessionId, deviceId, signal),
    )
  }

  async openViewer(deviceIds: readonly string[] | undefined, signal: AbortSignal, options: OpenSessionOptions = {}): Promise<Awaited<ReturnType<ViewerServer['open']>>> {
    const principal = this.account?.scope ?? 'local'
    const owner = options.owner ?? options.task?.viewerOwner ?? 'local'
    const task = options.task ?? [...this.viewerTasks.values()].find(task => task.viewerOwner === owner) ?? createControlTask()
    task.viewerOwner = owner
    // A new task opens the workbench first: the person signs in, confirms the request, model and
    // device, then clicks 开始执行. Nothing is bound or prepared before that decision.
    if (this.confirmStart && !options.resumeTaskId && !task.startConfirmed && !task.selectedDeviceIds?.length && (options.objective ?? task.objective)) {
      const choices = (await this.deviceChoices(signal)).filter(device => device.selectable)
      const preferred = this.account?.preferredDeviceId
      const suggested = deviceIds?.find(id => choices.some(device => device.id === id))
        ?? (preferred && choices.some(device => device.id === preferred) ? preferred : choices.length === 1 ? choices[0]!.id : undefined)
      const opened = await this.openGuide(signal, { ...options, task })
      this.viewers.requireStart(opened.viewerId, suggested, task.request)
      return { ...await this.viewers.status(opened.viewerId, owner, 0, signal), workbenchUrl: opened.workbenchUrl }
    }
    const requested = deviceIds ?? task.selectedDeviceIds
    if (!requested && !options.resumeTaskId) {
      const available = (await this.deviceChoices(signal)).filter(device => device.selectable)
      if (principal !== (this.account?.scope ?? 'local')) throw new Error('account_changed: repeat device selection under the current account')
      const preferred = this.account?.preferredDeviceId
      const selected = preferred ? available.find(device => device.id === preferred) : available.length === 1 ? available[0] : undefined
      if (!selected) {
        const opened = await this.openGuide(signal, { ...options, task })
        this.viewers.requestDeviceSelection(opened.viewerId)
        return { ...await this.viewers.status(opened.viewerId, owner, 0, signal), workbenchUrl: opened.workbenchUrl }
      }
      deviceIds = [selected.id]
    }
    const saved = options.resumeTaskId ? this.viewers.recoveryTask(options.resumeTaskId) : undefined
    const devices = saved
      ? await (this.host.resolveArchivedDevices ? this.host.resolveArchivedDevices(saved.devices, signal) : this.host.resolveDevices(saved.devices.map(d => d.id), signal))
      : await this.host.resolveDevices(deviceIds ?? task.selectedDeviceIds, signal)
    if (saved && deviceIds && (deviceIds.length !== devices.length || deviceIds.some(id => !saved.devices.some(d => d.id === id) && !devices.some(d => d.id === id)))) throw new Error('device_frozen')
    if (task.selectedDeviceIds && (devices.length !== task.selectedDeviceIds.length || devices.some(d => !task.selectedDeviceIds!.includes(d.id)))) throw new Error('device_frozen')
    if (principal !== (this.account?.scope ?? 'local')) throw new Error('account_changed: repeat device selection under the current account')
    if (saved) {
      if ((task.objective && task.objective !== saved.board.objective) || (options.objective && options.objective !== saved.board.objective) || (task.successCriteria && task.successCriteria !== saved.board.successCriteria) || (options.successCriteria && options.successCriteria !== saved.board.successCriteria)) throw new Error('task_goal_frozen')
      task.objective = saved.board.objective; task.successCriteria = saved.board.successCriteria
    }
    const opened = await this.viewers.open(owner, devices, signal, options.resumeTaskId, true)
    if (principal !== (this.account?.scope ?? 'local')) {
      this.viewers.closeViewer(opened.viewerId, owner)
      this.viewers.endTask(opened.viewerId)
      throw new Error('account_changed: repeat device selection under the current account')
    }
    task.selectedDeviceIds ??= devices.map(d => d.id)
    this.initializeViewer(opened.viewerId, task, options)
    if (devices.length === 1 && !['error', 'closed'].includes(opened.state)) this.rememberDevice(opened.viewerId, devices[0]!.id, principal)
    if (options.resumeTaskId) {
      task.objective = opened.board.objective
      task.successCriteria = opened.board.successCriteria
      for (const device of devices) task.operations.set(device.serial, this.viewers.board(opened.viewerId).operationCount(device.id))
    }
    return { ...await this.viewers.status(opened.viewerId, owner, 0, signal), workbenchUrl: opened.workbenchUrl }
  }

  async openGuide(signal: AbortSignal, options: OpenSessionOptions = {}): Promise<Awaited<ReturnType<ViewerServer['open']>>> {
    const owner = options.owner ?? options.task?.viewerOwner ?? 'local'
    const task = options.task ?? [...this.viewerTasks.values()].find(task => task.viewerOwner === owner) ?? createControlTask()
    task.viewerOwner = owner
    if (task.selectedDeviceIds?.length) return this.openViewer(task.selectedDeviceIds, signal, { ...options, task })
    const opened = await this.viewers.open(owner, [], signal)
    this.initializeViewer(opened.viewerId, task, options)
    if (task.objective) this.viewers.requestDeviceSelection(opened.viewerId)
    if (this.confirmStart && !task.startConfirmed) {
      this.viewers.requireStart(opened.viewerId, this.account?.preferredDeviceId, task.request)
    }
    return { ...await this.viewers.status(opened.viewerId, owner, 0, signal), workbenchUrl: opened.workbenchUrl }
  }
  private initializeViewer(id: string, task: ControlTask, options: OpenSessionOptions): void {
    const board = this.viewers.board(id)
    if (options.objective && (task.objective || board.objective) && options.objective !== (task.objective || board.objective)) throw new Error('task_goal_frozen')
    if (options.successCriteria && (task.successCriteria || board.successCriteria) && options.successCriteria !== (task.successCriteria || board.successCriteria)) throw new Error('task_goal_frozen')
    task.objective ??= options.objective ?? (board.objective || undefined)
    task.successCriteria ??= options.successCriteria ?? (board.successCriteria || undefined)
    board.objective = task.objective ?? board.objective; board.successCriteria = task.successCriteria ?? board.successCriteria
    if (task.request && !board.request) board.request = task.request
    this.configureTaskBudget(id, task, options.executionBudget)
    if (options.stopBeforeSubmit || board.stopBeforeSubmit || requestsPreSubmitStop(task.objective) || requestsPreSubmitStop(task.successCriteria)) task.stopBeforeSubmit = true
    if (task.stopBeforeSubmit) board.stopBeforeSubmit = true
    board.checkpoint(); this.viewerTasks.set(id, task)
  }
  restrictTask(task: ControlTask): void {
    task.stopBeforeSubmit = true
    for (const [id, current] of this.viewerTasks) if (current === task) { const board = this.viewers.board(id); board.stopBeforeSubmit = true; board.checkpoint() }
  }
  private configureTaskBudget(viewerId: string, task: ControlTask, value?: ExecutionBudgetInput): void {
    const board = this.viewers.board(viewerId)
    const requested = requestedOperationLimit(task.objective, task.successCriteria)
    const explicit = value === undefined ? undefined : executionBudgetInput(value)
    if (requested === undefined && explicit === undefined) return
    const operationLimit = requested === undefined ? explicit?.operationLimit : Math.min(requested, explicit?.operationLimit ?? board.executionBudget?.initialLimits?.operationLimit ?? requested)
    board.configureExecutionBudget({ ...(operationLimit === undefined ? {} : { operationLimit }), ...(explicit?.inferenceLimit === undefined ? {} : { inferenceLimit: explicit.inferenceLimit }) })
  }
  private async selectViewerDevice(viewerId: string, deviceId: string): Promise<void> {
    const principal = this.account?.scope ?? 'local'
    const task = this.viewerTasks.get(viewerId)
    if (task?.selectedDeviceIds?.length && !task.selectedDeviceIds.includes(deviceId)) throw new Error('device_frozen')
    const selected = (await this.deviceChoices(AbortSignal.timeout(10_000))).find(device => device.id === deviceId)
    if (!selected?.connected) throw new Error('device_offline')
    if (!selected.authorized) throw new Error('device_unauthorized')
    if (selected.busy) throw new Error('device_busy')
    if (selected.selectionStatus === 'version_conflict') throw new Error('device_version_conflict')
    const devices = await this.host.resolveDevices([deviceId], AbortSignal.timeout(10_000))
    if (devices.length !== 1) throw new Error('one_device_required')
    if (this.locks.has(devices[0]!.serial)) throw new Error('device_busy')
    await this.viewers.bindDevices(viewerId, devices, AbortSignal.timeout(30_000))
    if (task) task.selectedDeviceIds = [devices[0]!.id]
    this.rememberDevice(viewerId, devices[0]!.id, principal)
  }
  /** Confirm the host-owned request before binding and waiting for the first visible frame. */
  private async startViewerTask(viewerId: string, deviceId: string, request?: string, comments?: { enabled: boolean; budget?: unknown }): Promise<void> {
    if (!this.viewers.awaitingStart(viewerId)) throw new Error('task_already_started')
    const board = this.viewers.board(viewerId)
    const task = this.viewerTasks.get(viewerId)
    if (!task) throw new Error('task_unavailable')
    const clean = (value: string): string => value.replace(/^\s*@(?:skill:)?opengui\b\s*/iu, '').trim()
    const objective = clean(request ?? task.request ?? task.objective ?? '')
    if (!objective || objective.length > 4000) throw new Error('task_request_required')
    if (/【[^】]*】/u.test(objective)) throw new Error('请先补全任务中【】标记的内容')
    requestedOperationLimit(objective)
    const commentBudget = comments?.enabled ? comments.budget as CommentBudgetInput : undefined
    if (comments?.enabled) {
      try { createCommentBudget(commentBudget!, this.now()) }
      catch { throw new Error('请为评论任务设置有效的核验发送条数或运行时限') }
    }
    if (request !== undefined && objective !== clean(task.request || task.objective || '')) {
      // Only the person's initial confirmation can replace the pending request and its limits.
      // Never discard a restored run's history, consumed budget, prepared app or approvals.
      if (board.control !== 'idle' || board.traces.length || board.reviews.length || board.testCases.length || board.handoffs.length || board.apk || board.environment || board.executionBudget?.extensions.length || Object.values(board.executionBudget?.operations ?? {}).some(count => count > 0) || [...task.operations.values()].some(count => count > 0)) throw new Error('task_request_frozen')
      this.viewers.writeTodos(viewerId, task.viewerOwner!, [])
      task.objective = objective; task.successCriteria = undefined; task.scenario = 'general'
      board.objective = objective; board.successCriteria = ''; board.scenario = 'general'
      task.stopBeforeSubmit = undefined; board.stopBeforeSubmit = undefined
      board.executionBudget = undefined; board.commentBudget = undefined; task.commentBudget = undefined
    }
    task.request = objective; board.request = objective
    task.objective ??= objective; board.objective = task.objective
    if (comments?.enabled) {
      task.scenario = board.scenario = 'comments'
      task.commentBudget = { ...commentBudget! }
    } else if (comments?.enabled === false && task.scenario === 'comments') {
      task.scenario = undefined; board.scenario = 'general'; task.commentBudget = undefined
    }
    if (requestsPreSubmitStop(objective)) task.stopBeforeSubmit = true
    if (task.stopBeforeSubmit) board.stopBeforeSubmit = true
    this.configureTaskBudget(viewerId, task)
    board.checkpoint()
    await this.selectViewerDevice(viewerId, deviceId)
    task.startConfirmed = true
    this.viewers.markStarted(viewerId)
  }
  private async extendBudget(viewerId: string, additional: number, operationLimit: number, inferenceLimit: number): Promise<void> {
    const principal = this.account?.scope ?? 'local'
    const records = [...this.sessions.values()].filter(record => record.viewerId === viewerId && record.purpose === 'control')
    if (records.some(record => record.state === 'active' || record.pending.size)) throw new Error('finish_run_before_budget_extension')
    await Promise.all(records.map(record => record.cleanup))
    if ((this.account?.scope ?? 'local') !== principal) throw new Error('account_changed')
    const board = this.viewers.board(viewerId), devices = this.viewers.selectedDeviceIds(viewerId)
    if (devices.length !== 1) throw new Error('one_device_required')
    const latest = records.at(-1), item = latest?.devices[0]
    if (item) board.reserveOperation(item.device.id, Math.max(board.operationCount(item.device.id), latest!.task.operations.get(item.device.serial) ?? 0))
    board.extendExecutionBudget(devices[0]!, additional, operationLimit, inferenceLimit, this.now())
    // A new bounded run cannot reuse the previous kernel's observation or exhausted actor.
    for (const record of records) for (const item of record.devices) { this.host.invalidate?.(item.actor); record.task.actors.delete(item.device.serial) }
  }
  private rememberDevice(viewerId: string, deviceId: string, principal: string): void {
    if (principal !== (this.account?.scope ?? 'local')) return
    try { this.account?.selectDevice(deviceId); this.viewers.devicePreferenceError(viewerId) }
    catch { this.viewers.devicePreferenceError(viewerId, '本次设备已绑定，但上次选择偏好未保存；下次请重新选择。') }
  }
  private async deviceChoices(signal: AbortSignal, refresh = false, viewerId?: string): Promise<readonly DeviceChoice[]> {
    const devices = await this.host.listDevices(signal, refresh)
    return devices.map(device => {
      const busy = [...this.locks.values()].some(id => this.sessions.get(id)?.devices.some(item => item.device.id === device.id))
      const occupiedElsewhere = [...this.locks.values()].some(id => { const session = this.sessions.get(id); return session?.viewerId !== viewerId && session?.devices.some(item => item.device.id === device.id) })
      const selectionStatus = deviceSelectionStatus(device)
      const { id, name, model, manufacturer, os, osVersion, sdk, serialSuffix, connection, state, connected, authorized } = device
      return { id, name, ...(model ? {model} : {}), ...(manufacturer ? {manufacturer} : {}), ...(os ? {os} : {}), ...(osVersion ? {osVersion} : {}), ...(sdk !== undefined ? {sdk} : {}), ...(serialSuffix ? {serialSuffix} : {}), ...(connection ? {connection} : {}), state, connected, authorized, busy, selectionStatus, selected: false,
        connectionHint: connectionHint({ ...device, selectionStatus, busy: occupiedElsewhere }),
        selectable: connected && authorized && !busy && selectionStatus !== 'version_conflict' }
    })
  }

  /** The person's emulator choice from the device picker; installing requires accepting the Android SDK license. */
  private emulatorAction(input: Record<string, unknown>): void {
    if (!this.emulators) throw new Error('emulator_unsupported')
    if (input.action === 'cancel') { this.emulators.cancel(); return }
    if (input.action === 'install') {
      if (input.acceptLicense !== true) throw new Error('emulator_license_required')
      this.emulators.begin('install'); return
    }
    if (input.action === 'start') {
      const name = typeof input.name === 'string' && /^[A-Za-z0-9._-]{1,64}$/u.test(input.name) ? input.name : undefined
      this.emulators.begin('start', name); return
    }
    throw new Error('invalid_arguments: unknown emulator action')
  }

  /** A start-page candidate for display only; a phone in use by another task is never shown. */
  private async previewChoice(viewerId: string, deviceId: string, signal: AbortSignal): Promise<ResolvedWorkBuddyDevice> {
    const choice = (await this.deviceChoices(signal, false, viewerId)).find(device => device.id === deviceId)
    if (!choice?.selectable || choice.os === 'ios') throw new Error('preview_unavailable: the device is not selectable')
    const [device] = await this.host.resolveDevices([deviceId], signal)
    if (!device) throw new Error('preview_unavailable: the device is offline')
    return device
  }

  listDevices(signal: AbortSignal): Promise<readonly WorkBuddyDeviceInfo[]> {
    return this.host.listDevices(signal)
  }

  endViewerTask(owner: string): void { this.viewers.endOwner(owner); for (const [id, task] of this.viewerTasks) if (task.viewerOwner === owner) this.viewerTasks.delete(id) }
  awaitingTaskStart(task: ControlTask): boolean { return [...this.viewerTasks].some(([id, current]) => current === task && this.viewers.awaitingStart(id)) }
  awaitingDeviceTask(task: ControlTask): boolean { return [...this.viewerTasks].some(([id, current]) => current === task && this.viewers.awaitingDeviceTask(id)) }

  hasPersistentMirrors(): boolean { return this.viewers.active || (this.host.hasMirrors?.() ?? false) }

  async start(signal: AbortSignal): Promise<{ devices: readonly (WorkBuddyDeviceInfo & { mirror?: MirrorStatus })[] }> {
    await this.host.activateMirrors?.(signal)
    return this.displayStatus(signal)
  }

  async displayStatus(signal: AbortSignal): Promise<{ devices: readonly (WorkBuddyDeviceInfo & { mirror?: MirrorStatus })[] }> {
    const devices = await this.host.listDevices(signal)
    return { devices: await Promise.all(devices.map(async device => {
      if (!device.connected || !device.authorized) return device
      try {
      const [resolved] = await this.host.resolveDevices([device.id], signal)
      const mirror = resolved ? await this.host.inspectMirror?.(resolved.serial) ?? this.host.mirrorStatus?.(resolved.serial) : undefined
      return { ...device, ...(mirror ? { mirror } : {}) }
      } catch (error) {
        signal.throwIfAborted()
        return { ...device, displayError: errorInfo(error) }
      }
    })) }
  }

  async deviceMirror(deviceId: string, close: boolean, signal: AbortSignal, owned: ReadonlySet<string> = new Set()): Promise<unknown> {
    const [device] = await this.host.resolveDevices([deviceId], signal)
    if (!device) throw new Error('opengui: unknown device')
    const owner = this.locks.get(device.serial)
    if (close && owner && !owned.has(owner)) throw new Error('opengui: another task is controlling this phone; cannot close its display')
    if (close) {
      await this.host.closeMirror?.(device.serial)
    } else await this.host.openMirror?.(device, signal)
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

  async openSession(deviceIds: readonly string[] | undefined, signal: AbortSignal, purpose: 'control' | 'mirror' = 'control', options: OpenSessionOptions = {}): Promise<WorkBuddySessionStatus> {
    signal.throwIfAborted()
    if (this.disposed) throw new Error('opengui: runtime is shutting down')
    const task = options.task ?? (options.viewerId ? this.viewerTasks.get(options.viewerId) : undefined) ?? createControlTask()
    const devices = await this.host.resolveDevices(deviceIds ?? task.selectedDeviceIds, signal)
    if (task.selectedDeviceIds && (devices.length !== task.selectedDeviceIds.length || devices.some(device => !task.selectedDeviceIds!.includes(device.id)))) {
      throw new OpenGuiError('device_frozen', 'opengui: automatic recovery cannot change the task devices')
    }
    task.objective ??= options.objective
    task.successCriteria ??= options.successCriteria
    task.scenario ??= options.scenario
    if (devices.some(device => device.os === 'ios') && task.scenario === 'comments') throw new OpenGuiError('ios_comments_unsupported', 'opengui: iOS simulators support GUI testing; comment operations require an Android device')
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
    const selectedViewer = purpose === 'control' ? this.viewers.find(options.owner ?? task.viewerOwner ?? 'local', devices, options.viewerId) : undefined
    if (options.executionBudget !== undefined && !selectedViewer) throw new Error('execution_budget_requires_control')
    if (selectedViewer) this.configureTaskBudget(selectedViewer, task, options.executionBudget)
    if (options.stopBeforeSubmit || requestsPreSubmitStop(task.objective) || requestsPreSubmitStop(task.successCriteria) || selectedViewer && this.viewers.board(selectedViewer).stopBeforeSubmit) task.stopBeforeSubmit = true
    if (selectedViewer && task.stopBeforeSubmit) { const board = this.viewers.board(selectedViewer); board.stopBeforeSubmit = true; board.checkpoint() }
    // The person's confirmed limits take precedence over a later host-model inference.
    const commentBudget = task.commentBudget ?? options.commentBudget
    if (commentBudget) {
      createCommentBudget(commentBudget, this.now())
      if (!selectedViewer || (task.scenario ?? options.scenario ?? this.viewers.board(selectedViewer).scenario) !== 'comments') throw new Error('comment_scenario_required')
      this.viewers.board(selectedViewer).configureCommentBudget(commentBudget, this.now())
    }
    if (options.environment !== undefined) {
      if (!selectedViewer || devices.length !== 1) throw new Error('environment_requires_one_control_phone')
      this.viewers.board(selectedViewer).configureEnvironment(environmentSpec(options.environment), devices[0]!.id, devices[0]!.os)
    }
    if (selectedViewer) this.viewers.board(selectedViewer).invalidateEnvironment()
    if (selectedViewer) for (const device of devices) task.operations.set(device.serial, Math.max(task.operations.get(device.serial) ?? 0, this.viewers.board(selectedViewer).operationCount(device.id)))
    if (selectedViewer && this.viewers.board(selectedViewer).apk?.status === 'installing') this.viewers.board(selectedViewer).saveApk({ ...this.viewers.board(selectedViewer).apk!, status: 'unknown', code: 'apk_session_interrupted' })
    task.selectedDeviceIds ??= devices.map(device => device.id)
    const id = this.createSessionId()
    const record: SessionRecord = {
      controlMode: 'agent', controlController: new AbortController(),
      ...(selectedViewer ? { viewerId: selectedViewer } : {}),
      task,
      lastActivity: this.now(),
      purpose,
      mirrorRequested: false,
      id,
      createdAt: new Date().toISOString(),
      controller: new AbortController(),
      devices: devices.map(device => ({
        device,
        actor: purpose === 'control' ? task.actors.get(device.serial) ?? {} : {},
        displayEstablished: task.displaysEstablished.has(device.serial),
        connectionController: new AbortController(),
        connected: device.connected,
        authorized: device.authorized,
      })),
      state: 'active',
      pending: new Set(),
    }
    for (const item of record.devices) {
      if (purpose === 'control') {
        // Keep task-level progress history, but never restore old observation authority.
        if (task.actors.has(item.device.serial)) this.host.invalidate?.(item.actor)
        task.actors.set(item.device.serial, item.actor)
      }
      this.host.assignTarget(item.actor, item.device.serial)
      if (purpose === 'control') this.locks.set(item.device.serial, id)
    }
    this.sessions.set(id, record)
    if (selectedViewer) {
      const board = this.viewers.board(selectedViewer)
      board.objective = task.objective ?? board.objective
      board.successCriteria = task.successCriteria ?? board.successCriteria
      if (task.scenario && board.scenario === 'general') board.scenario = task.scenario
      task.scenario ??= board.scenario
      board.control = 'agent'
      board.result = undefined
      if (board.pendingHandoff) {
        record.controlMode = 'manual'; board.control = 'manual'
        record.controlController.abort(new OpenGuiError('task_paused', 'opengui: restored handoff needs a new human decision', 'not_executed', 'wait'))
        for (const item of record.devices) item.needsObservation = true
      } else if (board.connectionRecovery && board.connectionRecovery.status !== 'resolved') {
        record.controlMode = 'paused'; board.control = 'paused'
        record.controlController.abort(new OpenGuiError('device_offline', 'opengui: restored connection recovery needs a new human recheck', 'not_executed', 'wait'))
        for (const item of record.devices) item.needsObservation = true
      }
    }
    this.renewLease(record)
    try {
      if (selectedViewer && ['manual', 'paused'].includes(record.controlMode)) this.viewers.awaitUser(selectedViewer, true)
      await this.wall.start()
      signal.throwIfAborted()
      if (this.disposed) throw new Error('opengui: runtime is shutting down')
      if (purpose === 'mirror' && !options.skipActivation && this.host.activateMirrors) {
        await this.host.activateMirrors(signal)
        record.mirrorRequested = true
      } else if (purpose === 'mirror' && !options.skipActivation && this.host.openMirror) {
        record.mirrorRequested = true
        const launchSignal = AbortSignal.any([signal, record.controller.signal])
        const results = await Promise.allSettled(record.devices.map(item => this.track(record,
          () => this.host.openMirror!(item.device, launchSignal))))
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) record.lastError = `Automatic mirror unavailable: ${String(failure.reason)}`
        signal.throwIfAborted()
        record.controller.signal.throwIfAborted()
      }
      this.armCommentBudget(record)
      if (selectedViewer && this.viewers.board(selectedViewer).environment && record.controlMode === 'agent') await this.environment(record.id, undefined, 'check', signal)
      return this.snapshot(record)
    } catch (error) {
      record.state = 'closed'
      record.closedAt = new Date().toISOString()
      record.controller.abort(error)
      clearTimeout(record.leaseTimer)
      await record.apk?.dispose(); delete record.apk
      await this.releaseDeviceResources(record)
      this.release(record)
      this.sessions.delete(id)
      throw error
    }
  }

  async observe(sessionId: string, deviceId: string | undefined, signal: AbortSignal, taskNodeIndex?: number, evidenceObservationId?: string, stepId?: string): Promise<WorkBuddyObservation> {
    if (this.requireActiveSession(sessionId).apkBusy) throw new Error('apk_preparation_busy: wait for preparation before observing')
    this.syncTaskNode(sessionId, deviceId, taskNodeIndex, evidenceObservationId, signal, stepId)
    return this.runPhoneOperation(sessionId, deviceId, signal, (item, combined) => this.host.observe(item.actor, combined), 'observe', '查看当前画面')
  }

  async openMirror(sessionId: string, deviceId: string | undefined, signal: AbortSignal): Promise<WorkBuddySessionStatus> {
    const record = this.requireActiveSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    if (!this.host.openMirror) throw new Error('opengui: native mirroring is unavailable')
    await this.host.resolveDevices([item.device.id], signal)
    record.mirrorRequested = true
    try {
      signal.throwIfAborted()
      await this.track(record, () => this.host.openMirror!(item.device, AbortSignal.any([signal, record.controller.signal])))
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

  async apk(sessionId: string, command: 'read' | 'inspect' | 'install', signal: AbortSignal, path?: string, artifactId?: string, allowTestApk = false): Promise<{ apk?: ApkRecord; environment?: EnvironmentState }> {
    const record = this.requireActiveSession(sessionId)
    if (!record.viewerId || record.purpose !== 'control' || record.devices.length !== 1) throw new Error('apk_requires_one_control_phone')
    const board = this.viewers.board(record.viewerId), item = record.devices[0]!
    const snapshot = () => ({ ...(board.apk ? { apk: structuredClone(board.apk) } : {}), ...(board.environment ? { environment: structuredClone(board.environment) } : {}) })
    if (command === 'read') return snapshot()
    this.assertAgentControl(record); this.enforceCommentBudget(record)
    if (record.apkBusy || record.pending.size) throw new Error('apk_preparation_busy')
    this.viewers.assertReady(record.viewerId)
    const combined = AbortSignal.any([signal, record.controller.signal, record.controlController.signal, item.connectionController.signal]), epoch = item.connectionEpoch ?? 0
    record.apkBusy = true
    try {
      if (command === 'inspect') {
        if (!path) throw new Error('apk_path_required')
        if (board.apk && board.apk.status !== 'prepared') throw new Error('apk_attempt_recorded: inspect installed state; never replay a recorded attempt')
        if (board.traces.some(trace => !['model', 'observe', 'environment', 'apk_inspect'].includes(trace.kind))) throw new Error('apk_preparation_started: prepare the requested APK before phone actions')
        const prepared = await this.track(record, () => prepareApk(path, item.device.id, allowTestApk, combined))
        try {
          combined.throwIfAborted()
          if (board.environment && (board.environment.spec.packageName !== prepared.record.packageName || board.environment.spec.expectedVersion && board.environment.spec.expectedVersion !== prepared.record.versionName)) throw new Error('apk_target_mismatch: APK metadata must match the original task app and requested version')
          if (prepared.record.testOnly && !allowTestApk) throw new Error('apk_test_only: enable test APK installation only when explicitly requested by the user')
          if (!board.environment) board.configureEnvironment(environmentSpec({ packageName: prepared.record.packageName, ...(prepared.record.versionName ? { expectedVersion: prepared.record.versionName } : {}) }), item.device.id)
          if (board.apk) prepared.record.id = board.apk.id
          await this.checkApkReplacement(record, prepared.record, combined)
          combined.throwIfAborted()
          board.saveApk(prepared.record)
          await record.apk?.dispose(); record.apk = prepared
          if (prepared.record.existingApp && !prepared.record.updateApprovedAt) this.viewers.awaitUser(record.viewerId, true)
        } catch (error) { await prepared.dispose(); throw error }
      } else {
        if (!record.apk || !board.apk || board.apk.status !== 'prepared' || board.apk.id !== artifactId || record.apk.record.sha256 !== board.apk.sha256) throw new Error('apk_artifact_required: inspect the original APK; failed, installed and unknown attempts cannot be replayed')
        if (!this.host.installApk) throw new Error('apk_install_unavailable')
        const operations = record.task.operations.get(item.device.serial) ?? 0
        if (operations >= board.operationLimit) throw new Error('budget_exhausted')
        const current = structuredClone(board.apk)
        await this.checkApkReplacement(record, current, combined)
        combined.throwIfAborted(); board.saveApk(current)
        if (current.existingApp && !current.updateApprovedAt) { this.viewers.awaitUser(record.viewerId, true); throw new OpenGuiError('apk_update_confirmation_required', 'opengui: existing app will be replaced; user must confirm the exact APK update in the workbench', 'not_executed', 'wait') }
        await this.track(record, () => validatePreparedApk(record.apk!, combined))
        board.invalidateEnvironment()
        board.saveApk({ ...board.apk, status: 'installing', startedAt: new Date().toISOString() })
        delete item.observation; item.needsObservation = true; this.host.invalidate?.(item.actor)
        record.task.operations.set(item.device.serial, operations + 1)
        board.reserveOperation(item.device.id, operations + 1)
        const trace = board.begin(item.device.id, 'apk_install', this.now(), { label: '安装测试包' })
        let installed = false
        try {
          combined.throwIfAborted()
          await this.track(record, () => this.host.installApk!(item.device, record.apk!, combined))
          combined.throwIfAborted()
          if ((item.connectionEpoch ?? 0) !== epoch) throw new OpenGuiError('apk_connection_changed', 'opengui: installation connection changed', 'outcome_unknown')
          installed = true
          board.saveApk({ ...board.apk!, status: 'installed', finishedAt: new Date().toISOString(), code: 'apk_install_success' })
          board.finish(trace, this.now(), 'executed')
        } catch (error) {
          const info = errorInfo(error)
          const unknown = combined.aborted || info.executionState === 'outcome_unknown' || installed
          // A failed result write cannot restore authority to retry an installation intent.
          if (board.apk) { board.apk.status = unknown ? 'unknown' : 'failed'; board.apk.code = info.code; board.apk.finishedAt = new Date().toISOString() }
          board.checkpoint(); board.finish(trace, this.now(), unknown ? 'unknown' : 'failed', undefined, info.code)
          throw error
        } finally { await record.apk.dispose(); delete record.apk }
        if (installed) await this.environment(record.id, undefined, 'check', combined)
      }
      this.renewLease(record)
      return snapshot()
    } finally { record.apkBusy = false }
  }

  private async checkApkReplacement(record: SessionRecord, apk: ApkRecord, signal: AbortSignal): Promise<void> {
    const board = this.viewers.board(record.viewerId!)
    if (!this.host.checkEnvironment || !board.environment) throw new Error('apk_existing_app_unverified: current installation must be checked before replacing an app')
    const state = await this.track(record, () => this.host.checkEnvironment!(record.devices[0]!.device, board.environment!.spec, signal))
    const installed = state.checks.find(check => check.id === 'app')
    if (!installed || installed.status === 'unknown' || state.stale) throw new Error('apk_existing_app_unverified: installation state is unknown')
    delete apk.existingApp; delete apk.updateApprovedAt
    if (installed.status === 'passed') {
      const version = state.checks.find(check => check.id === 'version')?.observedValue
      apk.existingApp = { ...(version ? { version } : {}) }
      const previous = board.apk
      if (previous?.sha256 === apk.sha256 && previous.existingApp && previous.existingApp.version === version && previous.updateApprovedAt) apk.updateApprovedAt = previous.updateApprovedAt
    }
  }

  async waitForApkUpdate(sessionId: string, waitMs: number, signal: AbortSignal): Promise<void> {
    const record = this.requireActiveSession(sessionId), deadline = Date.now() + Math.min(30000, waitMs)
    while (record.state === 'active' && Date.now() < deadline) {
      signal.throwIfAborted(); record.controller.signal.throwIfAborted()
      const apk = this.viewers.board(record.viewerId!).apk
      if (!apk?.existingApp || apk.updateApprovedAt || apk.status !== 'prepared' || ['manual', 'paused'].includes(record.controlMode)) return
      this.renewLease(record)
      await new Promise<void>(resolve => setTimeout(resolve, 100))
    }
  }

  async environment(sessionId: string, deviceId: string | undefined, command: 'read' | 'check' | 'verify', signal: AbortSignal, spec?: unknown, verification?: { check: 'account' | 'service'; status: 'passed' | 'failed' | 'unknown'; detail: string; evidenceObservationId: string }, humanRecheck = false): Promise<{ environment?: EnvironmentState; ready: boolean }> {
    const record = this.requireActiveSession(sessionId)
    if (!record.viewerId || record.purpose !== 'control') throw new Error('control_viewer_required')
    const board = this.viewers.board(record.viewerId), item = this.resolveDevice(record, deviceId)
    if (command === 'read') return { ...(board.environment ? { environment: structuredClone(board.environment) } : {}), ready: Boolean(board.environment) && environmentReady(board.environment) }
    if (!humanRecheck) this.assertAgentControl(record)
    this.enforceCommentBudget(record)
    if (spec !== undefined) board.configureEnvironment(environmentSpec(spec), item.device.id, item.device.os)
    const state = board.environment
    if (!state || state.deviceId !== item.device.id) throw new Error('environment_spec_required: declare the original target package and prerequisites')
    if (command === 'verify') {
      if (!verification || !['account', 'service'].includes(verification.check) || !['passed', 'failed', 'unknown'].includes(verification.status) || typeof verification.detail !== 'string' || !verification.detail.trim() || verification.detail.length > 500) throw new Error('environment_verification_invalid')
      if (state.stale) throw new Error('environment_recheck_required')
      if (item.needsObservation || !item.observation || item.observation.observationId !== verification.evidenceObservationId || item.observation.foregroundPackage !== state.spec.packageName || !board.hasEvidence(verification.evidenceObservationId)) throw new Error('environment_evidence_required: compare the latest recorded screen of the original target app')
      const next = structuredClone(state), check = next.checks.find(check => check.id === verification.check)
      if (!check || check.source !== 'model_observation') throw new Error('environment_check_not_declared')
      Object.assign(check, { status: verification.status, detail: verification.detail.trim(), evidenceObservationId: verification.evidenceObservationId })
      board.saveEnvironment(next)
    } else {
      if (record.pending.size) throw new Error('environment_busy: wait for the current operation before checking')
      board.invalidateEnvironment()
      const epoch = item.connectionEpoch ?? 0
      const combined = AbortSignal.any([signal, record.controller.signal, item.connectionController.signal, ...(humanRecheck ? [] : [record.controlController.signal])])
      const trace = board.begin(item.device.id, 'environment', this.now(), { label: '检查设备与应用环境' })
      try {
        const next = await this.track(record, () => this.host.checkEnvironment ? this.host.checkEnvironment(item.device, state.spec, combined) : Promise.resolve(initialEnvironment(state.spec, item.device.id)))
        combined.throwIfAborted()
        if ((item.connectionEpoch ?? 0) !== epoch) throw new Error('environment_connection_changed')
        if (next.deviceId !== state.deviceId || JSON.stringify(next.spec) !== JSON.stringify(state.spec)) throw new Error('environment_target_changed')
        board.saveEnvironment(next)
        board.finish(trace, this.now(), 'executed')
      } catch (error) { board.finish(trace, this.now(), 'failed', undefined, 'environment_check_failed'); throw error }
    }
    this.renewLease(record)
    return { environment: structuredClone(board.environment!), ready: environmentReady(board.environment) }
  }

  async act(
    sessionId: string,
    deviceId: string | undefined,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<WorkBuddyObservation> {
    this.externalSideEffect(input.externalSideEffect)
    const record = this.requireActiveSession(sessionId)
    this.assertAgentControl(record)
    this.enforceCommentBudget(record)
    const stopBoard = record.viewerId ? this.viewers.board(record.viewerId) : undefined
    const activeCheck = stopBoard?.testCases.find(test => test.id === stopBoard.activeTestCaseId)
    if (stopBoard?.stopBeforeSubmit || requestsPreSubmitStop(activeCheck?.definition.stoppingCondition)) record.task.stopBeforeSubmit = true
    if (record.task.stopBeforeSubmit) {
      if (stopBoard) { stopBoard.stopBeforeSubmit = true; stopBoard.checkpoint() }
      if (violatesPreSubmitStop(input)) throw new OpenGuiError('stop_before_submit', 'opengui: the task must stop before final submission; inspect the current screen and record submission as not checked', 'not_executed', 'replan')
      if (requiresPreSubmitClassification(input)) throw new OpenGuiError('stop_action_unclassified', 'opengui: pre-submit taps and swipes require explicit externalSideEffect classification from the current image; hand off if the control is ambiguous', 'not_executed', 'replan')
    }
    // 发内容前需要审核: every gesture and Enter must say whether it publishes, so publishing cannot pass unclassified.
    if (record.viewerId && this.viewers.board(record.viewerId).contentReview && requiresContentClassification(input)) throw new OpenGuiError('content_action_unclassified', 'opengui: content review is on; declare externalSideEffect on every tap, swipe and Enter (none for navigation and typing, publish or send for posting text)', 'not_executed', 'replan')
    if (record.apkBusy) throw new Error('apk_preparation_busy: wait before phone actions')
    if (record.viewerId && this.viewers.board(record.viewerId).apk && this.viewers.board(record.viewerId).apk!.status !== 'installed') throw new Error('apk_not_installed: prepare the original requested APK before phone actions')
    const item = this.resolveDevice(record, deviceId)
    if (record.viewerId && isInputAction(String(input.action)) && this.viewers.board(record.viewerId).inputDiagnostic?.status === 'blocked') throw new OpenGuiError('input_permission_denied', 'opengui: user must handle input security settings and recheck the original phone before new input', 'not_executed', 'wait')
    if (item.needsObservation) throw new OpenGuiError('observation_required', 'opengui: observation was invalidated; observe again before acting', 'not_executed', 'observe')
    if (!item.observation || item.observation.observationId !== input.observationId) throw new OpenGuiError('observation_required', 'opengui: observe the current phone before acting', 'not_executed', 'observe')
    const environment = record.viewerId ? this.viewers.board(record.viewerId).environment : undefined
    if (environment && (environment.deviceId !== item.device.id || !environmentReady(environment) && !environmentSetupAllowed(environment, input))) throw new OpenGuiError('environment_blocked', 'opengui: declared app, version, permissions, account or service prerequisites are not ready; inspect the environment checklist', 'not_executed', 'wait')
    const preparingEnvironment = environment && !environmentReady(environment) && environmentSetupAllowed(environment, input)
    if (record.viewerId) {
      const board = this.viewers.board(record.viewerId), test = board.testCases.find(test => test.id === board.activeTestCaseId)
      if (!preparingEnvironment && board.testCases.length && (!test || test.result || (test.definition.stepId && test.definition.stepId !== input.stepId))) throw new Error('test_case_required: begin an unresolved case bound to this step before acting')
    }
    const review = record.viewerId ? this.viewers.board(record.viewerId).reviews.find(r => r.id === input.reviewId) : undefined
    if (record.viewerId && this.viewers.board(record.viewerId).pendingReplacement) throw new OpenGuiError('comment_replacement_required', 'opengui: wait for the human keep/replace decision on the saved phone original', 'not_executed', 'wait')
    if (record.viewerId && this.viewers.board(record.viewerId).reviews.some(r => r.status === 'pending')) throw new OpenGuiError('review_required', 'opengui: wait for the user to review the saved comment', 'not_executed', 'wait')
    if (input.reviewId !== undefined && (!review || review.status !== 'approved')) throw new OpenGuiError('review_required', 'opengui: this comment has no valid approval or was already submitted', 'not_executed', 'wait')
    const filling = input.action === 'text' || input.action === 'replace_text', sending = input.externalSideEffect === 'send' || input.externalSideEffect === 'publish'
    if (review && filling && input.text !== review.draft) throw new OpenGuiError('review_changed', 'opengui: input must match the exact saved and approved draft', 'not_executed', 'replan')
    if (record.viewerId && !review) {
      const board = this.viewers.board(record.viewerId)
      // Content review leaves ordinary typing (search, forms) free; only publishing needs the approved, read-back text.
      const fillingNeedsReview = filling && board.reviews.length > 0 && !(board.contentReview && board.scenario !== 'comments')
      const sendingNeedsReview = sending && (board.scenario === 'comments' || Boolean(board.contentReview) || board.reviews.length > 0)
      if (fillingNeedsReview || sendingNeedsReview) throw new OpenGuiError('review_required', 'opengui: publishing content requires the approved reviewId; submit the exact text with opengui_review_comment and wait for the user', 'not_executed', 'wait')
    }
    if (input.action === 'replace_text' && !review) throw new OpenGuiError('comment_replacement_required', 'opengui: replacement is only available for an approved comment with a human original-draft decision')
    if (review && (filling || sending)) this.viewers.board(record.viewerId!).assertPlatformInput(review.id, String(input.observationId), sending ? 'send' : input.action as 'text' | 'replace_text')
    this.syncTaskNode(sessionId, deviceId, input.taskNodeIndex, String(input.observationId), signal, input.stepId as string | undefined)
    const action = { ...input }
    if (record.task.stopBeforeSubmit && input.action === 'text') action.forceClipboard = true
    delete action.sessionId
    delete action.deviceId
    delete action.externalSideEffect
    delete action.confirmationRequestId
    delete action.target
    delete action.hostContext
    delete action.taskNodeIndex
    delete action.stepId
    delete action.reviewId
    if (review && filling) { this.viewers.board(record.viewerId!).prepareInput(review.id, String(input.observationId), input.action === 'replace_text'); action.forceClipboard = true; if (input.action === 'replace_text') action.expectedOriginalText = review.platformInput!.text }
    if (review && sending) { this.viewers.board(record.viewerId!).prepareSubmission(review.id); action.expectedInputText = review.draft }
    // The workbench animates the cursor as the action is dispatched; display only, never a permission.
    const cursor = item.observation ? deviceActionEvent(input, item.observation.image) : undefined
    if (cursor && record.viewerId) this.viewers.announceAction(record.viewerId, item.device.id, cursor)
    try {
      const result = await this.runPhoneOperation(sessionId, deviceId, signal, (item, combined) => this.host.act(item.actor, action, combined), String(input.action), actionLabel(input))
      if (review && filling) this.viewers.board(record.viewerId!).finishInput(review.id, result.observationId)
      return result
    } catch (error) {
      item.resultUnknown ||= errorInfo(error).executionState === 'outcome_unknown'
      record.resultUnknown = record.devices.some(device => device.resultUnknown)
      if (review && filling) this.viewers.board(record.viewerId!).finishInput(review.id)
      if (review?.status === 'submitted') this.viewers.board(record.viewerId!).updateReview(review.id, { status: error instanceof OpenGuiError && error.executionState === 'not_executed' ? 'approved' : 'unknown' })
      throw error
    }
  }

  assertExecutionOwner(sessionId: string, internal: boolean, name: string, args: Record<string, unknown>): void {
    const record = this.requireSession(sessionId)
    const configured = record.configured || Boolean(record.viewerId && this.viewers.board(record.viewerId).modelConfig)
    if (!configured || internal || ['opengui_execute', 'opengui_status', 'opengui_cancel'].includes(name) || (name === 'opengui_prepare_apk' && args.command === 'read') || (name === 'opengui_environment' && args.command === 'read') || (name === 'opengui_test_case' && args.command === 'read') || (name === 'opengui_review_comment' && args.draft === undefined && args.platformDraft === undefined) || (name === 'opengui_close_session' && record.state !== 'active')) return
    throw new OpenGuiError('executor_owned', 'opengui: the selected model owns this phone run; use status or cancel rather than dispatching parallel actions', 'not_executed', 'wait')
  }
  configuredContext(sessionId: string) { const record = this.requireActiveSession(sessionId); return { viewerId: record.viewerId! } }
  configuredSignal(sessionId: string, signal: AbortSignal): AbortSignal {
    const record = this.requireActiveSession(sessionId)
    return AbortSignal.any([signal, record.controller.signal, record.controlController.signal])
  }
  configuredInference<T>(sessionId: string, operation: () => Promise<T>): Promise<T> { const record = this.requireActiveSession(sessionId); this.enforceCommentBudget(record); return this.track(record, operation) }
  async executeConfigured(sessionId: string, waitMs: number, signal: AbortSignal, onProgress?: ToolProgress): Promise<WorkBuddySessionStatus> {
    signal.throwIfAborted()
    const record = this.requireSession(sessionId), model = record.viewerId ? this.viewers.board(record.viewerId).modelConfig : undefined
    if (record.state !== 'active') return this.snapshot(record)
    if (!model || !this.account) throw new Error('host_model_only: use WorkBuddy observe/act for this release')
    if (record.devices.length !== 1) throw new Error('configured_executor_requires_one_phone')
    this.viewers.assertReady(record.viewerId!)
    const board = this.viewers.board(record.viewerId!)
    const event = () => {
      const pendingReviews = board.reviews.filter(review => review.status === 'pending').map(review => review.id)
      const apkPending = Boolean(board.apk?.status === 'prepared' && board.apk.existingApp && !board.apk.updateApprovedAt)
      const waiting = ['paused', 'manual'].includes(record.controlMode) || pendingReviews.length > 0 || Boolean(board.pendingReplacement) || apkPending
      // Screenshots, traces, keystrokes and draft edits are not new chat events.
      const cursor = createHash('sha256').update(JSON.stringify({
        state: record.state, control: record.controlMode, result: record.result?.outcome,
        steps: this.viewers.taskSteps(record.viewerId!).map(step => [step.stepId, ['pending', 'in_progress'].includes(step.status) ? 'open' : step.status]),
        pendingReviews, replacement: board.pendingReplacement?.id, apkPending,
        decisions: board.reviews.map(review => [review.id, review.status === 'pending' ? 'pending' : review.status === 'skipped' ? 'skipped' : 'accepted']),
      })).digest('hex')
      const message = record.state !== 'active' ? '任务已结束，请查看执行结果和报告。'
        : record.controlMode === 'manual' ? '等待你在右侧处理；完成后点击「恢复控制」。'
        : record.controlMode === 'paused' ? '任务已暂停，请在右侧查看原因并处理。'
        : pendingReviews.length ? '内容待审核：请在右侧批准、修改或跳过；跳过只影响这一条。'
        : board.pendingReplacement ? '手机输入框已有内容，请在右侧选择保留或替换。'
        : apkPending ? '等待你在右侧确认应用更新。'
        : this.viewers.progress(record.viewerId!)?.message ?? '任务执行中，进度会自动更新。'
      return { cursor, message, waiting }
    }
    const initial = event(), before = record.lastExecuteEvent ?? initial.cursor
    let notified = ''
    const notify = () => { const current = event(); if (current.cursor !== notified) { notified = current.cursor; onProgress?.(current.message) } return current }
    if (!record.runner) {
      record.configured = true
      record.runner = runConfiguredPhone(this, this.account, record.id, model, record.controller.signal).catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : ''
        const cause = message.startsWith('model_upstream_error') ? `所选模型「${model.name}」的服务返回错误（${message.slice(message.indexOf('HTTP'))}），可换用其他模型或跟随 WorkBuddy。`
          : message.startsWith('login_required') ? '账号登录已过期，请重新登录后继续。'
          : message.startsWith('invalid_model_response') || message.startsWith('invalid_model_tool_call') || message.startsWith('excessive_model_tool_calls') ? `所选模型「${model.name}」返回了无法执行的结果，可换用其他模型或跟随 WorkBuddy。`
          : transientModelFailure(error) ? `所选模型「${model.name}」的请求重试后仍失败（网络或服务不稳定），可稍后继续或换用其他模型。`
          : '模型或执行服务暂时不可用。'
        if (record.state === 'active') await this.closeSession(record.id, { outcome: 'blocked', summary: cause + '已保留当前步骤、草稿和证据；恢复前检查原任务与最后一次操作。' })
      })
      void record.runner.catch(() => { /* Persistence failures remain visible through the task state. */ })
    }
    let ended = false
    const received = waitMs > 0 ? await waitForEvent(listener => {
      const off = this.viewers.onTaskChange(record.viewerId!, listener)
      let listening = true
      void record.runner!.finally(() => { ended = true; if (listening) listener() }).catch(() => undefined)
      return () => { listening = false; off() }
    }, () => {
      const current = notify()
      // With progress support, keep this one request open through reviews and node changes.
      // Otherwise return each meaningful event once, then wait for a different one.
      return ended || (!onProgress && record.state === 'active' && (current.cursor !== before || (!record.lastExecuteEvent && current.waiting)))
    }, Math.min(HUMAN_CONTROL_WAIT_MS, waitMs), signal) : true
    const current = event(), changed = current.cursor !== record.lastExecuteEvent
    record.lastExecuteEvent = current.cursor
    return { ...this.snapshot(record), event: { cursor: current.cursor, changed, timedOut: !received, message: current.message, delivery: onProgress ? 'progress' : 'event_wait' } }
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
      if (record.viewerId) { try { this.viewers.assertReady(record.viewerId); item.displayEstablished = true } catch { /* First display is pending. */ } }
      else if (this.host.mirrorStatus?.(item.device.serial).ready) item.displayEstablished = true
      if (item.displayEstablished) record.task.displaysEstablished.add(item.device.serial)
    }
    return {
      executor: { mode: record.viewerId && this.viewers.board(record.viewerId).modelConfig ? 'configured' : 'workbuddy', started: Boolean(record.runner), ...(record.viewerId && this.viewers.board(record.viewerId).modelConfig ? { model: this.viewers.board(record.viewerId).modelConfig!.name } : {}) },
      ...(record.task.stopBeforeSubmit || record.viewerId && this.viewers.board(record.viewerId).stopBeforeSubmit ? { stopBeforeSubmit: true as const } : {}),
      ...(record.viewerId && this.viewers.board(record.viewerId).contentReview ? { contentReview: true as const } : {}),
      ...(record.viewerId && this.viewers.board(record.viewerId).apk ? { apk: this.viewers.board(record.viewerId).apk! } : {}),
      ...(record.viewerId && this.viewers.board(record.viewerId).environment ? { environment: this.viewers.board(record.viewerId).environment! } : {}),
      ...(record.viewerId && this.viewers.board(record.viewerId).inputDiagnostic ? { inputDiagnostic: this.viewers.board(record.viewerId).inputDiagnostic! } : {}),
      ...(record.viewerId ? { executionBudget: { operationLimit: this.viewers.board(record.viewerId).operationLimit, inferenceLimit: this.viewers.board(record.viewerId).inferenceLimit, inferenceCount: this.viewers.board(record.viewerId).inferenceCount } } : {}),
      controlMode: record.controlMode,
      ...(record.viewerId && this.viewers.board(record.viewerId).connectionRecovery ? { connectionRecovery: this.viewers.board(record.viewerId).connectionRecovery! } : {}),
      ...(record.viewerId && (this.viewers.board(record.viewerId).reviews.length || this.viewers.board(record.viewerId).commentBudget) ? { comments: this.viewers.board(record.viewerId).comments } : {}),
      ...(record.viewerId && this.viewers.board(record.viewerId).pendingHandoff ? { handoff: this.viewers.board(record.viewerId).pendingHandoff! } : {}),
      ...(record.viewerId ? { reviews: this.viewers.board(record.viewerId).reviews } : {}),
      ...(record.viewerId ? { replacementPending: Boolean(this.viewers.board(record.viewerId).pendingReplacement) } : {}),
      ...(record.viewerId ? { reportExports: this.viewers.reportFiles(record.viewerId) } : {}),
      ...(record.viewerId && this.viewers.board(record.viewerId).testCases.length ? { tests: { ...testSummary(this.viewers.board(record.viewerId).testCases), ...(this.viewers.board(record.viewerId).activeTestCaseId ? { activeCaseId: this.viewers.board(record.viewerId).activeTestCaseId } : {}) } } : {}),
      activity: record.state !== 'active' ? 'ended'
        : record.controlMode !== 'agent' ? 'paused'
        : record.resultUnknown ? 'result_unknown'
        : record.devices.some(item => item.needsObservation) ? 'paused'
        : record.devices.some(item => !item.displayEstablished) ? 'waiting_for_display' : 'ready',
      ...(record.viewerId ? { progress: this.viewers.progress(record.viewerId) } : {}),
      sessionId: record.id,
      purpose: record.purpose,
      state: record.state,
      createdAt: record.createdAt,
      leaseExpiresAt: new Date(record.lastActivity + this.leaseMs).toISOString(),
      ...(record.result ? { result: record.result } : {}),
      ...(record.task.objective ? { objective: record.task.objective } : {}),
      ...(record.task.successCriteria ? { successCriteria: record.task.successCriteria } : {}),
      ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
      ...(record.lastError === undefined ? {} : { lastError: record.lastError }),
      deviceWallUrl: record.viewerId ? this.viewers.url(record.viewerId) : this.wall.url(record.id),
      devices: record.devices.map(({ device, actor, connected, authorized }) => {
        const runtime = this.host.status(actor)
        return {
          id: device.id,
          name: device.name,
          ...(device.model === undefined ? {} : { model: device.model }),
          connected,
          authorized,
          operationCount: record.task.operations.get(device.serial) ?? 0,
          remainingOperations: Math.max(0, (record.viewerId ? this.viewers.board(record.viewerId).operationLimit : WORKBUDDY_MAX_OPERATIONS) - (record.task.operations.get(device.serial) ?? 0)),
          ...(this.host.mirrorStatus ? { mirror: this.host.mirrorStatus(device.serial) } : {}),
          ...(runtime.observationId === undefined ? {} : { observationId: runtime.observationId }),
        }
      }),
    }
  }

  async cancel(sessionId: string): Promise<WorkBuddySessionStatus> {
    const record = this.requireSession(sessionId)
    if (record.state === 'active') {
      record.state = 'cancelled'
      record.result = { outcome: 'cancelled' }
      if (record.viewerId) { const board = this.viewers.board(record.viewerId); board.control = 'ended'; board.result = record.result; board.checkpoint() }
      if (record.viewerId) this.viewers.pauseNodes(record.viewerId)
      record.closedAt = new Date().toISOString()
      record.controller.abort(new Error('opengui: session cancelled'))
    }
    await this.cleanup(record)
    if (record.viewerId) await this.viewers.archiveReports(record.viewerId)
    this.pruneClosedSessions()
    return this.snapshot(record)
  }

  async closeSession(sessionId: string, result?: SessionResult): Promise<WorkBuddySessionStatus> {
    const record = this.requireSession(sessionId)
    if (result?.outcome === 'completed' && record.state === 'active') {
      if (record.viewerId) {
        const board = this.viewers.board(record.viewerId)
        if (record.apkBusy || board.apk && board.apk.status !== 'installed') throw new Error('apk_preparation_incomplete: requested package must be installed and checked')
        if (board.inputDiagnostic && board.inputDiagnostic.status !== 'resolved') throw new Error('input_permission_unverified: connection and screenshot receipts do not prove input capability recovered')
        if (board.connectionRecovery && board.connectionRecovery.status !== 'resolved') throw new Error('connection_unverified: recheck the original device and obtain a new observation before claiming completion')
        if (!environmentReady(board.environment)) throw new Error('environment_blocked: unresolved prerequisites cannot be a completed task')
        if (board.scenario === 'testing' && (!board.testCases.length || board.testCases.some(test => !test.result))) throw new Error('test_results_incomplete: record each planned check and explicitly explain unverified or unexecuted scope')
      }
      if (record.controlMode !== 'agent' || record.pending.size || record.resultUnknown || record.devices.some(item => item.needsObservation || !item.observation || !result.evidenceObservationIds?.includes(item.observation.observationId)) || (record.viewerId && this.viewers.board(record.viewerId).reviews.some(r => !['sent', 'skipped'].includes(r.status)))) {
        throw new OpenGuiError('completion_unverified', 'opengui: completion requires the latest observed result of every task phone', 'not_executed', 'observe')
      }
    }
    if (result?.outcome === 'completed' && record.state === 'active' && record.viewerId) this.viewers.finishNodes(record.viewerId)
    if (result?.outcome === 'blocked' && record.state === 'active' && record.viewerId) {
      const board = this.viewers.board(record.viewerId), step = this.viewers.progress(record.viewerId)?.currentStepId
      if (step && board.traces.at(-1)?.status === 'failed') this.viewers.settleNode(record.viewerId, step, 'failed', result.summary ?? '工具执行失败，后续步骤未完成')
    }
    if (record.state === 'active' && record.viewerId && result?.outcome !== 'completed') this.viewers.pauseNodes(record.viewerId)
    if (record.state === 'active') record.result = result ?? { outcome: 'unknown' }
    if (record.viewerId) { const board = this.viewers.board(record.viewerId); board.control = 'ended'; board.result = record.result; board.checkpoint() }
    if (record.state === 'active') record.controller.abort(new Error('opengui: session closed'))
    record.state = 'closed'
    record.closedAt ??= new Date().toISOString()
    await this.cleanup(record)
    if (record.viewerId) await this.viewers.archiveReports(record.viewerId)
    this.pruneClosedSessions()
    return this.snapshot(record)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.allSettled([...this.sessions.keys()].map(id => this.closeSession(id)))
    await this.viewers.dispose()
    await this.wall.close()
    await this.host.dispose()
  }

  private async preview(sessionId: string, deviceId: string, signal: AbortSignal): Promise<Buffer> {
    const record = this.requireActiveSession(sessionId)
    const item = this.resolveDevice(record, deviceId)
    return this.track(record, () => this.host.preview(item.device, AbortSignal.any([record.controller.signal, signal])))
  }

  private syncTaskNode(sessionId: string, deviceId: string | undefined, index: unknown, evidence: string | undefined, signal: AbortSignal, stepId?: string): void {
    const record = this.requireActiveSession(sessionId)
    if (record.controlMode === 'paused' || record.controlMode === 'manual') this.assertAgentControl(record)
    if (!record.viewerId) return
    const item = this.resolveDevice(record, deviceId)
    AbortSignal.any([record.controller.signal, item.connectionController.signal, signal]).throwIfAborted()
    this.viewers.assertReady(record.viewerId)
    const progress = this.viewers.progress(record.viewerId)
    const board = this.viewers.board(record.viewerId)
    if (progress?.currentStepId && ((stepId !== undefined && stepId !== progress.currentStepId) || (index !== undefined && index !== progress.currentNodeIndex)) && board.testCases.some(test => test.definition.stepId === progress.currentStepId && !test.result)) throw new Error('test_results_incomplete: record checks on the current step before advancing')
    if (!progress && index === undefined && stepId === undefined) return
    if (record.pending.size) throw new OpenGuiError('task_node_busy', 'opengui: await the previous operation before synchronizing task nodes', 'not_executed', 'replan')
    if ((record.task.operations.get(item.device.serial) ?? 0) >= board.operationLimit) throw new OpenGuiError('budget_exhausted', 'opengui: task exceeded its saved operation limit')
    if (evidence !== undefined && (item.needsObservation || item.resultUnknown || !item.observation || item.observation.observationId !== evidence)) {
      throw new OpenGuiError('observation_required', 'opengui: task node evidence must be the latest valid observation on this phone', 'not_executed', 'observe')
    }
    this.viewers.syncNode(record.viewerId, index, evidence, stepId)
  }

  private async runPhoneOperation(
    sessionId: string,
    deviceId: string | undefined,
    signal: AbortSignal,
    operation: (item: SessionDevice, combined: AbortSignal) => Promise<RawPhoneObservation>,
    kind = 'observe',
    label?: string,
  ): Promise<WorkBuddyObservation> {
    const record = this.requireActiveSession(sessionId)
    if (record.purpose === 'mirror') throw new Error('opengui: mirror-only sessions cannot capture model images or control phones')
    this.enforceCommentBudget(record)
    const item = this.resolveDevice(record, deviceId)
    if (record.controlMode === 'paused' || record.controlMode === 'manual') this.assertAgentControl(record)
    const combined = AbortSignal.any([record.controller.signal, record.controlController.signal, item.connectionController.signal, signal])
    const connectionEpoch = item.connectionEpoch ?? 0
    const board = this.viewers.board(record.viewerId!)
    let trace: ReturnType<typeof board.begin> | undefined
    try {
      combined.throwIfAborted()
      this.viewers.assertReady(record.viewerId!)
      const operations = record.task.operations.get(item.device.serial) ?? 0
      if (operations >= board.operationLimit) throw new OpenGuiError('budget_exhausted', 'opengui: task exceeded its saved operation limit')
      record.task.operations.set(item.device.serial, operations + 1)
      board.reserveOperation(item.device.id, operations + 1)
      this.renewLease(record)
      trace = board.begin(item.device.id, kind, this.now(), { label, step: this.viewers.progress(record.viewerId!)?.currentNode })
      const value = await this.track(record, () => operation(item, combined))
      if (kind === 'observe' && trace) trace.label = observationLabel(value.foregroundPackage)
      combined.throwIfAborted()
      if ((item.connectionEpoch ?? 0) !== connectionEpoch) {
        this.host.invalidate?.(item.actor)
        throw new Error('opengui: device disconnected during operation; outcome may be unknown; observe again')
      }
      board.finish(trace, this.now(), 'executed', value.observationId)
      board.capture(value.observationId, value.image.data)
      if (isInputAction(kind)) board.resolveInput(item.device.id)
      if (kind === 'observe') { board.resolveHandoff(value.observationId); board.resolveConnection(item.device.id, value.observationId) }
      item.observation = value
      item.needsObservation = false
      item.resultUnknown = false
      record.resultUnknown = record.devices.some(device => device.resultUnknown)
      record.controlMode = board.inputDiagnostic?.status === 'blocked' ? 'paused' : 'agent'
      board.control = record.controlMode
      this.viewers.awaitUser(record.viewerId!, record.controlMode === 'paused' || board.reviews.some(review => review.status === 'pending') || Boolean(board.pendingReplacement) || Boolean(board.apk?.status === 'prepared' && board.apk.existingApp && !board.apk.updateApprovedAt))
      this.renewLease(record)
      return { ...this.publicObservation(record.id, item.device.id, value), connectionEpoch, progress: this.viewers.progress(record.viewerId!) }
    } catch (error) {
      delete item.observation
      item.needsObservation = true
      this.host.invalidate?.(item.actor)
      record.lastError = error instanceof Error ? error.message : String(error)
      const info = errorInfo(error)
      if (isInputAction(kind) && info.code === 'input_permission_denied') {
        record.controlMode = 'paused'; board.control = 'paused'
        record.controlController.abort(new OpenGuiError('input_permission_denied', 'opengui: Android denied input; wait for user settings and recheck', 'outcome_unknown', 'wait'))
        this.viewers.awaitUser(record.viewerId!, true)
        board.blockInput(inputDiagnostic(item.device, this.now()))
        board.invalidateEnvironment()
      }
      if (trace) board.finish(trace, this.now(), kind !== 'observe' && combined.aborted ? 'unknown' : info.executionState === 'outcome_unknown' ? 'unknown' : 'failed', undefined, info.code)
      if (record.viewerId) this.viewers.pauseNodes(record.viewerId)
      throw error
    }
  }

  private assertAgentControl(record: SessionRecord): void {
    if (record.controlMode !== 'agent') throw new OpenGuiError('task_paused', 'opengui: user control is active or a fresh observation is required after handing back; do not dispatch or replay actions', 'not_executed', record.controlMode === 'reconciling' ? 'observe' : 'wait')
  }

  private async boardAction(viewerId: string, action: BoardAction): Promise<void> {
    const record = [...this.sessions.values()].find(r => r.viewerId === viewerId && r.state === 'active' && r.purpose === 'control')
    if (!record && action === 'disconnect') {
      const board = this.viewers.board(viewerId)
      if (board.control !== 'idle') throw new Error('active_session_required')
      board.control = 'ended'; board.result = { outcome: 'cancelled', summary: '任务已停止。' }; board.checkpoint()
      this.viewers.endTask(viewerId)
      await this.viewers.archiveReports(viewerId)
      return
    }
    if (!record) throw new Error('active_session_required')
    if (action === 'disconnect') { await this.cancel(record.id); return }
    this.enforceCommentBudget(record)
    if (action === 'takeover') {
      record.controlMode = 'manual'
      this.viewers.board(viewerId).control = record.controlMode
      record.controlController.abort(new OpenGuiError('task_paused', 'opengui: user paused control', 'outcome_unknown', 'observe'))
      for (const item of record.devices) { item.needsObservation = true; delete item.observation; this.host.invalidate?.(item.actor) }
      this.viewers.board(viewerId).invalidateEnvironment()
      this.viewers.board(viewerId).pauseHandoff()
      this.viewers.pauseNodes(viewerId)
      this.viewers.awaitUser(viewerId, true)
      return
    }
    await Promise.allSettled([...record.pending])
    if (record.state !== 'active') throw new Error('session_ended')
    await this.status(record.id, AbortSignal.timeout(10_000))
    if (record.devices.some(item => !item.connected || !item.authorized)) throw new Error('device_unavailable: reconnect and authorize the original phone')
    // Recheck and handback both re-run the read-only environment check, so the agent can
    // continue without another round trip; a failed check on handback leaves it stale.
    if (this.viewers.board(viewerId).environment) {
      try { await this.environment(record.id, undefined, 'check', AbortSignal.timeout(15_000), undefined, undefined, true) }
      catch (error) { if (action === 'recheck') throw error; this.viewers.board(viewerId).invalidateEnvironment() }
    }
    // A connection check is not a decision to return a sensitive flow to the agent.
    if (action === 'recheck' && (record.controlMode === 'manual' || this.viewers.board(viewerId).pendingHandoff?.status === 'waiting_user')) return
    if (action === 'recheck') this.viewers.board(viewerId).recheckInput(record.devices[0]!.device.id)
    this.viewers.board(viewerId).recheckConnection(record.devices[0]!.device.id)
    record.controlController = new AbortController()
    record.controlMode = 'reconciling'
    this.viewers.board(viewerId).control = 'reconciling'
    for (const item of record.devices) { item.needsObservation = true; delete item.observation; this.host.invalidate?.(item.actor) }
    try { this.viewers.board(viewerId).resumeHandoff(); this.viewers.board(viewerId).checkpoint() }
    catch (error) {
      record.controlMode = 'manual'; this.viewers.board(viewerId).control = 'manual'
      record.controlController.abort(new OpenGuiError('task_paused', 'opengui: handback could not be saved', 'not_executed', 'wait'))
      throw error
    }
  }

  async requestHandoff(sessionId: string, category: HumanHandoff['category'], reason: string, waitMs: number, signal: AbortSignal): Promise<WorkBuddySessionStatus> {
    signal.throwIfAborted()
    const record = this.requireActiveSession(sessionId)
    if (!record.viewerId || record.purpose !== 'control') throw new Error('control_viewer_required')
    // Revoke control before any durable write, including a write that may fail.
    await this.boardAction(record.viewerId, 'takeover')
    this.viewers.board(record.viewerId).requestHandoff(category, reason)
    return this.waitForUser(sessionId, waitMs, signal) as Promise<WorkBuddySessionStatus>
  }

  reviewComment(sessionId: string, input?: { account: string; target: string; context: string; draft: string; kind?: ContentKind; title?: string }) {
    const record = input ? this.requireActiveSession(sessionId) : this.requireSession(sessionId)
    if (!record.viewerId) throw new Error('viewer_required')
    const board = this.viewers.board(record.viewerId)
    if (!input) return { reviews: board.reviews }
    this.enforceCommentBudget(record)
    const review = board.requestReview(input)
    if (review.status === 'pending') this.viewers.awaitUser(record.viewerId, true)
    return review
  }

  platformDraft(sessionId: string, reviewId: string, text: string, evidenceObservationId: string) {
    const record = this.requireActiveSession(sessionId), item = this.resolveDevice(record, undefined)
    this.enforceCommentBudget(record)
    if (item.needsObservation || item.observation?.observationId !== evidenceObservationId) throw new Error('platform_draft_unverified: cite the latest current phone image')
    return this.viewers.board(record.viewerId!).savePlatformDraft(reviewId, text, evidenceObservationId)
  }

  async commentInput(sessionId: string, reviewId: string, observationId: string, targetBBox: Record<string, unknown>, signal: AbortSignal) {
    const record = this.requireActiveSession(sessionId)
    if (!record.viewerId || record.purpose !== 'control') throw new Error('control_viewer_required')
    const item = this.resolveDevice(record, undefined), board = this.viewers.board(record.viewerId)
    this.assertAgentControl(record); this.enforceCommentBudget(record)
    if (record.apkBusy || record.pending.size) throw new Error('comment_input_busy')
    const review = board.reviews.find(review => review.id === reviewId)
    if (!review || !['pending', 'approved'].includes(review.status)) throw new Error('review_input_unavailable')
    if (item.needsObservation || item.observation?.observationId !== observationId) throw new OpenGuiError('observation_required', 'opengui: identify the current focused comment field on a fresh image', 'not_executed', 'observe')
    if (!environmentReady(board.environment)) throw new Error('environment_blocked')
    const result = await this.runPhoneOperation(sessionId, undefined, signal, (item, combined) => this.host.act(item.actor, { action: 'read_text', observationId, targetBBox }, combined), 'read_text', '核对输入框内容')
    if (result.inputRead?.source !== 'device_clipboard') throw new Error('comment_input_unavailable: host did not return a focused field receipt')
    const updated = board.savePlatformInput(reviewId, result.inputRead.text, result.observationId, 'device_clipboard')
    this.viewers.awaitUser(record.viewerId!, updated.status === 'pending' || Boolean(board.pendingReplacement))
    return { ...result, review: updated }
  }

  testCase(sessionId: string, input: TestCaseCommand) {
    const record = input.command === 'read' ? this.requireSession(sessionId) : this.requireActiveSession(sessionId)
    if (!record.viewerId || record.purpose !== 'control') throw new Error('viewer_required')
    const board = this.viewers.board(record.viewerId), steps = this.viewers.taskSteps(record.viewerId)
    const validateStep = (stepId?: string) => {
      if (steps.length && !steps.some(step => step.stepId === stepId && !['completed', 'failed', 'skipped'].includes(step.status))) throw new Error('test_step_required: bind the case to an unfinished stepId in this task')
      if (!steps.length && stepId) throw new Error('test_step_unknown')
    }
    let test
    if (input.command === 'define') {
      validateStep(input.definition.stepId)
      if (input.definition.kind === 'retest') throw new Error('test_origin_required: use the retest command to link a saved case')
      test = board.defineTest(input.definition)
    } else if (input.command === 'retest') {
      if (input.sourceTaskId === record.viewerId) throw new Error('test_retest_requires_new_task')
      validateStep(input.stepId)
      const history = this.viewers.history(input.sourceTaskId)
      if (Array.isArray(history)) throw new Error('test_source_not_found')
      const source = history.board.testCases?.find(test => test.id === input.sourceCaseId)
      if (!source) throw new Error('test_source_not_found')
      const dependencies = source.definition.dependencies.map(id => {
        const dependency = board.testCases.find(test => test.origin?.taskId === input.sourceTaskId && test.origin.caseId === id)
        if (!dependency) throw new Error('test_retest_dependency_required: copy the source prerequisites into this run first')
        return dependency.id
      })
      const { stepId: _oldStep, ...definition } = structuredClone(source.definition)
      test = board.defineTest({ ...definition, kind: 'retest', context: input.context, dependencies, ...(input.stepId ? { stepId: input.stepId } : {}) }, { taskId: input.sourceTaskId, caseId: source.id, context: structuredClone(source.definition.context), ...(source.result ? { result: structuredClone(source.result) } : {}) })
    } else if (input.command === 'begin') {
      this.assertAgentControl(record)
      if (record.apkBusy || board.apk && board.apk.status !== 'installed') throw new Error('apk_preparation_incomplete')
      if (!environmentReady(board.environment)) throw new Error('environment_blocked: prepare prerequisites before beginning a test')
      test = board.testCases.find(test => test.id === input.caseId)
      if (!test) throw new Error('test_case_not_found')
      validateStep(test.definition.stepId)
      const item = this.resolveDevice(record, undefined)
      AbortSignal.any([record.controller.signal, record.controlController.signal, item.connectionController.signal]).throwIfAborted()
      this.viewers.assertReady(record.viewerId)
      if (record.pending.size) throw new OpenGuiError('task_node_busy', 'opengui: await the previous operation before beginning another check', 'not_executed', 'wait')
      const currentStep = this.viewers.progress(record.viewerId)?.currentStepId
      if (currentStep && currentStep !== test.definition.stepId) {
        if (board.testCases.some(test => test.definition.stepId === currentStep && !test.result)) throw new Error('test_results_incomplete: record checks on the current step before advancing')
        if (item.needsObservation || item.resultUnknown || !item.observation) throw new OpenGuiError('observation_required', 'opengui: beginning the next check requires the latest valid phone evidence', 'not_executed', 'observe')
      }
      // Case activation consumes no phone operation; the next observe/act still enforces its budget.
      test = this.viewers.beginTest(record.viewerId, input.caseId, test.definition.stepId, item.observation?.observationId)
    } else if (input.command === 'result') {
      test = board.testCases.find(test => test.id === input.caseId)
      if (!test) throw new Error('test_case_not_found')
      if (['passed', 'failed'].includes(input.result.status)) {
        this.assertAgentControl(record)
        const item = this.resolveDevice(record, undefined)
        if (record.pending.size || item.needsObservation || item.resultUnknown || !item.observation || !input.result.evidenceObservationIds.includes(item.observation.observationId)) throw new Error('test_current_evidence_required: inspect and cite the latest valid phone image')
        if (test.definition.stepId && this.viewers.progress(record.viewerId)?.currentStepId !== test.definition.stepId) throw new Error('test_step_mismatch')
      }
      test = board.recordTest(input.caseId, input.result)
      if (test.definition.stepId && input.result.status === 'not_checked') {
        const related = board.testCases.filter(item => item.definition.stepId === test!.definition.stepId)
        const step = steps.find(step => step.stepId === test!.definition.stepId)
        if (step && !['completed', 'failed', 'skipped'].includes(step.status) && related.every(item => item.result?.status === 'not_checked')) this.viewers.settleNode(record.viewerId, step.stepId, 'skipped', input.result.reason!)
      }
    } else if (input.caseId) {
      test = board.testCases.find(test => test.id === input.caseId)
      if (!test) throw new Error('test_case_not_found')
    }
    return { ...(test ? { test, comparison: retestComparison(test) } : { cases: board.testCases }), summary: testSummary(board.testCases), progress: this.viewers.progress(record.viewerId) }
  }

  async waitForUser(sessionId: string, waitMs: number, signal: AbortSignal, review = false) {
    const record = this.requireSession(sessionId)
    await waitForEvent(listener => this.viewers.onTaskChange(record.viewerId!, listener), () => {
      const pending = record.state === 'active' && (review
        ? this.viewers.board(record.viewerId!).reviews.some(item => item.status === 'pending') || Boolean(this.viewers.board(record.viewerId!).pendingReplacement)
        : record.controlMode === 'paused' || record.controlMode === 'manual')
      return !pending
    }, Math.min(review ? 30_000 : HUMAN_CONTROL_WAIT_MS, Math.max(0, waitMs)), signal)
    return review ? this.reviewComment(sessionId) : this.snapshot(record)
  }

  verifyComment(sessionId: string, reviewId: string, evidenceObservationId: string) {
    const record = this.requireActiveSession(sessionId), item = this.resolveDevice(record, undefined)
    const review = this.viewers.board(record.viewerId!).reviews.find(r => r.id === reviewId)
    if (!review || !['submitted', 'unknown'].includes(review.status) || item.needsObservation || !item.observation || item.observation.observationId !== evidenceObservationId) throw new Error('comment_unverified: use the latest observation for a submitted comment')
    const board = this.viewers.board(record.viewerId!)
    const saved = board.updateReview(review.id, { status: 'sent', evidenceObservationId })
    const reason = board.commentStopReason(this.now())
    if (reason) void this.stopCommentBudget(record, reason).catch(() => { record.lastError = 'comment_budget_stop_failed: control remains paused' })
    return saved
  }

  private publicObservation(sessionId: string, deviceId: string, value: RawPhoneObservation): WorkBuddyObservation {
    return {
      sessionId,
      deviceId,
      observationId: value.observationId,
      ...(value.inputRead ? { inputRead: value.inputRead } : {}),
      ...(value.unchangedFromObservationId === undefined ? {} : { unchangedFromObservationId: value.unchangedFromObservationId }),
      width: value.width,
      height: value.height,
      foregroundPackage: value.foregroundPackage,
      ...(value.capturedAt ? { capturedAt: value.capturedAt } : {}),
      ...(value.settled !== undefined ? { settled: value.settled } : {}),
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
      this.enforceCommentBudget(record)
      return operation()
    })
    record.pending.add(pending)
    try { return await pending } finally { record.pending.delete(pending) }
  }

  /** Keep leases until in-flight work and owned resource cleanup have both drained. */
  private cleanup(record: SessionRecord): Promise<void> {
    clearTimeout(record.commentTimer)
    clearTimeout(record.leaseTimer)
    record.cleanup ??= (async () => {
      await Promise.allSettled([...record.pending])
      await record.apk?.dispose(); delete record.apk
      await this.releaseDeviceResources(record)
      this.release(record)
    })()
    return record.cleanup
  }

  private enforceCommentBudget(record: SessionRecord): void {
    const reason = record.viewerId ? this.viewers.board(record.viewerId).commentStopReason(this.now()) : undefined
    if (!reason) return
    void this.stopCommentBudget(record, reason).catch(() => { record.lastError = 'comment_budget_stop_failed: control remains paused' })
    throw new OpenGuiError('comment_budget_exhausted', 'opengui: the saved comment stopping condition was reached; no further phone or inference calls are permitted', 'not_executed', 'stop')
  }
  private armCommentBudget(record: SessionRecord): void {
    clearTimeout(record.commentTimer)
    if (!record.viewerId) return
    const board = this.viewers.board(record.viewerId), reason = board.commentStopReason(this.now())
    if (reason) { void this.stopCommentBudget(record, reason).catch(() => { record.lastError = 'comment_budget_stop_failed' }); return }
    if (!board.commentBudget?.deadlineAt) return
    record.commentTimer = setTimeout(() => {
      if (record.state === 'active') this.armCommentBudget(record)
    }, Math.max(0, Date.parse(board.commentBudget.deadlineAt) - this.now()))
    record.commentTimer.unref()
  }
  private async stopCommentBudget(record: SessionRecord, reason: NonNullable<CommentBudget['stopReason']>): Promise<void> {
    if (record.state !== 'active' || !record.viewerId) return
    record.controlMode = 'paused'
    record.controlController.abort(new OpenGuiError('comment_budget_exhausted', 'opengui: comment run stopped at its saved limit', 'outcome_unknown', 'stop'))
    const board = this.viewers.board(record.viewerId)
    board.control = 'paused'; board.stopComments(reason, this.now())
    const counts = board.comments
    await this.closeSession(record.id, { outcome: 'stopped', summary: `${reason === 'target_reached' ? '已达到约定的核验成功数量，停止本次评论任务。' : '已达到约定运行时长，停止本次评论任务。'}已核验 ${counts.sent}${counts.targetCount ? '／' + counts.targetCount : ''} 条；已提交／结果未确认 ${counts.submitted + counts.unknown} 条。未完成步骤保留，不继续搜索或发送。`, evidenceObservationIds: record.devices.flatMap(item => item.observation ? [item.observation.observationId] : []) })
  }

  /** A view or status poll never extends the control lease. */
  /** A person is expected to act in the workbench or on the phone before the agent continues. */
  private awaitingUser(record: SessionRecord): boolean {
    if (record.controlMode === 'paused' || record.controlMode === 'manual') return true
    if (!record.viewerId) return false
    const board = this.viewers.board(record.viewerId)
    return board.reviews.some(review => review.status === 'pending') || Boolean(board.pendingReplacement)
      || board.pendingHandoff?.status === 'waiting_user'
      || Boolean(record.apk?.record.existingApp && record.apk.record.status === 'prepared' && !record.apk.record.updateApprovedAt)
  }

  private renewLease(record: SessionRecord): void {
    if (record.purpose !== 'control' || record.state !== 'active') return
    clearTimeout(record.leaseTimer)
    record.lastActivity = this.now()
    delete record.awaitingUserSince
    const expire = (): void => {
      if (record.state !== 'active') return
      if (record.pending.size > 0) {
        record.leaseTimer = setTimeout(expire, 1000)
        record.leaseTimer.unref()
        return
      }
      // Entering a code, passing a slider or reviewing drafts is not idleness. Keep the
      // device for the person, bounded so an abandoned host still releases the phone.
      if (this.awaitingUser(record)) {
        record.awaitingUserSince ??= this.now()
        if (this.now() - record.awaitingUserSince < USER_WAIT_LIMIT_MS) {
          record.leaseTimer = setTimeout(expire, this.leaseMs)
          record.leaseTimer.unref()
          return
        }
      }
      record.lastError = '控制超时：长时间没有新的执行动作，已结束本次控制。原任务记录已保留，可在聊天中继续。'
      void this.closeSession(record.id, { outcome: 'blocked', summary: record.lastError }).catch(() => undefined)
    }
    record.leaseTimer = setTimeout(expire, this.leaseMs)
    record.leaseTimer.unref()
  }

  snapshotSession(sessionId: string): WorkBuddySessionStatus { return this.snapshot(this.requireSession(sessionId)) }

  findSession(sessionId: string): WorkBuddySessionStatus | undefined {
    const record = this.sessions.get(sessionId)
    return record ? this.snapshot(record) : undefined
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
    if (value === 'submit' || value === 'send' || value === 'publish' || value === 'purchase' || value === 'delete') return value
    throw new Error('opengui: externalSideEffect must be none, submit, send, publish, purchase, or delete')
  }

  private pruneClosedSessions(): void {
    const closed = [...this.sessions.values()].filter(record => record.state !== 'active')
    for (const record of closed.slice(0, Math.max(0, closed.length - 100))) {
      this.sessions.delete(record.id)
      this.wall.forget(record.id)
    }
  }
}
