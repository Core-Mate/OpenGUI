import { describe, expect, it } from 'vitest'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { relayNestedTaskProgress, relayPhoneTaskProgress } from '../src/phone-progress.ts'
import { CallId, SessionSeq, snapshotEvents } from '../src/dsh-api.ts'

function legacySession() {
  const events: any[] = []
  const session = {
    events,
    append(type: string, data: unknown, options = {}) {
      const event = { seq: events.length, type, data, ...options }
      events.push(event)
      return event
    },
  }
  return session as unknown as Session & { events: any[] }
}

describe('legacy DSH execution compatibility', () => {
  it('relays legacy streaming chunks and remaps final message sources', () => {
    const parent = legacySession()
    parent.append('todo/write', { todos: [] })
    let publish!: (event: SessionEvent) => void
    const relay = relayPhoneTaskProgress({ parent, initialEvents: [], subscribe(listener) { publish = listener; return () => {} } })
    const send = (seq: number, type: string, data: unknown, extra = {}) => publish({ seq, type, data, ...extra } as SessionEvent)
    send(0, 'turn/start', { turn: 1 })
    send(1, 'step/start', { turn: 1, step: 1 })
    send(2, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'Opening phone' } })
    expect(parent.events.at(-1)).toMatchObject({ type: 'assistant/chunk', data: { chunk: { text: 'Opening phone' } } })
    send(3, 'assistant/message', { turn: 1, step: 1, message: { content: [] } }, { sourceEventSeqs: [2] })
    expect(parent.events.at(-1)).toMatchObject({ type: 'assistant/message', sourceEventSeqs: [3] })
    relay.dispose()
    expect(parent.events.slice(-2).map(event => event.type)).toEqual(['step/end', 'turn/end'])
    expect(snapshotEvents(parent)).toEqual(parent.events)
  })

  it('uses the legacy nested event names and closes unfinished tool cards', () => {
    const parent = legacySession()
    const stop = relayNestedTaskProgress({ parent, sourceId: 'phone', rootCallId: CallId('root'),
      initialEvents: [{ seq: 0, type: 'tool/call', data: { callId: CallId('child'), name: 'phone_control', arguments: '{}' } } as SessionEvent],
      subscribe() { return () => {} },
    })
    expect(parent.events[0].type).toBe('tool/code-dispatch-start')
    stop()
    expect(parent.events[1]).toMatchObject({ type: 'tool/code-dispatch', data: { isError: true } })
  })

  it('rejects invalid sequence values on every supported host', () => {
    for (const value of [-1, -0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => SessionSeq(value)).toThrow()
    expect(SessionSeq(0)).toBe(0)
    expect(SessionSeq(12)).toBe(12)
  })
})
