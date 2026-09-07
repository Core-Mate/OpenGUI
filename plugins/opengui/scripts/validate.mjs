import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { stagePlugin } from './stage.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'))
const pkg = await json('package.json')
const plugin = await json('.codex-plugin/plugin.json')
assert.equal(plugin.name, 'opengui')
assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
assert.equal(plugin.version, pkg.version)
assert.equal(plugin.skills, './skills/')
for (const key of ['mcpServers', 'apps', 'hooks']) assert.equal(key in plugin, false)
for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })) {
  assert.ok(!/deepseek|dsh-|sharp|puppeteer|pi-ai/.test(name), 'Unexpected dependency: ' + name)
}
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) assert.equal(pkg.scripts[hook], undefined)
const read = path => readFile(join(root, path), 'utf8')
const source = await read('src/state.ts')
assert.ok(source.includes("VERSION = '" + pkg.version + "'"), 'Runtime version differs')
assert.ok((await read('scripts/opengui')).includes("'" + pkg.version + "'"), 'Launcher version differs')
const binary = await readFile(join(root, 'assets/platform-tools/darwin/adb'))
assert.equal(createHash('sha256').update(binary).digest('hex'), (await read('assets/platform-tools/darwin/adb.sha256')).trim())
assert.ok((await stat(join(root, 'assets/platform-tools/darwin/adb'))).mode & 0o111)

async function walk(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    assert.equal((await lstat(path)).isSymbolicLink(), false, 'Symbolic links are not allowed in the upload')
    if (entry.isDirectory()) paths.push(...await walk(path))
    else paths.push(path)
  }
  return paths
}
for (const path of await walk(join(root, 'src'))) {
  const text = await readFile(path, 'utf8')
  assert.ok(!/from ['"][^'"]*(deepseek-harness|@deepseek|\.\.\/\.\.\/\.\.)/.test(text), 'Cross-package runtime import: ' + path)
  assert.ok(!/DSH_HOME|coremate-mobile-scrcpy|dev-auto-reload/.test(text), 'Production coupling: ' + path)
  // state.ts may name .dsh only to reject it as an unsafe override.
  if (path !== join(root, 'src/state.ts')) assert.ok(!/\.dsh\b/.test(text), 'Legacy runtime path: ' + path)
}
const temp = await mkdtemp(join(tmpdir(), 'opengui-stage-check-'))
try {
  const destination = await stagePlugin(join(temp, 'opengui'))
  const paths = await walk(destination)
  for (const path of paths) assert.ok(!/(node_modules|\.mcp\.json|cordis|dsh-compatibility|linux-x64|win32)/.test(path), 'Unexpected upload file: ' + path)
  const help = JSON.parse(execFileSync(process.execPath, [join(destination, 'lib/cli.js'), '--help'], { encoding: 'utf8' }))
  assert.equal(help.version, pkg.version)
  assert.equal(help.interfaces.length, 8)
  execFileSync('/bin/sh', ['-n', join(destination, 'scripts/opengui')])
  console.log('Standalone manifest, dependencies, runtime, launcher, ADB checksum and staged upload verified.')
} finally { await rm(temp, { recursive: true, force: true }) }
