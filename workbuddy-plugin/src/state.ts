import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, open, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const VERSION = '0.3.1'
export const BROKER_PROTOCOL = 8
/** Longest single wait for the person to hand control back; nothing is captured and no model runs meanwhile. */
export const HUMAN_CONTROL_WAIT_MS = 600_000
/** Per-call budget: a long control wait gets its wait plus margin, every other call the usual two minutes. */
export function callBudgetMs(args: Record<string, unknown>): number {
  const wait = Number(args.waitMs ?? 0)
  return Math.max(120_000, (Number.isFinite(wait) ? wait : 0) + 30_000)
}

export function workbuddyStateDir(override?: string): string {
  const configured = override ?? process.env.OPENGUI_WORKBUDDY_HOME?.trim()
  return configured ? resolve(configured) : join(homedir(), '.workbuddy', 'opengui')
}

/** Stable per-user endpoint. A collision fails closed; it never displaces another listener. */
export function brokerPort(stateDir = workbuddyStateDir()): number {
  return 43000 + createHash('sha256').update(stateDir).digest().readUInt32BE(0) % 10000
}

export async function ensurePrivateState(stateDir = workbuddyStateDir()): Promise<string> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 })
  const info = await lstat(stateDir)
  if (!info.isDirectory() || info.isSymbolicLink()
    || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0))) {
    throw new Error('opengui: WorkBuddy state directory must be private, owned by this user, and not a symlink')
  }
  return stateDir
}

export async function brokerToken(stateDir = workbuddyStateDir()): Promise<string> {
  await ensurePrivateState(stateDir)
  const path = join(stateDir, 'broker-token')
  try {
    const file = await open(path, 'wx', 0o600)
    try { await file.writeFile(randomBytes(32).toString('hex')) } finally { await file.close() }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()
      || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0))) {
      throw new Error('opengui: unsafe WorkBuddy broker token permissions')
    }
    const token = await readFile(path, 'utf8')
    if (/^[a-f0-9]{64}$/.test(token)) return token
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('opengui: WorkBuddy broker token is incomplete')
}
