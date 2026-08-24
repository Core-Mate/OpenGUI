/** Relay OpenGUI child-agent activity into the user-visible parent conversation. */

import { CallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

export interface PhoneTaskProgressSource {
  readonly initialEvents: readonly SessionEvent[]
  readonly subscribe: (listener: (event: SessionEvent) => void) => () => void
  readonly parent: Session
}

const RELAYED_TYPES = new Set<SessionEvent['type']>([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'assistant/chunk',
  'assistant/message',
  'tool/call',
  'tool/result',
  'tool/code-dispatch-start',
  'tool/code-dispatch',
])

function nextTurn(session: Session): number {
  let next = 1
  let open: number | undefined
  for (const event of session.events) {
    if (event.type === 'turn/start') {
      open = event.data.turn
      next = Math.max(next, event.data.turn + 1)
    } else if (event.type === 'turn/end' && event.data.turn === open) {
      open = undefined
    }
  }
  if (open !== undefined) {
    throw new Error(`coremate-mobile: cannot publish phone progress while parent turn ${open} is open`)
  }
  return next
}

type RelayedSurfaceEvent = Extract<SessionEvent, { type: 'assistant/message' | 'tool/result' }>

function mappedSources(event: RelayedSurfaceEvent, seqs: ReadonlyMap<number, number>): number[] | undefined {
  if (event.sourceEventSeqs === undefined) return undefined
  const mapped = event.sourceEventSeqs.map(seq => seqs.get(seq))
  if (mapped.some(seq => seq === undefined)) return undefined
  return mapped as number[]
}

/**
 * Mirror the live, user-visible execution events from one child session.
 * The returned disposer also repairs a partially mirrored turn when the child
 * is cancelled before it can publish its own closing boundaries.
 */
export function relayPhoneTaskProgress(source: PhoneTaskProgressSource): () => void {
  const seen = new Set<number>()
  const turns = new Map<number, number>()
  const seqs = new Map<number, number>()
  let nextParentTurn = nextTurn(source.parent)
  let openTurn: { child: number, parent: number } | undefined
  let openStep: { child: number, parent: number, step: number } | undefined
  let stopped = false

  const parentTurn = (childTurn: number): number => {
    const existing = turns.get(childTurn)
    if (existing !== undefined) return existing
    const allocated = nextParentTurn++
    turns.set(childTurn, allocated)
    return allocated
  }

  const relay = (event: SessionEvent): void => {
    if (stopped || seen.has(event.seq)) return
    seen.add(event.seq)
    if (!RELAYED_TYPES.has(event.type)) return

    let mirrored
    switch (event.type) {
      case 'turn/start': {
        const turn = parentTurn(event.data.turn)
        mirrored = source.parent.append('turn/start', { turn })
        openTurn = { child: event.data.turn, parent: turn }
        break
      }
      case 'turn/end': {
        const turn = parentTurn(event.data.turn)
        mirrored = source.parent.append('turn/end', { turn, reason: event.data.reason })
        if (openTurn?.child === event.data.turn) openTurn = undefined
        break
      }
      case 'step/start': {
        const turn = parentTurn(event.data.turn)
        mirrored = source.parent.append('step/start', { turn, step: event.data.step })
        openStep = { child: event.data.turn, parent: turn, step: event.data.step }
        break
      }
      case 'step/end': {
        const turn = parentTurn(event.data.turn)
        mirrored = source.parent.append('step/end', { turn, step: event.data.step })
        if (openStep?.child === event.data.turn && openStep.step === event.data.step) openStep = undefined
        break
      }
      case 'assistant/chunk':
        mirrored = source.parent.append('assistant/chunk', {
          ...event.data,
          turn: parentTurn(event.data.turn),
        })
        break
      case 'assistant/message': {
        const sourceEventSeqs = mappedSources(event, seqs)
        mirrored = source.parent.append('assistant/message', {
          ...event.data,
          turn: parentTurn(event.data.turn),
        }, {
          surfaceOp: 'append',
          ...(sourceEventSeqs === undefined ? {} : { sourceEventSeqs }),
        })
        break
      }
      case 'tool/call':
        mirrored = source.parent.append('tool/call', {
          ...event.data,
          turn: parentTurn(event.data.turn),
        })
        break
      case 'tool/result': {
        const sourceEventSeqs = mappedSources(event, seqs)
        mirrored = source.parent.append('tool/result', {
          ...event.data,
          turn: parentTurn(event.data.turn),
        }, {
          surfaceOp: 'append',
          ...(sourceEventSeqs === undefined ? {} : { sourceEventSeqs }),
        })
        break
      }
      case 'tool/code-dispatch-start':
        mirrored = source.parent.append('tool/code-dispatch-start', event.data)
        break
      case 'tool/code-dispatch':
        mirrored = source.parent.append('tool/code-dispatch', event.data)
        break
    }
    if (mirrored !== undefined) seqs.set(event.seq, mirrored.seq)
  }

  // Subscribe before replaying the snapshot: an append after subscription is
  // either replayed and then deduplicated, or delivered live, but never missed.
  const unsubscribe = source.subscribe(relay)
  try {
    for (const event of source.initialEvents) relay(event)
  } catch (error) {
    unsubscribe()
    throw error
  }

  return () => {
    if (stopped) return
    stopped = true
    unsubscribe()
    if (openStep !== undefined) {
      source.parent.append('step/end', { turn: openStep.parent, step: openStep.step })
      openStep = undefined
    }
    if (openTurn !== undefined) {
      source.parent.append('turn/end', {
        turn: openTurn.parent,
        reason: { kind: 'interrupted' },
      })
      openTurn = undefined
    }
  }
}

export interface NestedTaskProgressSource {
  readonly initialEvents: readonly SessionEvent[]
  readonly subscribe: (listener: (event: SessionEvent) => void) => () => void
  /** The session containing the currently running phone_agent/browser_agent call. */
  readonly parent: Session
  readonly rootCallId: CallId
  /** Stable child identity used to avoid call-id collisions across selected phones. */
  readonly sourceId: string
}

interface NestedCall {
  readonly subCallId: CallId
  readonly name: string
  readonly arguments: unknown
}

function parsedArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { raw }
  }
}

function unfinishedContent(name: string): ContentBlock[] {
  return [{ type: 'text', text: `${name} 已结束，但没有返回可展示的结果。` }]
}

/**
 * Project one nested OpenGUI agent's tool activity under its outer agent call.
 * These log-only events are rendered live by Harness but never enter model context,
 * so users see the execution process without duplicating it into the LLM history.
 */
export function relayNestedTaskProgress(source: NestedTaskProgressSource): () => void {
  const seen = new Set<number>()
  const open = new Map<string, NestedCall>()
  let stopped = false

  const relay = (event: SessionEvent): void => {
    if (stopped || seen.has(event.seq)) return
    seen.add(event.seq)
    if (event.type === 'tool/call') {
      const originalCallId = String(event.data.callId)
      const nested: NestedCall = {
        subCallId: CallId(`${String(source.rootCallId)}:coremate:${source.sourceId}:${originalCallId}`),
        name: event.data.name,
        arguments: parsedArguments(event.data.arguments),
      }
      open.set(originalCallId, nested)
      source.parent.append('tool/code-dispatch-start', {
        rootCallId: source.rootCallId,
        parentCallId: source.rootCallId,
        ...nested,
      })
      return
    }
    if (event.type !== 'tool/result') return
    const originalCallId = String(event.data.message.source.callId)
    const nested = open.get(originalCallId)
    if (nested === undefined) return
    open.delete(originalCallId)
    const result = event.data.message.content[0]
    source.parent.append('tool/code-dispatch', {
      rootCallId: source.rootCallId,
      parentCallId: source.rootCallId,
      ...nested,
      isError: result.isError === true || event.data.error !== undefined,
      content: result.content,
    })
  }

  const unsubscribe = source.subscribe(relay)
  try {
    for (const event of source.initialEvents) relay(event)
  } catch (error) {
    unsubscribe()
    throw error
  }

  return () => {
    if (stopped) return
    stopped = true
    unsubscribe()
    for (const nested of open.values()) {
      source.parent.append('tool/code-dispatch', {
        rootCallId: source.rootCallId,
        parentCallId: source.rootCallId,
        ...nested,
        isError: true,
        content: unfinishedContent(nested.name),
      })
    }
    open.clear()
  }
}
