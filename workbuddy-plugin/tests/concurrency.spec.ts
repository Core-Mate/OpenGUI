import { describe, expect, it, vi } from 'vitest'
import { AsyncSemaphore } from '../src/concurrency.ts'

describe('bounded OpenGUI concurrency', () => {
  it('shares two media permits across callers and never starts an aborted queued request', async () => {
    const permits = new AsyncSemaphore(2)
    const first = await permits.acquire(new AbortController().signal)
    const second = await permits.acquire(new AbortController().signal)
    const queued = new AbortController()
    const waiting = permits.acquire(queued.signal)
    const queue = (permits as unknown as { queued: unknown[] }).queued
    expect(queue).toHaveLength(1)
    queued.abort(new Error('stopped'))
    await expect(waiting).rejects.toThrow('stopped')
    expect(queue).toHaveLength(0)
    first()
    second()
    const next = await permits.acquire(new AbortController().signal)
    expect(next).toEqual(expect.any(Function))
    next()
    await vi.waitFor(() => expect(true).toBe(true))
  })
})
