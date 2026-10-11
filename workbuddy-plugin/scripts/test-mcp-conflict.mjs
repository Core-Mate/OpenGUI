import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-conflict-')))
const script = fileURLToPath(new URL('./install-local.mjs', import.meta.url))
const hash = value => createHash('sha256').update(value).digest('hex')
try {
  const root = join(temporary, "host with spaces and 'quote")
  const state = join(root, 'opengui')
  const pkg = join(state, 'packages/new/node_modules/opengui-mcp')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'opengui-mcp', version: '0.4.0' }))
  await writeFile(join(pkg, 'lib/host-hook.js'), '// Fixture only\n')
  await writeFile(join(pkg, 'lib/opengui-SKILL.md'), 'fixture skill\n')
  const receiptPath = join(state, `local-install-${hash(root).slice(0, 16)}.json`)
  const http = { type: 'http', timeout: 120000, disabled: false, url: 'http://127.0.0.1:61785/mcp', headers: { Authorization: 'Bearer fixture-only' } }
  const receipt = { configRoot: root, packageDir: join(state, 'packages/old/node_modules/opengui-mcp'), transport: 'http', nativeServerSha256: hash(JSON.stringify(http)), hookCommands: [] }
  const args = [script, '--config-root', root, '--state-root', state, '--package-dir', pkg]
  const seed = async (server, previous = receipt) => {
    await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'retained' }, opengui: server } }))
    await writeFile(join(root, 'settings.json'), '{"user":"retained"}\n')
    await mkdir(join(root, 'skills/opengui'), { recursive: true })
    await writeFile(join(root, 'skills/opengui/SKILL.md'), 'old skill\n')
    await writeFile(receiptPath, JSON.stringify(previous))
  }
  await seed(http)
  const installed = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' }))
  const migrated = JSON.parse(await readFile(join(root, 'mcp.json'), 'utf8'))
  assert.equal(installed.status, 'CONFIG_WRITTEN')
  assert.equal(migrated.mcpServers.opengui.type, 'stdio')
  assert.deepEqual(migrated.mcpServers.opengui.args, [join(pkg, 'lib/mcp.js')])
  assert.equal(migrated.mcpServers.opengui.url, undefined)
  assert.equal(migrated.mcpServers.opengui.headers, undefined)
  assert.equal(migrated.mcpServers.other.command, 'retained')
  assert.equal(JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' })).status, 'ALREADY_CONFIGURED')
  await seed({ type: 'stdio', command: process.execPath, args: [join(receipt.packageDir, 'lib/mcp.js')] }, { ...receipt, transport: 'stdio' })
  execFileSync(process.execPath, args, { stdio: 'pipe' })
  for (const [server, previous] of [
    [{ command: 'third-party', args: [] }, {}],
    [http, {}],
    [{ ...http, url: 'http://127.0.0.1:61786/mcp' }, receipt],
    [{ ...http, headers: { Authorization: 'Bearer user-edit' } }, receipt],
    [http, { ...receipt, configRoot: join(temporary, 'other-host') }],
    [http, { ...receipt, nativeServerSha256: undefined }],
  ]) {
    await seed(server, previous)
    const paths = [join(root, 'mcp.json'), join(root, 'settings.json'), join(root, 'skills/opengui/SKILL.md'), receiptPath]
    const before = await Promise.all(paths.map(path => readFile(path, 'utf8')))
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /MCP_CONFLICT/)
    assert.match(result.stderr, /cp /)
    assert.match(result.stderr, /EDITOR/)
    assert.match(result.stderr, /rename.*opengui/s)
    assert.deepEqual(await Promise.all(paths.map(path => readFile(path, 'utf8'))), before)
  }
  console.log('PASS: HTTP receipt migration, stdio upgrade, reinstall, and six preserved actionable conflicts')
} finally { await rm(temporary, { recursive: true, force: true }) }
