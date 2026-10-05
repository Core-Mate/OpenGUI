import { createHmac, randomBytes } from 'node:crypto'
import { lstat, open, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensurePrivateState } from './state.ts'

/** Local device identities survive restarts without exposing an unsalted serial hash. */
export async function deviceIdentity(stateDir: string): Promise<(serial: string) => string> {
  await ensurePrivateState(stateDir)
  const path = join(stateDir, 'device-identity-key')
  try {
    const file = await open(path, 'wx', 0o600)
    try { await file.writeFile(randomBytes(32).toString('hex')); await file.sync() }
    finally { await file.close() }
    if (process.platform !== 'win32') {
      const directory = await open(stateDir, 'r')
      try { await directory.sync() } finally { await directory.close() }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077)))) throw new Error('unsafe_device_identity_key')
    if (info.size > 64) throw new Error('invalid_device_identity_key')
    const value = await readFile(path, 'utf8')
    if (/^[a-f0-9]{64}$/u.test(value)) {
      const key = Buffer.from(value, 'hex')
      return serial => `device-${createHmac('sha256', key).update(serial).digest('hex').slice(0, 32)}`
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('invalid_device_identity_key')
}
