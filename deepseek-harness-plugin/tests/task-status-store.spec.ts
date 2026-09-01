import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoremateTaskStatusStore } from '../src/client/task-status-store.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('OpenGUI client task status store', () => {
  it('keeps the Host stopping state instead of publishing an optimistic idle state', async () => {
    const responses = [
      new Response(null, { status: 202 }),
      Response.json({ active: true, phase: 'stopping', selectionLocked: true, ownerSessionId: 'session-owner' }),
    ]
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift()!))
    const store = new CoremateTaskStatusStore()

    await store.stop()

    expect(store.getSnapshot().task).toEqual({
      active: true,
      phase: 'stopping',
      selectionLocked: true,
      ownerSessionId: 'session-owner',
    })
  })

  it.each(['stop', 'refresh'] as const)('bounds an unresponsive Host %s request', async (stage) => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (stage === 'refresh' && input === '/coremate-mobile/task/stop') return Promise.resolve(Response.json({ stopped: true }))
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    }))
    const store = new CoremateTaskStatusStore()

    const stopping = store.stop()
    const result = expect(stopping).rejects.toThrow('停止 OpenGUI 操作超时，请检查 Host 后重试。')
    await vi.advanceTimersByTimeAsync(5_000)

    await result
  })

  it('blocks duplicate launches until Host activity is observed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      active: true,
      phase: 'waiting-for-device',
      selectionLocked: false,
      ownerSessionId: 'session-owner',
    })))
    const store = new CoremateTaskStatusStore()

    expect(store.beginLaunch('session-owner')).toBe(true)
    expect(store.beginLaunch()).toBe(false)
    expect(store.isConsumedSession('session-owner')).toBe(true)
    expect(store.getSnapshot().launching).toBe(true)
    await store.refresh()
    expect(store.getSnapshot().launching).toBe(false)
    expect(store.beginLaunch()).toBe(false)
  })

  it('marks a direct slash session consumed before the first Host poll', () => {
    const store = new CoremateTaskStatusStore()
    store.markConsumedSession('slash-owner')
    expect(store.isConsumedSession('slash-owner')).toBe(true)
  })
})
