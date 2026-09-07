import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { workbuddyStateDir } from './state.ts'
import { dirname, join } from 'node:path'

export type OwnedForwardKind = 'text-input' | 'video-stream'

export interface OwnedForward {
  readonly serial: string
  readonly port: number
  readonly scid: string
  readonly kind: OwnedForwardKind
}

interface StoredForward extends OwnedForward {
  readonly ownerId?: string
  readonly ownerPid?: number
}

export type ForwardAdbRunner = (args: readonly string[], signal: AbortSignal) => Promise<unknown>

interface ListedForward {
  readonly serial: string
  readonly local: string
  readonly remote: string
}

export function parseAdbForwardList(output: string): ListedForward[] {
  const forwards: ListedForward[] = []
  for (const line of output.split(/\r?\n/u)) {
    const [serial, local, remote, ...extra] = line.trim().split(/\s+/u)
    if (!serial || !local || !remote || extra.length > 0) continue
    forwards.push({ serial, local, remote })
  }
  return forwards
}

export function defaultForwardRegistryPath(): string {
  return join(workbuddyStateDir(), 'owned-forwards.json')
}

/** Durable inventory of ADB forwards created by this plugin, never inferred from global ADB state. */
export class OwnedForwardRegistry {
  private mutation = Promise.resolve()
  private readonly ownerId = randomUUID()

  constructor(private readonly path = defaultForwardRegistryPath()) {}

  async track(record: OwnedForward): Promise<void> {
    await this.mutate(records => {
      records.set(this.key(record), { ...record, ownerId: this.ownerId, ownerPid: process.pid })
    })
  }

  async release(record: OwnedForward, runAdb: ForwardAdbRunner): Promise<boolean> {
    let forwards: ListedForward[]
    try {
      const listed = await runAdb(
        ['-s', record.serial, 'forward', '--list'],
        AbortSignal.timeout(5_000),
      )
      forwards = parseAdbForwardList(String(listed ?? ''))
    } catch {
      return false
    }
    const local = `tcp:${record.port}`
    const owned = forwards.find(candidate => candidate.serial === record.serial && candidate.local === local)
    if (owned === undefined || owned.remote !== this.remote(record)) {
      try {
        await this.deleteMatching(record)
        return true
      } catch {
        return false
      }
    }
    try {
      await runAdb(
        ['-s', record.serial, 'forward', '--remove', local],
        AbortSignal.timeout(5_000),
      )
    } catch {
      return false
    }
    try {
      await this.deleteMatching(record)
      return true
    } catch {
      return false
    }
  }

  async recover(runAdb: ForwardAdbRunner): Promise<{ removed: number; retained: number }> {
    const records = await this.read()
    let removed = 0
    let retained = 0
    for (const record of records.values()) {
      if (record.ownerId !== undefined && record.ownerId !== this.ownerId
        && record.ownerPid !== undefined && this.processAlive(record.ownerPid)) {
        retained += 1
        continue
      }
      if (await this.release(record, runAdb)) removed += 1
      else retained += 1
    }
    return { removed, retained }
  }

  async list(): Promise<OwnedForward[]> {
    return [...(await this.read()).values()].map(record => this.publicRecord(record))
  }

  /** Best-effort synchronous signal-path cleanup when the Host cannot await plugin disposal. */
  releaseAllSync(adbPath: string): { removed: number; retained: number } {
    const lock = `${this.path}.lock`
    let lockFd: number
    try {
      lockFd = openSync(lock, 'wx', 0o600)
    } catch {
      return { removed: 0, retained: this.readSync().filter(record => record.ownerId === this.ownerId).length }
    }
    let records: StoredForward[]
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as unknown
      records = Array.isArray(value) ? value.filter(candidate => this.valid(candidate)) : []
    } catch {
      closeSync(lockFd)
      rmSync(lock, { force: true })
      return { removed: 0, retained: 0 }
    }
    const ownedRecords = records.filter(record => record.ownerId === this.ownerId)
    const retainedOwned: StoredForward[] = []
    for (const record of ownedRecords) {
      const listed = spawnSync(adbPath, ['-s', record.serial, 'forward', '--list'], {
        timeout: 1_500,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      if (listed.status !== 0 || listed.error !== undefined) {
        retainedOwned.push(record)
        continue
      }
      const local = `tcp:${record.port}`
      const owned = parseAdbForwardList(listed.stdout ?? '')
        .find(candidate => candidate.serial === record.serial && candidate.local === local)
      if (owned === undefined || owned.remote !== this.remote(record)) continue
      const removed = spawnSync(adbPath, ['-s', record.serial, 'forward', '--remove', local], {
        timeout: 1_500,
        stdio: 'ignore',
      })
      if (removed.status !== 0 || removed.error !== undefined) retainedOwned.push(record)
    }
    const retainedKeys = new Set(retainedOwned.map(record => `${this.key(record)}\u0000${record.scid}`))
    const retained = records.filter(record => record.ownerId !== this.ownerId
      || retainedKeys.has(`${this.key(record)}\u0000${record.scid}`))
    try {
      if (retained.length === 0) rmSync(this.path, { force: true })
      else {
        const temporary = `${this.path}.${process.pid}.${this.ownerId}.signal.tmp`
        writeFileSync(temporary, JSON.stringify(retained), { encoding: 'utf8', mode: 0o600 })
        renameSync(temporary, this.path)
      }
    } catch { /* startup recovery retains the durable fallback */ }
    finally {
      closeSync(lockFd)
      rmSync(lock, { force: true })
    }
    return { removed: ownedRecords.length - retainedOwned.length, retained: retainedOwned.length }
  }

  private key(record: OwnedForward): string {
    return `${record.serial}\u0000${record.port}`
  }

  private remote(record: OwnedForward): string {
    return `localabstract:scrcpy_${record.scid}`
  }

  private valid(value: unknown): value is StoredForward {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Partial<OwnedForward>
    return typeof candidate.serial === 'string' && Number.isSafeInteger(candidate.port)
      && typeof candidate.scid === 'string'
      && (candidate.kind === 'text-input' || candidate.kind === 'video-stream')
  }

  private async mutate(change: (records: Map<string, StoredForward>) => void | boolean): Promise<void> {
    const operation = this.mutation.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const releaseLock = await this.acquireLock()
      try {
        const records = await this.read()
        change(records)
        if (records.size === 0) {
          await rm(this.path, { force: true })
          return
        }
        const temporary = `${this.path}.${process.pid}.${this.ownerId}.${randomUUID()}.tmp`
        await writeFile(temporary, JSON.stringify([...records.values()]), { encoding: 'utf8', mode: 0o600 })
        await rename(temporary, this.path)
      } finally {
        await releaseLock()
      }
    })
    this.mutation = operation.catch(() => undefined)
    await operation
  }

  private async read(): Promise<Map<string, StoredForward>> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as unknown
      if (!Array.isArray(parsed)) return new Map()
      const records = new Map<string, StoredForward>()
      for (const value of parsed) {
        if (!this.valid(value)) continue
        const record = value
        records.set(this.key(record), record)
      }
      return records
    } catch {
      return new Map()
    }
  }

  private async deleteMatching(record: OwnedForward): Promise<void> {
    await this.mutate(records => {
      const stored = records.get(this.key(record))
      if (stored?.scid === record.scid) records.delete(this.key(record))
    })
  }

  private publicRecord(record: StoredForward): OwnedForward {
    return { serial: record.serial, port: record.port, scid: record.scid, kind: record.kind }
  }

  private processAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private readSync(): StoredForward[] {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as unknown
      return Array.isArray(parsed) ? parsed.filter(candidate => this.valid(candidate)) : []
    } catch {
      return []
    }
  }

  private async acquireLock(): Promise<() => Promise<void>> {
    const lock = `${this.path}.lock`
    const deadline = Date.now() + 5_000
    while (true) {
      try {
        const handle = await open(lock, 'wx', 0o600)
        return async () => {
          await handle.close()
          await rm(lock, { force: true })
        }
      } catch (error) {
        // Windows can report a sharing violation while another writer deletes its lock.
        // Retry acquisition only; never infer that EPERM grants permission to remove it.
        if ((error as NodeJS.ErrnoException).code === 'EPERM') {
          if (Date.now() >= deadline) throw error
          await new Promise(resolve => setTimeout(resolve, 10))
          continue
        }
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        try {
          if (Date.now() - (await stat(lock)).mtimeMs > 10_000) {
            await rm(lock, { force: true })
            continue
          }
        } catch { /* another writer released the lock */ }
        if (Date.now() >= deadline) throw new Error('opengui: timed out waiting for forward registry lock')
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
  }
}
