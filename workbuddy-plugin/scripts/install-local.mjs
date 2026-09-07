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
const packagesRoot = await realpath(join(root, 'opengui', 'packages'))
assert(!relative(packagesRoot, packageDir).startsWith('..') && relative(packagesRoot, packageDir), 'Install from an immutable WorkBuddy version directory')
const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
assert.equal(pkg.name, 'opengui-mcp')
assert.equal(pkg.version, '0.2.0')
assert.match(execFileSync(node, ['--version'], { encoding: 'utf8' }).trim(), /^v(?:22\.(?:19|2\d|[3-9]\d)|2[4-9]\.|[3-9]\d\.)/)
const quote = value => process.platform === 'win32' ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", `'"'"'`)}'`
const command = `${quote(node)} ${quote(join(packageDir, 'lib', 'host-hook.js'))}`
assert((await lstat(join(packageDir, 'lib', 'host-hook.js'))).isFile())
const installState = join(root, 'opengui', 'local-install.json')
await assertOwnedPath(installState)
const optional = async path => { try { return await readFile(path, 'utf8') } catch (error) { if (error.code === 'ENOENT') return undefined; throw error } }
const previous = JSON.parse(await optional(installState) ?? '{}')
const targets = [join(root, 'mcp.json'), join(root, 'settings.json'), join(root, 'skills', 'opengui', 'SKILL.md')]
const original = await Promise.all(targets.map(optional))
for (const path of targets) await assertOwnedPath(path)
const values = [
  JSON.stringify(mergeMcpConfig(JSON.parse(original[0] ?? '{}'), node, join(packageDir, 'lib', 'mcp.js')), null, 2) + '\n',
  JSON.stringify(mergeHostHooks(JSON.parse(original[1] ?? '{}'), command, previous.hookCommands ?? []), null, 2) + '\n',
  await readFile(join(packageDir, 'lib', 'opengui-SKILL.md'), 'utf8'),
]
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
// A live client must be stopped by the caller; never overwrite concurrent edits.
if (await optional(installState)) await copyFile(installState, `${installState}.before-${stamp}`)
await assertOwnedPath(installState)
const journal = `${installState}.pending-${stamp}`
const state = { version: pkg.version, packageDir, hookCommands: [command], backups, installedAt: new Date().toISOString() }
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
  await assertOwnedPath(installState)
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
console.log(JSON.stringify({ version: pkg.version, packageDir, backups, recoveryJournal: journal, hookEvents: HOST_HOOK_EVENTS }, null, 2))
