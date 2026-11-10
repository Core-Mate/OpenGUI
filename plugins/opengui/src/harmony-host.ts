import type { CodexDeviceInfo, CodexPhoneHost, ResolvedCodexDevice } from './codex/service.ts'
import type { AdbDevice } from './adb.ts'
import { DeviceFleet } from './device-fleet.ts'
import { createHdcRunner, hdcShell, parseHdcDevices } from './hdc.ts'
import type { HdcRunner } from './hdc.ts'
import { HarmonyPhoneDriver } from './harmony-driver.ts'
import { PhoneController } from './phone-controller.ts'
import { encodeCodexPhoneScreenshot } from './codex/screenshot.ts'
import { MAX_DEVICES, MAX_OPERATIONS } from './phone-limits.ts'

/** The existing session/CLI service can use HarmonyOS without initializing ADB/scrcpy. */
export class LocalHarmonyPhoneHost implements CodexPhoneHost {
  private readonly fleet: DeviceFleet
  private readonly driver: HarmonyPhoneDriver
  private readonly controller: PhoneController
  private readonly models = new Map<string, string>()

  constructor(private readonly run: HdcRunner = createHdcRunner()) {
    this.fleet = new DeviceFleet(signal => this.discover(signal))
    this.driver = new HarmonyPhoneDriver(run)
    this.controller = new PhoneController({
      driver: this.driver,
      discoverTarget: async signal => {
        const devices = await this.fleet.selectedDevices(signal)
        if (devices.length !== 1) throw new Error('opengui: select exactly one HarmonyOS device for an unbound operation')
        return devices[0]!.serial
      },
      validateTarget: async (serial, signal) => {
        const devices = await this.discover(signal)
        if (!devices.some(device => device.serial === serial && device.state === 'device')) {
          this.driver.invalidate(serial)
          throw new Error('opengui: the selected HarmonyOS device disconnected or lost debugging authorization')
        }
      },
      encodeScreenshot: encodeCodexPhoneScreenshot,
      maxOperations: () => MAX_OPERATIONS,
    })
  }

  private async discover(signal: AbortSignal): Promise<AdbDevice[]> {
    const devices = parseHdcDevices(await this.run(['list', 'targets', '-v'], signal))
    for (const device of devices) {
      if (device.state === 'device' && !this.models.has(device.serial)) {
        const model = await hdcShell(this.run, device.serial, ['param', 'get', 'const.product.model'], signal)
        this.models.set(device.serial, model.slice(0, 100) || 'HarmonyOS')
      }
      device.model = this.models.get(device.serial) ?? device.model ?? 'HarmonyOS'
    }
    return devices
  }

  async listDevices(signal: AbortSignal): Promise<readonly CodexDeviceInfo[]> {
    return (await this.fleet.inspect(signal)).map(device => ({
      id: device.id, name: device.label, ...(device.model ? { model: device.model } : {}),
      state: device.state, connected: device.state === 'device' || device.state === 'unauthorized', authorized: device.authorized,
    }))
  }

  async resolveDevices(deviceIds: readonly string[] | undefined, signal: AbortSignal): Promise<readonly ResolvedCodexDevice[]> {
    const available = (await this.listDevices(signal)).filter(device => device.authorized)
    const ids = [...new Set(deviceIds ?? [])]
    if (!ids.length) {
      if (!available.length) throw new Error('opengui: no authorized HarmonyOS device is connected; enable USB debugging and accept the phone prompt')
      if (available.length !== 1) throw new Error('opengui: multiple HarmonyOS phones are connected; choose deviceIds from opengui_list_devices')
      ids.push(available[0]!.id)
    }
    if (ids.length > MAX_DEVICES) throw new Error(`opengui: a session can lock at most ${MAX_DEVICES} phones`)
    const resolved = await this.fleet.resolveConnected(ids, signal)
    return resolved.map(device => {
      const status = available.find(candidate => candidate.id === device.id)
      if (!status) throw new Error('opengui: selected HarmonyOS device is unavailable')
      return { ...status, serial: device.serial }
    })
  }

  assignTarget(actor: object, serial: string): void { this.controller.assignTarget(actor, serial) }
  observe(actor: object, signal: AbortSignal) { return this.controller.observe(actor, signal) }
  act(actor: object, input: Record<string, unknown>, signal: AbortSignal) { return this.controller.execute(actor, input, signal) }
  status(actor: object) { return this.controller.status(actor) }
  async preview(device: ResolvedCodexDevice, signal: AbortSignal): Promise<Buffer> {
    return (await encodeCodexPhoneScreenshot(await this.driver.preview(device.serial, signal))).data
  }
  async releaseDevice(serial: string): Promise<void> { this.driver.invalidate(serial) }
  async dispose(): Promise<void> { this.models.clear() }
}
