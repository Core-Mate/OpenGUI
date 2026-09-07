import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmod, lstat, open, readFile, rm } from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { CodexOpenGuiService } from './codex/service.ts'
import { callOpenGuiTool, isCodexObservation, requestedSideEffect, validateToolArguments } from './codex/tools.ts'
import { confirmAction } from './confirmation.ts'
import type { ConfirmAction } from './confirmation.ts'
import { DAEMON_IDLE_MS, PROTOCOL_VERSION, VERSION, ObservationStore, daemonEndpoint, dataDirectory, privateDirectory } from './state.ts'

export interface Request {
  version: string
  protocol: number
  name: string
  args: Record<string, unknown>
  owner?: string
}
export interface Response { ok: boolean; result?: unknown; error?: string }
export interface Hello { version: string; protocol: number; activeSessions: number }
export function request(name: string, args: Record<string, unknown> = {}, owner = process.env.CODEX_THREAD_ID): Request {
  return { version: VERSION, protocol: PROTOCOL_VERSION, name, args, ...(owner ? { owner } : {}) }
}

/** Keep the request socket open until the result so process death cancels work. */
export function sendRequest(endpoint: string, value: Request, signal?: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint)
    let body = ''
    const cleanup = (): void => { signal?.removeEventListener('abort', abort); socket.destroy() }
    const abort = (): void => { cleanup(); reject(signal?.reason ?? new Error('opengui: request cancelled')) }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    socket.setEncoding('utf8')
    socket.setTimeout(125_000, () => { cleanup(); reject(new Error('opengui: daemon request timed out')) })
    socket.once('connect', () => socket.write(JSON.stringify(value) + '\n'))
    socket.on('data', chunk => {
      body += chunk
      if (Buffer.byteLength(body) > 2_000_000) { cleanup(); reject(new Error('opengui: oversized daemon response')); return }
      if (!body.includes('\n')) return
      try { const result = JSON.parse(body.trim()) as Response; cleanup(); resolve(result) }
      catch (error) { cleanup(); reject(error) }
    })
    socket.once('error', error => { cleanup(); reject(error) })
    socket.once('end', () => { if (!body.includes('\n')) { cleanup(); reject(new Error('opengui: incomplete daemon response')) } })
  })
}

export async function ping(endpoint: string): Promise<Hello | undefined> {
  try {
    const result = await sendRequest(endpoint, request('__ping__'), AbortSignal.timeout(1500))
    if (!result.ok || typeof result.result !== 'object' || result.result === null) throw new Error('opengui: invalid daemon handshake')
    const hello = result.result as Hello
    if (typeof hello.version !== 'string' || typeof hello.protocol !== 'number') throw new Error('opengui: invalid daemon identity')
    return hello
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ECONNREFUSED') return undefined
    throw error
  }
}

export function assertVersion(hello: Hello): void {
  if (hello.version !== VERSION || hello.protocol !== PROTOCOL_VERSION) {
    throw new Error(`opengui: daemon version ${hello.version} differs from ${VERSION}; finish existing sessions and wait for idle exit before upgrading`)
  }
}

/** A short startup lock prevents two CLI calls from unlinking each other's socket. */
export async function ensureDaemon(entry: string, root = dataDirectory(), signal = AbortSignal.timeout(15_000)): Promise<string> {
  await privateDirectory(root)
  const endpoint = daemonEndpoint(root)
  const lockPath = join(root, 'daemon-start.lock')
  while (true) {
    signal.throwIfAborted()
    const hello = await ping(endpoint)
    if (hello) { assertVersion(hello); return endpoint }
    let lock
    try { lock = await open(lockPath, 'wx', 0o600) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      await delay(50, undefined, { signal })
      continue
    }
    const token = randomUUID()
    try {
      await lock.writeFile(token)
      const current = await ping(endpoint)
      if (current) { assertVersion(current); return endpoint }
      const info = await lstat(endpoint).catch(() => undefined)
      if (info) {
        if (!info.isSocket() || (process.getuid && info.uid !== process.getuid())) throw new Error('opengui: refusing to replace an unowned endpoint')
        await rm(endpoint)
      }
      const child = spawn(process.execPath, [entry, '--daemon'], {
        detached: true, stdio: 'ignore',
        env: { ...process.env, OPENGUI_CODEX_DATA_DIR: root },
      })
      let spawnError: Error | undefined
      child.once('error', error => { spawnError = error })
      child.unref()
      while (true) {
        signal.throwIfAborted()
        if (spawnError) throw spawnError
        const ready = await ping(endpoint)
        if (ready) { assertVersion(ready); return endpoint }
        await delay(50, undefined, { signal })
      }
    } finally {
      await lock.close()
      if (await readFile(lockPath, 'utf8').catch(() => '') === token) await rm(lockPath, { force: true })
    }
  }
}

export interface DaemonOptions {
  root: string
  service?: CodexOpenGuiService
  confirm?: ConfirmAction
  idleMs?: number
  sweepMs?: number
}

/** No phone command is performed merely by starting the daemon. */
export async function startDaemon(options: DaemonOptions): Promise<{ endpoint: string; close: () => Promise<void>; closed: Promise<void> }> {
  await privateDirectory(options.root)
  const endpoint = daemonEndpoint(options.root)
  const observations = new ObservationStore(join(options.root, 'observations'))
  await observations.prune()
  const service = options.service ?? new CodexOpenGuiService({ onSessionClosed: id => observations.remove(id) })
  const confirm = options.confirm ?? confirmAction
  const sockets = new Set<Socket>()
  const operations = new Set<Promise<void>>()
  // CLI connections are short-lived; ownership follows the host's stable task id.
  // This prevents task mixups, not malicious impersonation by same-user processes.
  const owners = new Map<string, string>()
  let lastRequest = Date.now()
  let resolveClosed!: () => void
  const closed = new Promise<void>(resolve => { resolveClosed = resolve })
  let closing: Promise<void> | undefined
  let sweep: ReturnType<typeof setInterval> | undefined
  let sweeping = false
  const server: Server = createServer(socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    let input = ''
    let received = false
    let responseSent = false
    let ownedSession: string | undefined
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)])
    const respond = (value: Response): void => {
      if (socket.destroyed) return
      responseSent = true
      socket.end(JSON.stringify(value) + '\n')
    }
    socket.setEncoding('utf8')
    socket.setTimeout(120_000, () => socket.destroy())
    socket.on('error', () => {})
    socket.once('close', () => {
      if (!responseSent) {
        controller.abort(new Error('opengui: CLI connection closed'))
        if (ownedSession) void service.cancel(ownedSession).catch(() => {})
      }
    })
    socket.on('data', chunk => {
      if (received) return
      input += chunk
      if (Buffer.byteLength(input) > 65_536) { respond({ ok: false, error: 'opengui: request exceeds 64 KiB' }); return }
      if (!input.includes('\n')) return
      received = true
      const operation = (async () => {
        try {
          const value = JSON.parse(input.trim()) as Request
          if (value.name === '__ping__') {
            respond({ ok: true, result: { version: VERSION, protocol: PROTOCOL_VERSION, activeSessions: service.activeSessionCount } satisfies Hello })
            return
          }
          if (value.version !== VERSION || value.protocol !== PROTOCOL_VERSION) throw new Error('opengui: incompatible CLI protocol or version')
          if (value.name === '__shutdown__') {
            if (service.activeSessionCount > 0) throw new Error('opengui: close active sessions before stopping this daemon')
            respond({ ok: true, result: { state: 'stopping' } })
            setImmediate(() => { void close() })
            return
          }
          validateToolArguments(value.name, value.args)
          if (typeof value.owner !== 'string' || !value.owner.trim() || value.owner.length > 200) {
            throw new Error('opengui: CODEX_THREAD_ID is required; run this command from a local Codex task')
          }
          const sessionId = value.args.sessionId
          if (typeof sessionId === 'string' && owners.get(sessionId) !== value.owner) {
            throw new Error('opengui: session belongs to another Codex task or is unknown')
          }
          lastRequest = Date.now()
          if (['opengui_act', 'opengui_observe'].includes(value.name)) ownedSession = String(value.args.sessionId)
          let confirmed = false
          if (value.name === 'opengui_act') {
            const effect = requestedSideEffect(value.args)
            if (effect !== 'none') {
              confirmed = await confirm(effect, structuredClone(value.args), signal)
              if (!confirmed) throw new Error('opengui: user declined this action')
            }
          }
          signal.throwIfAborted()
          const result = value.name === 'opengui_list_sessions'
            ? { sessions: service.listSessions().filter(item => owners.get(item.sessionId) === value.owner) }
            : await callOpenGuiTool(service, value.name, value.args, signal, confirmed)
          if (value.name === 'opengui_open_session') {
            ownedSession = (result as { sessionId: string }).sessionId
            owners.set(ownedSession, value.owner)
          }
          signal.throwIfAborted()
          const materialized = isCodexObservation(result) ? await observations.save(result) : result
          if (isCodexObservation(result) && service.listSessions().find(item => item.sessionId === result.sessionId)?.state !== 'active') {
            await observations.remove(result.sessionId)
            throw new Error('opengui: session ended before its screenshot was delivered')
          }
          if (value.name === 'opengui_close_session' || value.name === 'opengui_cancel') await observations.remove(String(value.args.sessionId))
          signal.throwIfAborted()
          respond({ ok: true, result: materialized })
        } catch (error) {
          if (signal.aborted && ownedSession) {
            await service.cancel(ownedSession).catch(() => {})
            await observations.remove(ownedSession).catch(() => {})
          }
          respond({ ok: false, error: error instanceof Error ? error.message : String(error) })
        } finally {
          lastRequest = Date.now()
          const retained = new Set(service.listSessions().map(item => item.sessionId))
          for (const id of owners.keys()) if (!retained.has(id)) owners.delete(id)
        }
      })()
      operations.add(operation)
      void operation.finally(() => operations.delete(operation))
    })
  })
  const close = (): Promise<void> => {
    if (closing) return closing
    closing = (async () => {
      if (sweep) clearInterval(sweep)
      const stopped = new Promise<void>(resolve => server.close(() => resolve()))
      for (const socket of sockets) socket.destroy()
      await Promise.allSettled(operations)
      await service.dispose()
      await stopped
      // Node removes its own bound Unix socket on close; never unlink another listener.
      resolveClosed()
    })()
    return closing
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(endpoint, () => { server.off('error', reject); resolve() })
    })
    await chmod(endpoint, 0o600)
  } catch (error) { await service.dispose(); throw error }
  sweep = setInterval(() => {
    if (sweeping || closing) return
    sweeping = true
    void (async () => {
      await service.expireIdleSessions()
      if (service.activeSessionCount === 0 && operations.size === 0 && Date.now() - lastRequest >= (options.idleMs ?? DAEMON_IDLE_MS)) await close()
    })().catch(() => {}).finally(() => { sweeping = false })
  }, options.sweepMs ?? 10_000)
  sweep.unref()
  return { endpoint, close, closed }
}
