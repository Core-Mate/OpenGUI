import { describe, expect, it, vi } from 'vitest'
import { installActiveTaskSessionBridge, installSessionCommandTracking, shouldForceNewSession } from '../src/client/session-bridge.ts'
import { CoremateTaskStatusStore } from '../src/client/task-status-store.ts'

const activeTask = (sessionId: string) => ({
  sessionId,
  taskId: `task-${sessionId}`,
  attemptId: `attempt-${sessionId}`,
  active: true,
  phase: 'running',
  selectionLocked: true,
  deviceIds: [],
})

const idleTask = (sessionId: string) => ({
  sessionId,
  active: false,
  phase: 'idle',
  selectionLocked: false,
  deviceIds: [],
})

describe('OpenGUI active-task new-session bridge', () => {
  it('tracks command outcomes from the owning session snapshot, including immediate failure', () => {
    const listeners = new Set<() => void>()
    const store = new CoremateTaskStatusStore()
    const node = { kind: 'command', name: 'opengui', args: 'inspect phone', commandId: 'cmd-b', seq: 10, outcome: { kind: 'error', text: 'device busy' } }
    const snapshot = { sessionId: 'session-b', nodes: [node] }
    const session = {
      sessionId: 'session-b',
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
    store.beginLaunch('session-b')
    const dispose = installSessionCommandTracking(session as never, store)
    expect(store.getSnapshot('session-b')).toMatchObject({ launching: false, launchError: 'device busy' })
    expect(store.isConsumedSession('session-b')).toBe(true)
    snapshot.sessionId = 'session-a'
    node.outcome.text = 'must not leak'
    for (const listener of listeners) listener()
    expect(store.getSnapshot('session-a').launchError).toBeUndefined()
    expect(store.getSnapshot('session-b').launchError).toBe('device busy')
    dispose()
    expect(listeners.size).toBe(0)
  })

  it('keeps a consumed idle command session visible after Host marks it blank', () => {
    let state = { byId: { 'session-b': { blank: true } } }
    const store = new CoremateTaskStatusStore()
    store.markConsumedSession('session-b')
    const dispose = installActiveTaskSessionBridge({
      sessions: { list: { getSnapshot: () => state, set: (next: typeof state) => { state = next } } },
      workspaces: { startSession: vi.fn() },
    } as never, store)
    expect(state.byId['session-b'].blank).toBe(false)
    dispose()
  })

  it('only bypasses blank-session reuse for the active task owner', () => {
    expect(shouldForceNewSession('session-1', 'session-1', true)).toBe(true)
    expect(shouldForceNewSession('session-1', 'session-2', true)).toBe(false)
    expect(shouldForceNewSession('session-1', 'session-1', false)).toBe(false)
    expect(shouldForceNewSession(undefined, 'session-1', true)).toBe(false)
    expect(shouldForceNewSession(undefined, 'session-1', true, true)).toBe(true)
  })

  it('creates and opens a distinct session while the owner remains blank and active', async () => {
    const open = vi.fn()
    const listState = {
      current: 'session-owner',
      byId: {
        'session-owner': { blank: true },
      } as Record<string, { blank: boolean }>,
    }
    let releaseCreate!: () => void
    const createGate = new Promise<void>(resolve => { releaseCreate = resolve })
    const create = vi.fn(async () => {
      await createGate
      listState.byId['session-new'] = { blank: true }
      return 'session-new'
    })
    const sessions = {
      list: { getSnapshot: () => listState, subscribe: () => () => {} },
      create,
      open,
    }
    const original = vi.fn()
    const workspace = {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', sessionIds: ['session-owner'] }], recentWorkspaceId: 'workspace-1' }) },
      startSession: original,
    }
    const errors: Array<string | undefined> = []
    const store = {
      getSnapshot: () => ({ task: activeTask('session-owner') }),
      activeTasks: () => [activeTask('session-owner')],
      isConsumedSession: () => false,
      setBridgeError: (_sessionId: string, value?: string) => { errors.push(value) },
    }
    const dispose = installActiveTaskSessionBridge({ sessions, workspaces: workspace } as never, store as never)

    workspace.startSession()
    workspace.startSession()
    expect(create).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
    releaseCreate()
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('session-new'))
    expect(create).toHaveBeenCalledTimes(1)
    expect(original).not.toHaveBeenCalled()
    expect(errors).toEqual([undefined])
    dispose()
    expect(workspace.startSession).toBe(original)
  })

  it('restores a running owner to the visible list after a client refresh', () => {
    const listListeners = new Set<() => void>()
    const storeListeners = new Set<() => void>()
    const listState = {
      ids: ['session-owner'],
      current: 'session-owner',
      byId: {
        'session-owner': { id: 'session-owner', blank: true, displayTitle: 'OpenGUI task', running: false, updatedAt: 0 },
      },
    }
    const list = {
      getSnapshot: () => listState,
      subscribe: (listener: () => void) => { listListeners.add(listener); return () => listListeners.delete(listener) },
      set: (next: typeof listState) => {
        Object.assign(listState, next)
        for (const listener of listListeners) listener()
      },
    }
    const workspace = {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', sessionIds: ['session-owner'] }] }) },
      startSession: vi.fn(),
    }
    const store = {
      getSnapshot: () => ({ task: activeTask('session-owner') }),
      activeTasks: () => [activeTask('session-owner')],
      subscribe: (listener: () => void) => { storeListeners.add(listener); return () => storeListeners.delete(listener) },
      isConsumedSession: () => true,
      setBridgeError: vi.fn(),
    }

    const dispose = installActiveTaskSessionBridge({ sessions: { list, create: vi.fn(), open: vi.fn() }, workspaces: workspace } as never, store as never)
    expect(listState.byId['session-owner'].blank).toBe(false)

    listState.byId['session-owner'].blank = true
    for (const listener of listListeners) listener()
    expect(listState.byId['session-owner'].blank).toBe(false)

    dispose()
  })

  it('keeps the owner open and surfaces a visible bridge error when creation fails', async () => {
    const original = vi.fn()
    const errors: Array<string | undefined> = []
    const workspace = {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', sessionIds: ['session-owner'] }] }) },
      startSession: original,
    }
    installActiveTaskSessionBridge({
      sessions: {
        list: { getSnapshot: () => ({ current: 'session-owner', byId: { 'session-owner': { blank: true } } }), subscribe: () => () => {} },
        create: async () => { throw new Error('create failed') },
        open: vi.fn(),
      },
      workspaces: workspace,
    } as never, {
      getSnapshot: () => ({ task: activeTask('session-owner') }),
      activeTasks: () => [activeTask('session-owner')],
      isConsumedSession: () => false,
      setBridgeError: (_sessionId: string, value?: string) => { errors.push(value) },
    } as never)

    workspace.startSession()
    await vi.waitFor(() => expect(errors).toContain('create failed'))
    expect(original).not.toHaveBeenCalled()
  })

  it('does not let a delayed create steal focus after the user navigates elsewhere', async () => {
    const listState = {
      current: 'session-owner',
      byId: {
        'session-owner': { blank: true },
        'session-other': { blank: false },
      } as Record<string, { blank: boolean }>,
    }
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const open = vi.fn()
    const workspace = {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', sessionIds: ['session-owner', 'session-other'] }] }) },
      startSession: vi.fn(),
    }
    installActiveTaskSessionBridge({
      sessions: {
        list: { getSnapshot: () => listState },
        create: async () => { await gate; return 'session-fresh' },
        open,
      },
      workspaces: workspace,
    } as never, {
      getSnapshot: () => ({ task: activeTask('session-owner') }),
      activeTasks: () => [activeTask('session-owner')],
      isConsumedSession: () => false,
      setBridgeError: vi.fn(),
    } as never)

    workspace.startSession()
    listState.current = 'session-other'
    release()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(open).not.toHaveBeenCalled()
  })

  it('queues a new-session request from a different origin in the same workspace', async () => {
    const listState = {
      current: 'session-owner',
      byId: {
        'session-owner': { blank: true },
        'session-other': { blank: true },
      } as Record<string, { blank: boolean }>,
    }
    let releaseFirst!: () => void
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
    const create = vi.fn()
      .mockImplementationOnce(async () => { await firstGate; return 'session-first' })
      .mockResolvedValueOnce('session-second')
    const open = vi.fn()
    const workspace = {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', sessionIds: ['session-owner', 'session-other'] }] }) },
      startSession: vi.fn(),
    }
    installActiveTaskSessionBridge({
      sessions: { list: { getSnapshot: () => listState }, create, open },
      workspaces: workspace,
    } as never, {
      getSnapshot: (sessionId: string) => ({ task: activeTask(sessionId) }),
      activeTasks: () => [activeTask('session-owner'), activeTask('session-other')],
      isConsumedSession: () => false,
      setBridgeError: vi.fn(),
    } as never)

    workspace.startSession()
    listState.current = 'session-other'
    workspace.startSession()
    releaseFirst()

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('session-second'))
    expect(open).not.toHaveBeenCalledWith('session-first')
  })

  it('preserves the native New Session path outside the active blank owner', () => {
    const original = vi.fn()
    const workspace = {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', sessionIds: ['session-owner'] }] }) },
      startSession: original,
    }
    installActiveTaskSessionBridge({
      sessions: {
        list: { getSnapshot: () => ({ current: 'session-owner', byId: { 'session-owner': { blank: false } } }) },
        create: vi.fn(),
        open: vi.fn(),
      },
      workspaces: workspace,
    } as never, {
      getSnapshot: (sessionId: string) => ({ task: idleTask(sessionId) }),
      activeTasks: () => [],
      isConsumedSession: () => false,
      setBridgeError: vi.fn(),
    } as never)

    workspace.startSession('workspace-1')
    expect(original).toHaveBeenCalledWith('workspace-1')
  })

  it('creates a fresh session after OpenGUI settles even when the browser still caches the owner as blank', async () => {
    const create = vi.fn(async () => 'session-fresh')
    const open = vi.fn()
    const original = vi.fn()
    const workspace = {
      list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace-1', sessionIds: ['session-consumed'] }] }) },
      startSession: original,
    }
    installActiveTaskSessionBridge({
      sessions: {
        list: { getSnapshot: () => ({ current: 'session-consumed', byId: { 'session-consumed': { blank: true } } }) },
        create,
        open,
      },
      workspaces: workspace,
    } as never, {
      getSnapshot: (sessionId: string) => ({ task: idleTask(sessionId) }),
      activeTasks: () => [],
      isConsumedSession: (id: string) => id === 'session-consumed',
      setBridgeError: vi.fn(),
    } as never)

    workspace.startSession()

    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('session-fresh'))
    expect(create).toHaveBeenCalledWith({ workspaceId: 'workspace-1' })
    expect(original).not.toHaveBeenCalled()
  })
})
