/** Runtime bridges for the supported pre-0.1.5 and 0.1.5 DSH APIs. */
import * as llm from '@deepseek-ai/dsh-llm'
import * as settings from '@deepseek-ai/dsh-settings'
import type { Session, SessionEvent, SessionSeq as Seq } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'

export type CallId = ToolCallId
export const CallId: (value: string) => CallId = Reflect.get(llm, 'ToolCallId') ?? Reflect.get(llm, 'CallId')

export function SessionSeq(value: number): Seq {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(`SessionSeq must be a non-negative safe integer, got ${String(value)}`)
  }
  return value as Seq
}

export function snapshotEvents(session: Session): readonly SessionEvent[] {
  return typeof session.snapshotEvents === 'function'
    ? session.snapshotEvents()
    : (session as unknown as { events: readonly SessionEvent[] }).events
}

export const installSettingsSection: SettingsProvider['installSection'] = (...args) => {
  const [ctx] = args
  if (typeof ctx.settings.installSection === 'function') return ctx.settings.installSection(...args)
  const install = Reflect.get(settings, 'installSettingsSection') as SettingsProvider['installSection']
  return install(...args)
}

/** Nested activity was renamed along with the session snapshot API. */
export function dispatchEvent(session: Session, completed: boolean): 'tool/ptc-dispatch' | 'tool/ptc-dispatch-start' {
  const prefix = typeof session.snapshotEvents === 'function' ? 'tool/ptc-dispatch' : 'tool/code-dispatch'
  return `${prefix}${completed ? '' : '-start'}` as 'tool/ptc-dispatch' | 'tool/ptc-dispatch-start'
}
