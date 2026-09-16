import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Supply a retained, previously verified package; never download an arbitrary old version.
const oldSource = process.argv[2]
assert(oldSource, 'Usage: node scripts/test-rollback.mjs /verified/old/opengui-mcp')
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-rollback-')))
try {
  const config = join(temporary, '.workbuddy'), state = join(config, 'opengui')
  const oldPackage = join(state, 'packages/old'), candidate = join(state, 'packages/candidate')
  await mkdir(config, { recursive: true })
  await cp(oldSource, oldPackage, { recursive: true })
  await mkdir(candidate, { recursive: true })
  for (const entry of ['package.json', 'lib', 'scripts', 'connector']) {
    await cp(resolve(entry), join(candidate, entry), { recursive: true })
  }
  await writeFile(join(config, 'mcp.json'), JSON.stringify({ mcpServers: { foreign: { command: 'preserved' } } }))
  await writeFile(join(config, 'settings.json'), JSON.stringify({ custom: 'preserved' }))
  const oldVersion = JSON.parse(await readFile(join(oldPackage, 'package.json'))).version
  const versions = []
  for (const target of [oldPackage, candidate, oldPackage, candidate]) {
    execFileSync(process.execPath, [join(target, 'scripts/install-local.mjs'), '--config-root', config, '--state-root', state, '--package-dir', target, '--node', process.execPath], { stdio: 'pipe' })
    const receipt = JSON.parse(await readFile(join(state, `local-install-${createHash('sha256').update(config).digest('hex').slice(0,16)}.json`)))
    versions.push(receipt.version)
    const mcp = JSON.parse(await readFile(join(config, 'mcp.json')))
    assert.equal(mcp.mcpServers.foreign.command, 'preserved')
    assert.equal(mcp.mcpServers.opengui.args[0], join(target, 'lib/mcp.js'))
    const settings = JSON.parse(await readFile(join(config, 'settings.json')))
    assert.equal(settings.custom, 'preserved')
    assert.equal(settings.hooks.PreToolUse.length, 1)
    assert.equal(settings.hooks.FinalStop.length, 1)
    assert(receipt.backups.length > 0)
  }
  assert.deepEqual(versions, [oldVersion, '0.3.1', oldVersion, '0.3.1'])
  console.log(JSON.stringify({ result: 'PASS', versions, scope: 'isolated configuration rollback using retained packages; no host runtime acceptance' }))
} finally { await rm(temporary, { recursive: true, force: true }) }
