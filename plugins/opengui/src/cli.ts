#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { managedAdbPath } from './adb.ts'
import { assertCompatibleAdbServer } from './adb-guard.ts'
import { confirmLocalSetup } from './confirmation.ts'
import { OPENGUI_CODEX_TOOLS, validateToolArguments } from './codex/tools.ts'
import { ensureDaemon, request, sendRequest, startDaemon } from './daemon.ts'
import { VERSION, daemonEndpoint, dataDirectory } from './state.ts'

export async function runCli(argv: readonly string[], signal = new AbortController().signal): Promise<unknown> {
  const [name, raw] = argv
  if (!name || name === '--help' || name === '-h') {
    return {
      name: 'OpenGUI for Codex', version: VERSION,
      usage: 'opengui <interface> [json] (JSON can also be read from stdin)',
      commands: ['--help', '--version', '--interfaces', '--doctor', '--setup-adb-server', '--shutdown-daemon'],
      interfaces: OPENGUI_CODEX_TOOLS.map(tool => tool.name),
      platform: 'Local macOS arm64/x64 only. Use a dedicated non-production device environment.',
    }
  }
  if (name === '--version') return { version: VERSION }
  if (name === '--interfaces') return { interfaces: OPENGUI_CODEX_TOOLS }
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) {
    throw new Error('opengui: local Android control is supported only on macOS arm64/x64')
  }
  if (name === '--doctor') {
    const adb = managedAdbPath()
    let adbServer = 'compatible'
    try { await assertCompatibleAdbServer(signal) }
    catch (error) { adbServer = error instanceof Error ? error.message : String(error) }
    return {
      version: VERSION, node: process.version, platform: process.platform, arch: process.arch,
      dataDirectory: dataDirectory(),
      adbExecutable: await access(adb, constants.X_OK).then(() => 'ready', () => 'missing or not executable'),
      adbServer,
      setup: 'If no server exists, explicitly approve --setup-adb-server on a dedicated test machine. Never restart a production ADB server.',
    }
  }
  if (name === '--setup-adb-server') {
    // A running but incompatible server must never be replaced.
    try { await assertCompatibleAdbServer(signal); return { adbServer: 'already compatible' } }
    catch (error) {
      if ((error as Error & { cause?: NodeJS.ErrnoException }).cause?.code !== 'ECONNREFUSED') throw error
    }
    const approved = await confirmLocalSetup('Start the bundled Android Debug Bridge server on this Mac? This is a machine-wide service. Continue only on a dedicated non-production test machine with no other device automation running.', signal)
    if (!approved) throw new Error('opengui: ADB setup cancelled')
    // Recheck after the user dialog in case another program started a server.
    try { await assertCompatibleAdbServer(signal); return { adbServer: 'already compatible' } }
    catch (error) {
      if ((error as Error & { cause?: NodeJS.ErrnoException }).cause?.code !== 'ECONNREFUSED') throw error
    }
    await new Promise<void>((resolve, reject) => {
      execFile(managedAdbPath(), ['-H', '127.0.0.1', '-P', '5037', 'start-server'], {
        shell: false, signal, timeout: 10_000, maxBuffer: 8192,
      }, error => error ? reject(error) : resolve())
    })
    await assertCompatibleAdbServer(signal)
    return { adbServer: 'started' }
  }
  if (name === '--shutdown-daemon') {
    const result = await sendRequest(daemonEndpoint(), request('__shutdown__'), signal)
    if (!result.ok) throw new Error(result.error)
    return result.result
  }
  const source = raw ?? (process.stdin.isTTY ? '{}' : await readStdin())
  const args: unknown = JSON.parse(source.trim() || '{}')
  validateToolArguments(name, args)
  if (!process.env.CODEX_THREAD_ID?.trim()) throw new Error('opengui: CODEX_THREAD_ID is required; run from a local Codex task')
  const endpoint = await ensureDaemon(fileURLToPath(import.meta.url), dataDirectory(), AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
  const result = await sendRequest(endpoint, request(name, args as Record<string, unknown>), signal)
  if (!result.ok) throw new Error(result.error)
  return result.result
}

async function readStdin(): Promise<string> {
  let value = ''
  for await (const chunk of process.stdin) {
    value += String(chunk)
    if (Buffer.byteLength(value) > 65_536) throw new Error('opengui: input exceeds 64 KiB')
  }
  return value
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isEntry) {
  if (process.argv[2] === '--daemon') {
    startDaemon({ root: dataDirectory() }).then(async daemon => {
      process.once('SIGTERM', () => { void daemon.close() })
      process.once('SIGINT', () => { void daemon.close() })
      await daemon.closed
    }).catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
  } else {
    const controller = new AbortController()
    process.once('SIGINT', () => controller.abort(new Error('opengui: interrupted')))
    process.once('SIGTERM', () => controller.abort(new Error('opengui: terminated')))
    runCli(process.argv.slice(2), controller.signal)
      .then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
      .catch(error => {
        process.stderr.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n')
        process.exitCode = 1
      })
  }
}
