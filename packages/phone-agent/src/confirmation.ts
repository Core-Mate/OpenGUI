import { execFile } from 'node:child_process'

export type ConfirmPhoneAction = (effect: string, description: string, signal: AbortSignal) => Promise<boolean>
const script = [
  'on run argv',
  'try',
  'display dialog (item 1 of argv) with title "OpenGUI 手机动作确认" buttons {"取消", "仅允许这一次"} default button "取消" cancel button "取消" giving up after 60',
  'if gave up of result then return "cancel"',
  'return button returned of result',
  'on error',
  'return "cancel"',
  'end try',
  'end run',
].join('\n')

/** Keep the existing consequential-action gate independent of the host chat lifetime. */
export const confirmPhoneAction: ConfirmPhoneAction = async (effect, description, signal) => {
  signal.throwIfAborted()
  if (process.platform !== 'darwin') return false
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script, `允许手机执行一次 ${effect} 操作？\n\n${description.slice(0, 3000)}\n\n请核对手机上的内容。`],
      { shell: false, signal, timeout: 65000, maxBuffer: 8192 }, (error, stdout) => {
        if (signal.aborted) reject(signal.reason)
        else resolve(!error && stdout.trim() === '仅允许这一次')
      })
  })
}
