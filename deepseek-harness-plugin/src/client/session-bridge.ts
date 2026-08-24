import type { ClientContext, ISessions, IWorkspaces, SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { CoremateTaskStatusStore } from './task-status-store.ts'

type SessionCreator = ISessions & {
  create(options: { workspaceId: WorkspaceId }): Promise<SessionId>
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
  let pending: Promise<void> | undefined
  let disposed = false

  workspaces.startSession = (workspaceId?: WorkspaceId): void => {
    const list = sessions.list.getSnapshot()
    const current = list.current
    const row = current === undefined ? undefined : list.byId[current]
    const owner = store.getSnapshot().task.active ? store.getSnapshot().task.ownerSessionId : undefined
    const consumed = current !== undefined && store.isConsumedSession(String(current))
    if (current === undefined || row === undefined || !shouldForceNewSession(owner, String(current), row.blank, consumed)) {
      callOriginal(workspaceId)
      return
    }
    const target = workspaceId ?? ownerWorkspace(workspaces, current)
    if (target === undefined) { callOriginal(workspaceId); return }
    if (pending !== undefined) return
    store.setBridgeError(undefined)
    const operation = (async (): Promise<void> => {
      // SessionRuntime.create projects the new row and binding before resolving.
      // The raw Host RPC does not, which leaves this browser unable to open it.
      const id = await sessions.create({ workspaceId: target })
      if (!disposed) sessions.open(id)
    })().catch(error => {
      if (!disposed) store.setBridgeError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (pending === operation) pending = undefined
    })
    pending = operation
  }

  return () => {
    disposed = true
    workspaces.startSession = original
  }
}
