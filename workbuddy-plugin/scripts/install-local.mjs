import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFile, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { HOST_HOOK_EVENTS, mergeHostHooks, mergeMcpConfig } from '../lib/installation.js'

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
const root = resolve(option('--config-root') ?? join(homedir(), '.workbuddy'))
assert.equal(await realpath(root), root, 'Refuse redirected WorkBuddy configuration root')
async function assertOwnedPath(path) {
  assert(path === root || (!relative(root, path).startsWith('..') && !relative(root, path).startsWith('/')), 'Path must belong to WorkBuddy')
  for (let cursor = path; cursor !== root; cursor = dirname(cursor)) {
    try { assert(!(await lstat(cursor)).isSymbolicLink(), `Refuse symlink configuration: ${cursor}`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
await assertOwnedPath(join(root, 'opengui', 'packages'))
const packageDir = await realpath(resolve(option('--package-dir') ?? ''))
const node = await realpath(resolve(option('--node') ?? process.execPath))
const stateRoot = resolve(option('--state-root') ?? join(root, 'opengui'))
assert.equal(await realpath(stateRoot), stateRoot, 'Refuse redirected state root')
const packagesRoot = await realpath(join(stateRoot, 'packages'))
assert(!relative(packagesRoot, packageDir).startsWith('..') && relative(packagesRoot, packageDir), 'Install from an immutable WorkBuddy version directory')
const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
assert.equal(pkg.name, 'opengui-mcp')
assert.equal(pkg.version, '0.4.0')
assert.match(execFileSync(node, ['--version'], { encoding: 'utf8' }).trim(), /^v(?:22\.(?:19|2\d|[3-9]\d)|2[4-9]\.|[3-9]\d\.)/)
const quote = value => process.platform === 'win32' ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", `'"'"'`)}'`
const command = `${quote(node)} ${quote(join(packageDir, 'lib', 'host-hook.js'))}`
assert((await lstat(join(packageDir, 'lib', 'host-hook.js'))).isFile())
async function assertStatePath() {
  assert.equal(await realpath(stateRoot), stateRoot, 'Refuse redirected state root')
  try { assert(!(await lstat(installState)).isSymbolicLink(), 'Refuse redirected installation journal') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const receiptKey = createHash('sha256').update(root).digest('hex').slice(0, 16)
const installState = join(stateRoot, `local-install-${receiptKey}.json`)
await assertStatePath()
const optional = async path => { try { return await readFile(path, 'utf8') } catch (error) { if (error.code === 'ENOENT') return undefined; throw error } }
const ownReceipt = await optional(installState)
const legacy = ownReceipt ? {} : JSON.parse(await optional(join(stateRoot, 'local-install.json')) ?? '{}')
const previous = ownReceipt ? JSON.parse(ownReceipt) : (!legacy.configRoot || legacy.configRoot === root ? legacy : {})
const legacyMigration = !ownReceipt && !legacy.configRoot && Boolean(legacy.packageDir)
const targets = [join(root, 'mcp.json'), join(root, 'settings.json'), join(root, 'skills', 'opengui', 'SKILL.md')]
const original = await Promise.all(targets.map(optional))
for (const path of targets) await assertOwnedPath(path)
const existingMcp = JSON.parse(original[0] ?? '{}').mcpServers?.opengui
if (existingMcp) {
  const knownEntrypoints = [packageDir, previous.packageDir].filter(Boolean).map(path => join(path, 'lib', 'mcp.js'))
  assert(Array.isArray(existingMcp.args) && existingMcp.args.length === 1 && knownEntrypoints.includes(existingMcp.args[0]),
    'MCP_CONFLICT: an unrecognized opengui server already exists; preserve it and resolve the conflict explicitly')
}
const values = [
  JSON.stringify(mergeMcpConfig(JSON.parse(original[0] ?? '{}'), node, join(packageDir, 'lib', 'mcp.js')), null, 2) + '\n',
  JSON.stringify(mergeHostHooks(JSON.parse(original[1] ?? '{}'), command, previous.hookCommands ?? []), null, 2) + '\n',
  (await readFile(join(packageDir, 'lib', 'opengui-SKILL.md'), 'utf8')).replaceAll('(references.md)', `(${join(packageDir, 'lib', 'opengui-reference.md')})`),
]
if (original.every((value, i) => value === values[i]) && previous.packageDir === packageDir && previous.configRoot === root) {
  console.log(JSON.stringify({ status: 'ALREADY_CONFIGURED', version: pkg.version, installState, configRoot: root, hostLoaded: 'unverified' }))
  process.exit(0)
}
const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
const backups = []
for (let i = 0; i < targets.length; i++) {
  await assertOwnedPath(targets[i])
  assert.equal(await optional(targets[i]), original[i], `Configuration changed during installation: ${targets[i]}`)
  const path = targets[i]
  assert.equal(await optional(path), original[i], `Configuration changed during installation: ${path}`)
  await mkdir(dirname(path), { recursive: true })
  const backup = `${path}.before-opengui-${pkg.version}-${stamp}`
  if (original[i] !== undefined) await copyFile(path, backup)
  backups.push({ path, backup: original[i] === undefined ? null : backup, installedSha256: createHash('sha256').update(values[i]).digest('hex') })
}
// Prepare all bytes and the recovery journal before switching any entry.
// WorkBuddy can watch these files live. Preserve the compare-before-rename checks
// so a simultaneous host or user edit wins instead of being overwritten.
if (await optional(installState)) await copyFile(installState, `${installState}.before-${stamp}`)
await assertStatePath()
const journal = `${installState}.pending-${stamp}`
const state = { configRoot: root, version: pkg.version, packageDir, hookCommands: [command], backups, installedAt: new Date().toISOString() }
await writeFile(journal, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
const temporary = targets.map(path => `${path}.opengui-${stamp}.tmp`)
for (let i = 0; i < targets.length; i++) await writeFile(temporary[i], values[i], { mode: 0o600, flag: 'wx' })
const stateTemporary = `${installState}.${stamp}.tmp`
await writeFile(stateTemporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
const switched = []
try {
  for (let i = 0; i < targets.length; i++) {
    await assertOwnedPath(targets[i])
    assert.equal(await optional(targets[i]), original[i], `Configuration changed during installation: ${targets[i]}`)
    await rename(temporary[i], targets[i])
    switched.push(i)
  }
  await assertStatePath()
  await rename(stateTemporary, installState)
} catch (error) {
  const rollback = await Promise.allSettled(switched.map(async i => {
    await assertOwnedPath(targets[i])
    assert.equal(await optional(targets[i]), values[i], `Concurrent edit retained: ${targets[i]}`)
    if (original[i] === undefined) await unlink(targets[i])
    else {
      const rollbackPath = `${targets[i]}.rollback-${stamp}`
      await copyFile(backups[i].backup, rollbackPath)
      await rename(rollbackPath, targets[i])
    }
  }))
  console.error(JSON.stringify({ installationFailed: true, recoveryJournal: journal, rollbackComplete: rollback.every(result => result.status === 'fulfilled') }))
  throw error
}
// Restore only byte-identical files recorded by a previous installation in another
// host configuration root. Preserve any subsequent user edit for manual review.
const migration = []
const oldRoot = previous.configRoot ?? dirname(stateRoot)
if (args.includes('--repair-legacy') && legacyMigration && oldRoot !== root) {
  const allowed = ['mcp.json', 'settings.json', 'skills/opengui/SKILL.md'].map(path => join(oldRoot, path))
  for (const entry of previous.backups ?? []) {
    if (!allowed.includes(entry.path)) continue
    try {
      assert.equal(await realpath(dirname(entry.path)), dirname(entry.path), 'Redirected previous configuration directory')
      assert(!(await lstat(entry.path)).isSymbolicLink(), 'Redirected previous configuration')
      const current = await readFile(entry.path, 'utf8')
      assert.equal(createHash('sha256').update(current).digest('hex'), entry.installedSha256, 'Previous configuration has subsequent edits')
      if (entry.backup === null) await unlink(entry.path)
      else {
        assert(entry.backup.startsWith(`${entry.path}.before-opengui-`), 'Unexpected backup path')
        assert(!(await lstat(entry.backup)).isSymbolicLink(), 'Redirected backup')
        const restored = `${entry.path}.restore-${stamp}`
        await writeFile(restored, await readFile(entry.backup), {mode: 0o600, flag: 'wx'})
        assert.equal(await readFile(entry.path, 'utf8'), current, 'Concurrent edit retained')
        await rename(restored, entry.path)
      }
      migration.push({path: entry.path, status: 'restored'})
    } catch (error) {
      migration.push({path: entry.path, status: error.code === 'ENOENT' ? 'absent' : 'retained', reason: error.message})
    }
  }
}
console.log(JSON.stringify({ status: 'CONFIG_WRITTEN', installState, configRoot: root, hostLoaded: 'unverified', migration, previousConfigRoot: previous.configRoot ?? null, version: pkg.version, packageDir, backups, recoveryJournal: journal, hookEvents: HOST_HOOK_EVENTS }, null, 2))
