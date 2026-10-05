export interface CommentBudgetInput { targetCount?: number; maxDurationSeconds?: number }
export interface CommentBudget extends CommentBudgetInput {
  startedAt: string
  deadlineAt?: string
  stoppedAt?: string
  stopReason?: 'target_reached' | 'time_limit'
}
export interface DraftVersion {
  version: number
  source: 'generated' | 'human' | 'platform'
  draft: string
  savedAt: string
  evidenceObservationId?: string
}
export interface ReviewDecision {
  decision: 'approve' | 'skip'
  contentVersion: number
  decidedAt: string
  reason?: string
}
export interface PlatformInput {
  version: number
  text?: string | undefined
  source: 'model_observation' | 'device_clipboard'
  status: 'empty' | 'matches' | 'differs' | 'unreadable'
  evidenceObservationId: string
  readAt: string
  contentVersion: number
}
export interface ReplacementDecision {
  decision: 'replace' | 'keep'
  platformVersion: number
  contentVersion: number
  originalText: string
  decidedAt: string
  usedAt?: string | undefined
}
export interface InputAttempt {
  contentVersion: number
  platformVersion: number
  beforeObservationId: string
  startedAt: string
  outcome: 'pending' | 'executed' | 'unknown'
  afterObservationId?: string | undefined
}
export const commentBudgetSchema = {
  type: 'object', additionalProperties: false,
  properties: { targetCount: { type: 'integer', minimum: 1, maximum: 100 }, maxDurationSeconds: { type: 'integer', minimum: 1, maximum: 86400 } },
  minProperties: 1,
}
export function createCommentBudget(input: CommentBudgetInput, now: number): CommentBudget {
  if (!input || Object.keys(input).some(key => !['targetCount', 'maxDurationSeconds'].includes(key)) ||
    (!input.targetCount && !input.maxDurationSeconds) ||
    (input.targetCount !== undefined && (!Number.isInteger(input.targetCount) || input.targetCount < 1 || input.targetCount > 100)) ||
    (input.maxDurationSeconds !== undefined && (!Number.isInteger(input.maxDurationSeconds) || input.maxDurationSeconds < 1 || input.maxDurationSeconds > 86400))) throw new Error('invalid_comment_budget')
  return { ...input, startedAt: new Date(now).toISOString(), ...(input.maxDurationSeconds ? { deadlineAt: new Date(now + input.maxDurationSeconds * 1000).toISOString() } : {}) }
}

export function commentSummary(reviews: readonly { status: string }[], budget?: CommentBudget) {
  const count = (status: string) => reviews.filter(review => review.status === status).length
  const sent = count('sent'), submitted = count('submitted'), unknown = count('unknown'), reserved = sent + submitted + unknown
  return { total: reviews.length, sent, submitted, unknown, pending: count('pending'), approved: count('approved'), skipped: count('skipped'), reserved,
    ...(budget?.targetCount ? { targetCount: budget.targetCount, remainingTarget: Math.max(0, budget.targetCount - sent), availableSlots: Math.max(0, budget.targetCount - reserved) } : {}),
    ...(budget?.deadlineAt ? { deadlineAt: budget.deadlineAt } : {}), ...(budget?.stopReason ? { stopReason: budget.stopReason } : {}) }
}
