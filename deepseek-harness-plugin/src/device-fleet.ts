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
  readonly occupied: boolean
  readonly occupiedByCurrentSession: boolean
}

/** Read-only connection state exposed by Codex device discovery. */
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

/** Exact process-local owner of one physical-device lease. */
export interface DeviceLeaseOwner {
  readonly sessionId: string
  readonly taskId: string
  readonly attemptId: string
}

export interface DeviceLease extends DeviceLeaseOwner {
  readonly deviceId: string
}

/** All-or-nothing lease over the devices selected by one DSH session. */
export interface DeviceLeaseHandle {
  readonly owner: DeviceLeaseOwner
  readonly devices: readonly FleetDevice[]
  release(): void
}

export type DiscoverDevices = (signal: AbortSignal) => Promise<readonly AdbDevice[]>

interface DeviceRecord {
  id: string
  serial: string
}

const LEGACY_SELECTION_SCOPE = '\0codex'

function requireIdentity(value: string, field: keyof DeviceLeaseOwner): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`coremate-mobile: ${field} must not be empty`)
  return normalized
}

function normalizeOwner(owner: DeviceLeaseOwner): DeviceLeaseOwner {
  return {
    sessionId: requireIdentity(owner.sessionId, 'sessionId'),
    taskId: requireIdentity(owner.taskId, 'taskId'),
    attemptId: requireIdentity(owner.attemptId, 'attemptId'),
  }
}

function owns(lease: DeviceLease, owner: DeviceLeaseOwner): boolean {
  return lease.sessionId === owner.sessionId
    && lease.taskId === owner.taskId
    && lease.attemptId === owner.attemptId
}

/** A selected device is already held by another exact task attempt. */
export class DeviceLeaseConflictError extends Error {
  readonly code = 'DEVICE_BUSY'
  constructor(readonly deviceId: string) {
    super(`coremate-mobile: selected phone ${deviceId} is busy in another OpenGUI task`)
    this.name = 'DeviceLeaseConflictError'
  }
}

/** A running task has already frozen this session's device preference. */
export class DeviceSelectionLockedError extends Error {
  constructor() {
    super('selection_locked_during_task')
    this.name = 'DeviceSelectionLockedError'
  }
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
  private readonly preferenceBySession = new Map<string, Set<string>>()
  private readonly leaseByDevice = new Map<string, DeviceLease>()

  constructor(
    private readonly discover: DiscoverDevices,
    private readonly createId: () => string = randomUUID,
  ) {}

  /** Legacy process-local selection used only by the independent Codex adapter. */
  async snapshot(signal: AbortSignal): Promise<DeviceFleetSnapshot> {
    return this.snapshotForSession(LEGACY_SELECTION_SCOPE, signal)
  }

  /** Session-scoped DSH selection and occupancy projection. */
  async snapshotForSession(sessionId: string, signal: AbortSignal): Promise<DeviceFleetSnapshot> {
    const scope = requireIdentity(sessionId, 'sessionId')
    const devices = await this.discover(signal)
    signal.throwIfAborted()
    return this.snapshotFromDiscovery(scope, devices)
  }

  private snapshotFromDiscovery(scope: string, devices: readonly AdbDevice[]): DeviceFleetSnapshot {
    this.syncRecords(devices, false)
    const authorized = devices.filter(device => device.state === 'device')
      .toSorted((a, b) => a.serial.localeCompare(b.serial))
    let selected = this.preferenceBySession.get(scope)

    // Preserve the single-phone experience. With multiple phones, an explicit
    // choice is required unless a prior still-connected choice already exists.
    if (authorized.length === 1 && (selected === undefined || selected.size === 0)) {
      const only = this.records.get(authorized[0]!.serial)
      if (only !== undefined) {
        selected = new Set([only.id])
        this.preferenceBySession.set(scope, selected)
      }
    }
    selected ??= new Set()

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
      const lease = this.leaseByDevice.get(record.id)
      return {
        id: record.id,
        label,
        ...(model === undefined ? {} : { model }),
        selected: selected.has(record.id),
        occupied: lease !== undefined,
        occupiedByCurrentSession: lease?.sessionId === scope,
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

  /** Legacy process-local selection used only by the independent Codex adapter. */
  async select(deviceIds: readonly string[], signal: AbortSignal): Promise<DeviceFleetSnapshot> {
    return this.selectForSession(LEGACY_SELECTION_SCOPE, deviceIds, signal)
  }

  async selectForSession(sessionId: string, deviceIds: readonly string[], signal: AbortSignal): Promise<DeviceFleetSnapshot> {
    const scope = requireIdentity(sessionId, 'sessionId')
    const devices = await this.discover(signal)
    signal.throwIfAborted()
    if ([...this.leaseByDevice.values()].some(lease => lease.sessionId === scope)) {
      throw new DeviceSelectionLockedError()
    }
    const snapshot = this.snapshotFromDiscovery(scope, devices)
    const available = new Set(snapshot.devices.map(device => device.id))
    const unique = [...new Set(deviceIds)]
    if (unique.some(id => !available.has(id))) {
      throw new Error('coremate-mobile: device selection contains a disconnected or unknown phone')
    }
    this.preferenceBySession.set(scope, new Set(unique))
    return this.snapshotFromDiscovery(scope, devices)
  }

  /** Resolve browser-safe ids to current Host-private devices for an immediate operation. */
  async resolveConnected(deviceIds: readonly string[], signal: AbortSignal): Promise<readonly FleetDevice[]> {
    const snapshot = await this.snapshot(signal)
    return this.materialize(snapshot, deviceIds)
  }

  async selectedDevices(signal: AbortSignal): Promise<readonly FleetDevice[]> {
    return this.selectedDevicesForSession(LEGACY_SELECTION_SCOPE, signal)
  }

  async selectedDevicesForSession(sessionId: string, signal: AbortSignal): Promise<readonly FleetDevice[]> {
    const scope = requireIdentity(sessionId, 'sessionId')
    const snapshot = await this.snapshotForSession(scope, signal)
    if (snapshot.devices.length === 0) {
      throw new Error('coremate-mobile: no authorized Android device is connected; connect a phone and accept its USB debugging prompt')
    }
    if (snapshot.selectedDeviceIds.length === 0) {
      throw new Error('coremate-mobile: multiple phones are connected; select at least one in the OpenGUI Tab before running /opengui')
    }
    return this.materialize(snapshot, snapshot.selectedDeviceIds)
  }

  /** Atomically acquire every currently selected device for one exact attempt. */
  async acquireSelected(ownerInput: DeviceLeaseOwner, signal: AbortSignal): Promise<DeviceLeaseHandle> {
    const owner = normalizeOwner(ownerInput)
    const discovered = await this.discover(signal)
    signal.throwIfAborted()
    const snapshot = this.snapshotFromDiscovery(owner.sessionId, discovered)
    if (snapshot.devices.length === 0) {
      throw new Error('coremate-mobile: no authorized Android device is connected; connect a phone and accept its USB debugging prompt')
    }
    if (snapshot.selectedDeviceIds.length === 0) {
      throw new Error('coremate-mobile: multiple phones are connected; select at least one in the OpenGUI Tab before running /opengui')
    }
    const devices = this.materialize(snapshot, snapshot.selectedDeviceIds)
    const conflicts = devices.filter((device) => {
      const lease = this.leaseByDevice.get(device.id)
      return lease !== undefined && !owns(lease, owner)
    })
    if (conflicts[0] !== undefined) throw new DeviceLeaseConflictError(conflicts[0].id)

    for (const device of devices) {
      this.leaseByDevice.set(device.id, { ...owner, deviceId: device.id })
    }
    let released = false
    return {
      owner,
      devices,
      release: () => {
        if (released) return
        released = true
        this.release(owner, devices.map(device => device.id))
      },
    }
  }

  /** Release only leases still owned by the exact attempt; stale cleanup is a no-op. */
  release(ownerInput: DeviceLeaseOwner, deviceIds: readonly string[]): number {
    const owner = normalizeOwner(ownerInput)
    let released = 0
    for (const deviceId of new Set(deviceIds)) {
      const lease = this.leaseByDevice.get(deviceId)
      if (lease === undefined || !owns(lease, owner)) continue
      this.leaseByDevice.delete(deviceId)
      released += 1
    }
    return released
  }

  leaseSnapshot(): readonly DeviceLease[] {
    return [...this.leaseByDevice.values()].map(lease => ({ ...lease }))
  }

  forgetSession(sessionId: string): void {
    this.preferenceBySession.delete(requireIdentity(sessionId, 'sessionId'))
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


  private syncRecords(devices: readonly AdbDevice[], includeUnavailable: boolean): void {
    const connectedSerials = new Set(devices.map(device => device.serial))
    for (const [serial, record] of this.records) {
      if (connectedSerials.has(serial)) continue
      // Keep a leased physical identity reserved across transient discovery
      // misses and reconnects until its exact task finalizer releases it.
      if (this.leaseByDevice.has(record.id)) continue
      this.records.delete(serial)
      for (const selected of this.preferenceBySession.values()) selected.delete(record.id)
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
