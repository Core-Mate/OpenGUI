import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { nativeBridgeScript } from '../../packages/workbench/src/native-bridge.ts'

function page(search = '?mcpApp=1', owner = 'workbuddy:["chat-a",null]') {
  const listeners = new Map<string, (event?: unknown) => void>()
  const timers = new Map<number, () => void>()
  let sequence = 0
  const notice = { textContent: '', className: '', dataset: {} as Record<string, string>, setAttribute: vi.fn() }
  const parent = { postMessage: vi.fn() }
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ workbenchOwner: owner }) }))
  const storage = new Map<string, string>()
  const window = { parent, addEventListener: (name: string, fn: (event?: unknown) => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name), openguiHostBridge: undefined as undefined | { continueTask: (task: unknown) => Promise<boolean> } }
  runInNewContext(nativeBridgeScript, {
    URL, URLSearchParams, location: { search, origin: 'http://127.0.0.1:1234', pathname: '/root/session/owner/' },
    crypto: { randomUUID: () => String(++sequence) }, fetch,
    setTimeout: (callback: () => void) => { const id = ++sequence; timers.set(id, callback); return id },
    clearTimeout: (id: number) => timers.delete(id),
    document: { createElement: () => notice, querySelector: () => ({ prepend: vi.fn() }) },
    window, sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
  })
  const reply = (result: unknown, source: unknown = parent) => {
    const request = parent.postMessage.mock.calls.map(call => call[0]).findLast(m => m.id)
    listeners.get('message')?.({ source, data: { jsonrpc: '2.0', id: request.id, result } })
  }
  return { parent, notice, reply, fetch, timers, listeners, window, storage }
}
const task = { id: '11111111-1111-4111-8111-111111111111', sequence: 1, owner: 'workbuddy:["chat-a",null]' }
async function connected(session: string | null = 'chat-a') {
  const p = page()
  p.reply({ hostCapabilities: { message: {} } })
  await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('host/getWBCurrentSessionId'))
  p.reply(session)
  await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('connected'))
  return p
}
async function wake(p: ReturnType<typeof page>, value = task) {
  const result = p.window.openguiHostBridge!.continueTask(value)
  await vi.waitFor(() => expect(p.timers.size).toBe(1))
  p.reply('chat-a')
  return { result }
}
describe('native workbench connection', () => {
  it('verifies the Codex owner through a host-bound tool call before each dispatch', async () => {
    const owner = '22222222-2222-4222-8222-222222222222'
    const p = page('?mcpApp=codex', owner)
    p.reply({ hostCapabilities: { message: {} } })
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('tools/call'))
    expect(p.parent.postMessage.mock.calls.at(-1)?.[0].params).toEqual({ name: 'opengui_open_workbench', arguments: {} })
    p.reply({ structuredContent: { url: 'http://127.0.0.1:1234/root/session/owner/' } })
    await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('connected'))
    const result = p.window.openguiHostBridge!.continueTask({ ...task, owner })
    await vi.waitFor(() => expect(p.timers.size).toBe(1))
    p.reply({ structuredContent: { url: 'http://127.0.0.1:1234/root/session/other/' } })
    expect(await result).toBe(false)
    expect(p.parent.postMessage.mock.calls.some(call => call[0].method === 'ui/message')).toBe(false)
  })
  it('sends a Codex continuation once and preserves uncertainty after timeout', async () => {
    const owner = '22222222-2222-4222-8222-222222222222'
    const p = page('?mcpApp=codex', owner)
    const identity = { structuredContent: { url: 'http://127.0.0.1:1234/root/session/owner/' } }
    p.reply({ hostCapabilities: { message: {} } })
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('tools/call'))
    p.reply(identity)
    await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('connected'))
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = p.window.openguiHostBridge!.continueTask({ ...task, owner })
      await vi.waitFor(() => expect(p.timers.size).toBe(1))
      p.reply(identity)
      if (!attempt) {
        await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('ui/message'))
        for (const timeout of [...p.timers.values()]) timeout()
      }
      expect(await result).toBe(false)
    }
    expect(p.parent.postMessage.mock.calls.filter(call => call[0].method === 'ui/message')).toHaveLength(1)
  })
  it('does not initialize a bridge in the ordinary browser page', () => {
    const p = page('')
    expect(p.parent.postMessage).not.toHaveBeenCalled()
    expect(p.fetch).not.toHaveBeenCalled()
  })
  it('requires host messaging and matching conversation ownership', async () => {
    const p = page()
    p.reply({ hostCapabilities: { message: {} } }, {})
    expect(p.parent.postMessage).toHaveBeenCalledTimes(1)
    p.reply({ hostCapabilities: { message: {} } })
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('host/getWBCurrentSessionId'))
    p.reply('chat-a')
    await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('connected'))
    expect(p.timers.size).toBe(0)
    expect(p.parent.postMessage.mock.calls.some(call => call[0].method === 'ui/message')).toBe(false)
  })
  it('rejects another conversation and leaves task execution untouched', async () => {
    const p = page()
    p.reply({ hostCapabilities: { message: {} } })
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('host/getWBCurrentSessionId'))
    p.reply('chat-b')
    await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('unavailable'))
    expect(p.notice.textContent).toContain('不匹配')
  })
  it('does not dispatch a subagent-owned workbench to the main conversation', async () => {
    const p = page('?mcpApp=1', 'workbuddy:["chat-a","child-agent"]')
    p.reply({ hostCapabilities: { message: {} } })
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('host/getWBCurrentSessionId'))
    p.reply('chat-a')
    await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('unavailable'))
    expect(p.parent.postMessage.mock.calls.some(call => call[0].method === 'ui/message')).toBe(false)
  })
  it('uses artifact-scoped messaging when the host identity extension returns null', async () => {
    const p = await connected(null)
    const result = p.window.openguiHostBridge!.continueTask(task)
    await vi.waitFor(() => expect(p.timers.size).toBe(1))
    p.reply(null)
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('ui/message'))
    p.reply({})
    expect(await result).toBe(true)
    expect(p.notice.textContent).toContain('等待接手')
  })
  it.each(['workbench', 'workbuddy:chat-a', 'workbuddy:["chat-a","agent"]'])('rejects unbound and subagent owner %s even without a host identity', async owner => {
    const p = page('?mcpApp=1', owner)
    p.reply({ hostCapabilities: { message: {} } })
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('host/getWBCurrentSessionId'))
    p.reply(null)
    await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('unavailable'))
  })
  it('reports timeout without retrying or sending a task request', async () => {
    const p = page()
    for (const timeout of [...p.timers.values()]) timeout()
    await vi.waitFor(() => expect(p.notice.dataset.hostBridge).toBe('unavailable'))
    expect(p.parent.postMessage).toHaveBeenCalledTimes(1)
  })
  it('notifies the host with the accepted identity and deduplicates the same sequence', async () => {
    const p = await connected()
    const first = await wake(p)
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('ui/message'))
    const message = p.parent.postMessage.mock.calls.at(-1)![0]
    expect(message.params.content[0].text).toContain(task.id)
    expect(message.params.content[0].text).toContain('Do not submit a duplicate')
    p.reply({})
    expect(await first.result).toBe(true)
    expect(p.notice.textContent).toContain('等待接手')
    const duplicate = await wake(p)
    expect(await duplicate.result).toBe(false)
    expect(p.parent.postMessage.mock.calls.filter(call => call[0].method === 'ui/message')).toHaveLength(1)
  })
  it('rejects a foreign task and a switched conversation before messaging', async () => {
    const p = await connected()
    expect(await p.window.openguiHostBridge!.continueTask({ ...task, owner: 'workbuddy:["chat-b",null]' })).toBe(false)
    const result = p.window.openguiHostBridge!.continueTask(task)
    await vi.waitFor(() => expect(p.timers.size).toBe(1))
    p.reply('chat-b')
    expect(await result).toBe(false)
    expect(p.notice.textContent).toContain('已切换')
    expect(p.parent.postMessage.mock.calls.some(call => call[0].method === 'ui/message')).toBe(false)
  })
  it('does not replay an ambiguously delivered message after timeout', async () => {
    const p = await connected()
    const first = await wake(p)
    await vi.waitFor(() => expect(p.parent.postMessage.mock.calls.at(-1)?.[0].method).toBe('ui/message'))
    for (const timeout of [...p.timers.values()]) timeout()
    expect(await first.result).toBe(false)
    expect(p.notice.textContent).toContain('尚不确定')
    const duplicate = await wake(p)
    expect(await duplicate.result).toBe(false)
    expect(p.parent.postMessage.mock.calls.filter(call => call[0].method === 'ui/message')).toHaveLength(1)
  })
  it('disposes pending requests when the page closes without sending a message', async () => {
    const p = await connected()
    const result = p.window.openguiHostBridge!.continueTask(task)
    await vi.waitFor(() => expect(p.timers.size).toBe(1))
    p.listeners.get('pagehide')?.()
    expect(await result).toBe(false)
    expect(p.timers.size).toBe(0)
    expect(p.parent.postMessage.mock.calls.some(call => call[0].method === 'ui/message')).toBe(false)
  })
})
