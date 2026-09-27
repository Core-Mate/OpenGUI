import { lstat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { isTaskTool } from '../../phone-agent/src/host.ts'
import { TASK_SERVICE_PROTOCOL, serviceRoot, socketPath } from './paths.ts'

export type TaskHostName = 'codex' | 'workbuddy' | 'dsh'
export interface PhoneTasks {
  readonly activeCount: number
  readonly watching: boolean
  snapshot(): Promise<void>
  prepareMaintenance(): boolean
  call(name: string, args: Record<string, unknown>, owner: string): Promise<unknown>
  interruptOwner(owner: string, preserveUserWait?: boolean): Promise<void>
  close(): Promise<void>
}

interface Reply { result?: unknown; error?: string }

const entry = fileURLToPath(new URL('./task-service.js', import.meta.url))

async function request(root: string, name: string, args: Record<string, unknown>, owner: string, host: TaskHostName): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath(root))
    let body = ''
    const fail = (error: Error) => { socket.destroy(); reject(error) }
    socket.setEncoding('utf8')
    socket.setTimeout(125_000, () => fail(new Error('task service timeout')))
    socket.once('error', fail)
    socket.once('connect', () => socket.write(JSON.stringify({ protocol: TASK_SERVICE_PROTOCOL, host, name, args, owner }) + '\n'))
    socket.on('data', chunk => {
      body += chunk
      if (!body.includes('\n')) return
      try {
        const value = JSON.parse(body) as Reply
        socket.destroy()
        if (value.error) reject(new Error(value.error))
        else resolve(value.result)
      } catch { fail(new Error('invalid task service response')) }
    })
  })
}

async function alive(root: string): Promise<{ activeTasks: number; watching: boolean } | undefined> {
  try { return await request(root, '__ping__', {}, 'ping', 'codex') as { activeTasks: number; watching: boolean } }
  catch (error) { if (['ENOENT', 'ECONNREFUSED'].includes(String((error as NodeJS.ErrnoException).code))) return undefined; throw error }
}

/** Start the shared process only when a host actually submits work. */
export async function ensureTaskService(root = serviceRoot()): Promise<void> {
  if (await alive(root)) return
  if (process.env.OPENGUI_TASK_SERVICE_AUTOSTART === '0') throw new Error('task service is not running')
  const child = spawn(process.execPath, [entry], { detached: true, stdio: 'ignore', env: { ...process.env, OPENGUI_TASK_SERVICE_ROOT: root } })
  child.unref()
  const deadline = Date.now() + 15_000
  while (!await alive(root)) {
    if (Date.now() > deadline) throw new Error('task service did not start')
    await delay(100)
  }
}

export function sharedPhoneTasks(host: TaskHostName, root = serviceRoot()): PhoneTasks {
  let activeCount = 0
  let watching = false
  return {
    get activeCount() { return activeCount },
    get watching() { return watching },
    async snapshot() {
      const status = await alive(root)
      activeCount = status?.activeTasks ?? 0
      watching = status?.watching ?? false
    },
    prepareMaintenance: () => activeCount === 0 && !watching,
    async call(name, args, owner) {
      if (!isTaskTool(name)) throw new Error('unknown task tool')
      await ensureTaskService(root)
      return request(root, name, args, owner, host)
    },
    // Client disconnect is not a stop. Callers keep the method so older hooks compile, and it does nothing.
    async interruptOwner() {},
    async close() {},
  }
}

export async function serviceSocketExists(root = serviceRoot()): Promise<boolean> {
  const info = await lstat(socketPath(root)).catch(() => undefined)
  return info?.isSocket() ?? false
}
