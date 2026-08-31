import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  comparePluginVersions,
  parseLatestRelease,
  PluginUpdateManager,
  resolveCurrentProfile,
} from '../src/plugin-update.ts'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'opengui-update-test-'))
  temporary.push(path)
  return path
}

function pluginRelease(version: string, archive: Buffer, checksum: Buffer): Record<string, unknown> {
  const tag = `dsh-coremate-mobile-v${version}`
  const base = `https://github.com/Core-Mate/OpenGUI/releases/download/${tag}`
  const archiveName = `dsh-coremate-mobile-${version}.tgz`
  return {
    tag_name: tag,
    html_url: `https://github.com/Core-Mate/OpenGUI/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: archiveName,
        size: archive.byteLength,
        state: 'uploaded',
        url: `https://api.github.com/repos/Core-Mate/OpenGUI/releases/assets/${archiveName}`,
        browser_download_url: `${base}/${archiveName}`,
        digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
      },
      {
        name: `${archiveName}.sha256`,
        size: checksum.byteLength,
        state: 'uploaded',
        url: `https://api.github.com/repos/Core-Mate/OpenGUI/releases/assets/${archiveName}.sha256`,
        browser_download_url: `${base}/${archiveName}.sha256`,
      },
    ],
  }
}

function androidRelease(): Record<string, unknown> {
  return {
    tag_name: 'v9.9.9',
    html_url: 'https://github.com/Core-Mate/OpenGUI/releases/tag/v9.9.9',
    draft: false,
    prerelease: false,
    assets: [{ name: 'OpenGUI-Android-v9.9.9.apk', size: 123, state: 'uploaded', url: 'https://api.github.com/android' }],
  }
}

function releaseFetch(metadata: readonly Record<string, unknown>[], archive: Buffer, checksum: Buffer): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/releases?per_page=100')) return new Response(JSON.stringify(metadata))
    if (url.endsWith('.sha256')) return new Response(checksum, { headers: { 'Content-Length': String(checksum.byteLength) } })
    if (url.endsWith('.tgz')) return new Response(archive, { headers: { 'Content-Length': String(archive.byteLength) } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

async function writeProfile(root: string, name: string): Promise<void> {
  const profile = join(root, 'profiles', name)
  await mkdir(profile, { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'dsh-coremate-mobile': 'file:release.tgz' },
    dsh: { profile: { bundles: ['dsh-coremate-mobile'] } },
  }))
}

describe('OpenGUI plugin release updater', () => {
  it('compares stable and prerelease semantic versions', () => {
    expect(comparePluginVersions('0.1.7', '0.1.6')).toBe(1)
    expect(comparePluginVersions('v1.0.0', '1.0.0-rc.2')).toBe(1)
    expect(comparePluginVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBe(-1)
    expect(comparePluginVersions('1.2.3+build.2', '1.2.3+build.1')).toBe(0)
  })

  it('selects the highest stable plugin release and ignores newer Android releases', () => {
    const archive = Buffer.from('archive')
    const checksum = Buffer.from(`${createHash('sha256').update(archive).digest('hex')}  dsh-coremate-mobile-0.1.7.tgz\n`)
    expect(parseLatestRelease([
      androidRelease(),
      pluginRelease('0.1.6', archive, checksum),
      pluginRelease('0.1.7', archive, checksum),
    ])).toMatchObject({
      version: '0.1.7',
      archive: { name: 'dsh-coremate-mobile-0.1.7.tgz' },
      checksum: { name: 'dsh-coremate-mobile-0.1.7.tgz.sha256' },
    })
  })

  it('requires the versioned package and checksum assets', () => {
    expect(() => parseLatestRelease([{ ...pluginRelease('0.1.7', Buffer.from('x'), Buffer.from('y')), assets: [] }]))
      .toThrow('verified installer assets')
  })

  it('checks, verifies, caches, and installs an available public release into the owning profile', async () => {
    const root = await home()
    await writeProfile(root, 'web')
    const archive = Buffer.from('verified plugin package')
    const digest = createHash('sha256').update(archive).digest('hex')
    const archiveName = 'dsh-coremate-mobile-0.1.7.tgz'
    const checksum = Buffer.from(`${digest}  ${archiveName}\n`)
    const install = vi.fn(async (_profile: string, path: string) => {
      expect(await readFile(path)).toEqual(archive)
      const installed = join(root, 'profiles', 'web', 'node_modules', 'dsh-coremate-mobile')
      await mkdir(installed, { recursive: true })
      await writeFile(join(installed, 'package.json'), JSON.stringify({ version: '0.1.7' }))
    })
    const fetchImpl = releaseFetch([androidRelease(), pluginRelease('0.1.7', archive, checksum)], archive, checksum)
    const manager = new PluginUpdateManager({
      currentVersion: '0.1.6',
      dshHome: root,
      packageRoot: join(root, 'source-package'),
      fetch: fetchImpl,
      install,
    })

    await manager.check()
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/repos/Core-Mate/OpenGUI/releases?per_page=100'),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }) }),
    )
    expect(manager.status()).toMatchObject({ phase: 'available', currentVersion: '0.1.6', latestVersion: '0.1.7' })
    expect(manager.requestUpdate()).toBe(true)
    await vi.waitFor(() => { expect(manager.status().phase).toBe('restart-required') })
    expect(install).toHaveBeenCalledWith(
      'web',
      join(root, 'cache', 'coremate-mobile', 'releases', 'v0.1.7', archiveName),
      expect.any(AbortSignal),
    )
  })

  it('does not install an archive whose checksum does not match', async () => {
    const root = await home()
    await writeProfile(root, 'web')
    const archive = Buffer.from('tampered')
    const checksum = Buffer.from(`${'0'.repeat(64)}  dsh-coremate-mobile-0.1.7.tgz\n`)
    const install = vi.fn(async () => {})
    const manager = new PluginUpdateManager({
      currentVersion: '0.1.6', dshHome: root, packageRoot: root,
      fetch: releaseFetch([pluginRelease('0.1.7', archive, checksum)], archive, checksum), install,
    })
    await manager.check()
    expect(manager.requestUpdate()).toBe(true)
    await vi.waitFor(() => { expect(manager.status().phase).toBe('error') })
    expect(manager.status().message).toContain('checksum mismatch')
    expect(install).not.toHaveBeenCalled()
  })

  it('refuses to guess when multiple profiles contain non-identical installations', async () => {
    const root = await home()
    await Promise.all([writeProfile(root, 'web'), writeProfile(root, 'custom')])
    await expect(resolveCurrentProfile(root, join(root, 'source-package'))).rejects.toThrow('multiple DSH profiles')
    await expect(resolveCurrentProfile(root, join(root, 'source-package'), 'custom')).resolves.toBe('custom')
  })
})
