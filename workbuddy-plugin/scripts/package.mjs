import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmod, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { zipSync, unzipSync } from 'fflate'

const root = fileURLToPath(new URL('..', import.meta.url))
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const destination = join(root, 'dist')
await mkdir(destination, { recursive: true })
const npmCli = process.env.npm_execpath
assert(npmCli, 'Run through npm run pack:release')
const [packed] = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], { cwd: root, encoding: 'utf8' }))
assert.equal(packed.filename, `opengui-mcp-${version}.tgz`)
const files = packed.files.map(file => file.path)
for (const expected of ['lib/workbench.js', 'lib/workbench-page.js', 'lib/coremate-client.js', 'lib/task-store.js', 'lib/report-export.js']) assert(files.includes(expected), `Missing current runtime feature: ${expected}`)
for (const expected of ['scripts/install-local.mjs', 'lib/mcp.js', 'lib/broker-main.js', 'lib/host-hook.js', 'lib/automation.js', 'lib/installation.js', 'lib/opengui-SKILL.md', 'lib/opengui-installation.html', 'lib/opengui-authorization.html', 'assets/platform-tools/darwin/adb', 'assets/platform-tools/linux-x64/adb', 'assets/platform-tools/win32-x64/adb.exe', 'LICENSE', 'NOTICE.md']) assert(files.includes(expected), expected)
for (const expected of ['lib/pdf-report.js', 'assets/fonts/NotoSansSC-Regular.otf', 'assets/fonts/NotoEmoji.ttf', 'third-party/noto-sans-sc/LICENSE', 'third-party/noto-emoji/LICENSE']) assert(files.includes(expected), expected)
for (const expected of ['lib/ios-driver.js', 'lib/ios-simulator.js', 'lib/phone-host.js', 'third-party/axe/LICENSE', 'third-party/axe/THIRD_PARTY_LICENSES', 'third-party/axe/README.md']) assert(files.includes(expected), expected)
assert(files.includes('lib/connection-diagnostics.js'), 'Missing native connection diagnosis')
assert(!files.some(path => /confirmation|__pycache__|\.pyc$|\.DS_Store$/.test(path)), 'Obsolete approval code or build noise in package')
assert(!files.some(path => /(^|\/)(src|tests|node_modules|\.env|connector)(\/|$)|codex|dsh/i.test(path)), 'Unexpected package contents')
for (const path of ['lib/mcp.js', 'assets/platform-tools/darwin/adb', 'assets/platform-tools/linux-x64/adb']) {
  assert((packed.files.find(file => file.path === path).mode & 0o111) !== 0, `Missing executable mode: ${path}`)
}
const entries = {}
async function collect(relative = '') {
  for (const entry of await readdir(join(root, 'connector', relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) await collect(path)
    else entries[`opengui/${path}`] = [await readFile(join(root, 'connector', path)), { mtime: new Date('1980-01-01T00:00:00Z') }]
  }
}
await collect()
assert((await readFile(join(root, 'connector/skills/control/installation.html'))).equals(await readFile(join(root, 'resources/OpenGUI-安装指南.html'))), 'Rebuild the guide before packaging the connector')
const connector = `opengui-workbuddy-connector-${version}.zip`
await writeFile(join(destination, connector), zipSync(entries, { level: 9 }))
const installer = `opengui-workbuddy-${version}-install.command`
await copyFile(join(root, 'scripts/install-macos.command'), join(destination, installer))
await copyFile(join(root, 'scripts/install-macos.command'), join(destination, 'installer.sh'))
await copyFile(join(root, 'scripts/installer-handoff.command'), join(destination, 'OpenGUI-Install.command'))
await chmod(join(destination, 'OpenGUI-Install.command'), 0o755)
const guide = await readFile(join(root, 'resources/OpenGUI-安装指南.html'), 'utf8')
const embeddedArchive = guide.match(/id="download-installer"[^>]*href="data:application\/zip;base64,([^"]+)"/)
assert(embeddedArchive, 'Build the static installation guide before packaging')
const guideFiles = unzipSync(Buffer.from(embeddedArchive[1], 'base64'))
for (const [name, source] of [['OpenGUI-安装.command', 'scripts/installer-handoff.command'], ['installer.sh', 'scripts/install-macos.command']]) {
  assert(Buffer.from(guideFiles[`OpenGUI-WorkBuddy-Installer/${name}`] ?? []).equals(await readFile(join(root, source))), 'Stale guide download: run python3 scripts/build-installer-handoff.py')
}
await copyFile(join(root, 'resources/OpenGUI-安装指南.html'), join(destination, 'OpenGUI-Installation.html'))
await copyFile(join(root, 'resources/OpenGUI-授权指南.html'), join(destination, 'OpenGUI-Authorization.html'))
await copyFile(join(root, 'install.sh'), join(destination, 'install.sh'))
for (const name of [packed.filename, connector, installer, 'installer.sh', 'OpenGUI-Install.command', 'OpenGUI-Installation.html', 'OpenGUI-Authorization.html', 'install.sh']) {
  const hash = createHash('sha256').update(await readFile(join(destination, name))).digest('hex')
  await writeFile(join(destination, `${name}.sha256`), `${hash}  ${name}\n`)
  console.log(`${name}  ${hash}`)
}
