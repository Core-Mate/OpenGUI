import type { ClientContext, ISessions, IWorkspaces, SessionFace, SessionId, SessionListState, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { CoremateTaskStatusStore } from './task-status-store.ts'

type SessionCreator = ISessions & {
  create(options: { workspaceId: WorkspaceId }): Promise<SessionId>
}

type WritableSessionList = ISessions['list'] & {
  set?(next: SessionListState): void
}

/** Observe the bound session independently of whichever conversation view is mounted. */
export function installSessionCommandTracking(session: SessionFace, store: CoremateTaskStatusStore): () => void {
  const sessionId = String(session.sessionId)
  const sync = (): void => {
    const snapshot = session.getSnapshot()
    if (!sessionId || snapshot.sessionId !== sessionId) return
    const command = snapshot.nodes.filter(node => node.kind === 'command' &&
      (node.name === 'opengui' || node.name === 'coremate') && node.args?.trim())
      .reduce<(typeof snapshot.nodes)[number] | undefined>((latest, node) =>
        latest === undefined || node.seq > latest.seq ? node : latest, undefined)
    if (command?.kind === 'command') store.reconcileCommand(sessionId, command)
  }
  const unsubscribe = session.subscribe(sync)
  sync()
  return unsubscribe
}

/** Keep a command-only task owner in DSH's sidebar, which filters blank rows. */
export function surfaceSessionInList(sessions: ISessions, sessionId: SessionId): boolean {
  const list = sessions.list as WritableSessionList
  const snapshot = list.getSnapshot()
  const row = snapshot.byId[sessionId]
  if (row === undefined || !row.blank || typeof list.set !== 'function') return false
  list.set({
    ...snapshot,
    byId: {
      ...snapshot.byId,
      [sessionId]: { ...row, blank: false },
    },
  })
  return true
}

export function shouldForceNewSession(
  activeOwner: string | undefined,
  current: string | undefined,
  blank: boolean,
  consumed = false,
): boolean {
  return current !== undefined && (consumed || (activeOwner !== undefined && activeOwner === current && blank))
}

function ownerWorkspace(workspaces: IWorkspaces, current: SessionId): WorkspaceId | undefined {
  const snapshot = workspaces.list.getSnapshot()
  return snapshot.items.find(item => item.sessionIds.includes(current))?.workspaceId ?? snapshot.recentWorkspaceId
}

/** Preserve DSH New Session behavior, except for the blank session owning a live OpenGUI command. */
export function installActiveTaskSessionBridge(ctx: ClientContext, store: CoremateTaskStatusStore): () => void {
  const sessions = ctx.sessions as unknown as SessionCreator
  const workspaces = ctx.workspaces as unknown as IWorkspaces
  const original = workspaces.startSession
  const callOriginal = (workspaceId?: WorkspaceId): void => original.call(workspaces, workspaceId)
  let pending: { target: WorkspaceId, origin: SessionId, operation: Promise<void> } | undefined
  let queued: { target: WorkspaceId, origin: SessionId, generation: number } | undefined
  let generation = 0
  let disposed = false

  const syncOwnerVisibility = (): void => {
    if (disposed) return
    for (const sessionId of Object.keys(sessions.list.getSnapshot().byId)) {
      if (store.isConsumedSession(sessionId)) surfaceSessionInList(sessions, sessionId as SessionId)
    }
    for (const task of store.activeTasks()) {
      surfaceSessionInList(sessions, task.sessionId as SessionId)
    }
  }
  const subscribeStore = (store as CoremateTaskStatusStore & { subscribe?: CoremateTaskStatusStore['subscribe'] }).subscribe
  const unsubscribeStore = typeof subscribeStore === 'function'
    ? subscribeStore.call(store, syncOwnerVisibility)
    : () => {}
  const subscribeList = sessions.list.subscribe
  const unsubscribeList = typeof subscribeList === 'function'
    ? subscribeList.call(sessions.list, syncOwnerVisibility)
    : () => {}
  syncOwnerVisibility()

  const createAndMaybeOpen = (target: WorkspaceId, origin: SessionId, requestGeneration: number): void => {
    store.setBridgeError(String(origin), undefined)
    const operation = (async (): Promise<void> => {
      // SessionRuntime.create projects the new row and binding before resolving.
      // The raw Host RPC does not, which leaves this browser unable to open it.
      const id = await sessions.create({ workspaceId: target })
      const current = sessions.list.getSnapshot().current
      if (!disposed && generation === requestGeneration && current === origin) sessions.open(id)
    })().catch(error => {
      if (!disposed && generation === requestGeneration) {
        store.setBridgeError(String(origin), error instanceof Error ? error.message : String(error))
      }
    }).finally(() => {
      if (pending?.operation === operation) pending = undefined
      const next = queued
      queued = undefined
      if (!disposed && next !== undefined) createAndMaybeOpen(next.target, next.origin, next.generation)
    })
    pending = { target, origin, operation }
  }

  workspaces.startSession = (workspaceId?: WorkspaceId): void => {
    const list = sessions.list.getSnapshot()
    const current = list.current
    const row = current === undefined ? undefined : list.byId[current]
    const currentTask = current === undefined ? undefined : store.getSnapshot(String(current)).task
    const owner = currentTask?.active ? currentTask.sessionId : undefined
    const consumed = current !== undefined && store.isConsumedSession(String(current))
    if (current === undefined || row === undefined || !shouldForceNewSession(owner, String(current), row.blank, consumed)) {
      callOriginal(workspaceId)
      return
    }
    const target = workspaceId ?? ownerWorkspace(workspaces, current)
    if (target === undefined) { callOriginal(workspaceId); return }
    if (pending?.target === target && pending.origin === current) return
    const requestGeneration = ++generation
    if (pending !== undefined) {
      queued = { target, origin: current, generation: requestGeneration }
      return
    }
    createAndMaybeOpen(target, current, requestGeneration)
  }

  return () => {
    disposed = true
    unsubscribeStore()
    unsubscribeList()
    workspaces.startSession = original
  }
}
