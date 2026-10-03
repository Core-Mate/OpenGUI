import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startCodexMcp, type CodexMcpCall } from '../src/mcp-server.ts'

const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function connect(call: CodexMcpCall) {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = await startCodexMcp(b, call)
  const client = new Client({ name: 'codex-integration', version: '1' })
  cleanup.push(() => server.close(), () => client.close())
  await client.connect(a)
  return client
}

describe('Codex MCP task identity', () => {
  it('discovers tools without starting a daemon or acquiring a phone', async () => {
    const call = vi.fn()
    const client = await connect(call)
    expect((await client.listTools()).tools.some(tool => tool.name === 'opengui_manage_task')).toBe(true)
    const resources = (await client.listResources()).resources
    expect(resources).toHaveLength(1)
    const resource = await client.readResource({ uri: resources[0]!.uri })
    expect(resource.contents[0]?.mimeType).toBe('text/html;profile=mcp-app')
    await expect(client.readResource({ uri: 'file:///etc/passwd' })).rejects.toThrow('Unknown OpenGUI resource')
    expect(call).not.toHaveBeenCalled()
  })

  it('rejects missing, malformed and conflicting metadata before dispatch', async () => {
    const call = vi.fn()
    const client = await connect(call)
    for (const meta of [undefined, {}, { threadId: '' }, { threadId: 'not-a-thread' }, { threadId: first, thread_id: second }, { threadId: first, thread_id: null }]) {
      const result = await client.callTool({ name: 'opengui_list_tasks', arguments: {}, ...(meta ? { _meta: meta } : {}) })
      expect(result.isError).toBe(true)
    }
    expect(call).not.toHaveBeenCalled()
  })

  it('keeps overlapping calls bound to their individual host metadata', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let markEntered!: () => void
    const entered = new Promise<void>(resolve => { markEntered = resolve })
    const call = vi.fn<CodexMcpCall>(async (_name, _args, owner) => {
      if (owner === first) { markEntered(); await gate }
      return { owner }
    })
    const client = await connect(call)
    const before = process.env.CODEX_THREAD_ID
    const pending = client.callTool({ name: 'opengui_list_tasks', arguments: {}, _meta: { threadId: first, thread_id: first } })
    await entered
    const next = await client.callTool({ name: 'opengui_list_tasks', arguments: {}, _meta: { thread_id: second } })
    expect(next.structuredContent).toEqual({ owner: second })
    release()
    expect((await pending).structuredContent).toEqual({ owner: first })
    expect(process.env.CODEX_THREAD_ID).toBe(before)
  })

  it('does not accept model-supplied identity or replay a failed operation', async () => {
    const call = vi.fn<CodexMcpCall>(async () => { throw new Error('response lost') })
    const client = await connect(call)
    const injected = await client.callTool({ name: 'opengui_list_tasks', arguments: { threadId: second }, _meta: { threadId: first } })
    expect(injected.isError).toBe(true)
    expect(call).not.toHaveBeenCalled()
    const result = await client.callTool({ name: 'opengui_manage_task', arguments: { action: 'stop', taskId: 'task' }, _meta: { threadId: first } })
    expect(result.isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
  })
})
