import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { deviceIdentity } from '../src/device-identity.ts'

const execute = promisify(execFile), roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function root() { const path = await mkdtemp(join(tmpdir(), 'opengui-device-identity-')); roots.push(path); return path }

describe('persistent private device identities', () => {
  it('preserves opaque ids across actual processes and isolates local state namespaces', async () => {
    const directory = await root(), identify = await deviceIdentity(directory), serial = 'private-original-phone'
    const id = identify(serial)
    const source = pathToFileURL(resolve('src/device-identity.ts')).href
    const script = 'const {deviceIdentity}=await import(process.argv[1]); const identify=await deviceIdentity(process.argv[2]); process.stdout.write(identify(process.argv[3]));'
    const child = await execute(process.execPath, ['--input-type=module', '-e', script, source, directory, serial])
    expect(child.stdout).toBe(id)
    expect(id).toMatch(/^device-[a-f0-9]{32}$/u)
    expect(id).not.toContain(serial)
    expect(identify('different-phone')).not.toBe(id)
    expect((await deviceIdentity(await root()))(serial)).not.toBe(id)
    const info = await stat(join(directory, 'device-identity-key'))
    if (process.platform !== 'win32') expect(info.mode & 0o077).toBe(0)
  })

  it('uses one fully written key for concurrent starters', async () => {
    const directory = await root()
    const identities = await Promise.all(Array.from({ length: 8 }, () => deviceIdentity(directory)))
    expect(new Set(identities.map(identify => identify('same-phone'))).size).toBe(1)
    expect(await readFile(join(directory, 'device-identity-key'), 'utf8')).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('refuses corrupted keys without replacing the original bytes', async () => {
    const directory = await root(), path = join(directory, 'device-identity-key')
    await writeFile(path, 'invalid', { mode: 0o600 })
    await expect(deviceIdentity(directory)).rejects.toThrow('invalid_device_identity_key')
    expect(await readFile(path, 'utf8')).toBe('invalid')
  })

  it.skipIf(process.platform === 'win32')('refuses public permissions and symlink keys without changing them', async () => {
    const directory = await root(), path = join(directory, 'device-identity-key')
    await deviceIdentity(directory); await chmod(path, 0o644)
    await expect(deviceIdentity(directory)).rejects.toThrow('unsafe_device_identity_key')
    const other = await root(), link = join(other, 'device-identity-key')
    await symlink(path, link)
    await expect(deviceIdentity(other)).rejects.toThrow('unsafe_device_identity_key')
  })
})
