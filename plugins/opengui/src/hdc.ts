import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { delimiter, isAbsolute, join } from 'node:path'
import type { AdbDevice } from './adb.ts'

export type HdcRunner = (args: readonly string[], signal: AbortSignal) => Promise<string>

export async function hdcPath(): Promise<string> {
  const override = process.env.OPENGUI_HDC_PATH?.trim()
  if (override && !isAbsolute(override)) throw new Error('opengui: OPENGUI_HDC_PATH must be an absolute executable path')
  const candidates = override ? [override] : [
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map(path => join(path, 'hdc')),
    '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc',
  ]
  for (const path of candidates) {
    if ((await stat(path).catch(() => undefined))?.isFile()
      && await access(path, constants.X_OK).then(() => true, () => false)) return path
  }
  throw new Error('opengui: HDC is unavailable; install DevEco Studio and set OPENGUI_HDC_PATH to its hdc executable')
}

export function createHdcRunner(path: string | Promise<string> = hdcPath(), timeoutMs = 15_000): HdcRunner {
  // Consume a rejected path promise immediately; surface it when a command is requested.
  const ready = Promise.resolve(path).then(value => ({ value }), error => ({ error }))
  return async (args, signal) => {
    signal.throwIfAborted()
    const resolved = await ready
    if ('error' in resolved) throw resolved.error
    return new Promise<string>((resolve, reject) => {
      execFile(resolved.value!, [...args], { shell: false, windowsHide: true, signal,
        timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error || /\[Fail\]/i.test(stdout) || /\[Fail\]/i.test(stderr)) {
          reject(new Error(`opengui: HDC command failed: ${(stderr || stdout || error?.message || 'unknown error').trim().slice(0, 1000)}`, { cause: error }))
        } else resolve(stdout)
      })
    })
  }
}

/** Preserve each argument through HDC's device-side shell, including quotes and Unicode. */
export function quoteDeviceArgument(value: string): string {
  if (value.includes('\0')) throw new Error('opengui: device arguments may not contain NUL')
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

export function assertHdcSerial(serial: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:[\]-]{0,199}$/u.test(serial)) throw new Error('opengui: invalid HDC device identity')
}

/** HDC may exit zero for remote errors. Require a fresh shell exit marker as well. */
export async function hdcShell(run: HdcRunner, serial: string, args: readonly string[], signal: AbortSignal): Promise<string> {
  assertHdcSerial(serial)
  const marker = `__opengui_${randomUUID().replaceAll('-', '')}__`
  const command = args.map(quoteDeviceArgument).join(' ')
  const output = await run(['-t', serial, 'shell', `${command}; opengui_status=$?; printf '\\n${marker}%s\\n' "$opengui_status"`], signal)
  const match = output.match(new RegExp(`\\r?\\n${marker}(\\d+)\\r?\\n?$`))
  if (!match || match[1] !== '0') throw new Error('opengui: HDC remote command failed or lost its acknowledgement; observe again before retrying')
  return output.slice(0, match.index).trim()
}

/** Map only Connected rows to usable targets; Ready/Offline are not authorization. */
export function parseHdcDevices(output: string): AdbDevice[] {
  if (!output.trim() || output.trim() === '[Empty]') return []
  return output.trim().split(/\r?\n/u).filter(Boolean).map(line => {
    const fields = line.trim().split(/\s+/u)
    const [serial, transport, status] = fields
    if (!serial || !['USB', 'TCP'].includes(transport ?? '') || !status) throw new Error('opengui: unrecognized HDC device-list response')
    assertHdcSerial(serial)
    const state = status === 'Connected' ? 'device' : status === 'Unauthorized' ? 'unauthorized' : 'offline'
    return { serial, state, model: fields[3] && fields[3] !== 'localhost' ? fields[3] : 'HarmonyOS' }
  })
}
