import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoremateTaskStatusStore } from '../src/client/task-status-store.ts'

afterEach(() => {
  vi.unstubAllGlobals()
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
