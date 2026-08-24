import { describe, expect, it } from 'vitest'
import { coremateClaimSpan } from '../src/client/CoremateClaimBridge.tsx'

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
})
