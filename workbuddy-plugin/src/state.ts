import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, open, readFile } from 'node:fs/promises'
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const VERSION = '0.4.1'
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

/**
 * Preferred workbench port, stable per state directory so 打开控制台 links in chat survive a broker
 * restart. A busy port falls back to a random one; old links then fail closed with 404/refusal.
 */
export function viewerPort(stateDir = workbuddyStateDir()): number {
  return 53000 + createHash('sha256').update(`${stateDir}:viewer`).digest().readUInt32BE(0) % 10000
}

/** Owner-only key that signs 打开控制台 links; created once and kept with the private state. */
export function consoleKey(stateDir = workbuddyStateDir()): Buffer {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  const path = join(stateDir, 'console-key')
  try { writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new Error('unsafe_console_key')
  const key = Buffer.from(readFileSync(path, 'utf8').trim(), 'hex')
  if (key.length !== 32) throw new Error('invalid_console_key')
  return key
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
