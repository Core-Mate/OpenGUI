import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { BrokerClient } from '../lib/broker-client.js'
import { brokerPort, brokerToken } from '../lib/state.js'

const archive = resolve(process.argv[2] ?? 'dist/opengui-mcp-0.1.0.tgz')
const npmCli = process.env.npm_execpath
assert(npmCli, 'Run through npm run smoke:packed')
const temporary = await mkdtemp(join(tmpdir(), 'opengui-workbuddy-pack-'))
try {
  for (const offline of [false, true]) {
    const stateDir = join(temporary, 'state')
    let brokerPid
    const args = [npmCli, 'exec', '--yes', '--ignore-scripts', '--cache', join(temporary, 'npm-cache'), ...(offline ? ['--offline'] : ['--prefer-offline']), `--package=${archive}`, '--', 'opengui-mcp']
    const transport = new StdioClientTransport({ command: process.execPath, args, stderr: 'pipe', env: { ...process.env, OPENGUI_WORKBUDDY_HOME: stateDir } })
    const client = new Client({ name: 'packed-smoke', version: '1' }, { capabilities: {} })
    try {
      await client.connect(transport, { timeout: 120_000 })
      const { tools } = await client.listTools()
      assert.equal(tools.length, 11)
      await client.ping()
      const devices = await client.callTool({ name: 'opengui_list_devices', arguments: {} })
      assert.notEqual(devices.isError, true, JSON.stringify(devices.content))
      assert(Array.isArray(devices.structuredContent?.devices))
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
} finally { await rm(temporary, { recursive: true, force: true }) }
