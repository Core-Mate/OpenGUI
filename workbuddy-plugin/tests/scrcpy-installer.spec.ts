import { describe, expect, it, vi } from 'vitest'
import { ScrcpyInstaller, resolveScrcpyAsset } from '../src/scrcpy.ts'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return { ...original, open: vi.fn(original.open) }
})

describe('shared scrcpy installation cancellation', () => {
  it('retries a transient installation lock sharing violation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-install-lock-'))
    try {
      const installer = new ScrcpyInstaller() as unknown as { acquireInstallLock: (path: string, signal: AbortSignal) => Promise<() => Promise<void>> }
      vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('sharing violation'), { code: 'EPERM' }))
      const release = await installer.acquireInstallLock(join(root, 'lock'), AbortSignal.timeout(1000))
      await release()
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('starts a fresh job when reopening before cancelled installation cleanup finishes', async () => {
    const installer = new ScrcpyInstaller()
    const asset = resolveScrcpyAsset('darwin', 'arm64')!
    const installed = installer.paths(asset)
    let finishCleanup!: () => void
    const oldJob = new Promise<never>((_resolve, reject) => { finishCleanup = () => reject(new Error('old download cancelled')) })
    const install = vi.spyOn(installer as unknown as { install: () => Promise<typeof installed> }, 'install')
      .mockImplementationOnce(() => oldJob).mockResolvedValue(installed)
    const first = new AbortController()
    const pending = installer.ensure(asset, first.signal, () => {})
    first.abort(new Error('user closed window'))
    await expect(pending).rejects.toThrow('user closed')
    const reopened = installer.ensure(asset, AbortSignal.timeout(5000), () => {})
    finishCleanup()
    await expect(reopened).resolves.toEqual(installed)
    expect(install).toHaveBeenCalledTimes(2)
  })
})
