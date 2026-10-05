import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeEndpoint } from '../lib/native-endpoint.js'
import { nativeLaunchAgent } from '../lib/native-launch-agent.js'

assert.equal(process.platform, 'darwin', 'Native service smoke requires macOS')
const root = await mkdtemp(join(tmpdir(), 'opengui-service-smoke-'))
const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const service = nativeLaunchAgent({ configRoot: root, stateRoot: root, node: process.execPath, packageDir: pkg })
const target = `gui/${process.getuid()}/${service.label}`
const plist = join(root, 'service.plist')
const launchctl = (...args) => execFileSync('/bin/launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let loaded = false
const config = await nativeEndpoint(root)
const url = `http://127.0.0.1:${config.port}/mcp`
const ready = async () => {
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500), headers: {
        authorization: 'Bearer ' + config.token, 'mcp-session-id': 'read-only-probe',
      } })
      await response.body?.cancel()
      if (response.status === 404) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Native service readiness deadline exceeded')
}
try {
  await writeFile(plist, service.plist, { mode: 0o600 })
  launchctl('bootstrap', `gui/${process.getuid()}`, plist)
  loaded = true
  await ready()
  const pid = () => Number(launchctl('print', target).match(/\bpid = (\d+)/)?.[1])
  const first = pid()
  assert(first > 0)
  launchctl('kill', 'SIGTERM', target)
  const deadline = Date.now() + 25000
  let second = first
  while (Date.now() < deadline && (!second || second === first)) {
    await new Promise(resolve => setTimeout(resolve, 200))
    second = pid()
  }
  assert(second > 0 && second !== first, 'launchd must restart the terminated service')
  await ready()
  assert.deepEqual(await nativeEndpoint(root), config)
  assert.equal((await fetch(url)).status, 401)
  const log = await readFile(join(root, 'native-mcp.stdout.log'), 'utf8')
  assert(!log.includes(config.token) && !log.includes(url))
  console.log('PASS: native CLI supervised restart retains its endpoint and authentication; no broker or phone tools invoked')
} finally {
  if (loaded) launchctl('bootout', target)
  await rm(root, { recursive: true, force: true })
}
