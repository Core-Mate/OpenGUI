import { expect, it } from 'vitest'
import { validateToolArguments } from '../src/codex/tools.ts'

it('accepts host planning and step decisions through the CLI argument schema', () => {
  const decisions = [
    { kind: 'branches', branches: [{ goal: 'Read settings', successCriteria: 'Version visible', eligibleDeviceIds: ['phone'] }] },
    { operation: 'observe' },
    { operation: 'act', input: { action: 'tap', observationId: 'frame', targetBBox: { left: 1, top: 2, right: 3, bottom: 4 }, externalSideEffect: 'none' } },
    { operation: 'help', reason: 'Unlock the phone' },
    { operation: 'finish', outcome: 'completed', summary: 'Visible', checks: [{ criterion: 'Version visible', status: 'passed', evidenceId: 'frame' }] },
  ]
  for (const decision of decisions) expect(() => validateToolArguments('opengui_manage_task', { action: 'decide', taskId: 'task', decisionId: 'decision', decision })).not.toThrow()
})

it('keeps the decision envelope closed and requires an object decision', () => {
  for (const decision of [null, [], 'observe', 3]) {
    expect(() => validateToolArguments('opengui_manage_task', { action: 'decide', decision })).toThrow('invalid arguments.decision')
  }
  expect(() => validateToolArguments('opengui_manage_task', { action: 'decide', decision: { operation: 'observe' }, unknown: true })).toThrow('invalid arguments')
})

it('retains strict validation for device actions and nested bounding boxes', () => {
  const input = { sessionId: 'session', action: 'tap', observationId: 'frame', externalSideEffect: 'none', targetBBox: { left: 1, top: 2, right: 3, bottom: 4 } }
  expect(() => validateToolArguments('opengui_act', input)).not.toThrow()
  expect(() => validateToolArguments('opengui_act', { ...input, targetBBox: { ...input.targetBBox, extra: 1 } })).toThrow()
  expect(() => validateToolArguments('opengui_act', { ...input, targetBBox: { ...input.targetBBox, left: '1' } })).toThrow()
})
