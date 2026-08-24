import { useEffect } from 'react'

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
export function CoremateClaimBridge({ useInput, coremateDraftActions }: CoremateClaimBridgeProps): null {
  const draft = useInput(state => state.draft)
  const draftRev = useInput(state => state.draftRev)
  const phase = useInput(state => state.phase)

  useEffect(() => {
    if (phase !== 'plain') return
    const span = coremateClaimSpan(draft, draftRev)
    if (span) coremateDraftActions.claim(span)
  }, [coremateDraftActions, draft, draftRev, phase])
  return null
}
