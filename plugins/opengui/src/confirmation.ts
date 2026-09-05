import { execFile } from 'node:child_process'
import type { ExternalSideEffect } from './codex/service.ts'

export type ConfirmAction = (effect: ExternalSideEffect, args: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>

/** Fixed AppleScript; untrusted action descriptions are passed as argv, never code. */
const SCRIPT = [
  'on run argv',
  'set messageText to item 1 of argv',
  'try',
  'display dialog messageText with title "OpenGUI — Confirm Android action" buttons {"Cancel", "Allow once"} default button "Cancel" cancel button "Cancel" giving up after 60',
  'if gave up of result then return "cancel"',
  'return button returned of result',
  'on error',
  'return "cancel"',
  'end try',
  'end run',
].join('\n')

export const confirmAction: ConfirmAction = async (effect, args, signal) => {
  const description = `Allow one ${effect} action on the selected Android phone?\n\n${JSON.stringify(args, null, 2).slice(0, 3000)}\n\nOnly continue if this matches your request.`
  return confirmLocalSetup(description, signal)
}

export async function confirmLocalSetup(description: string, signal: AbortSignal): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  signal.throwIfAborted()
  return new Promise<boolean>((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', SCRIPT, description], {
      shell: false, signal, timeout: 65_000, maxBuffer: 8192,
    }, (error, stdout) => {
      if (signal.aborted) reject(signal.reason)
      else resolve(error === null && stdout.trim() === 'Allow once')
    })
  })
}
