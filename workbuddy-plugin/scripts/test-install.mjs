import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-install-test-')))
try {
  const root = join(temporary, 'workbuddy')
  const pkg = join(root, 'opengui', 'packages', 'test', 'node_modules', 'opengui-mcp')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'opengui-mcp', version: '0.4.0' }))
  await writeFile(join(pkg, 'lib', 'host-hook.js'), '// Synthetic installer target; never executed.\n')
  await writeFile(join(pkg, 'lib', 'opengui-SKILL.md'), 'name: opengui\n')
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'untouched' } } }))
  await writeFile(join(root, 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other-hook' }] }] }, setting: 'retained' }))
  const script = fileURLToPath(new URL('./install-local.mjs', import.meta.url))
  const run = () => JSON.parse(execFileSync(process.execPath, [script, '--config-root', root, '--package-dir', pkg], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const first = run()
  assert.equal(first.hookEvents.length, 7)
  assert.equal(JSON.parse(await readFile(join(root, 'mcp.json'))).mcpServers.other.command, 'untouched')
  const before = await readFile(join(root, 'settings.json'), 'utf8')
  run()
  assert.equal(await readFile(join(root, 'settings.json'), 'utf8'), before, 'Hook merge must be idempotent')
  assert.equal(JSON.parse(await readFile(first.backups[0].backup)).mcpServers.other.command, 'untouched')
  // Simulate the 0.2.0 receipt format at its legacy location.
  const legacyReceipt = JSON.parse(await readFile(first.installState, 'utf8'))
  delete legacyReceipt.configRoot
  await writeFile(join(root, 'opengui/local-install.json'), JSON.stringify(legacyReceipt))
  const alternate = join(temporary, 'workbuddy-ai')
  await mkdir(alternate)
  const migrated = JSON.parse(execFileSync(process.execPath, [script, '--repair-legacy', '--config-root', alternate, '--state-root', join(root, 'opengui'), '--package-dir', pkg], {encoding: 'utf8'}))
  assert.equal(migrated.configRoot, alternate)
  assert.equal(JSON.parse(await readFile(join(alternate, 'mcp.json'))).mcpServers.opengui.command, process.execPath)
  assert.equal(JSON.parse(await readFile(join(root, 'mcp.json'))).mcpServers.other.command, 'untouched')
  assert.equal(JSON.parse(await readFile(join(root, 'mcp.json'))).mcpServers.opengui, undefined)
  assert(migrated.migration.some(entry => entry.status === 'restored'))
  const repeated = JSON.parse(execFileSync(process.execPath, [script, '--config-root', alternate, '--state-root', join(root, 'opengui'), '--package-dir', pkg], {encoding: 'utf8'}))
  assert.equal(repeated.status, 'ALREADY_CONFIGURED')
  const secondInstance = join(temporary, 'workbuddy-ai-2')
  await mkdir(secondInstance)
  const firstInstanceConfig = await readFile(join(alternate, 'mcp.json'), 'utf8')
  // An explicit receipt is a legitimate separate instance, not a legacy mistake.
  await writeFile(join(root, 'opengui/local-install.json'), JSON.stringify({...legacyReceipt, configRoot: alternate}))
  execFileSync(process.execPath, [script, '--config-root', secondInstance, '--state-root', join(root, 'opengui'), '--package-dir', pkg])
  assert.equal(await readFile(join(alternate, 'mcp.json'), 'utf8'), firstInstanceConfig)
  assert.notEqual(repeated.installState, first.installState)
  // Restore the original root for the independent redirection regression below.
  run()
  const conflictRoot = join(temporary, 'conflicting-host')
  await mkdir(conflictRoot)
  const conflict = JSON.stringify({mcpServers:{opengui:{command:'another-provider',args:[]}}})
  await writeFile(join(conflictRoot, 'mcp.json'), conflict)
  assert.throws(() => execFileSync(process.execPath, [script, '--config-root', conflictRoot, '--state-root', join(root, 'opengui'), '--package-dir', pkg], {stdio:'pipe'}), /MCP_CONFLICT/)
  assert.equal(await readFile(join(conflictRoot, 'mcp.json'), 'utf8'), conflict)
  const foreign = join(temporary, 'foreign-host')
  await mkdir(foreign)
  await writeFile(join(foreign, 'SKILL.md'), 'DO NOT CHANGE')
  await rm(join(root, 'skills', 'opengui'), { recursive: true })
  await symlink(foreign, join(root, 'skills', 'opengui'), 'dir')
  assert.throws(run, /symlink/)
  assert.equal(await readFile(join(foreign, 'SKILL.md'), 'utf8'), 'DO NOT CHANGE')
  console.log('PASS: installer preserves other settings, backs up originals, is idempotent, and rejects parent symlink redirection.')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
