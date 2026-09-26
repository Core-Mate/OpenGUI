import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const defaultLeaseRoot = () => join(homedir(), 'Library', 'Application Support', 'OpenGUI', 'device-leases')
export interface DeviceLease { release(): Promise<void> }

/** Cross-process admission only. Host task data and credentials never enter this directory. */
export async function acquireDeviceLease(serial: string, owner: string, root = defaultLeaseRoot()): Promise<DeviceLease> {
  await mkdir(root, { recursive: true, mode: 0o700 })
  const path = join(root, createHash('sha256').update(serial).digest('hex'))
  const token = randomUUID()
  try { await mkdir(path, { mode: 0o700 }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    // Never steal on a timer or PID heuristic: a native command may outlive its parent.
    throw new Error('device_busy: another OpenGUI task owns this Android device; stop its task first. After a crash, verify all phone and emulator processes have stopped before removing the stale lease.')
  }
  try { await writeFile(join(path, 'owner.json'), JSON.stringify({ token, owner, pid: process.pid }), { mode: 0o600, flag: 'wx' }) }
  catch (error) { await rm(path, { recursive: true, force: true }); throw error }
  let released = false
  return { async release() {
    if (released) return
    const current = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')) as { token: string }
    if (current.token !== token) throw new Error('device_lease_owner_changed')
    await rm(path, { recursive: true })
    released = true
  } }
}
