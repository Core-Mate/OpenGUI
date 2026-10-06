import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForEvent } from '../src/task-events.ts'

afterEach(() => vi.useRealTimers())
describe('task event waits', () => {
  it('does not inspect unchanged state on a timer and removes listeners after timeout', async () => {
    vi.useFakeTimers()
    const off = vi.fn(), ready = vi.fn(() => false)
    const result = waitForEvent(() => off, ready, 600_000, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(599_999)
    expect(ready).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe(false); expect(off).toHaveBeenCalledTimes(1)
  })
  it('wakes immediately on a committed event and cleans up on cancellation', async () => {
    let changed = false, notify!: () => void
    const off = vi.fn(), controller = new AbortController()
    const result = waitForEvent(listener => { notify = listener; return off }, () => changed, 600_000, controller.signal)
    changed = true; notify()
    expect(await result).toBe(true); expect(off).toHaveBeenCalledTimes(1)
    const cancelled = waitForEvent(() => off, () => false, 600_000, controller.signal)
    const rejected = expect(cancelled).rejects.toThrow('Stopped')
    controller.abort(new Error('Stopped')); await rejected
    expect(off).toHaveBeenCalledTimes(2)
  })
})
