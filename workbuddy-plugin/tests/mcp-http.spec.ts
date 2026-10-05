import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startHttpMcp } from '../src/mcp-http.ts'
import { request } from 'node:http'

const cleanup: Array<() => unknown> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

describe('local native MCP App transport', () => {
  it.each([false, true])('retains active tools when disconnected=%s and then reclaims the idle session', async disconnected => {
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const connection = { call: vi.fn(async () => { await pending; return { devices: [] } }), close: vi.fn() }
    const connect = vi.fn(async () => connection)
    const http = await startHttpMcp({ connect, maxSessions: 1, sessionIdleMs: 100 })
    cleanup.push(() => http.close())
    cleanup.push(() => finish())
    const headers = { authorization: 'Bearer ' + http.token, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
    const initialize = () => fetch(http.url, { method: 'POST', headers, body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'abandoned-test', version: '1' } },
    }) })
    const first = await initialize()
    expect(first.status).toBe(200)
    const id = first.headers.get('mcp-session-id')!
    await first.json()
    const controller = new AbortController()
    const call = fetch(http.url, { signal: controller.signal, method: 'POST', headers: { ...headers, 'mcp-session-id': id }, body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'opengui_list_devices', arguments: {} },
    }) }).then(async response => { await response.text(); return response.status }, error => error.name)
    await vi.waitFor(() => expect(connection.call).toHaveBeenCalledOnce())
    if (disconnected) controller.abort()
    await new Promise(resolve => setTimeout(resolve, 250))
    const full = await initialize()
    expect(full.status).toBe(429)
    await full.text()
    finish()
    expect(await call).toBe(disconnected ? 'AbortError' : 200)
    await vi.waitFor(async () => {
      const expired = await fetch(http.url, { headers: { ...headers, 'mcp-session-id': id } })
      await expired.body?.cancel()
      expect(expired.status).toBe(404)
    }, { timeout: 2000, interval: 150 })
    expect(connection.close).not.toHaveBeenCalled()
    const second = await initialize()
    expect(second.status).toBe(200)
    await second.json()
    expect(connect).toHaveBeenCalledOnce()
  })
  it('requires bearer authentication and rejects foreign origins and hostnames', async () => {
    const connect = vi.fn()
    const http = await startHttpMcp({ connect })
    cleanup.push(() => http.close())
    const headers = { authorization: 'Bearer ' + http.token }
    expect((await fetch(http.url)).status).toBe(401)
    expect((await fetch(http.url, { headers: { ...headers, origin: 'https://example.com' } })).status).toBe(403)
    const wrongHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(http.url, { headers: { ...headers, host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode) })
      req.once('error', reject); req.end()
    })
    expect(wrongHostStatus).toBe(403)
    expect((await fetch(http.url, { headers: { ...headers, 'mcp-session-id': 'unknown' } })).status).toBe(404)
    expect(connect).not.toHaveBeenCalled()
  })

  it('discovers native resources and keeps the broker alive across HTTP client disposal', async () => {
    const connection = { call: vi.fn(async () => ({ devices: [] })), close: vi.fn() }
    const connect = vi.fn(async () => connection)
    const http = await startHttpMcp({ connect, maxSessions: 1 })
    cleanup.push(() => http.close())
    const open = async () => {
      const transport = new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: 'Bearer ' + http.token } } })
      const client = new Client({ name: 'native-http-test', version: '1' })
      cleanup.push(() => client.close())
      await client.connect(transport)
      return { client, transport }
    }
    const first = await open()
    const tool = (await first.client.listTools()).tools.find(t => t.name === 'opengui_open_workbench')!
    expect(tool._meta).toHaveProperty('ui.resourceUri', 'ui://opengui/workbench.html')
    expect((await first.client.readResource({ uri: 'ui://opengui/workbench.html' })).contents[0]?.mimeType).toBe('text/html;profile=mcp-app')
    expect(connect).not.toHaveBeenCalled()
    await first.client.callTool({ name: 'opengui_list_devices', arguments: {} })
    await first.transport.terminateSession()
    await first.client.close()
    expect(connection.close).not.toHaveBeenCalled()
    const second = await open()
    await second.client.callTool({ name: 'opengui_list_devices', arguments: {} })
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connection.call).toHaveBeenCalledTimes(2)
    await second.transport.terminateSession()
    await second.client.close()
    await http.close()
    cleanup.splice(0)
    expect(connection.close).toHaveBeenCalledTimes(1)
  })
})
