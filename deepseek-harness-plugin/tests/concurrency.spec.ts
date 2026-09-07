import { describe, expect, it, vi } from 'vitest'
import { AsyncSemaphore } from '../src/concurrency.ts'
import { mapWithConcurrency } from '../src/index.ts'

describe('bounded OpenGUI concurrency', () => {
  it('cancels queued device work on the first failure and waits for active workers to exit', async () => {
    const started: number[] = []
    const exited: number[] = []
    const running = mapWithConcurrency([0, 1, 2, 3], 2, new AbortController().signal, async (value, _index, signal) => {
      started.push(value)
      if (value === 0) throw new Error('phone failed')
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }).finally(() => { exited.push(value) })
      return value
    })

    await expect(running).rejects.toThrow('phone failed')
    expect(started).toEqual([0, 1])
    expect(exited).toEqual([1])
  })

  it('shares two media permits across callers and never starts an aborted queued request', async () => {
    const permits = new AsyncSemaphore(2)
    const first = await permits.acquire(new AbortController().signal)
    const second = await permits.acquire(new AbortController().signal)
    const queued = new AbortController()
    const waiting = permits.acquire(queued.signal)
    queued.abort(new Error('stopped'))
    await expect(waiting).rejects.toThrow('stopped')
    first()
    second()
    const next = await permits.acquire(new AbortController().signal)
    expect(next).toEqual(expect.any(Function))
    next()
    await vi.waitFor(() => expect(true).toBe(true))
  })
})
