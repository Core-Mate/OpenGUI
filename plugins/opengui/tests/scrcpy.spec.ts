import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { c as createTar } from 'tar'
import { buildScrcpyControlServerArgs, buildSetClipboardControlMessage, parseScrcpyDeviceMessages, ScrcpyInstaller, ScrcpyTextInput } from '../src/scrcpy.ts'
import { OwnedForwardRegistry } from '../src/forward-registry.ts'
import type { ScrcpyAsset } from '../src/scrcpy.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'opengui-scrcpy-test-')); roots.push(root)
  await mkdir(join(root, 'fixture'))
  await writeFile(join(root, 'fixture/scrcpy'), 'test executable')
  await chmod(join(root, 'fixture/scrcpy'), 0o755)
  await writeFile(join(root, 'fixture/scrcpy-server'), 'test server')
  await createTar({ cwd: root, file: join(root, 'archive.tar.gz'), gzip: true }, ['fixture'])
  const archive = await readFile(join(root, 'archive.tar.gz'))
  const asset: ScrcpyAsset = {
    key: 'darwin-arm64', archive: 'tar.gz', archiveRoot: 'fixture', executable: 'scrcpy',
    url: 'https://example.invalid/test-fixture', bytes: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
  }
  return { root, asset, archive }
}
describe('isolated scrcpy runtime and protocol', () => {
  it.each(['abort', 'spawn-throw'])('cleans owned resources when startup fails at %s', async failure => {
    const { root, asset } = await fixture()
    const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache') })
    vi.spyOn(installer, 'ensure').mockResolvedValue({ root, executable: join(root, 'scrcpy'), server: join(root, 'server') })
    const registry = new OwnedForwardRegistry(join(root, 'forwards.json'))
    vi.spyOn(registry, 'track').mockResolvedValue(undefined)
    const release = vi.spyOn(registry, 'release').mockResolvedValue(true)
    const controller = new AbortController()
    const runAdb = vi.fn(async () => undefined)
    const spawn = vi.fn(() => { throw new Error('spawn failed') })
    const input = new ScrcpyTextInput({
      installer, asset, forwardRegistry: registry, runAdb, spawn,
      adbPath: () => '/test/adb', freePort: async () => 45678,
      beforeSpawn: async () => { if (failure === 'abort') controller.abort(new Error('cancelled')) },
    })
    await expect(input.paste('test-serial', '你好', controller.signal)).rejects.toThrow()
    expect(release).toHaveBeenCalledOnce()
    expect(runAdb.mock.calls).toContainEqual([expect.arrayContaining(['shell', 'rm', '-f']), expect.any(AbortSignal)])
    await input.dispose()
  })
  it('installs one verified archive and reuses it without downloading again', async () => {
    const { root, asset, archive } = await fixture()
    const fetch = vi.fn(async () => new Response(archive))
    const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch })
    const installed = await installer.ensure(asset, new AbortController().signal, () => {})
    expect(await readFile(installed.server, 'utf8')).toBe('test server')
    await installer.ensure(asset, new AbortController().signal, () => {})
    expect(fetch).toHaveBeenCalledOnce()
    expect(installed.root.startsWith(join(root, 'cache'))).toBe(true)
  })
  it('does not execute or install an archive with the wrong hash', async () => {
    const { root, asset, archive } = await fixture()
    const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch: async () => new Response(archive) })
    await expect(installer.ensure({ ...asset, sha256: '0'.repeat(64) }, new AbortController().signal, () => {})).rejects.toThrow('checksum')
    expect(await installer.isInstalled(asset)).toBe(false)
    expect((await readdir(join(root, 'cache/v4.1/darwin-arm64'))).some(name => name.startsWith('.download') || name.startsWith('.extract'))).toBe(false)
  })
  it('shares one download among concurrent waiters', async () => {
    const { root, asset, archive } = await fixture()
    const fetch = vi.fn(async () => new Response(archive))
    const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch })
    await Promise.all(Array.from({ length: 4 }, () => installer.ensure(asset, new AbortController().signal, () => {})))
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('encodes Unicode with a sequence acknowledgement', () => {
    const payload = buildSetClipboardControlMessage('你好 👋', true, 42n)
    expect(payload[0]).toBe(9)
    expect(payload.readBigUInt64BE(1)).toBe(42n)
    expect(payload.subarray(14).toString('utf8')).toBe('你好 👋')
    const reply = Buffer.alloc(9); reply[0] = 1; reply.writeBigUInt64BE(42n, 1)
    expect(parseScrcpyDeviceMessages(reply.subarray(0, 4)).acknowledgements).toEqual([])
    expect(parseScrcpyDeviceMessages(reply).acknowledgements).toEqual([42n])
  })
  it('uses a standalone remote path and control-only server', () => {
    const args = buildScrcpyControlServerArgs('00000042')
    expect(args[0]).toContain('/data/local/tmp/opengui-codex-')
    expect(args).toContain('video=false')
    expect(args.join(' ')).not.toContain('coremate')
  })
})
