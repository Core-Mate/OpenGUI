import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-install-test-')))
try {
  const root = join(temporary, 'workbuddy')
  const pkg = join(root, 'opengui', 'packages', 'test', 'node_modules', 'opengui-mcp')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'opengui-mcp', version: '0.2.0' }))
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
