export type ExecutionState = 'not_executed' | 'executed' | 'outcome_unknown'
export type Recovery = 'observe' | 'reconnect' | 'wait' | 'replan' | 'stop'

/** Structured execution evidence, never an instruction to replay a mutation. */
export class OpenGuiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly executionState: ExecutionState = 'not_executed',
    readonly recovery: Recovery = 'stop',
  ) { super(message); this.name = 'OpenGuiError' }
}

// Plain `code: detail` errors name their own cause. Waiting codes need a person in the
// workbench; terminal codes cannot be fixed by the agent; every other prefixed code is a
// rejected argument or ordering the agent can correct without ending the task.
const WAITING_CODES = new Set(['start_required', 'model_selection_required', 'login_required', 'review_pending', 'comment_replacement_required', 'device_unavailable', 'account_change_in_progress'])
const TERMINAL_CODES = new Set(['display_timeout', 'task_ended', 'session_ended', 'different_task_active', 'foreign_account', 'account_changed', 'device_frozen', 'environment_frozen', 'test_result_immutable', 'upgrade_blocked'])
const CODE_ALIASES: Record<string, string> = { waiting_for_frame: 'waiting_for_display' }

export function errorInfo(error: unknown): { code: string; message: string; executionState: ExecutionState; recovery: Recovery } {
  if (error instanceof OpenGuiError) return { code: error.code, message: error.message, executionState: error.executionState, recovery: error.recovery }
  const message = error instanceof Error ? error.message : String(error)
  const prefixed = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)+):/u.exec(message)?.[1]
  if (prefixed) {
    const code = CODE_ALIASES[prefixed] ?? prefixed
    const recovery: Recovery = code === 'waiting_for_display' || WAITING_CODES.has(code) ? 'wait' : TERMINAL_CODES.has(code) ? 'stop' : 'replan'
    return { code, message, executionState: 'not_executed', recovery }
  }
  const code = /stale|observe.*before|observation.*unavailable|current frame/u.test(message) ? 'observation_required'
    : /invalid arguments|unknown tool|must be|is required/u.test(message) ? 'invalid_arguments'
    : /waiting_for_display/u.test(message) ? 'waiting_for_display'
    : /no screen progress|repeated action/u.test(message) ? 'no_progress'
    : /operation.*limit|budget/u.test(message) ? 'budget_exhausted'
    : /device offline|device not found|not connected/u.test(message) ? 'device_offline'
    : /disconnected|ECONNRESET|EPIPE|ECONNREFUSED/u.test(message) ? 'connection_lost'
    : /locked by another/u.test(message) ? 'device_busy'
    : /cancelled|aborted|session is closed/u.test(message) ? 'cancelled' : 'operation_failed'
  const recovery: Recovery = code === 'observation_required' ? 'observe'
    : code === 'connection_lost' ? 'reconnect'
    : code === 'waiting_for_display' || code === 'device_busy' || code === 'device_offline' ? 'wait'
    : code === 'invalid_arguments' || code === 'no_progress' ? 'replan' : 'stop'
  return { code, message, executionState: 'not_executed', recovery }
}

/** Retry only explicitly transient, non-mutating work. */
export async function retryRead<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try { return await operation() } catch (error) {
      if (signal.aborted || attempt >= 2 || !/ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|fetch failed|device offline|device .*not found|transport error|temporarily unavailable/iu.test(String(error))) throw error
      await new Promise<void>((resolve, reject) => {
        const abort = (): void => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, attempt === 0 ? 250 : 1000)
        signal.addEventListener('abort', abort, { once: true })
      })
    }
  }
}
