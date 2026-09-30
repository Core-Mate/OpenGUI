import { chmod, lstat, mkdir, rm } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { TaskHost } from '../../phone-agent/src/host.ts'
import { PhoneRuntime } from '../../phone-agent/src/runtime.ts'
import { keychain } from '../../phone-agent/src/credentials.ts'
import type { Credentials, Executor, Hardware } from '../../phone-agent/src/contracts.ts'
import type { ViewerServer } from '../../device-runtime/src/viewer.ts'
import { TASK_SERVICE_PROTOCOL, dataPath, socketPath } from './paths.ts'

export interface TaskService { endpoint: string; close: () => Promise<void> }
export interface TaskServiceOptions {
  root: string
  hardware: Hardware
  executor: Executor
  credentials?: Credentials
  viewers?: ViewerServer
  leaseRoot?: string
  /** Injectable alongside fake hardware/credentials; production uses the current OS. */
  platform?: NodeJS.Platform
}

interface Request {
  protocol?: number
  host?: string
  name?: string
  args?: Record<string, unknown>
  owner?: string
}

const hosts = new Set(['codex', 'workbuddy', 'dsh'])

/** One macOS process owns phone tasks for every host. Closing a client does not cancel accepted work. */
export async function startTaskService(options: TaskServiceOptions): Promise<TaskService> {
  await mkdir(options.root, { recursive: true, mode: 0o700 })
  const info = await lstat(options.root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('task service root must be a private directory')
  await chmod(options.root, 0o700)
  const runtime = new PhoneRuntime({
    root: dataPath(options.root), host: 'shared', hardware: options.hardware,
    credentials: options.credentials ?? keychain('shared'), executor: options.executor,
    ...(options.viewers ? { viewers: options.viewers } : {}),
    ...(options.leaseRoot ? { leaseRoot: options.leaseRoot } : {}),
  })
  const tasks = new TaskHost(() => runtime, options.platform)
  await tasks.call('opengui_list_tasks', {}, 'codex:bootstrap')
  const endpoint = socketPath(options.root)
  const existing = await lstat(endpoint).catch(() => undefined)
  if (existing) {
    if (!existing.isSocket()) throw new Error('task service endpoint is not a socket')
    await rm(endpoint)
  }
  let closing: Promise<void> | undefined
  const server = createServer(socket => { void handle(socket) })
  const handle = async (socket: Socket): Promise<void> => {
    let body = ''
    const send = (value: unknown): void => { if (!socket.destroyed) socket.end(JSON.stringify(value) + '\n') }
    socket.on('error', () => undefined)
    socket.setEncoding('utf8')
    socket.setTimeout(125_000, () => socket.destroy())
    socket.on('data', chunk => {
      body += chunk
      if (body.length > 2_000_000) { socket.destroy(); return }
      if (!body.includes('\n')) return
      socket.pause()
      void (async () => {
        try {
          const request = JSON.parse(body) as Request
          if (request.protocol !== TASK_SERVICE_PROTOCOL) throw new Error('task service protocol mismatch')
          if (request.name === '__ping__') { send({ result: { protocol: TASK_SERVICE_PROTOCOL, activeTasks: tasks.activeCount, watching: tasks.watching } }); return }
          if (request.name === '__prepare_upgrade__') { send({ result: { ready: tasks.prepareMaintenance() } }); return }
          if (request.name === '__shutdown__') {
            if (!tasks.prepareMaintenance()) throw new Error('upgrade_blocked: stop phone tasks and close the workbench first')
            send({ result: { stopping: true } })
            setImmediate(() => { void close() })
            return
          }
          if (request.name === '__configure_model__') {
            const args = request.args ?? {}
            const profile = await runtime.saveModel({ protocol: String(args.protocol), baseUrl: String(args.baseUrl), model: String(args.model), secret: String(args.secret ?? '') })
            send({ result: { id: profile.id, protocol: profile.protocol, baseUrl: profile.baseUrl, model: profile.model } })
            return
          }
          if (typeof request.name !== 'string' || typeof request.owner !== 'string' || !request.owner.trim() || request.owner.length > 200) throw new Error('task owner required')
          if (!hosts.has(String(request.host))) throw new Error('unknown task host')
          const owner = request.host + ':' + request.owner
          send({ result: await tasks.call(request.name, request.args ?? {}, owner) })
        } catch (error) {
          send({ error: error instanceof Error ? error.message : 'task service request failed' })
        }
      })()
    })
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(endpoint, () => { server.off('error', reject); resolve() })
  })
  await chmod(endpoint, 0o600)
  const close = (): Promise<void> => closing ??= (async () => { server.close(); await tasks.close(); await options.hardware.dispose() })()
  return { endpoint, close }
}
