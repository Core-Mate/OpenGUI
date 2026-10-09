import { describe, expect, it } from 'vitest'
import { errorInfo, OpenGuiError } from '../src/errors.ts'

describe('error classification', () => {
  it('uses the explicit code prefix of plain errors instead of guessing from the detail text', () => {
    expect(errorInfo(new Error('waiting_for_frame: visible decoded video is required before observation or action'))).toMatchObject({ code: 'waiting_for_display', recovery: 'wait' })
    expect(errorInfo(new Error('model_selection_required: explicitly choose an available model or follow WorkBuddy before control'))).toMatchObject({ code: 'model_selection_required', recovery: 'wait' })
    expect(errorInfo(new Error('execution_budget_started: the initial budget cannot change after work began'))).toMatchObject({ code: 'execution_budget_started', recovery: 'replan' })
    expect(errorInfo(new Error('test_step_required: bind this check to a plan step'))).toMatchObject({ code: 'test_step_required', recovery: 'replan' })
    expect(errorInfo(new Error('display_timeout: no verified frame within 30 seconds'))).toMatchObject({ code: 'display_timeout', recovery: 'stop' })
  })

  it('keeps structured errors and unprefixed fallbacks unchanged', () => {
    expect(errorInfo(new OpenGuiError('task_paused', 'opengui: paused', 'outcome_unknown', 'observe'))).toMatchObject({ code: 'task_paused', executionState: 'outcome_unknown', recovery: 'observe' })
    expect(errorInfo(new Error('opengui: device offline'))).toMatchObject({ code: 'device_offline', recovery: 'wait' })
    expect(errorInfo(new Error('ECONNRESET'))).toMatchObject({ code: 'connection_lost', recovery: 'reconnect' })
    expect(errorInfo('something odd')).toMatchObject({ code: 'operation_failed', recovery: 'stop' })
  })
})
