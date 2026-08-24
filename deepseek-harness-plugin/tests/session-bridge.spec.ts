import { describe, expect, it, vi } from 'vitest'
import { installActiveTaskSessionBridge, shouldForceNewSession } from '../src/client/session-bridge.ts'

describe('OpenGUI active-task new-session bridge', () => {
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
      getSnapshot: () => ({ task: { active: true, phase: 'running', selectionLocked: true, ownerSessionId: 'session-owner' } }),
      isConsumedSession: () => false,
      setBridgeError: (value?: string) => { errors.push(value) },
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
      getSnapshot: () => ({ task: { active: true, ownerSessionId: 'session-owner' } }),
      isConsumedSession: () => false,
      setBridgeError: (value?: string) => { errors.push(value) },
    } as never)

    workspace.startSession()
    await vi.waitFor(() => expect(errors).toContain('create failed'))
    expect(original).not.toHaveBeenCalled()
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
      getSnapshot: () => ({ task: { active: false, phase: 'idle', selectionLocked: false } }),
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
      getSnapshot: () => ({ task: { active: false, phase: 'idle', selectionLocked: false } }),
      isConsumedSession: (id: string) => id === 'session-consumed',
      setBridgeError: vi.fn(),
    } as never)

    workspace.startSession()

    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('session-fresh'))
    expect(create).toHaveBeenCalledWith({ workspaceId: 'workspace-1' })
    expect(original).not.toHaveBeenCalled()
  })
})
