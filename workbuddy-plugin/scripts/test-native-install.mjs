import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { nativeLaunchAgent } from '../lib/native-launch-agent.js'

assert.equal(process.platform, 'darwin')
const exec = promisify(execFile)
const root = await realpath(await mkdtemp(join(tmpdir(), 'opengui-native-install-')))
const state = join(root, 'opengui')
const directory = join(root, 'launch-agents')
const source = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const installer = join(source, 'scripts/install-local.mjs')
let target
try {
  await mkdir(join(state, 'packages'), { recursive: true }); await chmod(state, 0o700)
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'retain' } } }))
  await writeFile(join(root, 'settings.json'), JSON.stringify({ custom: true }))
  const fixture = async (name, broken = false) => {
    const pkg = join(state, 'packages', name, 'node_modules/opengui-mcp')
    await mkdir(join(pkg, 'lib'), { recursive: true })
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'opengui-mcp', version: '0.4.0' }))
    await writeFile(join(pkg, 'lib/host-hook.js'), '// Isolated installer fixture, not invoked\n')
    await writeFile(join(pkg, 'lib/opengui-SKILL.md'), 'name: opengui\n')
    await writeFile(join(pkg, 'lib/mcp.js'), broken ? 'process.exit(7)\n' : `import ${JSON.stringify(pathToFileURL(join(source, 'lib/mcp.js')).href)}\n`)
    return pkg
  }
  const first = await fixture('first')
  const spec = nativeLaunchAgent({ configRoot: root, stateRoot: state, node: process.execPath, packageDir: first })
  target = `gui/${process.getuid()}/${spec.label}`
  const run = async (pkg, transport = 'http') => JSON.parse((await exec(process.execPath, [installer, '--config-root', root, '--state-root', state,
    '--package-dir', pkg, '--transport', transport, '--native-service', '--launch-agents-dir', directory], { timeout: 40000 })).stdout)
  await run(first)
  const originalProcess = (await exec('/bin/launchctl', ['print', target])).stdout.match(/\bpid = (\d+)/)?.[1]
  await run(first)
  assert.equal((await exec('/bin/launchctl', ['print', target])).stdout.match(/\bpid = (\d+)/)?.[1], originalProcess, 'Repeated installation must retain the healthy service process')
  const endpoint = JSON.parse(await readFile(join(state, 'native-mcp.json')))
  const url = `http://127.0.0.1:${endpoint.port}/mcp`
  const ready = async () => {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url, { signal: AbortSignal.timeout(200) })).status === 401) return } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw Error('Restored service did not become ready')
  }
  await ready()
  const files = ['mcp.json', 'settings.json', 'skills/opengui/SKILL.md']
  const before = await Promise.all(files.map(file => readFile(join(root, file), 'utf8')))
  const broken = await fixture('broken', true)
  await assert.rejects(run(broken), /did not become ready/)
  assert.deepEqual(await Promise.all(files.map(file => readFile(join(root, file), 'utf8'))), before)
  assert.equal(await readFile(join(directory, spec.label + '.plist'), 'utf8'), spec.plist)
  await ready()
  const next = await fixture('next')
  await run(next)
  assert.equal(JSON.parse(await readFile(join(root, 'mcp.json'))).mcpServers.other.command, 'retain')
  assert.deepEqual(JSON.parse(await readFile(join(state, 'native-mcp.json'))), endpoint)
  await ready()
  await run(first, 'stdio')
  const reverted = JSON.parse(await readFile(join(root, 'mcp.json'))).mcpServers.opengui
  assert.equal(reverted.type, 'stdio'); assert.equal(reverted.url, undefined)
  await assert.rejects(exec('/bin/launchctl', ['print', target]))
  await run(next)
  await ready()
  assert.deepEqual(JSON.parse(await readFile(join(state, 'native-mcp.json'))), endpoint)
  console.log('PASS: native installation, failed-start rollback, upgrade, stdio rollback, and native re-enable retain configuration and endpoint')
} finally {
  if (target) await exec('/bin/launchctl', ['bootout', target]).catch(error => { if (![3, 113].includes(error.code)) throw error })
  await rm(root, { recursive: true, force: true })
}
