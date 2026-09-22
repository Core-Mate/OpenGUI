import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat, mkdir, open, readFile, rm } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

export const phoneRoot = (): string => process.env.OPENGUI_DSH_HOME || join(homedir(), '.local', 'share', 'opengui-dsh')
export const phoneEndpoint = (): string => join('/tmp', `opengui-dsh-${process.getuid?.()}-${createHash('sha256').update(phoneRoot()).digest('hex').slice(0, 16)}.sock`)
export const PHONE_PROTOCOL = 1
/** Lifecycle notifications must never start a worker just to stop it. */
export async function interruptPhoneOwner(owner: string): Promise<void> {
  try { await phoneRequest('__interrupt_owner__', {}, owner) }
  catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(String((error as NodeJS.ErrnoException).code))) return
    throw error
  }
}
/** Stop only an idle DSH worker; never terminate active autonomous work for an upgrade. */
export async function assertPhoneUpgrade(): Promise<void> {
  try { await phoneRequest('__shutdown__', {}, 'upgrade') }
  catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(String((error as NodeJS.ErrnoException).code))) return
    throw new Error('升级被阻止：请在 DSH 手机工作台停止任务并关闭工作台后重试。')
  }
}
export async function phoneRequest(name: string, args: Record<string, unknown>, owner: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(phoneEndpoint())
    let body = ''
    const fail = (error: Error) => { socket.destroy(); reject(error) }
    socket.setEncoding('utf8'); socket.setTimeout(125_000, () => fail(new Error('Phone worker timeout; query by requestId before retrying')))
    socket.once('error', fail)
    socket.once('connect', () => socket.write(JSON.stringify({ protocol: PHONE_PROTOCOL, name, args, owner }) + '\n'))
    socket.on('data', chunk => {
      body += chunk
      if (body.length > 2_000_000) { fail(new Error('Phone worker response too large')); return }
      if (!body.includes('\n')) return
      try { const value = JSON.parse(body); socket.destroy(); if (value.error) reject(new Error(value.error)); else resolve(value.result) } catch { fail(new Error('Invalid phone worker response')) }
    })
    socket.once('end', () => { if (!body.includes('\n')) fail(new Error('Phone worker disconnected')) })
  })
}
export async function callPhoneTask(name: string, args: Record<string, unknown>, owner: string): Promise<unknown> {
  if (process.platform !== 'darwin') throw new Error('Autonomous phone tasks require macOS')
  await mkdir(phoneRoot(), { recursive: true, mode: 0o700 })
  const info = await lstat(phoneRoot())
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new Error('DSH phone state directory must be private')
  const alive = async () => {
    try { await phoneRequest('__ping__', {}, owner); return true }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(String((error as NodeJS.ErrnoException).code))) throw error; return false }
  }
  const deadline = Date.now() + 15_000
  while (!await alive()) {
    if (Date.now() > deadline) throw new Error('Phone worker did not start')
    const lockPath = join(phoneRoot(), 'startup.lock')
    let lock
    try { lock = await open(lockPath, 'wx', 0o600) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; await delay(100); continue }
    const token = randomUUID()
    try {
      await lock.writeFile(token)
      if (await alive()) break
      const socket = await lstat(phoneEndpoint()).catch(() => undefined)
      if (socket) { if (!socket.isSocket() || socket.uid !== process.getuid?.()) throw new Error('Unsafe phone endpoint'); await rm(phoneEndpoint()) }
      const child = spawn(process.execPath, [fileURLToPath(new URL('./phone-worker.js', import.meta.url))], { detached: true, stdio: 'ignore', env: { ...process.env } })
      let error: Error | undefined; child.once('error', value => { error = value }); child.unref()
      while (!await alive()) { if (error) throw error; if (Date.now() > deadline) throw new Error('Phone worker startup timeout'); await delay(100) }
    } finally { await lock.close(); if (await readFile(lockPath, 'utf8').catch(() => '') === token) await rm(lockPath) }
  }
  return phoneRequest(name, args, owner)
}
