import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ElicitRequestSchema, type ClientCapabilities } from '@modelcontextprotocol/sdk/types.js'
import { startMcp, toolResult } from '../src/mcp-server.ts'
import { OPENGUI_WORKBUDDY_TOOLS } from '../src/tools.ts'
import { FakeHost } from './fake-host.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { callOpenGuiTool } from '../src/tools.ts'

const cleanup: Array<() => unknown> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function client(capabilities: ClientCapabilities = {}, action: 'accept' | 'decline' | 'cancel' = 'accept', confirm = true) {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const service = new WorkBuddyOpenGuiService({ host: new FakeHost() })
  const connection = { call: vi.fn((name, args, signal, confirmed) => callOpenGuiTool(service, name, args, signal, confirmed)), close: vi.fn() }
  const server = await startMcp(b, async () => connection)
  const client = new Client({ name: 'workbuddy-test', version: '1' }, { capabilities })
  if (capabilities.elicitation) client.setRequestHandler(ElicitRequestSchema, async () => ({ action, content: { confirm } }))
  cleanup.push(() => service.dispose(), () => server.close(), () => client.close())
  await client.connect(a)
  return { client, connection }
}

describe('standard MCP transport', () => {
  it('retries a failed initial connection on a later call without replaying calls', async () => {
    const [a, b] = InMemoryTransport.createLinkedPair()
    const connection = { call: vi.fn(async () => ({ devices: [] })), close: vi.fn() }
    const connect = vi.fn().mockRejectedValueOnce(new Error('temporary broker mismatch')).mockResolvedValue(connection)
    const server = await startMcp(b, connect)
    const c = new Client({ name: 'recovery-test', version: '1' })
    cleanup.push(() => server.close(), () => c.close())
    await c.connect(a)
    expect((await c.callTool({ name: 'opengui_list_devices', arguments: {} })).isError).toBe(true)
    expect(connection.call).not.toHaveBeenCalled()
    const result = await c.callTool({ name: 'opengui_list_devices', arguments: {} })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toEqual({ devices: [] })
    expect(connect).toHaveBeenCalledTimes(2)
    expect(connection.call).toHaveBeenCalledTimes(1)
  })

  it('does not reconnect or replay after a dispatched action fails', async () => {
    const [a, b] = InMemoryTransport.createLinkedPair()
    const connection = { call: vi.fn().mockRejectedValue(new Error('broker disconnected; outcome unknown')), close: vi.fn() }
    const connect = vi.fn(async () => connection)
    const server = await startMcp(b, connect)
    const c = new Client({ name: 'no-replay-test', version: '1' })
    cleanup.push(() => server.close(), () => c.close())
    await c.connect(a)
    const result = await c.callTool({ name: 'opengui_act', arguments: {
      sessionId: 'session-a', observationId: 'observation-a', action: 'key', key: 'Home',
    } })
    expect(result.isError).toBe(true)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connection.call).toHaveBeenCalledTimes(1)
  })

  it('discovers every documented tool and negotiates initialization', async () => {
    const { client: c, connection } = await client()
    const listed = await c.listTools()
    expect(listed.tools.map(tool => tool.name)).toEqual(OPENGUI_WORKBUDDY_TOOLS.map(tool => tool.name))
    expect(c.getServerVersion()).toMatchObject({ name: 'opengui-workbuddy', version: '0.1.0' })
    expect(connection.call).not.toHaveBeenCalled()
  })

  it('returns image content separately without duplicating base64 in structured metadata', async () => {
    const { client: c } = await client()
    await c.listTools()
    const session = await c.callTool({ name: 'opengui_open_session', arguments: { deviceIds: ['phone-a'] } })
    const result = await c.callTool({ name: 'opengui_observe', arguments: { sessionId: session.structuredContent!.sessionId } })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContainEqual({ type: 'image', data: 'anBlZw==', mimeType: 'image/jpeg' })
    expect(JSON.stringify(result.structuredContent)).not.toContain('anBlZw==')
  })

  it.each([
    [{}, 'accept', true, false],
    [{ elicitation: { url: {} } }, 'accept', true, false],
    [{ elicitation: { form: {} } }, 'decline', true, false],
    [{ elicitation: { form: {} } }, 'cancel', true, false],
    [{ elicitation: { form: {} } }, 'accept', false, false],
    [{ elicitation: { form: {} } }, 'accept', true, true],
    [{ elicitation: {} }, 'accept', true, true],
  ] as const)('gates consequential actions for capabilities %j, response %s/%s', async (caps, action, confirm, allowed) => {
    const { client: c, connection } = await client(caps, action, confirm)
    const session = await c.callTool({ name: 'opengui_open_session', arguments: { deviceIds: ['phone-a'] } })
    await c.callTool({ name: 'opengui_observe', arguments: { sessionId: session.structuredContent!.sessionId } })
    connection.call.mockClear()
    const result = await c.callTool({ name: 'opengui_act', arguments: {
      sessionId: session.structuredContent!.sessionId, action: 'key', key: 'Enter', observationId: 'phone-observation-1', externalSideEffect: 'send',
    } })
    const fallback = !('elicitation' in caps) || ('elicitation' in caps && 'url' in caps.elicitation)
    expect(result.isError === true).toBe(!allowed && !fallback)
    if (fallback) expect(result.structuredContent).toMatchObject({ status: 'confirmation_required' })
    expect(connection.call.mock.calls.filter(call => call[0] === 'opengui_act')).toHaveLength(allowed || fallback ? 1 : 0)
    if (allowed) expect(connection.call.mock.calls[0]![3]).toBe(true)
  })

  it('rejects unknown tools and schema violations as tool errors', async () => {
    const { client: c } = await client()
    expect((await c.callTool({ name: 'raw_adb', arguments: {} })).isError).toBe(true)
    expect((await c.callTool({ name: 'opengui_open_session', arguments: { deviceIds: [] } })).isError).toBe(true)
  })

  it('preserves structured non-image results', () => {
    expect(toolResult({ devices: [] })).toEqual({ content: [{ type: 'text', text: '{"devices":[]}' }], structuredContent: { devices: [] } })
  })
})
