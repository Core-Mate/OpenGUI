import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoremateTaskStatusStore } from '../src/client/task-status-store.ts'

const activeTask = (sessionId: string, taskId = `task-${sessionId}`) => ({
  sessionId,
  taskId,
  attemptId: `attempt-${sessionId}`,
  active: true as const,
  phase: 'running' as const,
  selectionLocked: true,
  deviceIds: [`device-${sessionId}`],
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('OpenGUI client task status store', () => {
  it('reconciles concurrent Host tasks into independent session snapshots', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      tasks: [activeTask('session-a'), activeTask('session-b')],
    })))
    const store = new CoremateTaskStatusStore()

    await store.refresh()

    expect(store.getSnapshot('session-a').task).toEqual(activeTask('session-a'))
    expect(store.getSnapshot('session-b').task).toEqual(activeTask('session-b'))
    expect(store.getSnapshot('session-c').task.active).toBe(false)
    expect(store.activeTasks()).toHaveLength(2)
  })

  it('derives idle only for an active task omitted by a trusted batch response', async () => {
    const responses = [
      Response.json({ tasks: [activeTask('session-a'), activeTask('session-b')] }),
      Response.json({ tasks: [activeTask('session-b')] }),
    ]
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift()!))
    const store = new CoremateTaskStatusStore()

    await store.refresh()
    await store.refresh()

    expect(store.getSnapshot('session-a').task).toEqual({
      sessionId: 'session-a',
      active: false,
      phase: 'idle',
      selectionLocked: false,
      deviceIds: [],
    })
    expect(store.getSnapshot('session-b').task.active).toBe(true)
  })

  it('retains the last trusted snapshots when status refresh fails', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ tasks: [activeTask('session-a')] }))
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    const store = new CoremateTaskStatusStore()

    await store.refresh()
    await expect(store.refresh()).rejects.toThrow('offline')

    expect(store.getSnapshot('session-a').task).toEqual(activeTask('session-a'))
  })

  it('does not turn active sessions idle after a malformed batch response', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ tasks: [activeTask('session-a')] }))
      .mockResolvedValueOnce(Response.json({ active: false }))
    vi.stubGlobal('fetch', fetch)
    const store = new CoremateTaskStatusStore()

    await store.refresh()
    await expect(store.refresh()).rejects.toThrow('任务状态响应无效')

    expect(store.getSnapshot('session-a').task.active).toBe(true)
  })

  it('ignores an older refresh response that arrives after a newer generation', async () => {
    let first!: (response: Response) => void
    let second!: (response: Response) => void
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { first = resolve }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { second = resolve }))
    vi.stubGlobal('fetch', fetch)
    const store = new CoremateTaskStatusStore()
    const older = store.refresh()
    const newer = store.refresh()

    second(Response.json({ tasks: [activeTask('session-b')] }))
    await newer
    first(Response.json({ tasks: [activeTask('session-a')] }))
    await older

    expect(store.activeTasks()).toEqual([activeTask('session-b')])
  })

  it('drops asynchronous task rows without a complete identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      tasks: [
        { ...activeTask('session-a'), sessionId: undefined },
        { ...activeTask('session-b'), taskId: undefined },
        activeTask('session-c'),
      ],
    })))
    const store = new CoremateTaskStatusStore()

    await store.refresh()

    expect(store.activeTasks()).toEqual([activeTask('session-c')])
  })

  it('posts an exact stop identity and keeps the returned stopping task', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ sessionId: 'session-a', taskId: 'task-a', accepted: true }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({
        tasks: [{ ...activeTask('session-a', 'task-a'), phase: 'stopping' }],
      }))
    vi.stubGlobal('fetch', fetch)
    const store = new CoremateTaskStatusStore()

    await store.stop('session-a', 'task-a')

    expect(fetch.mock.calls[0]).toEqual([
      '/coremate-mobile/task/stop',
      expect.objectContaining({ body: JSON.stringify({ sessionId: 'session-a', taskId: 'task-a' }) }),
    ])
    expect(store.getSnapshot('session-a').task.phase).toBe('stopping')
  })

  it('surfaces an exact stale-task conflict from the Host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { error: 'task_identity_mismatch' },
      { status: 409 },
    )))
    const store = new CoremateTaskStatusStore()

    await expect(store.stop('session-a', 'old-task')).rejects.toThrow('task_identity_mismatch')
  })

  it('ignores a stale launch callback after a newer generation starts', () => {
    const store = new CoremateTaskStatusStore()
    const first = store.beginLaunch('session-a')!
    expect(store.finishLaunch('session-a', first)).toBe(true)
    const second = store.beginLaunch('session-a')!

    expect(store.finishLaunch('session-a', first, 'stale error')).toBe(false)
    expect(store.getSnapshot('session-a')).toMatchObject({ launching: true, launchError: undefined })
    expect(store.finishLaunch('session-a', second, 'current error')).toBe(true)
    expect(store.getSnapshot('session-a')).toMatchObject({ launching: false, launchError: 'current error' })
  })

  it('isolates launch and bridge errors by session', () => {
    const store = new CoremateTaskStatusStore()
    const launch = store.beginLaunch('session-a')!
    store.finishLaunch('session-a', launch, 'A failed')
    store.setBridgeError('session-b', 'B failed')

    expect(store.getSnapshot('session-a')).toMatchObject({ launchError: 'A failed', bridgeError: undefined })
    expect(store.getSnapshot('session-b')).toMatchObject({ launchError: undefined, bridgeError: 'B failed' })
  })

  it('allows B and a new C to launch without changing A during repeated tab projection', () => {
    const store = new CoremateTaskStatusStore()
    const a = store.beginLaunch('session-a')!
    const b = store.beginLaunch('session-b')!
    expect(store.beginLaunch('session-a')).toBeUndefined()
    for (const sessionId of ['session-a', 'session-b', 'session-a', 'session-b']) {
      expect(store.getSnapshot(sessionId).launching).toBe(true)
    }
    const c = store.beginLaunch('session-c')!
    expect(store.getSnapshot('session-a').launching).toBe(true)
    expect(store.getSnapshot('session-b').launching).toBe(true)
    store.finishLaunch('session-a', a)
    store.finishLaunch('session-b', b)
    store.finishLaunch('session-c', c)
  })

  it('marks a direct slash session consumed before the first Host poll', () => {
    const store = new CoremateTaskStatusStore()
    store.markConsumedSession('slash-owner')
    expect(store.isConsumedSession('slash-owner')).toBe(true)
  })
})
