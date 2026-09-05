import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, parse, resolve, sep } from 'node:path'
import type { CodexObservation } from './codex/service.ts'

export const VERSION = '0.1.0'
export const PROTOCOL_VERSION = 2
export const SESSION_IDLE_MS = 30 * 60_000
export const DAEMON_IDLE_MS = 5 * 60_000
export const OBSERVATION_RETENTION_MS = 24 * 60 * 60_000

export function dataDirectory(): string {
  const requested = process.env.OPENGUI_CODEX_DATA_DIR || join(homedir(), '.codex', 'opengui-codex')
  const root = resolve(requested)
  const home = homedir()
  if (!isAbsolute(requested) || [parse(root).root, home, join(home, '.codex'), join(home, '.codex', 'opengui')].includes(root)
    || root.split(sep).includes('.dsh')) {
    throw new Error('opengui: refusing an unsafe or legacy runtime directory')
  }
  return root
}

export async function privateDirectory(path: string): Promise<string> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()
    || (process.getuid !== undefined && info.uid !== process.getuid())) {
    throw new Error('opengui: runtime directory must be an owned directory, not a symbolic link')
  }
  await chmod(path, 0o700)
  return path
}

export function daemonEndpoint(root = dataDirectory()): string {
  const identity = createHash('sha256').update(resolve(root)).digest('hex').slice(0, 16)
  return join(tmpdir(), `opengui-codex-standalone-${process.getuid?.() ?? 'user'}-${identity}.sock`)
}

/** Only session-owned images are removed. Runtime files are outside this tree. */
export class ObservationStore {
  constructor(readonly root: string) {}

  private directory(sessionId: string): string {
    return join(this.root, createHash('sha256').update(sessionId).digest('hex'))
  }

  async save(value: CodexObservation): Promise<unknown> {
    await privateDirectory(this.root)
    const directory = await privateDirectory(this.directory(value.sessionId))
    const digest = createHash('sha256').update(value.deviceId + '\0' + value.observationId).digest('hex')
    const path = join(directory, digest + '.jpg')
    await writeFile(path, Buffer.from(value.screenshot.data, 'base64'), { mode: 0o600, flag: 'wx' })
    const { data: _data, ...screenshot } = value.screenshot
    return { ...value, screenshot: { ...screenshot, path } }
  }

  async remove(sessionId: string): Promise<void> {
    await this.removeDirectory(this.directory(sessionId))
  }

  async prune(now = Date.now()): Promise<void> {
    await privateDirectory(this.root)
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue
      const path = join(this.root, entry.name)
      if (now - (await lstat(path)).mtimeMs > OBSERVATION_RETENTION_MS) await this.removeDirectory(path)
    }
  }

  private async removeDirectory(path: string): Promise<void> {
    const info = await lstat(path).catch(() => undefined)
    if (info?.isDirectory() && !info.isSymbolicLink()) await rm(path, { recursive: true, force: true })
  }
}
