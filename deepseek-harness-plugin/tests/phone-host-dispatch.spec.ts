import { expect, it, vi } from 'vitest'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { interruptPhoneOwner, phoneEndpoint, PHONE_PROTOCOL } from '../src/phone-background.ts'
import { dispatchHostPhoneTask, bindHostPhoneLifecycle } from '../src/phone-host-dispatch.ts'

it('delivers owner interruption over the worker socket and tolerates an absent worker', async () => {
  vi.stubEnv('OPENGUI_DSH_HOME', '/tmp/opengui-lifecycle-' + randomUUID())
  const requests: unknown[] = []
  const server = createServer(socket => {
    let body = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      body += chunk
      if (!body.includes('\n')) return
      requests.push(JSON.parse(body))
      socket.end(JSON.stringify({ result: { stopProcessed: true } }) + '\n')
    })
  })
  try {
    await interruptPhoneOwner('absent-session')
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(phoneEndpoint(), resolve) })
    await interruptPhoneOwner('session-a')
    expect(requests).toEqual([{ protocol: PHONE_PROTOCOL, name: '__interrupt_owner__', args: {}, owner: 'session-a' }])
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.unstubAllEnvs()
  }
})

it('forwards explicit host cancellation and disposal but preserves normal turn completion', async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ctx = { on: (name: string, fn: (...args: unknown[]) => unknown) => { handlers.set(name, fn) } }
  const interrupt = vi.fn(async (_owner: string) => {})
  const onError = vi.fn()
  bindHostPhoneLifecycle(ctx as unknown as Parameters<typeof bindHostPhoneLifecycle>[0], interrupt, onError)
  const session = { id: 'session-a' }
  handlers.get('session/event')!(session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  handlers.get('session/event')!(session, { type: 'step/end' })
  expect(interrupt).not.toHaveBeenCalled()
  handlers.get('session/event')!(session, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
  expect(interrupt).toHaveBeenCalledExactlyOnceWith('session-a')
  handlers.get('agent/disposed')!({ agent: { session: { id: 'session-b' } } })
  expect(interrupt).toHaveBeenLastCalledWith('session-b')
  interrupt.mockRejectedValueOnce(new Error('worker unavailable'))
  handlers.get('session/event')!(session, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
})

it('wakes the existing host after acceptance without duplicating the task', async () => {
  const result = { id: 'accepted-task' }
  const submit = vi.fn(async () => result)
  const followup = vi.fn()
  const cancel = vi.fn()
  expect(await dispatchHostPhoneTask({ followup }, submit, cancel)).toBe(result)
  expect(submit).toHaveBeenCalledTimes(1)
  expect(followup).toHaveBeenCalledTimes(1)
  expect(followup.mock.calls[0]![0]).toMatchObject({ role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: expect.stringContaining('accepted-task') }] })
  expect(cancel).not.toHaveBeenCalled()
})

it('rejects unsupported hosts before accepting phone work', async () => {
  const submit = vi.fn()
  await expect(dispatchHostPhoneTask({}, submit, vi.fn())).rejects.toThrow('DSH')
  expect(submit).not.toHaveBeenCalled()
})

it('cancels accepted work if the host inbox rejects the wakeup', async () => {
  const cancel = vi.fn(async () => {})
  await expect(dispatchHostPhoneTask({ followup: () => { throw new Error('inbox closed') } }, async () => ({ id: 'accepted-task' }), cancel)).rejects.toThrow('inbox closed')
  expect(cancel).toHaveBeenCalledWith('accepted-task')
})
