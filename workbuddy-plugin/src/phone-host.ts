import type { WorkBuddyPhoneHost, ResolvedWorkBuddyDevice } from './service.ts'
import type { ViewerStreams } from './viewer.ts'
import type { MirrorStatus } from './mirror.ts'
import { OpenGuiError } from './errors.ts'
import { simulatorUdid } from './ios-simulator.ts'
import { connectionDiagnostic } from './connection-diagnostics.ts'

/** Route frozen devices and actors without changing either platform's executor. */
export class CombinedPhoneHost implements WorkBuddyPhoneHost {
  readonly videoStreams: ViewerStreams
  onDeviceUnavailable?: (serial: string) => void
  onMirrorEnded?: (serial: string) => void
  private readonly actors = new WeakMap<object, WorkBuddyPhoneHost>()
  private readonly deviceHosts = new Map<string, WorkBuddyPhoneHost>()
  constructor(private readonly android: WorkBuddyPhoneHost, private readonly ios: WorkBuddyPhoneHost) {
    for (const host of [android, ios]) {
      host.onDeviceUnavailable = serial => this.onDeviceUnavailable?.(serial)
      host.onMirrorEnded = serial => this.onMirrorEnded?.(serial)
    }
    this.videoStreams = {
      prepare: async (signal, devices) => {
        if (!devices?.length) return
        const hosts = new Set(devices.map(device => this.hostFor(device.serial)))
        for (const host of hosts) { if (!host.videoStreams) throw new Error('video_unavailable'); await host.videoStreams.prepare(signal, devices.filter(device => this.hostFor(device.serial) === host)) }
      },
      subscribe: (device, sink) => { const streams = this.hostFor(device.serial).videoStreams; if (!streams) throw new Error('video_unavailable'); return streams.subscribe(device, sink) },
      dispose: async () => { await Promise.allSettled([android.videoStreams?.dispose(), ios.videoStreams?.dispose()]) },
    }
  }
  private hostFor(serial: string): WorkBuddyPhoneHost {
    if (serial.startsWith('ios-simulator:')) { simulatorUdid(serial); return this.ios }
    return this.android
  }
  async listDevices(signal: AbortSignal, refresh?: boolean) {
    const results = await Promise.allSettled([this.android.listDevices(signal, refresh), this.ios.listDevices(signal, refresh)])
    signal.throwIfAborted()
    if (results.every(result => result.status === 'rejected')) throw new OpenGuiError('device_discovery_failed', 'opengui: device discovery failed; check ADB/Xcode and detect again')
    const rows = results.flatMap((result, index) => result.status === 'fulfilled' ? result.value.map(device => { this.deviceHosts.set(device.id, index ? this.ios : this.android); return device }) : [])
    return rows
  }
  diagnoseConnection(signal: AbortSignal) { return this.android.diagnoseConnection?.(signal) ?? Promise.resolve(connectionDiagnostic(undefined, { status: 'unknown' })) }
  async resolveDevices(ids: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedWorkBuddyDevice[]> {
    const rows = await this.listDevices(signal), available = rows.filter(row => row.connected && row.authorized)
    const selected = ids?.length ? [...new Set(ids)] : available.length === 1 ? [available[0]!.id] : []
    if (!selected.length) throw new OpenGuiError(available.length ? 'device_selection_required' : 'device_offline', 'opengui: select one available Android device or booted iOS simulator')
    const devices: ResolvedWorkBuddyDevice[] = []
    for (const id of selected) {
      const host = this.deviceHosts.get(id)
      if (!host || !available.some(row => row.id === id)) throw new OpenGuiError('device_offline', 'opengui: original selected device is unavailable')
      devices.push(...await host.resolveDevices([id], signal))
    }
    return devices
  }
  async resolveArchivedDevices(devices: readonly { id: string; serial: string }[], signal: AbortSignal) {
    const resolved: ResolvedWorkBuddyDevice[] = []
    for (const device of devices) {
      const host = this.hostFor(device.serial)
      if (!host.resolveArchivedDevices) throw new OpenGuiError('device_recovery_unavailable', 'opengui: original device recovery is unavailable')
      resolved.push(...await host.resolveArchivedDevices([device], signal))
    }
    return resolved
  }
  assignTarget(actor: object, serial: string): void {
    const host = this.hostFor(serial), previous = this.actors.get(actor)
    if (previous && previous !== host) throw new Error('device_frozen')
    host.assignTarget(actor, serial); this.actors.set(actor, host)
  }
  private actorHost(actor: object): WorkBuddyPhoneHost { const host = this.actors.get(actor); if (!host) throw new Error('device_binding_required'); return host }
  observe(actor: object, signal: AbortSignal) { return this.actorHost(actor).observe(actor, signal) }
  act(actor: object, input: Record<string, unknown>, signal: AbortSignal) { return this.actorHost(actor).act(actor, input, signal) }
  status(actor: object) { return this.actorHost(actor).status(actor) }
  invalidate(actor: object): void { this.actorHost(actor).invalidate?.(actor) }
  preview(device: ResolvedWorkBuddyDevice, signal: AbortSignal) { return this.hostFor(device.serial).preview(device, signal) }
  releaseDevice(serial: string) { return this.hostFor(serial).releaseDevice(serial) }
  async checkEnvironment(device: ResolvedWorkBuddyDevice, spec: Parameters<NonNullable<WorkBuddyPhoneHost['checkEnvironment']>>[1], signal: AbortSignal) {
    const host = this.hostFor(device.serial)
    if (!host.checkEnvironment) throw new Error('environment_unavailable')
    return host.checkEnvironment(device, spec, signal)
  }
  async installApk(device: ResolvedWorkBuddyDevice, apk: Parameters<NonNullable<WorkBuddyPhoneHost['installApk']>>[1], signal: AbortSignal) {
    const host = this.hostFor(device.serial)
    if (!host.installApk) throw new OpenGuiError('apk_platform_unsupported', 'opengui: APK installation is only supported on Android')
    return host.installApk(device, apk, signal)
  }
  async activateMirrors(signal: AbortSignal): Promise<void> { await this.android.activateMirrors?.(signal) }
  hasMirrors(): boolean { return this.android.hasMirrors?.() ?? false }
  async inspectMirror(serial: string): Promise<MirrorStatus> { return await this.hostFor(serial).inspectMirror?.(serial) ?? { phase: 'idle' } }
  async openMirror(device: ResolvedWorkBuddyDevice, signal: AbortSignal): Promise<void> { await this.hostFor(device.serial).openMirror?.(device, signal) }
  async closeMirror(serial: string): Promise<void> { await this.hostFor(serial).closeMirror?.(serial) }
  mirrorStatus(serial: string): MirrorStatus { return this.hostFor(serial).mirrorStatus?.(serial) ?? { phase: 'idle' } }
  async dispose(): Promise<void> { await Promise.allSettled([this.android.dispose(), this.ios.dispose()]) }
}
