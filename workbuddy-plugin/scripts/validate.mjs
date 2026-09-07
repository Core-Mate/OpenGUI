import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { OPENGUI_WORKBUDDY_TOOLS } from '../lib/tools.js'
import { VERSION } from '../lib/state.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'))
const pkg = await json('package.json')
const meta = await json('connector/connector-meta.json')
const config = await json('connector/mcp.json')
assert.equal(pkg.name, 'opengui-mcp')
assert.equal(pkg.version, VERSION)
assert.equal(meta.version, VERSION)
assert.equal(meta.type, 'mcp')
assert.equal(meta.source, 'opengui')
assert.equal(meta.minWorkbuddyVersion, '5.5.3')
assert.equal(pkg.peerDependencies, undefined)
assert.equal(meta.auth_mode, undefined)
assert.deepEqual(Object.keys(config.mcpServers), ['opengui'])
assert(config.mcpServers.opengui.args.includes(`--package=https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v${VERSION}/opengui-mcp-${VERSION}.tgz`))
assert.equal(config.mcpServers.opengui.command, 'npx')
assert.equal(config.mcpServers.opengui.runtime.type, 'node')
assert.equal(OPENGUI_WORKBUDDY_TOOLS.length, 11)
assert.equal(new Set(OPENGUI_WORKBUDDY_TOOLS.map(tool => tool.name)).size, 11)
for (const path of ['lib/host-hook.js', 'lib/automation.js', 'lib/opengui-SKILL.md']) assert((await stat(join(root, path))).size > 0)
if (process.platform === 'darwin') for (const arch of ['arm64', 'x64']) for (const helper of ['window-helper', 'mirror-launcher']) assert((await stat(join(root, `lib/native/${helper}-${arch}`))).mode & 0o111)
assert((await readFile(join(root, 'lib/mcp.js'), 'utf8')).startsWith('#!/usr/bin/env node'))
if (process.platform !== 'win32') assert(((await stat(join(root, 'lib/mcp.js'))).mode & 0o111) !== 0)
const skill = await readFile(join(root, 'connector/skills/control/SKILL.md'), 'utf8')
for (const key of ['description', 'description_zh', 'description_en', 'author', 'version']) assert(new RegExp(`^${key}: .+`, 'm').test(skill))
assert(skill.includes(`version: ${VERSION}`))
for (const tool of OPENGUI_WORKBUDDY_TOOLS) assert(skill.includes(tool.name))

const hashes = {
  'darwin/adb': '1811e253b21b12cbfda7201ebaf86c10e7ddcb5c606a7a81f7c82b4c429c2d3b',
  'linux-x64/adb': 'a902be8f45c6c62e76c9efaf6947a0fa747c9cabd89a2ac8e0d16ecb30b3ed01',
  'win32-x64/adb.exe': '957e46b8615f7af5b7292a2ddabe98d2e61940c3fb2b0545756507f080613e71',
  'win32-x64/AdbWinApi.dll': '120bef587119c6cb926b86b9be90fdfbce38937588eae28cd91a94ce63c7b965',
  'win32-x64/AdbWinUsbApi.dll': '6ca69a2ca0e31309c087d288f058977d421ad03500e4c3e1dbd981241a069c60',
}
for (const [path, hash] of Object.entries(hashes)) {
  const data = await readFile(join(root, 'assets/platform-tools', path))
  assert.equal(createHash('sha256').update(data).digest('hex'), hash, path)
}
for (const platform of ['darwin', 'linux-x64', 'win32-x64']) assert((await stat(join(root, 'assets/platform-tools', platform, 'NOTICE.txt'))).size > 0)

async function sources(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const absolute = join(path, entry.name)
    if (entry.isDirectory()) await sources(absolute)
    else if (entry.name.endsWith('.ts')) {
      const text = await readFile(absolute, 'utf8')
      assert(!/@deepseek|deepseek-harness-plugin|\.codex|DSH_HOME|OPENGUI_CODEX_HOME/.test(text), `Production dependency in ${entry.name}`)
      assert(!/from ['"]\.\.\//.test(text), `Import escapes independent source tree: ${entry.name}`)
    }
  }
}
await sources(join(root, 'src'))
if (process.argv.includes('--release')) {
  const readiness = await json('release-readiness.json')
  assert.equal(readiness.version, VERSION)
  for (const name of ['workbuddyImageToolFlow', 'realDeviceActionsIncludingUnicode', 'twoPhysicalDevicesAndConflict', 'workbuddyAutonomousContinuationAndStop', 'workbuddyStopRestartCleanup', 'supportedDesktopPackagedStartup']) {
    const check = readiness.checks[name]
    assert(check?.verified === true && typeof check.evidence === 'string' && check.evidence.trim().length > 0, `Unverified release gate: ${name}`)
  }
}
console.log('WorkBuddy manifest, eleven-tool contract, production isolation, native helpers, and bundled ADB hashes verified.')
