#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import type { Server as NetServer, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexOpenGuiService, ensureCodexStateDir } from './codex/service.ts'
import { callOpenGuiTool, isCodexObservation } from './codex/tools.ts'

interface DaemonRequest {
  readonly name: string
  readonly args: Record<string, unknown>
}

interface DaemonResponse {
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: string
}

function endpointPath(): string {
  const identity = typeof process.getuid === 'function' ? String(process.getuid()) : process.env.USER ?? 'user'
  return join(tmpdir(), `opengui-codex-${identity}.sock`)
}

function sendRequest(endpoint: string, request: DaemonRequest): Promise<DaemonResponse> {
  return new Promise((resolveResponse, rejectResponse) => {
    const socket = createConnection(endpoint)
    let body = ''
    socket.setEncoding('utf8')
    socket.once('connect', () => socket.end(`${JSON.stringify(request)}\n`))
    socket.on('data', chunk => { body += chunk })
    socket.once('error', rejectResponse)
    socket.once('end', () => {
      try {
        resolveResponse(JSON.parse(body) as DaemonResponse)
      } catch (error) {
        rejectResponse(error)
      }
    })
  })
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolveWait => setTimeout(resolveWait, delayMs))
}

async function ensureDaemon(endpoint: string): Promise<void> {
  try {
    const response = await sendRequest(endpoint, { name: '__ping__', args: {} })
    if (response.ok) return
  } catch { /* start a new local daemon below */ }

  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--daemon'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, OPENGUI_CODEX_SOCKET: endpoint },
  })
  child.unref()
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    await wait(50)
    try {
      const response = await sendRequest(endpoint, { name: '__ping__', args: {} })
      if (response.ok) return
    } catch { /* daemon is still starting */ }
  }
  throw new Error('opengui: local CLI daemon did not start within five seconds')
}

async function readArgs(raw: string | undefined): Promise<Record<string, unknown>> {
  const input = raw ?? (process.stdin.isTTY ? '' : readFileSync(0, 'utf8'))
  if (input.trim().length === 0) return {}
  const value = JSON.parse(input) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('opengui: CLI arguments must be one JSON object')
  }
  return value as Record<string, unknown>
}

export async function materializeCliResult(value: unknown): Promise<unknown> {
  if (!isCodexObservation(value)) return value
  const stateDir = await ensureCodexStateDir()
  const directory = join(stateDir, 'observations')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const digest = createHash('sha256')
    .update(`${value.sessionId}\0${value.deviceId}\0${value.observationId}`)
    .digest('hex')
  const screenshotPath = join(directory, `${digest}.jpg`)
  await writeFile(screenshotPath, Buffer.from(value.screenshot.data, 'base64'), { mode: 0o600 })
  const { data: _data, ...screenshot } = value.screenshot
  return { ...value, screenshot: { ...screenshot, path: screenshotPath } }
}

async function handleSocket(service: CodexOpenGuiService, socket: Socket): Promise<void> {
  socket.setEncoding('utf8')
  let body = ''
  socket.on('data', chunk => { body += chunk })
  socket.once('end', async () => {
    try {
      const request = JSON.parse(body) as DaemonRequest
      if (request.name === '__ping__') {
        socket.end(JSON.stringify({ ok: true, result: { status: 'ready' } } satisfies DaemonResponse))
        return
      }
      if (request.name === '__shutdown__') {
        socket.end(JSON.stringify({ ok: true, result: { status: 'stopping' } } satisfies DaemonResponse))
        setImmediate(() => process.kill(process.pid, 'SIGTERM'))
        return
      }
      const confirmed = request.args.confirmedExternalSideEffect === true
      const result = await callOpenGuiTool(service, request.name, request.args, new AbortController().signal, confirmed)
      socket.end(JSON.stringify({ ok: true, result } satisfies DaemonResponse))
    } catch (error) {
      socket.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies DaemonResponse))
    }
  })
}

async function runDaemon(endpoint = process.env.OPENGUI_CODEX_SOCKET ?? endpointPath()): Promise<void> {
  process.umask(0o077)
  await rm(endpoint, { force: true })
  const service = new CodexOpenGuiService()
  const server: NetServer = createServer({ allowHalfOpen: true }, socket => { void handleSocket(service, socket) })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(endpoint, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  await chmod(endpoint, 0o600)
  let closing = false
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    await new Promise<void>(resolveClose => server.close(() => resolveClose()))
    await service.dispose()
    await rm(endpoint, { force: true })
  }
  process.once('SIGINT', () => { void close() })
  process.once('SIGTERM', () => { void close() })
}

export async function runCli(argv: readonly string[]): Promise<unknown> {
  const [name, raw] = argv
  if (name === undefined || name === '--help' || name === '-h') {
    return {
      usage: 'opengui-codex <opengui_interface> [json]',
      interfaces: [
        'opengui_list_devices', 'opengui_open_session', 'opengui_observe', 'opengui_act',
        'opengui_status', 'opengui_cancel', 'opengui_close_session',
      ],
    }
  }
  if (name === '--shutdown-daemon') {
    const response = await sendRequest(endpointPath(), { name: '__shutdown__', args: {} })
    if (!response.ok) throw new Error(response.error ?? 'opengui: CLI daemon shutdown failed')
    return response.result
  }
  const args = await readArgs(raw)
  const endpoint = endpointPath()
  await ensureDaemon(endpoint)
  const response = await sendRequest(endpoint, { name, args })
  if (!response.ok) throw new Error(response.error ?? 'opengui: CLI request failed')
  return materializeCliResult(response.result)
}

async function main(): Promise<void> {
  if (process.argv[2] === '--daemon') {
    await runDaemon()
    return
  }
  const value = await runCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

const launchedPath = process.argv[1]
const launchedAsMain = launchedPath !== undefined
  && realpathSync(launchedPath) === realpathSync(fileURLToPath(import.meta.url))
if (launchedAsMain) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
