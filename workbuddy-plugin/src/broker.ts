import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Socket } from 'node:net'
import { WorkBuddyOpenGuiService } from './service.ts'
import { callOpenGuiTool, validateToolArguments } from './tools.ts'
import { BROKER_PROTOCOL, VERSION } from './state.ts'
import { readFrames, sendFrame, type Message } from './wire.ts'
import { errorInfo } from './errors.ts'
import { AutomationCoordinator, type HostEvent, type AutomationTask } from './automation.ts'

export interface BrokerOptions {
  token: string
  port: number
  service?: WorkBuddyOpenGuiService
  idleMs?: number
  onIdle?: () => void
}

/** One local owner of device leases across all WorkBuddy MCP child processes. */
export async function startBroker(options: BrokerOptions): Promise<{ port: number; close: () => Promise<void> }> {
  const service = options.service ?? new WorkBuddyOpenGuiService()
  const automation = new AutomationCoordinator(service)
  const sockets = new Set<Socket>()
  const clients = new Set<Socket>()
  const cleanups = new Set<Promise<unknown>>()
  const mirrorGrants = new Map<string, { token: string; owner: Socket | undefined }>()
  let idle: ReturnType<typeof setTimeout> | undefined
  let closing: Promise<void> | undefined
  const resetIdle = (): void => {
    clearTimeout(idle)
    if (clients.size === 0 && !closing) {
      idle = setTimeout(() => {
        if (service.hasPersistentMirrors()) { resetIdle(); return }
        for (const [id, grant] of mirrorGrants) if (!grant.owner && !service.retainsMirror(id)) mirrorGrants.delete(id)
        if ([...mirrorGrants.keys()].some(id => service.retainsMirror(id))) { resetIdle(); return }
        void close().then(() => options.onIdle?.())
      }, options.idleMs ?? 60_000)
    }
  }
  const server = createServer(socket => {
    sockets.add(socket)
    socket.on('error', () => undefined)
    let authenticated = false
    let hookConnection = false
    const lifetime = new AbortController()
    const owned = new Set<string>()
    const closedSessions: string[] = []
    const requests = new Map<string, { controller: AbortController; sessionId?: string }>()
    const handshake = setTimeout(() => socket.destroy(), 5_000)
    const finish = (operation: Promise<unknown>): void => {
      cleanups.add(operation)
      void operation.finally(() => cleanups.delete(operation)).catch(() => undefined)
    }
    socket.once('close', () => {
      clearTimeout(handshake)
      lifetime.abort(new Error('opengui: WorkBuddy connection closed'))
      sockets.delete(socket)
      clients.delete(socket)
      finish(Promise.allSettled([...owned].map(id => {
        const grant = mirrorGrants.get(id)
        if (grant?.owner === socket && service.retainsMirror(id)) { grant.owner = undefined; return Promise.resolve() }
        mirrorGrants.delete(id)
        return service.closeSession(id)
      })))
      resetIdle()
    })
    const cancel = (requestId: string): void => {
      const request = requests.get(requestId)
      request?.controller.abort(new Error('opengui: request cancelled'))
      if (request?.sessionId) finish(service.cancel(request.sessionId))
    }
    const handle = async (message: Message): Promise<void> => {
      if (typeof message.id !== 'string' || message.id.length > 100) { socket.destroy(); return }
      const id = message.id
      try {
        if (!authenticated) {
          const supplied = typeof message.token === 'string' ? Buffer.from(message.token) : Buffer.alloc(0)
          const expected = Buffer.from(options.token)
          if (message.method !== 'hello' || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            sendFrame(socket, { id, error: 'opengui: broker authentication failed or endpoint belongs to another application' })
            socket.end(); return
          }
          if (message.protocol !== BROKER_PROTOCOL || message.version !== VERSION) {
            sendFrame(socket, { id, error: 'opengui: broker version differs; explicitly finish old WorkBuddy OpenGUI tasks and close its persistent displays using the old runtime, then disconnect its MCP clients and wait for idle exit before reconnecting. Do not stop other hosts.' })
            socket.end(); return
          }
          authenticated = true
          hookConnection = message.role === 'hook'
          clearTimeout(handshake)
          clients.add(socket)
          resetIdle()
          sendFrame(socket, { id, result: { protocol: BROKER_PROTOCOL, version: VERSION, pid: process.pid } })
          return
        }
        if (message.method === 'host_event') {
          if (!hookConnection || !message.event || typeof message.event !== 'object') throw new Error('opengui: host lifecycle events require a hook connection')
          sendFrame(socket, { id, result: await automation.event(message.event as HostEvent) })
          return
        }
        if (hookConnection) throw new Error('opengui: hooks cannot execute phone tools')
        if (message.method === 'cancel') { cancel(String(message.requestId)); return }
        if (message.method !== 'call' || typeof message.name !== 'string') throw new Error('opengui: invalid broker method')
        if (requests.has(id) || requests.size >= 16) throw new Error('opengui: duplicate or excessive concurrent request')
        validateToolArguments(message.name, message.args)
        const { hostContext, ...args } = message.args
        const task: AutomationTask | undefined = automation.consume(hostContext, message.name, args)
        const sessionId = typeof args.sessionId === 'string' ? args.sessionId : undefined
        if (message.name === 'opengui_resume_mirror' && sessionId) {
          const grant = mirrorGrants.get(sessionId)
          const supplied = Buffer.from(String(args.mirrorResumeToken))
          const expected = Buffer.from(grant?.token ?? '')
          if (!grant || (grant.owner && grant.owner !== socket) || !service.retainsMirror(sessionId)
            || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            throw new Error('opengui: mirror resume capability is invalid, still owned, or expired')
          }
          grant.owner = socket
          owned.add(sessionId)
          automation.attach(task, sessionId, false)
          sendFrame(socket, { id, result: { ...await service.status(sessionId, lifetime.signal), automation: automation.status(task) } })
          return
        }
        if (sessionId && !owned.has(sessionId)) throw new Error('opengui: session belongs to another WorkBuddy connection')
        const controller = new AbortController()
        const lifecycleOnly = ['opengui_status', 'opengui_list_devices', 'opengui_cancel', 'opengui_close_session', 'opengui_close_mirror'].includes(message.name)
        const signal = AbortSignal.any([lifetime.signal, controller.signal, AbortSignal.timeout(120_000), ...(!lifecycleOnly && task ? [task.controller.signal] : [])])
        requests.set(id, { controller, ...(sessionId ? { sessionId } : {}) })
        try {
          let result = message.name === 'opengui_start' && task?.started
            ? await service.displayStatus(signal)
            : !sessionId && (message.name === 'opengui_open_mirror' || message.name === 'opengui_close_mirror')
            ? await service.deviceMirror(String(args.deviceId), message.name === 'opengui_close_mirror', signal, automation.closeableSessions(owned, task))
            : await callOpenGuiTool(service, message.name, args, signal, task ? { task: task.execution, skipActivation: task.started } : {})
          if (message.name === 'opengui_open_session') {
            const created = (result as { sessionId: string }).sessionId
            if (signal.aborted || socket.destroyed || (task && task.outcome !== 'active')) {
              await service.closeSession(created, { outcome: 'cancelled' })
              signal.throwIfAborted()
              throw new Error('opengui: task ended during session startup')
            }
            owned.add(created)
            automation.attach(task, created, args.purpose !== 'mirror')
            if (args.purpose === 'mirror') {
              const token = randomBytes(32).toString('base64url')
              mirrorGrants.set(created, { token, owner: socket })
              result = { ...(result as object), mirrorResumeToken: token }
            }
            if (signal.aborted || socket.destroyed) { await service.closeSession(created); signal.throwIfAborted(); return }
          }
          if (sessionId && (message.name === 'opengui_close_session' || message.name === 'opengui_cancel')) {
            mirrorGrants.delete(sessionId)
            if (!closedSessions.includes(sessionId)) closedSessions.push(sessionId)
            while (closedSessions.length > 100) owned.delete(closedSessions.shift()!)
          }
          automation.success(task, message.name, args)
          if (message.name === 'opengui_status' && !sessionId) {
            result = { ...(result as object), sessions: [...owned].flatMap(id => {
              try { return [service.snapshotSession(id)] } catch { return [] }
            }) }
          }
          if (message.name !== 'opengui_list_devices') result = { ...(result as object), automation: automation.status(task) }
          sendFrame(socket, { id, result })
        } catch (error) {
          automation.failure(task, error)
          if (signal.aborted && sessionId) await service.cancel(sessionId).catch(() => undefined)
          throw error
        } finally { requests.delete(id) }
      } catch (error) {
        const info = errorInfo(error)
        sendFrame(socket, { id, ...info, error: info.message })
      }
    }
    readFrames(socket, message => { finish(handle(message)) })
  })
  async function close(): Promise<void> {
    closing ??= (async () => {
      clearTimeout(idle)
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await service.dispose()
      await Promise.allSettled([...cleanups])
    })()
    return closing
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: options.port, exclusive: true }, resolve)
  }).catch(async error => { await service.dispose(); throw error })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('opengui: broker did not bind')
  resetIdle()
  return { port: address.port, close }
}
