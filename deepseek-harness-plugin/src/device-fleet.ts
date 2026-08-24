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
    const authorized = devices.filter(device => device.state === 'device')
      .toSorted((a, b) => a.serial.localeCompare(b.serial))
    const connectedSerials = new Set(authorized.map(device => device.serial))
    for (const [serial, record] of this.records) {
      if (connectedSerials.has(serial)) continue
      this.records.delete(serial)
      this.selected.delete(record.id)
    }
    for (const device of authorized) {
      if (!this.records.has(device.serial)) {
        this.records.set(device.serial, { id: this.createId(), serial: device.serial })
      }
    }

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

  async select(deviceIds: readonly string[], signal: AbortSignal): Promise<DeviceFleetSnapshot> {
    const snapshot = await this.snapshot(signal)
    const available = new Set(snapshot.devices.map(device => device.id))
    const unique = [...new Set(deviceIds)]
    if (unique.some(id => !available.has(id))) {
      throw new Error('coremate-mobile: device selection contains a disconnected or unknown phone')
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
      throw new Error('coremate-mobile: no authorized Android device is connected; connect a phone and accept its USB debugging prompt')
    }
    if (snapshot.selectedDeviceIds.length === 0) {
      throw new Error('coremate-mobile: multiple phones are connected; select at least one in the OpenGUI Tab before running /opengui')
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
        throw new Error('coremate-mobile: device is disconnected or unknown')
      }
      return {
        id,
        serial: record.serial,
        label: view.label,
        ...(view.model === undefined ? {} : { model: view.model }),
      }
    })
  }
}
