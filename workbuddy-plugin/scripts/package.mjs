import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { zipSync } from 'fflate'

const root = fileURLToPath(new URL('..', import.meta.url))
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const destination = join(root, 'dist')
await mkdir(destination, { recursive: true })
const npmCli = process.env.npm_execpath
assert(npmCli, 'Run through npm run pack:release')
const [packed] = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], { cwd: root, encoding: 'utf8' }))
assert.equal(packed.filename, `opengui-mcp-${version}.tgz`)
const files = packed.files.map(file => file.path)
for (const expected of ['lib/mcp.js', 'lib/broker-main.js', 'lib/host-hook.js', 'lib/automation.js', 'lib/installation.js', 'lib/opengui-SKILL.md', 'assets/platform-tools/darwin/adb', 'assets/platform-tools/linux-x64/adb', 'assets/platform-tools/win32-x64/adb.exe', 'LICENSE', 'NOTICE.md']) assert(files.includes(expected), expected)
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
const connector = `opengui-workbuddy-connector-${version}.zip`
await writeFile(join(destination, connector), zipSync(entries, { level: 9 }))
for (const name of [packed.filename, connector]) {
  const hash = createHash('sha256').update(await readFile(join(destination, name))).digest('hex')
  await writeFile(join(destination, `${name}.sha256`), `${hash}  ${name}\n`)
  console.log(`${name}  ${hash}`)
}
