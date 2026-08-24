import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { CorematePromotionCard } from './CorematePromotionCard.tsx'
import { CoremateClaimBridge, type CoremateDraftActions } from './CoremateClaimBridge.tsx'
import { CoremateView } from './CoremateView.tsx'
import { CoremateTaskNotice } from './CoremateTaskNotice.tsx'
import {
  coremateCommandContextDefinition,
  corematePromotionDefinition,
  coremateSuggestionDefinition,
  selectCorematePromotion,
} from './promotion-data.ts'
import { TaskStopButton } from './TaskStopButton.tsx'
import { coremateCommandClaim, coremateTriggerSource } from './coremate-trigger.ts'
import { installActiveTaskSessionBridge } from './session-bridge.ts'
import { coremateTaskStatusStore } from './task-status-store.ts'

export const inject = ['slots', 'conversationEvents', 'inputTriggers', 'sessions', 'workspaces']

interface ConversationInputDockSlots {
  inject(name: 'conversation.input.dock', effect: () => () => void): void
  register(
    options: { name: 'conversation.input.dock'; id: string; order: number },
    component: typeof CoremateTaskNotice,
  ): () => void
}

interface CoremateClaimSlots {
  inject(name: 'conversation.input.dock', effect: () => () => void): void
  register(
    options: { name: 'conversation.input.dock'; id: string; order: number },
    component: typeof CoremateClaimBridge,
  ): () => void
}

interface ConversationInputSlots {
  inject(name: 'conversation.input.right', effect: () => () => void): void
  register(
    options: { name: 'conversation.input.right'; id: string; order: number },
    component: typeof TaskStopButton,
  ): () => void
}

interface ConversationTurnTailSlots {
  inject(name: 'conversation.chat.turnTail', effect: () => () => void): void
  register(
    options: {
      name: 'conversation.chat.turnTail'
      select: typeof selectCorematePromotion
      priority?: number
    },
    component: typeof CorematePromotionCard,
  ): () => void
}

interface ConversationViewSlots {
  inject(name: 'conversation.view', effect: () => () => void): void
  register(
    options: { name: 'conversation.view'; id: string; order: number; label: string },
    component: typeof CoremateView,
  ): () => void
}

/** Add OpenGUI's command, task controls, promotion card, and dedicated workbench. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(coremateCommandContextDefinition)
  ctx.conversationEvents.register(corematePromotionDefinition)
  ctx.conversationEvents.register(coremateSuggestionDefinition)
  ctx.effect(() => ctx.inputTriggers.registerSource(coremateTriggerSource(ctx)))
  ctx.effect(() => coremateTaskStatusStore.connect())
  ctx.effect(() => installActiveTaskSessionBridge(ctx, coremateTaskStatusStore))
  ctx.effect(() => (ctx.sessions as unknown as ISessions).provide({
    props: ['coremateDraftActions', 'coremateSessionId', 'coremateSessions'],
    resolve(binding) {
      const coremateDraftActions: CoremateDraftActions = {
        claim(span) {
          const claimed = binding.ctx.bail(binding.ctx, 'slash/input-begin-command', {
            claim: coremateCommandClaim(ctx, { sessionId: binding.sessionId }),
            span,
          }) === true
          // Programmatic/pasted mentions can still have an @ candidate menu
          // open. Close it after claiming so the next Enter submits the command
          // instead of picking the already-applied candidate a second time.
          if (claimed) ctx.inputTriggers.sessionOf(binding.ctx).dismiss()
          return claimed
        },
      }
      return { props: { coremateDraftActions, coremateSessionId: String(binding.sessionId), coremateSessions: ctx.sessions } }
    },
  }))
  // ui-conversation declares this optional child slot at runtime; registering
  // through inject keeps this plugin load-order independent.
  const claimSlots = ctx.slots as unknown as CoremateClaimSlots
  claimSlots.inject('conversation.input.dock', () => claimSlots.register({
    name: 'conversation.input.dock',
    id: 'coremate-command-claim',
    order: -110,
  }, CoremateClaimBridge))
  const inputDockSlots = ctx.slots as unknown as ConversationInputDockSlots
  inputDockSlots.inject('conversation.input.dock', () => inputDockSlots.register({
    name: 'conversation.input.dock',
    id: 'coremate-active-task-notice',
    order: -80,
  }, CoremateTaskNotice))
  const inputSlots = ctx.slots as unknown as ConversationInputSlots
  inputSlots.inject('conversation.input.right', () => inputSlots.register({
    name: 'conversation.input.right',
    id: 'coremate-mobile-stop',
    order: 100,
  }, TaskStopButton))
  const turnTailSlots = ctx.slots as unknown as ConversationTurnTailSlots
  turnTailSlots.inject('conversation.chat.turnTail', () => turnTailSlots.register({
    name: 'conversation.chat.turnTail',
    select: selectCorematePromotion,
    priority: 20,
  }, CorematePromotionCard))
  const viewSlots = ctx.slots as unknown as ConversationViewSlots
  viewSlots.inject('conversation.view', () => viewSlots.register({
    name: 'conversation.view',
    id: 'coremate',
    order: 10,
    label: 'OpenGUI',
  }, CoremateView))
}
