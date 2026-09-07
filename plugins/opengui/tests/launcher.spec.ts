import { afterEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { c as createTar } from 'tar'

const exec = promisify(execFile)
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'opengui-launcher-test-')); roots.push(root)
  const bin = join(root, 'mock-bin')
  const script = join(root, 'plugin/scripts/opengui')
  const runtimeName = 'node-v22.23.2-darwin-arm64'
  await mkdir(bin)
  await mkdir(join(root, 'plugin/scripts'), { recursive: true })
  await mkdir(join(root, runtimeName, 'bin'), { recursive: true })
  const executable = async (path: string, source: string) => {
    await writeFile(path, '#!/bin/sh\nset -eu\n' + source); await chmod(path, 0o755)
  }
  await executable(join(root, runtimeName, 'bin/node'), 'printf "%s\\n" "$@"\n')
  await createTar({ cwd: root, file: join(root, 'fixture.tar.gz'), gzip: true }, [runtimeName])
  const sha = createHash('sha256').update(await readFile(join(root, 'fixture.tar.gz'))).digest('hex')
  // Replace only external platform dependencies in a private copy of the actual launcher.
  let launcher = await readFile(resolve('scripts/opengui'), 'utf8')
  launcher = launcher.replaceAll(/archive_sha=[a-f0-9]{64}/g, 'archive_sha=' + sha)
    .replace('/usr/bin/osascript', 'opengui-test-approval').replace('/usr/bin/curl', 'opengui-test-fetch')
  if (process.platform !== 'darwin') launcher = launcher.replace("stat -f '%u'", "stat -c '%u'")
  await writeFile(script, launcher)
  await executable(join(bin, 'uname'), 'if [ "$1" = -s ]; then echo "${TEST_OS:-Darwin}"; else echo arm64; fi\n')
  await executable(join(bin, 'opengui-test-approval'), 'echo approval >> "$TEST_EVENTS"\necho "${TEST_APPROVAL:-Download}"\n')
  await executable(join(bin, 'opengui-test-fetch'), [
    'echo download >> "$TEST_EVENTS"',
    'if [ "${TEST_DOWNLOAD_FAIL:-false}" = true ]; then exit 22; fi',
    'while [ "$1" != --output ]; do shift; done',
    'if [ "${TEST_CORRUPT:-false}" = true ]; then echo invalid > "$2"; else cp "$TEST_ARCHIVE" "$2"; fi',
  ].join('\n') + '\n')
  const data = join(root, 'data')
  const env = { ...process.env, PATH: bin + ':' + process.env.PATH, OPENGUI_CODEX_DATA_DIR: data,
    TEST_EVENTS: join(root, 'events'), TEST_ARCHIVE: join(root, 'fixture.tar.gz') }
  const run = (args = ['--setup'], overrides: Record<string, string> = {}) => exec('/bin/sh', [script, ...args], { env: { ...env, ...overrides }, timeout: 15_000 })
  const events = () => readFile(join(root, 'events'), 'utf8')
  return { root, data, runtime: join(data, 'runtime', runtimeName), run, events }
}

describe('standalone launcher installation contract', () => {
  it('prints help and version without approval, download, or state creation', async () => {
    const f = await fixture()
    expect((await f.run(['--help'], { TEST_OS: 'Linux' })).stdout).toContain('OpenGUI for Codex')
    expect((await f.run(['--version'])).stdout.trim()).toBe('0.1.0')
    await expect(readdir(f.data)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('installs a verified runtime, translates setup to doctor, and reuses the cache', async () => {
    const f = await fixture()
    expect((await f.run()).stdout).toContain('--doctor')
    expect((await f.run(['--interfaces'])).stdout).toContain('--interfaces')
    expect(await f.events()).toBe('approval\ndownload\n')
    expect(await readdir(join(f.data, 'runtime'))).toEqual(['node-v22.23.2-darwin-arm64'])
  })
  it('cancels before downloading and releases only its own install lock', async () => {
    const f = await fixture()
    await expect(f.run([], { TEST_APPROVAL: 'cancel' })).resolves.toBeDefined()
    await expect(f.run(['--setup'], { TEST_APPROVAL: 'cancel' })).rejects.toMatchObject({ code: 1 })
    expect(await f.events()).toBe('approval\n')
    expect(await readdir(join(f.data, 'runtime'))).toEqual([])
  })
  it('rejects corrupt archives without installing or executing them', async () => {
    const f = await fixture()
    await expect(f.run(['--setup'], { TEST_CORRUPT: 'true' })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('checksum mismatch') })
    expect(await readdir(join(f.data, 'runtime'))).toEqual([])
  })
  it('preserves an old cache if a replacement download fails', async () => {
    const f = await fixture()
    await f.run()
    await writeFile(join(f.runtime, '.verified'), 'invalid marker')
    const oldBinary = await readFile(join(f.runtime, 'bin/node'))
    await expect(f.run(['--setup'], { TEST_DOWNLOAD_FAIL: 'true' })).rejects.toMatchObject({ code: 22 })
    expect(await readFile(join(f.runtime, 'bin/node'))).toEqual(oldBinary)
    expect(await readdir(join(f.data, 'runtime'))).toEqual(['node-v22.23.2-darwin-arm64'])
  })
  it('serializes concurrent processes into a single approved download', async () => {
    const f = await fixture()
    const results = await Promise.all([f.run(), f.run(), f.run()])
    expect(results.every(result => result.stdout.includes('--doctor'))).toBe(true)
    expect(await f.events()).toBe('approval\ndownload\n')
  })
  it('rejects unsafe state roots and unsupported platforms before setup', async () => {
    const f = await fixture()
    await expect(f.run(['--setup'], { OPENGUI_CODEX_DATA_DIR: '/' })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('unsafe') })
    await expect(f.run(['--setup'], { TEST_OS: 'Linux' })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('macOS only') })
    await expect(f.events()).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
