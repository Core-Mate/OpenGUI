import type {
  ConversationContextReader,
  ConversationMatch,
  ConversationNodeContext,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import {
  coremateCommandContextDefinition,
  corematePromotionDefinition,
  coremateSuggestionDefinition,
  selectCorematePromotion,
} from '../src/client/promotion-data.ts'

function event<T extends SessionEvent['type']>(
  type: T,
  data: Extract<SessionEvent, { type: T }>['data'],
  seq: number,
): Extract<SessionEvent, { type: T }> {
  return { type, data, seq, time: seq } as Extract<SessionEvent, { type: T }>
}

function match(value: SessionEvent, role: 'start' | 'update'): ConversationMatch {
  return { event: value, role, location: { kind: 'session' }, view: undefined }
}

function context<State>(state?: State): ConversationNodeContext<State> {
  return {
    key: 'test', kind: 'test', id: 'test', matches: [], start: undefined,
    state, current: new Map(),
  }
}

function commandState(name = 'opengui', doneSeq?: number): ConversationContextReader {
  return {
    previous: () => ({
      key: 'command', kind: 'coremate-command-context', id: 'command-1', startSeq: 1,
      state: { name, runSeq: 1, ...(doneSeq === undefined ? {} : { doneSeq }) }, matches: [],
    }),
  } as ConversationContextReader
}

describe('OpenGUI completion promotion', () => {
  const assistant = (seq: number, turn = 4) => match(event('assistant/message', {
    turn,
    step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text: '完成。' }], source: { provider: 'test', model: 'vision' } }),
  }, seq), 'start')

  it('publishes one success marker only after command/done names the final assistant message', () => {
    expect(corematePromotionDefinition.kind).toBe('coremate-promotion')
    const start = assistant(2)
    const initial = corematePromotionDefinition.start(context(), start, commandState())
    expect(corematePromotionDefinition.buildLocationData?.(context(initial), 'turn')).toBeNull()
    const done = match(event('command/done', {
      commandId: 'command-1' as never, kind: 'success', sourceEventSeq: 2,
    }, 3), 'update')
    const completed = corematePromotionDefinition.update(context(initial) as never, done)

    expect(corematePromotionDefinition.buildLocationData?.(context(completed), 'turn')).toEqual({
      kind: 'turn', turn: 4, key: 'coremate-promotion',
      value: { task: 'coremate', status: 'success', suggestions: [] },
    })
  })

  it('still attributes turns launched through the legacy /coremate alias', () => {
    const start = assistant(2, 5)
    const initial = corematePromotionDefinition.start(context(), start, commandState('coremate'))
    expect(initial.attributed).toBe(true)
  })

  it.each([
    ['failed command', 'opengui', undefined, 'error'],
    ['another command', 'help', undefined, 'success'],
    ['finished configuration command', 'opengui', 1, 'success'],
  ] as const)('does not publish for %s', (_label, name, doneSeq, kind) => {
    const start = assistant(2, 2)
    const initial = corematePromotionDefinition.start(context(), start, commandState(name, doneSeq))
    const done = match(event('command/done', {
      commandId: 'command-1' as never, kind, sourceEventSeq: 2,
    }, 3), 'update')
    const finished = corematePromotionDefinition.update(context(initial) as never, done)

    expect(corematePromotionDefinition.buildLocationData?.(context(finished), 'turn')).toBeNull()
  })

  it('marks a command inactive on command/done and lets the pure slot selector decline missing data', () => {
    const run = match(event('command/run', {
      commandId: 'command-1' as never, name: 'opengui', source: 'user',
    }, 1), 'start')
    const initial = coremateCommandContextDefinition.start(context(), run, { previous: () => undefined })
    const done = match(event('command/done', {
      commandId: 'command-1' as never, kind: 'success', sourceEventSeq: 1,
    }, 2), 'update')
    const finished = coremateCommandContextDefinition.update(context(initial) as never, done)

    expect(finished).toEqual({ name: 'opengui', runSeq: 1, doneSeq: 2, doneKind: 'success' })
    expect(selectCorematePromotion({
      turn: { data: { get: () => undefined } },
    } as never)).toBeNull()
  })

  it('binds validated model suggestions to the owning turn and combines them with one promotion', () => {
    const message = match(event('assistant/message', {
      turn: 7,
      step: 2,
      message: createAssistantMessage({
        content: [{ type: 'text', text: `完成。\n<!--coremate-suggestions\n{"items":[{"label":"继续检查","prompt":"继续检查其余页面"},{"label":"整理报告","prompt":"整理完整测试报告"}]}\n-->` }],
        source: { provider: 'test', model: 'vision' },
      }),
    }, 8), 'start')
    const state = coremateSuggestionDefinition.start(context(), message, { previous: () => undefined })
    expect(coremateSuggestionDefinition.buildLocationData?.(context(state), 'turn')).toEqual({
      kind: 'turn', turn: 7, key: 'coremate-suggestions',
      value: { items: [
        { label: '继续检查', prompt: '继续检查其余页面' },
        { label: '整理报告', prompt: '整理完整测试报告' },
      ] },
    })
    expect(selectCorematePromotion({
      turn: { data: { get: (key: string) => key === 'coremate-promotion'
        ? { task: 'coremate', status: 'success', suggestions: [] }
        : { items: state.items } } },
    } as never)).toMatchObject({ suggestions: state.items })
  })
})
