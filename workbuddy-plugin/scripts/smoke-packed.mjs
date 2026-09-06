import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createConnection, createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { managedAdbPath } from '../lib/adb.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { BrokerClient } from '../lib/broker-client.js'
import { brokerPort, brokerToken } from '../lib/state.js'

const archive = resolve(process.argv[2] ?? 'dist/opengui-mcp-0.1.0.tgz')
const npmCli = process.env.npm_execpath
assert(npmCli, 'Run through npm run smoke:packed')
const temporary = await mkdtemp(join(tmpdir(), 'opengui-workbuddy-pack-'))
// Keep discovery off the user's shared ADB server and own the foreground process.
const reservation = createServer()
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
const adbPort = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const adbSocket = `tcp:127.0.0.1:${adbPort}`
const smokeEnv = { ...process.env, ADB_SERVER_SOCKET: adbSocket, ADB_MDNS_AUTO_CONNECT: 'none', ADB_LOCAL_TRANSPORT_MAX_PORT: '5554', ANDROID_USER_HOME: join(temporary, 'android') }
const adb = spawn(managedAdbPath(), ['-L', `tcp:${adbPort}`, '--one-device', `opengui-smoke-${randomUUID()}`, 'server', 'nodaemon'], { env: smokeEnv, stdio: ['ignore', 'ignore', 'pipe'] })
let adbError, adbLog = ''
adb.on('error', error => { adbError = error })
adb.stderr.on('data', chunk => { adbLog = (adbLog + chunk).slice(-4096) })
const adbClosed = new Promise(resolve => adb.once('close', resolve))
try {
  for (let attempt = 0; ; attempt++) {
    assert(!adbError && adb.exitCode === null && adb.signalCode === null, `Test ADB startup failed: ${adbError ?? adbLog}`)
    const listening = await new Promise(resolve => {
      const socket = createConnection({ host: '127.0.0.1', port: adbPort })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => { socket.destroy(); resolve(false) })
      socket.setTimeout(1000, () => { socket.destroy(); resolve(false) })
    })
    if (listening) break
    assert(attempt < 100, `Test ADB did not bind: ${adbLog}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  for (const offline of [false, true]) {
    const stateDir = join(temporary, 'state')
    let brokerPid
    const args = [npmCli, 'exec', '--yes', '--ignore-scripts', '--cache', join(temporary, 'npm-cache'), ...(offline ? ['--offline'] : ['--prefer-offline']), `--package=${archive}`, '--', 'opengui-mcp']
    const transport = new StdioClientTransport({ command: process.execPath, args, stderr: 'pipe', env: { ...smokeEnv, OPENGUI_WORKBUDDY_HOME: stateDir } })
    const client = new Client({ name: 'packed-smoke', version: '1' }, { capabilities: {} })
    try {
      await client.connect(transport, { timeout: 120_000 })
      const { tools } = await client.listTools()
      assert.equal(tools.length, 11)
      await client.ping()
      const devices = await client.callTool({ name: 'opengui_list_devices', arguments: {} })
      assert.notEqual(devices.isError, true, JSON.stringify(devices.content))
      assert(Array.isArray(devices.structuredContent?.devices))
      assert.equal(devices.structuredContent.devices.length, 0, 'Smoke discovery must not acquire real phones')
      assert(adb.exitCode === null && adb.signalCode === null, 'Test-owned ADB exited during discovery')
      const probe = await BrokerClient.connect(brokerPort(stateDir), await brokerToken(stateDir))
      brokerPid = probe.brokerPid
      probe.close()
      assert(brokerPid && brokerPid !== process.pid)
      console.log(`${offline ? 'Offline cached' : 'Fresh isolated cache'}: packed stdio, eleven tools, ping, broker startup, and read-only ADB discovery passed.`)
    } finally {
      await client.close()
      if (brokerPid) {
        try { process.kill(brokerPid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
        for (let attempt = 0; attempt < 100; attempt++) {
          try { process.kill(brokerPid, 0) } catch (error) { if (error.code === 'ESRCH') break; throw error }
          await new Promise(resolve => setTimeout(resolve, 50))
          assert(attempt < 99, 'Test-owned broker failed to exit')
        }
      }
    }
  }
} finally {
  if (adb.exitCode === null && adb.signalCode === null) adb.kill('SIGTERM')
  const force = setTimeout(() => { if (adb.exitCode === null && adb.signalCode === null) adb.kill('SIGKILL') }, 5000)
  try { await adbClosed } finally { clearTimeout(force) }
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  console.log('Test-owned ADB exited and isolated installation was removed.')
}
