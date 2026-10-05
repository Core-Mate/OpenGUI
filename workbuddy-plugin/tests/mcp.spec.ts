import { ReadyViewer } from './ready-viewer.ts'
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
  const service = new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host: new FakeHost() })
  const connection = { call: vi.fn((name, args, signal) => callOpenGuiTool(service, name, args, signal)), close: vi.fn() }
  const server = await startMcp(b, async () => connection)
  const client = new Client({ name: 'workbuddy-test', version: '1' }, { capabilities })
  if (capabilities.elicitation) client.setRequestHandler(ElicitRequestSchema, async () => ({ action, content: { confirm } }))
  cleanup.push(() => service.dispose(), () => server.close(), () => client.close())
  await client.connect(a)
  return { client, connection }
}

describe('standard MCP transport', () => {
  it('exposes the native workbench resource only when enabled without opening the broker', async () => {
    const [a, b] = InMemoryTransport.createLinkedPair()
    const connect = vi.fn()
    const server = await startMcp(b, connect, { nativeWorkbench: true })
    const c = new Client({ name: 'native-workbench', version: '1' })
    cleanup.push(() => server.close(), () => c.close())
    await c.connect(a)
    const tools = (await c.listTools()).tools
    const meta = tools.find(t => t.name === 'opengui_open_workbench')!._meta as { ui: { resourceUri: string }; workbuddy: unknown }
    expect(meta.workbuddy).toEqual({ ui: { launchSurface: 'panel' } })
    expect(tools.filter(t => t._meta)).toHaveLength(1)
    expect((await c.listResources()).resources.map(r => r.uri)).toEqual([meta.ui.resourceUri])
    const resource = await c.readResource({ uri: meta.ui.resourceUri })
    expect(resource.contents[0]?.mimeType).toBe('text/html;profile=mcp-app')
    expect(resource.contents[0]?._meta).toEqual({ ui: { csp: { frameDomains: ['http://127.0.0.1:*'] } } })
    expect(resource.contents[0]?.text).toContain('ui/initialize')
    await expect(c.readResource({ uri: 'file:///etc/passwd' })).rejects.toThrow('Unknown OpenGUI resource')
    expect(connect).not.toHaveBeenCalled()
  })

  it('keeps native resource discovery disabled for the ordinary workbench', async () => {
    const { client: c } = await client()
    expect(c.getServerCapabilities()?.resources).toBeUndefined()
    expect((await c.listTools()).tools.find(t => t.name === 'opengui_open_workbench')?._meta).toBeUndefined()
  })
  it('reconnects the next independent call after an established connection closes', async () => {
    const [a, b] = InMemoryTransport.createLinkedPair()
    let disconnect: (() => void) | undefined
    let dead = false
    const first = {
      call: vi.fn(async () => { if (dead) throw new Error('disconnected'); return { devices: [] } }),
      close: vi.fn(),
      onDisconnect: (listener: () => void) => { disconnect = listener; return () => {} },
    }
    const second = { call: vi.fn(async () => ({ devices: [] })), close: vi.fn() }
    const connect = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(second)
    const server = await startMcp(b, connect)
    const c = new Client({ name: 'established-recovery', version: '1' })
    cleanup.push(() => server.close(), () => c.close())
    await c.connect(a)
    expect((await c.callTool({ name: 'opengui_list_devices', arguments: {} })).isError).not.toBe(true)
    dead = true
    disconnect?.()
    expect((await c.callTool({ name: 'opengui_list_devices', arguments: {} })).isError).not.toBe(true)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(first.call).toHaveBeenCalledTimes(1)
    expect(second.call).toHaveBeenCalledTimes(1)
    disconnect?.()
    await c.callTool({ name: 'opengui_list_devices', arguments: {} })
    expect(connect).toHaveBeenCalledTimes(2)
  })
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
    expect(c.getServerVersion()).toMatchObject({ name: 'opengui-workbuddy', version: '0.4.0' })
    expect(connection.call).not.toHaveBeenCalled()
    const instructions = c.getInstructions()!
    expect(instructions).toContain('shared OpenGUI service')
    expect(instructions).toContain('opengui_run_task')
    expect(instructions).toContain('opengui_manage_task')
    expect(instructions).toContain('do not submit a duplicate')
    expect(instructions).not.toContain('next/decide')
    expect(instructions).toContain('Never mix legacy actions')
    expect(instructions).not.toContain('Start with opengui_open_viewer')
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
  ] as const)('does not request redundant plugin approval for capabilities %j, response %s/%s', async (caps, action, confirm, _allowed) => {
    const { client: c, connection } = await client(caps, action, confirm)
    const session = await c.callTool({ name: 'opengui_open_session', arguments: { deviceIds: ['phone-a'] } })
    await c.callTool({ name: 'opengui_observe', arguments: { sessionId: session.structuredContent!.sessionId } })
    connection.call.mockClear()
    const result = await c.callTool({ name: 'opengui_act', arguments: {
      sessionId: session.structuredContent!.sessionId, action: 'key', key: 'Enter', observationId: 'phone-observation-1', externalSideEffect: 'send',
    } })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toHaveProperty('observationId')
    expect(result.structuredContent).not.toHaveProperty('confirmationUrl')
    expect(connection.call.mock.calls.filter(call => call[0] === 'opengui_act')).toHaveLength(1)
    expect(connection.call.mock.calls[0]).toHaveLength(3)
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


it('delivers host-decision screenshots as image content, without base64 in text metadata', () => {
  const value = { decision: { id: 'decision', context: { observationId: 'frame', image: { type: 'image' as const, mimeType: 'image/jpeg', data: 'fixture-base64' } } } }
  const result = toolResult(value)
  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ decision: { id: 'decision', context: { observationId: 'frame' } } }) }, value.decision.context.image])
  expect(value.decision.context.image.data).toBe('fixture-base64')
})
