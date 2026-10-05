import { expect, it, vi } from 'vitest'
import { acceptedPhoneTask, executePhoneHandoff, phoneTaskHandoff, phoneWorkbenchRoute, phoneWorkbenchView } from '../src/client/phone-workbench-bridge.ts'

it('accepts only a bounded task identity from the exact workbench frame', () => {
  const frame = {} as MessageEventSource
  const origin = 'http://127.0.0.1:12345'
  const taskId = 'ab123456-1234-4567-8901-123456789abc'
  const event = { source: frame, origin, data: { type: 'opengui-task-accepted', taskId } }
  expect(acceptedPhoneTask(event, origin, frame)).toBe(taskId)
  expect(acceptedPhoneTask({ ...event, origin: 'http://127.0.0.1:12346' }, origin, frame)).toBeUndefined()
  expect(acceptedPhoneTask({ ...event, source: {} as MessageEventSource }, origin, frame)).toBeUndefined()
  expect(acceptedPhoneTask(event, origin, null)).toBeUndefined()
  expect(acceptedPhoneTask({ ...event, data: { ...event.data, taskId: '/opengui something else' } }, origin, frame)).toBeUndefined()
  expect(acceptedPhoneTask({ ...event, data: null }, origin, frame)).toBeUndefined()
})

it('retains navigation across remounts without leaking it to another conversation', () => {
  const first = phoneWorkbenchView('conversation-a')
  first.opened = true
  first.route = 'task/ab123456-1234-4567-8901-123456789abc'
  expect(phoneWorkbenchView('conversation-a')).toEqual(first)
  expect(phoneWorkbenchView('conversation-b')).toEqual({ opened: false, route: 'home' })
  const unbound = phoneWorkbenchView(undefined)
  unbound.opened = true
  expect(phoneWorkbenchView(undefined).opened).toBe(false)
})

it('accepts navigation only from the bound frame and never as a task dispatch', () => {
  const frame = {} as MessageEventSource
  const origin = 'http://127.0.0.1:12345'
  const event = { source: frame, origin, data: { type: 'opengui-workbench-route', route: 'task/ab123456-1234-4567-8901-123456789abc' } }
  expect(phoneWorkbenchRoute(event, origin, frame)).toBe(event.data.route)
  expect(acceptedPhoneTask(event, origin, frame)).toBeUndefined()
  expect(phoneWorkbenchRoute({ ...event, source: {} as MessageEventSource }, origin, frame)).toBeUndefined()
  expect(phoneWorkbenchRoute({ ...event, origin: 'http://127.0.0.1:9999' }, origin, frame)).toBeUndefined()
  for (const route of ['https://example.com', '//example.com', 'task/../../x', 'task/not-a-uuid', 'settings#evil']) {
    expect(phoneWorkbenchRoute({ ...event, data: { ...event.data, route } }, origin, frame)).toBeUndefined()
  }
  expect(phoneWorkbenchRoute({ ...event, data: null }, origin, frame)).toBeUndefined()
})

it('accepts subsequent replies with distinct delivery keys and rejects untrusted continuations', () => {
  const frame = {} as MessageEventSource
  const origin = 'http://127.0.0.1:12345'
  const taskId = 'ab123456-1234-4567-8901-123456789abc'
  const event = { source: frame, origin, data: { type: 'opengui-task-continued', taskId, sequence: 8 } }
  const first = phoneTaskHandoff(event, origin, frame)!
  expect(first.taskId).toBe(taskId)
  expect(phoneTaskHandoff(event, origin, frame)).toEqual(first)
  expect(phoneTaskHandoff({ ...event, data: { ...event.data, sequence: 9 } }, origin, frame)?.key).not.toBe(first.key)
  expect(phoneTaskHandoff({ ...event, data: { type: 'opengui-task-accepted', taskId } }, origin, frame)?.key).not.toBe(first.key)
  expect(phoneTaskHandoff({ ...event, origin: 'http://127.0.0.1:9999' }, origin, frame)).toBeUndefined()
  expect(phoneTaskHandoff({ ...event, source: {} as MessageEventSource }, origin, frame)).toBeUndefined()
  for (const sequence of [undefined, '8', -1, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(phoneTaskHandoff({ ...event, data: { ...event.data, sequence } }, origin, frame)).toBeUndefined()
  }
})

it('waits for durable command success rather than admission and ignores old or unrelated commands', async () => {
  const nodes = [{ kind: 'command', seq: 1, name: 'opengui', args: 'continue task', outcome: { kind: 'success' } }]
  let listener = () => {}
  const unsubscribe = vi.fn()
  const session = { getSnapshot: () => ({ nodes }), subscribe: (fn: () => void) => { listener = fn; return unsubscribe }, command: vi.fn(async () => ({ ok: true, value: { matched: true } })) }
  let done = false
  const result = executePhoneHandoff(session, 'task').then(value => { done = true; return value })
  await Promise.resolve(); expect(done).toBe(false)
  nodes.push({ kind: 'command', seq: 2, name: 'opengui', args: 'continue other', outcome: { kind: 'success' } });listener()
  await Promise.resolve(); expect(done).toBe(false)
  nodes.push({ kind: 'command', seq: 3, name: 'opengui', args: ' continue task', outcome: { kind: 'error' } });listener()
  expect(await result).toBe('rejected');expect(unsubscribe).toHaveBeenCalledOnce()
})

it('observes a synchronous host success and treats a missing result as unknown without resending', async () => {
  vi.useFakeTimers()
  try {
    const nodes: { kind: string; seq: number; name: string; args: string; outcome: { kind: string } }[] = []
    const unsubscribe = vi.fn()
    const session = { getSnapshot: () => ({ nodes }), subscribe: (_fn: () => void) => unsubscribe, command: vi.fn(async () => { nodes.push({ kind: 'command', seq: 1, name: 'opengui', args: 'continue task', outcome: { kind: 'success' } }); return { ok: true, value: { matched: true } } }) }
    expect(await executePhoneHandoff(session, 'task')).toBe('accepted')
    session.command.mockImplementation(async () => ({ ok: true, value: { matched: true } }))
    const pending = executePhoneHandoff(session, 'task', 100)
    await vi.advanceTimersByTimeAsync(100)
    expect(await pending).toBe('unknown')
    expect(session.command).toHaveBeenCalledTimes(2)
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  } finally { vi.useRealTimers() }
})
