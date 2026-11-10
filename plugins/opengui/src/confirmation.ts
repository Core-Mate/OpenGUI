import { execFile, type ExecFileException } from 'node:child_process'
import type { ExternalSideEffect } from './codex/service.ts'

export type ConfirmAction = (effect: ExternalSideEffect, args: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>

/** Fixed AppleScript; untrusted action descriptions are passed as argv, never code. */
export const CONFIRMATION_SCRIPT = [
  'on run argv',
  'set messageText to item 1 of argv',
  'try',
  'activate',
  'set dialogReply to display dialog messageText with title "OpenGUI — Confirm device action" buttons {"Cancel", "Allow once"} default button "Cancel" cancel button "Cancel" giving up after 60',
  // AppleScript control statements can clear implicit `result`; retain the reply explicitly.
  'if gave up of dialogReply then return "timeout"',
  'return button returned of dialogReply',
  'on error errorMessage number errorNumber',
  'if errorNumber is -128 then return "cancel"',
  'if errorNumber is -1712 then return "timeout"',
  'return "unavailable"',
  'end try',
  'end run',
].join('\n')

export const confirmAction: ConfirmAction = async (effect, args, signal) => {
  const description = `Allow one ${effect} action on the selected device?\n\n${JSON.stringify(args, null, 2).slice(0, 3000)}\n\nOnly continue if this matches your request.`
  return confirmLocalSetup(description, signal)
}

export async function confirmLocalSetup(description: string, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  if (process.platform !== 'darwin') throw new Error('opengui: confirmation UI unavailable')
  let output: string
  try {
    output = await new Promise<string>((resolve, reject) => {
      execFile('/usr/bin/osascript', ['-e', CONFIRMATION_SCRIPT, description], {
        shell: false, signal, timeout: 65_000, maxBuffer: 8192,
      }, (error, stdout) => error ? reject(error) : resolve(stdout))
    })
  } catch (error) {
    signal.throwIfAborted()
    const failure = error as ExecFileException
    if (failure?.killed && failure.signal === 'SIGTERM') throw new Error('opengui: confirmation timed out')
    // Process errors may contain the full command and private action arguments.
    throw new Error('opengui: confirmation UI unavailable')
  }
  signal.throwIfAborted()
  switch (output.trim()) {
    case 'Allow once': return true
    case 'cancel':
    case 'Cancel': return false
    case 'timeout': throw new Error('opengui: confirmation timed out')
    default: throw new Error('opengui: confirmation UI unavailable')
  }
}
