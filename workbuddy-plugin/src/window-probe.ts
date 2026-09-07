import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export interface WindowEvidence { visible: boolean; identity?: string; message?: string }
export async function probeWindow(pid: number, executable: string, identity: string | undefined, show: boolean, slot = -1, parentPid = process.pid): Promise<WindowEvidence> {
  if (process.platform !== 'darwin') return { visible: false, message: 'Verified window display currently requires macOS' }
  const helper = fileURLToPath(new URL(`./native/window-helper-${process.arch}`, import.meta.url))
  return new Promise(resolve => {
    execFile(helper, [show ? 'show' : 'probe', String(pid), String(parentPid), executable, identity ?? '', String(slot)],
      { timeout: 3000, maxBuffer: 8192 }, (error, stdout) => {
        if (error) { resolve({ visible: false, message: 'Window helper unavailable; check packaged helper and macOS permissions' }); return }
        try {
          const data = JSON.parse(stdout) as WindowEvidence
          resolve({ ...data, visible: data.visible === true })
        } catch { resolve({ visible: false, message: 'Invalid window helper response' }) }
      })
  })
}
