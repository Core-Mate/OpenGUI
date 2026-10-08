import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { OPENGUI_WORKBUDDY_TOOLS } from '../lib/tools.js'
import { VERSION } from '../lib/state.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'))
if (process.platform !== 'win32') execFileSync('bash', ['-n', join(root, 'scripts/install-macos.command')])
const pkg = await json('package.json')
const installer = await readFile(join(root, 'scripts/install-macos.command'), 'utf8')
assert(installer.split(/\r?\n/).includes('VERSION=' + pkg.version), 'Release installer version mismatch')
const launcher = await readFile(join(root, 'scripts/installer-handoff.command'), 'utf8')
assert.equal(launcher.match(/expected_sha='([a-f0-9]{64})'/)?.[1], createHash('sha256').update(installer).digest('hex'), 'Interactive launcher must pin this release installer')
assert(launcher.includes(`插件 ${pkg.version}`), 'Interactive launcher must display this plugin version')
for (const expected of ['lib/workbench.js', 'lib/workbench-page.js', 'lib/coremate-client.js', 'lib/task-store.js', 'lib/report-export.js']) assert((await stat(join(root, expected))).size > 0, `Missing current runtime feature: ${expected}`)
assert(installer.includes('CONFIG_WRITTEN'), 'Installer must report configuration writing separately from host loading')
assert(!installer.includes('LIVE_CONFIG_WRITTEN'), 'A version number does not establish live MCP reload support')
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
assert(OPENGUI_WORKBUDDY_TOOLS.some(tool => tool.name === 'opengui_history'))
assert.equal(new Set(OPENGUI_WORKBUDDY_TOOLS.map(tool => tool.name)).size, OPENGUI_WORKBUDDY_TOOLS.length)
for (const path of ['lib/host-hook.js', 'lib/automation.js', 'lib/opengui-SKILL.md', 'lib/opengui-installation.html']) assert((await stat(join(root, path))).size > 0)
if (process.platform === 'darwin') for (const arch of ['arm64', 'x64']) for (const helper of ['window-helper', 'mirror-launcher']) assert((await stat(join(root, `lib/native/${helper}-${arch}`))).mode & 0o111)
assert((await readFile(join(root, 'lib/mcp.js'), 'utf8')).startsWith('#!/usr/bin/env node'))
// Released packages must sign in without user configuration.
assert(/^https:\/\/[^/?#@\s]+$/u.test(JSON.parse(await readFile(join(root, 'lib/service-config.json'), 'utf8')).accountServiceUrl), 'Release must bundle an HTTPS account service')
if (process.platform !== 'win32') assert(((await stat(join(root, 'lib/mcp.js'))).mode & 0o111) !== 0)
const skill = await readFile(join(root, 'connector/skills/control/SKILL.md'), 'utf8')
for (const key of ['description', 'description_zh', 'description_en', 'author', 'version']) assert(new RegExp(`^${key}: .+`, 'm').test(skill))
assert(skill.includes(`version: ${VERSION}`))
const reference = await readFile(join(root, 'connector/skills/control/references.md'), 'utf8')
assert.equal(await readFile(join(root, 'lib/opengui-SKILL.md'), 'utf8'), skill, 'Build must include the current Skill')
assert.equal(await readFile(join(root, 'lib/opengui-reference.md'), 'utf8'), reference, 'Build must include current references')
for (const path of ['lib/opengui-installation.html', 'connector/skills/control/installation.html']) assert((await readFile(join(root, path))).equals(await readFile(join(root, 'resources/OpenGUI-安装指南.html'))), `Stale installation guide: ${path}`)
for (const tool of OPENGUI_WORKBUDDY_TOOLS) assert((skill + reference).includes(tool.name))

const hashes = {
  '../fonts/NotoSansSC-Regular.otf': 'faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9',
  '../fonts/NotoEmoji.ttf': 'de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551',
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
for (const font of ['noto-sans-sc', 'noto-emoji']) assert((await readFile(join(root, 'third-party', font, 'LICENSE'), 'utf8')).includes('SIL OPEN FONT LICENSE'))

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
console.log('WorkBuddy manifest, tool contract, production isolation, native helpers, and bundled ADB hashes verified.')

// The curl entry must verify both inputs before executing the installer.
const bootstrap = await readFile(join(root, 'install.sh'), 'utf8')
for (const [field, path] of [['installer_sha', 'scripts/install-macos.command'], ['guide_sha', 'resources/OpenGUI-授权指南.html']]) {
  assert.equal(bootstrap.match(new RegExp(`local ${field}='([a-f0-9]{64})'`))?.[1], createHash('sha256').update(await readFile(join(root, path))).digest('hex'), `Stale bootstrap pin: ${field}`)
}
for (const path of ['lib/opengui-authorization.html', 'connector/skills/control/authorization.html']) assert((await readFile(join(root, path))).equals(await readFile(join(root, 'resources/OpenGUI-授权指南.html'))), `Stale authorization guide: ${path}`)
if (process.platform !== 'win32') execFileSync('bash', ['-n', join(root, 'install.sh')])
