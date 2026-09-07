import { randomUUID } from 'node:crypto'
import type { AdbDevice } from './adb.ts'

/** Host-private device identity paired with its browser-safe presentation. */
export interface FleetDevice {
  readonly id: string
  readonly serial: string
  readonly label: string
  readonly model?: string
}

/** Browser-visible device choice; serial deliberately never crosses this seam. */
export interface FleetDeviceView {
  readonly id: string
  readonly label: string
  readonly model?: string
  readonly selected: boolean
}

/** Read-only connection state exposed by WorkBuddy device discovery. */
export interface FleetDeviceStatusView {
  readonly id: string
  readonly label: string
  readonly model?: string
  readonly state: string
  readonly connected: boolean
  readonly authorized: boolean
}

export interface DeviceFleetSnapshot {
  readonly devices: readonly FleetDeviceView[]
  readonly selectedDeviceIds: readonly string[]
}

export type DiscoverDevices = (signal: AbortSignal) => Promise<readonly AdbDevice[]>

interface DeviceRecord {
  id: string
  serial: string
}

function displayModel(device: AdbDevice): string | undefined {
  const raw = device.model?.trim()
  return raw ? raw.replaceAll('_', ' ') : undefined
}

/**
 * Owns authorized-device discovery, opaque browser identities, and the selection
 * applied atomically to the next OpenGUI task.
 */
export class DeviceFleet {
  private readonly records = new Map<string, DeviceRecord>()
  private readonly selected = new Set<string>()

  constructor(
    private readonly discover: DiscoverDevices,
    private readonly createId: () => string = randomUUID,
  ) {}

  async snapshot(signal: AbortSignal): Promise<DeviceFleetSnapshot> {
    const devices = await this.discover(signal)
    this.syncRecords(devices, false)
    const authorized = devices.filter(device => device.state === 'device')
      .toSorted((a, b) => a.serial.localeCompare(b.serial))

    // Preserve the single-phone experience. With multiple phones, an explicit
    // choice is required unless a prior still-connected choice already exists.
    if (authorized.length === 1 && this.selected.size === 0) {
      const only = this.records.get(authorized[0]!.serial)
      if (only !== undefined) this.selected.add(only.id)
    }

    const modelCounts = new Map<string, number>()
    for (const device of authorized) {
      const model = displayModel(device) ?? 'Android 手机'
      modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
    }
    const modelIndexes = new Map<string, number>()
    const views = authorized.map((device): FleetDeviceView => {
      const record = this.records.get(device.serial)!
      const model = displayModel(device)
      const base = model ?? 'Android 手机'
      const index = (modelIndexes.get(base) ?? 0) + 1
      modelIndexes.set(base, index)
      const label = (modelCounts.get(base) ?? 0) > 1 ? `${base} ${index}` : base
      return {
        id: record.id,
        label,
        ...(model === undefined ? {} : { model }),
        selected: this.selected.has(record.id),
      }
    })
    return {
      devices: views,
      selectedDeviceIds: views.filter(device => device.selected).map(device => device.id),
    }
  }

  /** List every ADB row, including unauthorized and offline devices, without exposing serials. */
  async inspect(signal: AbortSignal): Promise<readonly FleetDeviceStatusView[]> {
    const devices = (await this.discover(signal)).toSorted((a, b) => a.serial.localeCompare(b.serial))
    this.syncRecords(devices, true)
    const modelCounts = new Map<string, number>()
    for (const device of devices) {
      const model = displayModel(device) ?? 'Android phone'
      modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
    }
    const modelIndexes = new Map<string, number>()
    return devices.map((device): FleetDeviceStatusView => {
      const record = this.records.get(device.serial)!
      const model = displayModel(device)
      const base = model ?? 'Android phone'
      const index = (modelIndexes.get(base) ?? 0) + 1
      modelIndexes.set(base, index)
      return {
        id: record.id,
        label: (modelCounts.get(base) ?? 0) > 1 ? `${base} ${index}` : base,
        ...(model === undefined ? {} : { model }),
        state: device.state,
        connected: true,
        authorized: device.state === 'device',
      }
    })
  }

  /** Materialize only rows in the caller's discovery snapshot; do not rediscover per phone. */
  resolveInspected(deviceId: string): string | undefined {
    return [...this.records.values()].find(record => record.id === deviceId)?.serial
  }

  async select(deviceIds: readonly string[], signal: AbortSignal): Promise<DeviceFleetSnapshot> {
    const snapshot = await this.snapshot(signal)
    const available = new Set(snapshot.devices.map(device => device.id))
    const unique = [...new Set(deviceIds)]
    if (unique.some(id => !available.has(id))) {
      throw new Error('opengui: device selection contains a disconnected or unknown phone')
    }
    this.selected.clear()
    for (const id of unique) this.selected.add(id)
    return this.snapshot(signal)
  }

  /** Resolve browser-safe ids to current Host-private devices for an immediate operation. */
  async resolveConnected(deviceIds: readonly string[], signal: AbortSignal): Promise<readonly FleetDevice[]> {
    const snapshot = await this.snapshot(signal)
    return this.materialize(snapshot, deviceIds)
  }

  async selectedDevices(signal: AbortSignal): Promise<readonly FleetDevice[]> {
    const snapshot = await this.snapshot(signal)
    if (snapshot.devices.length === 0) {
      throw new Error('opengui: no authorized Android device is connected; connect a phone and accept its USB debugging prompt')
    }
    if (snapshot.selectedDeviceIds.length === 0) {
      throw new Error('opengui: multiple phones are connected; select at least one in the deviceIds in opengui_open_session')
    }
    return this.materialize(snapshot, snapshot.selectedDeviceIds)
  }

  private materialize(snapshot: DeviceFleetSnapshot, deviceIds: readonly string[]): readonly FleetDevice[] {
    const views = new Map(snapshot.devices.map(device => [device.id, device]))
    const byId = new Map([...this.records.values()].map(record => [record.id, record]))
    return [...new Set(deviceIds)].map((id) => {
      const view = views.get(id)
      const record = byId.get(id)
      if (view === undefined || record === undefined) {
        throw new Error('opengui: device is disconnected or unknown')
      }
      return {
        id,
        serial: record.serial,
        label: view.label,
        ...(view.model === undefined ? {} : { model: view.model }),
      }
    })
  }


  private syncRecords(devices: readonly AdbDevice[], includeUnavailable: boolean): void {
    const connectedSerials = new Set(devices.map(device => device.serial))
    for (const [serial, record] of this.records) {
      if (connectedSerials.has(serial)) continue
      // Retain opaque identity for frozen sessions across physical reconnects.
      // Current discovery still gates materialization; a remembered id grants no access.
      this.selected.delete(record.id)
    }
    const candidates = includeUnavailable ? devices : devices.filter(device => device.state === 'device')
    for (const device of candidates.toSorted((a, b) => {
      const authorization = Number(b.state === 'device') - Number(a.state === 'device')
      return authorization === 0 ? a.serial.localeCompare(b.serial) : authorization
    })) {
      if (!this.records.has(device.serial)) {
        this.records.set(device.serial, { id: this.createId(), serial: device.serial })
      }
    }
  }
}
