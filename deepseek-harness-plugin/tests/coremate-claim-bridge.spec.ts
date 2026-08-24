import { describe, expect, it } from 'vitest'
import {
  coremateClaimSpan,
  directOpenGuiTask,
  submittedDirectOpenGuiTask,
} from '../src/client/CoremateClaimBridge.tsx'

describe('OpenGUI command claim bridge', () => {
  it('keeps a bare mention plain so the native scene menu can remain open', () => {
    expect(coremateClaimSpan('@OpenGUI', 3)).toBeUndefined()
  })

  it('consumes one existing separator to avoid a duplicated command space', () => {
    expect(coremateClaimSpan('@opengui run the task', 5)).toEqual({ start: 0, end: 9, draftRev: 5 })
  })

  it('does not claim lookalike mentions', () => {
    expect(coremateClaimSpan('@OpenGUIX run the task', 7)).toBeUndefined()
    expect(coremateClaimSpan('hello @OpenGUI', 8)).toBeUndefined()
  })

  it('recognizes non-empty direct slash commands before Host status polling', () => {
    expect(directOpenGuiTask('/opengui inspect phone')).toBe('inspect phone')
    expect(directOpenGuiTask('/coremate legacy task')).toBe('legacy task')
    expect(directOpenGuiTask('/opengui')).toBeUndefined()
    expect(directOpenGuiTask('/help opengui')).toBeUndefined()
  })

  it('does not consume a session until the direct slash command is submitted', () => {
    expect(submittedDirectOpenGuiTask('/opengui inspect phone', 'plain')).toBeUndefined()
    expect(submittedDirectOpenGuiTask('/opengui inspect phone', 'adjudicating')).toBeUndefined()
    expect(submittedDirectOpenGuiTask('/opengui inspect phone', 'submitting')).toBe('inspect phone')
  })
})
