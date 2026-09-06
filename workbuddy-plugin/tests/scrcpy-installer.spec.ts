import { describe, expect, it, vi } from 'vitest'
import { ScrcpyInstaller, resolveScrcpyAsset } from '../src/scrcpy.ts'

describe('shared scrcpy installation cancellation', () => {
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
