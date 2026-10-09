import { describe, expect, it, vi } from 'vitest'
import { ScrcpyInstaller, resolveScrcpyAsset, type ScrcpyAsset } from '../src/scrcpy.ts'
import { mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { c as createTar } from 'tar'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return { ...original, open: vi.fn(original.open) }
})

describe('verified scrcpy download sources', () => {
  const fixture = async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-video-source-'))
    const archiveRoot = 'fixture-scrcpy'
    await mkdir(join(root, archiveRoot))
    await writeFile(join(root, archiveRoot, 'scrcpy'), 'fixture executable')
    await writeFile(join(root, archiveRoot, 'scrcpy-server'), 'fixture server')
    const archive = join(root, 'fixture.tar.gz')
    await createTar({ file: archive, cwd: root, gzip: true }, [archiveRoot])
    const bytes = await readFile(archive)
    const asset: ScrcpyAsset = { key: 'fixture', archive: 'tar.gz', archiveRoot, executable: 'scrcpy', url: 'https://github.com/Genymobile/scrcpy/releases/download/v4.1/fixture.tar.gz', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    return { root, asset, bytes }
  }

  it('uses the official source by default', async () => {
    const { root, asset, bytes } = await fixture()
    try {
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(bytes))
      await new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch }).ensure(asset, AbortSignal.timeout(5000), () => {})
      expect(fetch).toHaveBeenCalledExactlyOnceWith(asset.url, expect.objectContaining({ redirect: 'follow' }))
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('verifies a mirror archive and reuses the installed cache', async () => {
    const { root, asset, bytes } = await fixture()
    try {
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(bytes))
      const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch, mirrorBaseUrl: 'https://mirror.example/scrcpy/v4.1/' })
      const installed = await installer.ensure(asset, AbortSignal.timeout(5000), () => {})
      expect(await readFile(installed.server, 'utf8')).toBe('fixture server')
      await installer.ensure(asset, AbortSignal.timeout(5000), () => {})
      expect(fetch).toHaveBeenCalledExactlyOnceWith('https://mirror.example/scrcpy/v4.1/fixture.tar.gz', expect.anything())
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it.each(['HTTP failure', 'checksum mismatch', 'size mismatch', 'network failure'])('falls back to the official archive after mirror %s', async failure => {
    const { root, asset, bytes } = await fixture()
    try {
      const bad = Buffer.from(bytes)
      bad[0] = bad[0]! ^ 1
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => {
        if (failure === 'network failure') throw new Error('fixture network failure')
        return failure === 'HTTP failure' ? new Response(null, { status: 503 }) : new Response(failure === 'size mismatch' ? bad.subarray(1) : bad)
      }).mockImplementationOnce(async () => new Response(bytes))
      await new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch, mirrorBaseUrl: 'https://mirror.example/video' }).ensure(asset, AbortSignal.timeout(5000), () => {})
      expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://mirror.example/video/fixture.tar.gz', asset.url])
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('refuses corrupt bytes even when both sources respond successfully', async () => {
    const { root, asset, bytes } = await fixture()
    try {
      const bad = Buffer.from(bytes)
      bad[0] = bad[0]! ^ 1
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(bad))
      const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch, mirrorBaseUrl: 'https://mirror.example/video' })
      await expect(installer.ensure(asset, AbortSignal.timeout(5000), () => {})).rejects.toThrow('checksum mismatch')
      expect(await installer.isInstalled(asset)).toBe(false)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('does not start an official fallback after user cancellation', async () => {
    const { root, asset } = await fixture()
    try {
      const controller = new AbortController()
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
        controller.abort(new Error('fixture user cancelled'))
        throw new Error('fixture cancelled request')
      })
      const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch, mirrorBaseUrl: 'https://mirror.example/video' })
      await expect(installer.ensure(asset, controller.signal, () => {})).rejects.toThrow('fixture user cancelled')
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it.each(['http://mirror.example', 'https://user:pass@mirror.example', 'https://mirror.example?token=secret', 'https://mirror.example/#fragment'])('rejects an unsafe mirror directory %s', mirrorBaseUrl => {
    expect(() => new ScrcpyInstaller({ mirrorBaseUrl })).toThrow('HTTPS archive directory')
  })
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
