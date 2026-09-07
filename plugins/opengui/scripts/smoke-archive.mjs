import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

// This smoke never requests a device, starts ADB, or installs into a Codex profile.
const [pluginArchive, nodeArchive] = process.argv.slice(2).map(value => resolve(value))
assert.ok(pluginArchive && nodeArchive, 'Usage: node scripts/smoke-archive.mjs <plugin.tar.gz> <node-darwin.tar.gz>')
assert.equal(process.platform, 'darwin', 'Run this smoke on macOS')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const hashes = {
  arm64: '61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6',
  x64: '58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026',
}
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')
assert.equal(await hash(nodeArchive), hashes[arch], 'Node archive checksum mismatch')
assert.equal(await hash(pluginArchive), (await readFile(pluginArchive + '.sha256', 'utf8')).split(/\s/)[0])
const temp = await mkdtemp(join(tmpdir(), 'opengui-installed-smoke-'))
try {
  const entries = execFileSync('tar', ['-tzf', pluginArchive], { encoding: 'utf8' }).trim().split('\n')
  assert.ok(entries.every(entry => entry.startsWith('opengui/') && !entry.split('/').includes('..')))
  assert.ok(entries.every(entry => !/(node_modules|__pycache__|\.pyc$|\.DS_Store|\.log$|\.mcp\.json)/.test(entry)))
  execFileSync('tar', ['-xzf', pluginArchive, '-C', temp])
  execFileSync('tar', ['-xzf', nodeArchive, '-C', temp])
  const root = join(temp, 'opengui')
  const data = join(temp, 'private-state')
  const runtime = join(data, 'runtime', 'node-v22.23.2-darwin-' + arch)
  await mkdir(dirname(runtime), { recursive: true, mode: 0o700 })
  await cp(join(temp, 'node-v22.23.2-darwin-' + arch), runtime, { recursive: true })
  await writeFile(join(runtime, '.verified'), hashes[arch] + '\n' + await hash(join(runtime, 'bin/node')) + '\n', { mode: 0o600 })
  const env = { ...process.env, OPENGUI_CODEX_DATA_DIR: data }
  const run = (...args) => execFileSync('/bin/sh', [join(root, 'scripts/opengui'), ...args], { env, encoding: 'utf8', timeout: 30_000 })
  const version = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8')).version
  assert.equal(run('--version').trim(), version)
  assert.ok(run('--help').includes('OpenGUI for Codex'))
  const interfaces = JSON.parse(run('--interfaces'))
  assert.equal(JSON.parse(execFileSync(join(runtime, 'bin/node'), [join(root, 'lib/cli.js'), '--help'], { encoding: 'utf8' })).version, version)
  assert.equal(interfaces.interfaces.length, 8)
  assert.ok((await stat(join(root, 'assets/platform-tools/darwin/adb'))).mode & 0o111)
  assert.ok((await stat(join(root, 'scripts/opengui'))).mode & 0o111)
  assert.deepEqual(await readdir(data), ['runtime'], 'Read-only interface discovery must not create daemon state')
  console.log('Verified archive -> private pinned Node -> packaged launcher -> 8 interfaces; no ADB or profile mutation.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
