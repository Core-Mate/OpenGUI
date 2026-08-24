import type {
  ConversationNodeDefinition,
  ConversationTurnDataMap,
} from '@deepseek-ai/dsh-client-runtime/client'
import { cleanCoremateSuggestionBlocks, type CoremateSuggestion } from '../suggestions.ts'

interface TurnTailOwnerProps {
  readonly turn: {
    readonly data: {
      get<Key extends keyof ConversationTurnDataMap & string>(key: Key): Readonly<ConversationTurnDataMap[Key]> | undefined
    }
  }
}

const COMMAND_CONTEXT_KIND = 'coremate-command-context'

interface CommandContextState {
  readonly name: string
  readonly runSeq: number
  readonly doneSeq?: number
  readonly doneKind?: 'success' | 'error'
}

/** Immutable evidence consumed by the turn-tail selector. */
export interface CorematePromotionData {
  readonly task: 'coremate'
  readonly status: 'success'
  readonly suggestions: readonly CoremateSuggestion[]
}

interface CoremateSuggestionData {
  readonly items: readonly CoremateSuggestion[]
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationTurnDataMap {
    /** A completed Turn attributed to the currently running direct /opengui command. */
    'coremate-promotion': CorematePromotionData
    /** Valid model-generated follow-ups found in the completed assistant message. */
    'coremate-suggestions': CoremateSuggestionData
  }
}

interface PromotionTurnState {
  readonly turn: number
  readonly attributed: boolean
  readonly success: boolean
}

interface SuggestionTurnState {
  readonly turn: number
  readonly items: readonly CoremateSuggestion[]
}

/** Attach validated hidden follow-ups to their owning Turn. */
export const coremateSuggestionDefinition: ConversationNodeDefinition<SuggestionTurnState> = {
  kind: 'coremate-suggestions',
  match(event) {
    if (event.type !== 'assistant/message') return null
    return cleanCoremateSuggestionBlocks(event.data.message.content).suggestions.length > 0
      ? { id: String(event.seq), role: 'start' }
      : null
  },
  start(_context, match) {
    if (match.event.type !== 'assistant/message') throw new Error('OpenGUI suggestions require assistant/message')
    return {
      turn: match.event.data.turn,
      items: cleanCoremateSuggestionBlocks(match.event.data.message.content).suggestions,
    }
  },
  update(context) {
    return context.state
  },
  buildLocationData(context, scope) {
    if (scope !== 'turn' || context.state === undefined) return null
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'coremate-suggestions',
      value: { items: context.state.items },
    }
  },
}

/** Track whether the nearest direct command is still running. */
export const coremateCommandContextDefinition: ConversationNodeDefinition<CommandContextState> = {
  kind: COMMAND_CONTEXT_KIND,
  match(event) {
    if (event.type === 'command/run') return { id: String(event.data.commandId), role: 'start' }
    if (event.type === 'command/done') return { id: String(event.data.commandId), role: 'update' }
    return null
  },
  start(_context, match) {
    if (match.event.type !== 'command/run') throw new Error('OpenGUI command context requires command/run')
    return { name: match.event.data.name, runSeq: match.event.seq }
  },
  update(context, match) {
    if (match.event.type !== 'command/done') return context.state
    return { ...context.state, doneSeq: match.event.seq, doneKind: match.event.data.kind }
  },
  publication: () => 'none',
}

/** Publish only the final assistant message named by a successful direct command. */
export const corematePromotionDefinition: ConversationNodeDefinition<PromotionTurnState> = {
  kind: 'coremate-promotion',
  match(event) {
    if (event.type === 'assistant/message') return { id: String(event.seq), role: 'start' }
    if (event.type === 'command/done' && event.data.sourceEventSeq !== undefined) {
      return { id: String(event.data.sourceEventSeq), role: 'update' }
    }
    return null
  },
  start(_context, match, reader) {
    if (match.event.type !== 'assistant/message') throw new Error('OpenGUI promotion requires assistant/message')
    const command = reader.previous<CommandContextState>(COMMAND_CONTEXT_KIND)
    const messageSeq = match.event.seq
    return {
      turn: match.event.data.turn,
      attributed: command !== undefined && ['opengui', 'coremate'].includes(command.state.name)
        && command.state.runSeq < messageSeq
        && (command.state.doneSeq === undefined || messageSeq < command.state.doneSeq),
      success: false,
    }
  },
  update(context, match) {
    return match.event.type === 'command/done'
      ? { ...context.state, success: match.event.data.kind === 'success' }
      : context.state
  },
  publication: match => match.event.type === 'command/done' ? 'immediate' : 'none',
  buildLocationData(context, scope) {
    if (scope !== 'turn' || context.state?.attributed !== true || context.state.success !== true) return null
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'coremate-promotion',
      value: { task: 'coremate', status: 'success', suggestions: [] },
    }
  },
}

/** Pure chain selector, so failed, cancelled and unrelated Turns never mount the card. */
export function selectCorematePromotion(owner: TurnTailOwnerProps): ConversationTurnDataMap['coremate-promotion'] | null {
  const promotion = owner.turn.data.get('coremate-promotion')
  if (promotion === undefined) return null
  return {
    ...promotion,
    suggestions: owner.turn.data.get('coremate-suggestions')?.items ?? [],
  }
}
