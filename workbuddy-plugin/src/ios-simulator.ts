import { basename, isAbsolute, join } from 'node:path'
import sharp from 'sharp'
import { deviceIdentity } from './device-identity.ts'
import { workbuddyStateDir } from './state.ts'
import { PhoneController } from './phone-controller.ts'
import { actionCommand, type PhoneAction, type PhoneCoordinateSpace } from './adb.ts'
import { encodeWorkBuddyPhoneScreenshot } from './screenshot.ts'
import { OpenGuiError } from './errors.ts'
import { IosDriver, runSimulatorCommand } from './ios-driver.ts'
import type { WorkBuddyPhoneHost, ResolvedWorkBuddyDevice, WorkBuddyDeviceInfo } from './service.ts'
import type { ViewerStreams } from './viewer.ts'
import type { VideoDevice, ScrcpyStreamSink } from './scrcpy-stream.ts'
import type { EnvironmentSpec, EnvironmentState } from './environment.ts'

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu
export function simulatorUdid(serial: string): string {
  const udid = serial.startsWith('ios-simulator:') ? serial.slice(14) : ''
  if (!UUID.test(udid)) throw new OpenGuiError('ios_simulator_identity_invalid', 'opengui: only an explicitly discovered iOS simulator may be used')
  return udid
}
/** Read only the application-process envelope; UI labels and controls are never projected. */
export function iosApplicationPid(raw: string): number | undefined {
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024) return undefined
  try {
    const value = JSON.parse(raw) as unknown
    const roots = Array.isArray(value) ? value : [value]
    const root = roots.length === 1 ? roots[0] as Record<string, unknown> | null : null
    const pid = root?.pid
    return root?.type === 'Application' && root.role === 'AXApplication' && Number.isSafeInteger(pid) && Number(pid) > 0 && Number(pid) <= 2_147_483_647 ? Number(pid) : undefined
  } catch { return undefined }
}
/** Only simulator rows from iOS runtimes; physical devices never enter this adapter. */
export function parseIosSimulators(raw: string): Array<{ serial: string; name: string; osVersion: string; connected: boolean }> {
  const data = JSON.parse(raw) as { devices?: Record<string, Array<Record<string, unknown>>> }
  if (!data.devices || typeof data.devices !== 'object' || Array.isArray(data.devices)) throw new Error('ios_simulator_discovery_invalid')
  const rows: ReturnType<typeof parseIosSimulators> = []
  const seen = new Set<string>()
  for (const [runtime, devices] of Object.entries(data.devices)) {
    const version = runtime.match(/^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+(?:-\d+){0,2})$/u)?.[1]?.replaceAll('-', '.')
    if (!version || !Array.isArray(devices)) continue
    for (const device of devices) {
      if (device.isAvailable !== true || typeof device.udid !== 'string' || !UUID.test(device.udid) || typeof device.name !== 'string' || seen.has(device.udid.toUpperCase())) continue
      seen.add(device.udid.toUpperCase())
      rows.push({ serial: `ios-simulator:${device.udid.toUpperCase()}`, name: device.name.replace(/[\u0000-\u001f]/gu, '').slice(0, 100), osVersion: version, connected: device.state === 'Booted' })
      if (rows.length > 128) throw new Error('ios_simulator_discovery_limit')
    }
  }
  return rows
}

/** Resolve screenshot coordinates to simulator points, never host desktop coordinates. */
export function iosActionArgs(action: PhoneAction, screen: PhoneCoordinateSpace): string[] {
  if (action.action === 'tap') { const command = actionCommand(action, screen)!; return ['tap', '-x', command[3]!, '-y', command[4]!, '--tap-style', 'physical'] }
  if (action.action === 'swipe') { const command = actionCommand(action, screen)!; return ['swipe', '--start-x', command[3]!, '--start-y', command[4]!, '--end-x', command[5]!, '--end-y', command[6]!, '--duration', String(Number(command[7]) / 1000)] }
  if (action.action === 'key' && action.key === 'Home') return ['button', 'home']
  if (action.action === 'text') {
    if (action.text.length < 1 || [...action.text].length > 500 || /[\u0000-\u001f\u007f]/u.test(action.text)) throw new OpenGuiError('ios_text_unsupported', 'opengui: iOS test input supports single-line text up to 500 characters')
    return ['key-combo', '--modifiers', '227', '--key', '25']
  }
  if (action.action === 'launch') { actionCommand(action, screen); return [] }
  throw new OpenGuiError('ios_action_unsupported', 'opengui: this iOS simulator action is unavailable; use a visible in-app control or hand off to the user')
}

export interface IosSimulatorOptions {
  stateDir?: string
  platform?: NodeJS.Platform
  run?: typeof runSimulatorCommand
  driver?: { ensure(signal: AbortSignal): Promise<string> }
}

/** iOS simulator-only host, reusing the existing execution kernel and task guards. */
export class IosSimulatorHost implements WorkBuddyPhoneHost {
  readonly videoStreams: ViewerStreams
  onDeviceUnavailable?: (serial: string) => void
  private readonly platform: NodeJS.Platform
  private readonly run: typeof runSimulatorCommand
  private readonly driver: { ensure(signal: AbortSignal): Promise<string> }
  private readonly controller: PhoneController
  private identity: Promise<(serial: string) => string> | undefined
  private readonly directory: string
  private devices: ResolvedWorkBuddyDevice[] = []
  private readonly subscriptions = new Set<AbortController>()
  private readonly lifetime = new AbortController()
  constructor(options: IosSimulatorOptions = {}) {
    const directory = workbuddyStateDir(options.stateDir)
    this.platform = options.platform ?? process.platform
    this.run = options.run ?? runSimulatorCommand
    this.driver = options.driver ?? new IosDriver(join(directory, 'ios-driver'))
    this.directory = directory
    this.controller = new PhoneController({
      runAdb: async () => { throw new Error('ios_adb_unavailable') },
      discoverTarget: async signal => (await this.resolveDevices(undefined, signal))[0]!.serial,
      validateTarget: (serial, signal) => this.assertTarget(serial, signal),
      pasteUnicode: async () => { throw new Error('ios_scrcpy_unavailable') },
      captureDevice: (serial, signal) => this.capture(serial, signal),
      validateAction: (action, screen) => { iosActionArgs(action, screen) },
      dispatchAction: (serial, action, screen, signal) => this.dispatch(serial, action, screen, signal),
      encodeScreenshot: encodeWorkBuddyPhoneScreenshot,
      maxOperations: () => 10_100,
    })
    this.videoStreams = {
      prepare: async signal => { await this.driver.ensure(signal) },
      subscribe: (device, sink) => this.subscribe(device, sink),
      dispose: async () => { for (const controller of this.subscriptions) controller.abort() },
    }
  }
  async listDevices(signal: AbortSignal): Promise<readonly WorkBuddyDeviceInfo[]> {
    if (this.platform !== 'darwin') return []
    const raw = await this.run('/usr/bin/xcrun', ['simctl', 'list', 'devices', '-j'], signal)
    const identify = await (this.identity ??= deviceIdentity(this.directory)); signal.throwIfAborted()
    this.devices = parseIosSimulators(String(raw)).map(row => ({ ...row, id: identify(row.serial), manufacturer: 'Apple', model: row.name, os: 'ios', serialSuffix: row.serial.slice(-4), connection: 'local_simulator', state: row.connected ? 'device' : 'shutdown', authorized: row.connected }))
    return this.devices.map(({ serial: _serial, ...device }) => device)
  }
  async resolveDevices(ids: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]> {
    await this.listDevices(signal)
    const available = this.devices.filter(device => device.connected)
    if (!ids?.length && available.length !== 1) throw new OpenGuiError('ios_selection_required', 'opengui: select one booted iOS simulator')
    const chosen = [...new Set(ids?.length ? ids : [available[0]!.id])]
    return chosen.map(id => { const device = available.find(row => row.id === id); if (!device) throw new OpenGuiError('device_offline', 'opengui: boot the original iOS simulator and detect again'); return device })
  }
  async resolveArchivedDevices(rows: readonly { id: string; serial: string }[], signal: AbortSignal) {
    await this.listDevices(signal)
    return rows.map(row => { const device = this.devices.find(device => device.serial === row.serial && device.connected); if (!device) throw new OpenGuiError('device_offline', 'opengui: reconnect the original archived simulator'); return device })
  }
  private async assertTarget(serial: string, signal: AbortSignal): Promise<void> {
    simulatorUdid(serial); await this.listDevices(signal)
    if (!this.devices.some(device => device.serial === serial && device.connected)) { this.onDeviceUnavailable?.(serial); throw new OpenGuiError('device_offline', 'opengui: the original iOS simulator is no longer booted') }
  }
  private async foreground(serial: string, signal: AbortSignal): Promise<{ pid: number; packageName: string } | undefined> {
    try {
      const udid = simulatorUdid(serial), executable = await this.driver.ensure(signal)
      const pid = iosApplicationPid(String(await this.run(executable, ['describe-ui', '--udid', udid], signal)))
      if (!pid) return undefined
      const processPath = String(await this.run('/bin/ps', ['-p', String(pid), '-o', 'comm='], signal)).trim()
      const boundary = processPath.lastIndexOf('.app/')
      if (!isAbsolute(processPath) || boundary < 0 || processPath.length > 4096 || /[\u0000-\u001f\u007f]/u.test(processPath) || processPath.split('/').includes('..')) return undefined
      const bundle = processPath.slice(0, boundary + 4), plist = join(bundle, 'Info.plist')
      const [id, name] = await Promise.all([
        this.run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist], signal),
        this.run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', plist], signal),
      ])
      const packageName = String(id).trim(), executableName = String(name).trim()
      if (packageName.length > 200 || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/u.test(packageName) || !executableName || executableName.length > 200 || basename(executableName) !== executableName || /[\u0000-\u001f\u007f]/u.test(executableName) || join(bundle, executableName) !== processPath) return undefined
      const container = String(await this.run('/usr/bin/xcrun', ['simctl', 'get_app_container', udid, packageName, 'app'], signal)).trim()
      return container === bundle ? { pid, packageName } : undefined
    } catch { signal.throwIfAborted(); return undefined }
  }
  private async capture(serial: string, signal: AbortSignal, withForeground = true) {
    const udid = simulatorUdid(serial)
    const before = withForeground ? await this.foreground(serial, signal) : undefined
    const [source, scaleRaw] = await Promise.all([
      this.run('/usr/bin/xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', '-'], signal, undefined, true),
      this.run('/usr/bin/xcrun', ['simctl', 'getenv', udid, 'SIMULATOR_MAINSCREEN_SCALE'], signal),
    ])
    const scale = Number(String(scaleRaw).trim()), info = await sharp(source, { limitInputPixels: 40_000_000 }).metadata()
    if (!info.width || !info.height || ![1, 2, 3, 4].includes(scale) || info.width % scale || info.height % scale) throw new OpenGuiError('ios_screen_unknown', 'opengui: simulator display scale could not be verified')
    const after = before ? await this.foreground(serial, signal) : undefined
    const foregroundPackage = before && after && before.pid === after.pid && before.packageName === after.packageName ? after.packageName : ''
    return { source, width: info.width / scale, height: info.height / scale, foregroundPackage }
  }
  private async dispatch(serial: string, action: PhoneAction, screen: PhoneCoordinateSpace, signal: AbortSignal): Promise<void> {
    const args = iosActionArgs(action, screen), udid = simulatorUdid(serial)
    await this.assertTarget(serial, signal)
    if (action.action === 'launch') { await this.run('/usr/bin/xcrun', ['simctl', 'launch', udid, action.packageName], signal); return }
    const executable = await this.driver.ensure(signal)
    if (action.action !== 'text') { await this.run(executable, [...args, '--udid', udid], signal); return }
    // Clipboard contents remain in memory; never print them or persist them as diagnostics.
    const previous = await this.run('/usr/bin/xcrun', ['simctl', 'pbpaste', udid], signal)
    if (previous.length > 256 * 1024 || !Buffer.from(previous.toString('utf8')).equals(previous)) throw new OpenGuiError('ios_clipboard_unsupported', 'opengui: simulator clipboard cannot be preserved as bounded UTF-8 text')
    await this.run('/usr/bin/xcrun', ['simctl', 'pbcopy', udid], signal, action.text)
    if (String(await this.run('/usr/bin/xcrun', ['simctl', 'pbpaste', udid], signal)) !== action.text) throw new OpenGuiError('ios_clipboard_unconfirmed', 'opengui: simulator paste text could not be confirmed')
    await this.run(executable, [...args, '--udid', udid], signal)
    // An unrelated clipboard change must never be overwritten by cleanup.
    if (!signal.aborted && String(await this.run('/usr/bin/xcrun', ['simctl', 'pbpaste', udid], signal)) === action.text) await this.run('/usr/bin/xcrun', ['simctl', 'pbcopy', udid], signal, String(previous))
  }
  assignTarget(actor: object, serial: string): void { simulatorUdid(serial); this.controller.assignTarget(actor, serial) }
  observe(actor: object, signal: AbortSignal) { return this.controller.observe(actor, signal) }
  act(actor: object, input: Record<string, unknown>, signal: AbortSignal) { return this.controller.execute(actor, input, signal) }
  invalidate(actor: object): void { this.controller.invalidate(actor) }
  status(actor: object) { return this.controller.status(actor) }
  async preview(device: ResolvedWorkBuddyDevice, signal: AbortSignal): Promise<Buffer> {
    await this.assertTarget(device.serial, signal)
    return (await encodeWorkBuddyPhoneScreenshot((await this.capture(device.serial, signal, false)).source)).data
  }
  async releaseDevice(_serial: string): Promise<void> {}
  async dispose(): Promise<void> { this.lifetime.abort(); for (const controller of this.subscriptions) controller.abort(); this.subscriptions.clear() }
  async checkEnvironment(device: ResolvedWorkBuddyDevice, spec: EnvironmentSpec, signal: AbortSignal): Promise<EnvironmentState> {
    await this.assertTarget(device.serial, signal)
    const state: EnvironmentState = { spec: structuredClone(spec), deviceId: device.id, stale: false, checkedAt: new Date().toISOString(), checks: [] }
    const add = (id: string, label: string, required: boolean, status: 'passed' | 'failed' | 'unknown', detail: string, source: 'simctl' | 'model_observation' = 'simctl') => state.checks.push({ id, label, required, status, detail, source })
    add('ios', 'iOS 模拟器版本', true, device.osVersion ? 'passed' : 'unknown', device.osVersion ?? '版本未知')
    try {
      const raw = String(await this.run('/usr/bin/xcrun', ['simctl', 'listapps', simulatorUdid(device.serial)], signal))
      const apps = JSON.parse(String(await this.run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], signal, raw))) as Record<string, Record<string, unknown>>
      const app = apps[spec.packageName]
      add('app', '目标应用已安装', true, app ? 'passed' : 'failed', app ? '已安装目标 Bundle ID' : '模拟器未安装目标应用')
      let version: string | undefined
      if (app) {
        try {
          const path = String(await this.run('/usr/bin/xcrun', ['simctl', 'get_app_container', simulatorUdid(device.serial), spec.packageName, 'app'], signal)).trim()
          if (path.startsWith('/') && path.endsWith('.app') && !/[\u0000-\u001f]/u.test(path)) {
            const value = String(await this.run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(path, 'Info.plist')], signal)).trim()
            if (value.length >= 1 && value.length <= 100 && !/[\u0000-\u001f]/u.test(value)) version = value
          }
        } catch { signal.throwIfAborted() }
      }
      add('version', '目标应用版本', Boolean(spec.expectedVersion), typeof version === 'string' ? !spec.expectedVersion || version === spec.expectedVersion ? 'passed' : 'failed' : 'unknown', typeof version === 'string' ? `实际 ${version}` : '版本未知')
    } catch { signal.throwIfAborted(); add('app', '目标应用已安装', true, 'unknown', '安装状态未能读取'); add('version', '目标应用版本', Boolean(spec.expectedVersion), 'unknown', '版本未知') }
    for (const name of spec.requiredPermissions) add(`permission:${name}`, `权限 ${name}`, true, 'unknown', '未提供可靠的 iOS 权限读取；由用户核对，不自动授权')
    if (spec.requireAccount) add('account', '所需测试账号', true, 'unknown', '尚未核对当前目标应用与账号', 'model_observation')
    if (spec.requireService) add('service', '所需测试服务／环境', true, 'unknown', '模拟器不等于测试环境', 'model_observation')
    return state
  }
  private async subscribe(device: VideoDevice, sink: ScrcpyStreamSink): Promise<() => void> {
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, this.lifetime.signal])
    this.subscriptions.add(controller)
    const release = () => { controller.abort(); this.subscriptions.delete(controller) }
    sink.onClose(release)
    sink.sendText(JSON.stringify({ type: 'codec', codec: 'jpeg', mode: 'interval', intervalMs: 1000 }))
    sink.sendText(JSON.stringify({ type: 'session' }))
    void (async () => {
      while (!signal.aborted) {
        if (sink.bufferedBytes() > 2_000_000) { sink.close(1013, 'slow_client'); return }
        await this.assertTarget(device.serial, signal)
        const frame = (await encodeWorkBuddyPhoneScreenshot((await this.capture(device.serial, signal, false)).source)).data
        signal.throwIfAborted()
        if (sink.bufferedBytes() < 500_000) { const packet = Buffer.alloc(9 + frame.length); packet[0] = 4; packet.writeBigUInt64BE(BigInt(Date.now()), 1); frame.copy(packet, 9); sink.sendBinary(packet) }
        await new Promise<void>(resolve => { const timer = setTimeout(done, 1000); function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }; signal.addEventListener('abort', done, { once: true }) })
      }
    })().catch(() => { if (!signal.aborted) { sink.sendText(JSON.stringify({ type: 'error', message: 'ios_display_unavailable：模拟器画面中断，请重新检测原设备' })); sink.close(1011, 'ios_display_unavailable') } }).finally(release)
    return release
  }
}
