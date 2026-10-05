/** Resource ownership is local to one host runtime, never machine-global. */
export interface RuntimeDevice { readonly device: { readonly id: string; readonly serial: string } }
export interface RuntimeSession {
  readonly id: string
  state: string
  readonly controller: AbortController
  readonly pending: Set<Promise<unknown>>
  readonly devices: readonly RuntimeDevice[]
}

/** Shared resource mechanics; adapters retain authentication and lease policy. */
export class SessionRuntime<R extends RuntimeSession> {
  readonly sessions = new Map<string, R>()
  readonly locks = new Map<string, string>()
  private readonly leaseOwners = new Map<string, R>()
  private readonly cleanups = new WeakMap<R, Promise<void>>()

  register(record: R, control: boolean): void {
    if (this.sessions.has(record.id)) throw new Error('opengui: duplicate sessionId')
    const serials = record.devices.map(item => item.device.serial)
    if (new Set(serials).size !== serials.length) throw new Error('opengui: a session cannot contain the same phone twice')
    if (control && serials.some(serial => this.locks.has(serial))) throw new Error('opengui: device is already locked by another session')
    this.sessions.set(record.id, record)
    if (control) for (const serial of serials) { this.locks.set(serial, record.id); this.leaseOwners.set(serial, record) }
  }

  requireSession(id: string): R {
    const record = this.sessions.get(id)
    if (!record) throw new Error('opengui: unknown sessionId')
    return record
  }

  requireActiveSession(id: string): R {
    const record = this.requireSession(id)
    if (record.state !== 'active') throw new Error(`opengui: session is ${record.state}`)
    return record
  }

  resolveDevice(record: R, deviceId: string | undefined): R['devices'][number] {
    if (deviceId === undefined) {
      if (record.devices.length !== 1) throw new Error('opengui: deviceId is required for a multi-device session')
      return record.devices[0]!
    }
    const item = record.devices.find(candidate => candidate.device.id === deviceId)
    if (!item) throw new Error('opengui: deviceId is not locked by this session')
    return item
  }

  release(record: R): void {
    // A late callback cannot release a newly registered session with a reused id.
    for (const item of record.devices) {
      if (this.leaseOwners.get(item.device.serial) !== record) continue
      this.locks.delete(item.device.serial)
      this.leaseOwners.delete(item.device.serial)
    }
  }

  async track<T>(record: R, operation: () => Promise<T>): Promise<T> {
    const pending = Promise.resolve().then(() => {
      record.controller.signal.throwIfAborted()
      if (record.state !== 'active') throw new Error(`opengui: session is ${record.state}`)
      return operation()
    })
    record.pending.add(pending)
    try { return await pending } finally { record.pending.delete(pending) }
  }

  /** The caller terminates admission before draining; cleanup runs exactly once. */
  drain(record: R, releaseResources: () => Promise<void>): Promise<void> {
    const existing = this.cleanups.get(record)
    if (existing) return existing
    if (record.state === 'active' && !record.controller.signal.aborted) throw new Error('opengui: stop session before cleanup')
    const pending = (async () => {
      await Promise.allSettled([...record.pending])
      try { await releaseResources() } finally { this.release(record) }
    })()
    this.cleanups.set(record, pending)
    return pending
  }
}
