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

export function errorInfo(error: unknown): { code: string; message: string; executionState: ExecutionState; recovery: Recovery } {
  if (error instanceof OpenGuiError) return { code: error.code, message: error.message, executionState: error.executionState, recovery: error.recovery }
  const message = error instanceof Error ? error.message : String(error)
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
