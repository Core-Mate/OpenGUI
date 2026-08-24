import { useEffect } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import { isUntitledSession, taskTitle } from './coremate-trigger.ts'
import { coremateTaskStatusStore } from './task-status-store.ts'

export interface CoremateDraftActions {
  /** Upgrade the leading @OpenGUI token through the scoped DSH claim event. */
  claim(span: CoremateClaimSpan): boolean
}

export interface CoremateClaimSpan {
  readonly start: 0
  readonly end: number
  readonly draftRev: number
}

interface InputSnapshot {
  readonly draft: string
  readonly draftRev: number
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
}

interface CoremateClaimBridgeProps {
  readonly useInput: <T>(selector: (state: InputSnapshot) => T) => T
  readonly coremateDraftActions: CoremateDraftActions
  readonly coremateSessionId: string
  readonly coremateSessions: ISessions
}

export function directOpenGuiTask(draft: string): string | undefined {
  return /^\/(?:opengui|coremate)\s+(.+)$/iu.exec(draft.trim())?.[1]?.trim() || undefined
}

export function submittedDirectOpenGuiTask(draft: string, phase: InputSnapshot['phase']): string | undefined {
  return phase === 'submitting' ? directOpenGuiTask(draft) : undefined
}

/** Include one existing separator so the command claim does not duplicate it. */
export function coremateClaimSpan(draft: string, draftRev: number): CoremateClaimSpan | undefined {
  const match = /^@opengui(\s)(?=\S)/iu.exec(draft)
  if (!match) return undefined
  return {
    start: 0,
    end: '@OpenGUI'.length + (match[1] ? 1 : 0),
    draftRev,
  }
}

/** Make menu picks, typed text, pasted text, and template drafts share one native claim. */
export function CoremateClaimBridge({
  useInput,
  coremateDraftActions,
  coremateSessionId,
  coremateSessions,
}: CoremateClaimBridgeProps): null {
  const draft = useInput(state => state.draft)
  const draftRev = useInput(state => state.draftRev)
  const phase = useInput(state => state.phase)

  useEffect(() => {
    if (phase !== 'plain') return
    const span = coremateClaimSpan(draft, draftRev)
    if (span) coremateDraftActions.claim(span)
  }, [coremateDraftActions, draft, draftRev, phase])

  useEffect(() => {
    const task = submittedDirectOpenGuiTask(draft, phase)
    if (task === undefined) return
    coremateTaskStatusStore.markConsumedSession(coremateSessionId)
    coremateTaskStatusStore.beginLaunch(coremateSessionId)
    const sessions = coremateSessions
    const id = coremateSessionId as keyof ReturnType<typeof sessions.list.getSnapshot>['byId']
    const row = sessions.list.getSnapshot().byId[id]
    const binding = sessions.binding(id)
    if (isUntitledSession(row?.title) && binding !== undefined) {
      void binding.session.rename(taskTitle(task)).catch(() => {})
    }
  }, [coremateSessionId, coremateSessions, draft, phase])
  return null
}
