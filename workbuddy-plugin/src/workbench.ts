import type { ApkRecord } from './apk.ts'
import { requestsPreSubmitStop } from './stop-policy.ts'
import { BASE_EXECUTION_BUDGET, LEGACY_EXECUTION_BUDGET, validatedExecutionBudget, executionBudgetInput, type ExecutionBudget, type ExecutionBudgetInput } from './execution-budget.ts'
import type { InputDiagnostic } from './input-diagnostics.ts'
import { environmentReady, initialEnvironment, type EnvironmentState, type EnvironmentSpec } from './environment.ts'
import { randomUUID } from 'node:crypto'
import type { TaskStep } from './todos.ts'
import type { ConfiguredModel } from './coremate-client.ts'
import { validateTestDefinition, validateTestResult, testSummary, retestComparison, type TestCase, type TestCaseDefinition, type TestCaseResultInput } from './test-cases.ts'
import { commentSummary, createCommentBudget, type CommentBudget, type CommentBudgetInput, type DraftVersion, type ReviewDecision, type PlatformInput, type ReplacementDecision, type InputAttempt } from './comments.ts'

/** Takeover is the only user pause: it stops screenshots and model calls until the person resumes. */
export type BoardAction = 'takeover' | 'resume' | 'recheck' | 'disconnect'
export const handoffCategories = ['password', 'otp', 'payment', 'security', 'login', 'verification', 'other'] as const
export interface HumanHandoff {
  id: string
  category: typeof handoffCategories[number]
  reason: string
  requestedAt: string
  status: 'waiting_user' | 'waiting_observation' | 'resolved'
  resumedAt?: string
  resolvedAt?: string
  evidenceObservationId?: string
}
export interface TraceEntry {
  id: string
  deviceId: string
  kind: string
  startedAt: string
  durationMs?: number
  status: 'running' | 'executed' | 'failed' | 'unknown'
  observationId?: string
  code?: string
  /** A readable name derived from the action itself (never typed text). */
  label?: string
  /** The plan step this entry belonged to. */
  step?: string
}
/** What a reviewed text is published as; posts and messages may repeat on one target, comments may not. */
export type ContentKind = 'post' | 'comment' | 'reply' | 'message'
export const CONTENT_KINDS: readonly ContentKind[] = ['post', 'comment', 'reply', 'message']
export interface CommentReview {
  kind?: ContentKind | undefined
  title?: string | undefined
  platformInput?: PlatformInput | undefined
  replacementDecisions?: ReplacementDecision[] | undefined
  inputAttempts?: InputAttempt[] | undefined
  id: string
  account: string
  target: string
  context: string
  draft: string
  status: 'pending' | 'approved' | 'skipped' | 'submitted' | 'sent' | 'unknown'
  reviewedAt?: string
  evidenceObservationId?: string
  skipReason?: string
  contentVersion?: number
  originalDraft?: string
  submittedAt?: string
  draftVersions?: DraftVersion[]
  decisions?: ReviewDecision[]
  approvedVersion?: number
}
export interface BoardResult {
  outcome: 'completed' | 'blocked' | 'unknown' | 'cancelled' | 'stopped'
  summary?: string
  evidenceObservationIds?: readonly string[]
}
export interface ConnectionRecovery {
  deviceId: string
  detectedAt: string
  status: 'waiting_recheck' | 'waiting_observation' | 'resolved'
  recheckedAt?: string
  resolvedAt?: string
  evidenceObservationId?: string
}
export interface WorkbenchState {
  connectionRecovery?: ConnectionRecovery | undefined
  executionBudget?: ExecutionBudget | undefined
  stopBeforeSubmit?: true | undefined
  /** 发内容前需要审核: chosen on the start page; publishing text requires an approved review. */
  contentReview?: true | undefined
  inputDiagnostic?: InputDiagnostic | undefined
  apk?: ApkRecord | undefined
  environment?: EnvironmentState | undefined
  commentBudget?: CommentBudget | undefined
  handoffs?: HumanHandoff[]
  scenario?: 'general' | 'testing' | 'comments'
  testCases?: TestCase[]
  activeTestCaseId?: string | undefined
  createdAt: string
  objective: string
  /** The person's original chat request, shown for confirmation before execution. */
  request?: string | undefined
  successCriteria: string
  control: Workbench['control']
  result?: BoardResult | undefined
  traces: TraceEntry[]
  reviews: CommentReview[]
  evidenceCount: number
  evidenceFiles: Record<string, string>
  model: string
  modelConfig?: ConfiguredModel | undefined
}
export interface WorkbenchStorage {
  save(): void
  capture(id: string, name: string, data: Buffer): void
  previousComment(account: string, target: string): CommentReview | undefined
}

/** Receipt-backed board data. Never store action payloads or input secrets in the trace. */
export class Workbench {
  connectionRecovery: ConnectionRecovery | undefined
  executionBudget: ExecutionBudget | undefined
  stopBeforeSubmit: true | undefined
  contentReview: true | undefined
  inputDiagnostic: InputDiagnostic | undefined
  apk: ApkRecord | undefined
  environment: EnvironmentState | undefined
  readonly createdAt: string
  readonly traces: TraceEntry[] = []
  readonly reviews: CommentReview[] = []
  readonly testCases: TestCase[] = []
  readonly handoffs: HumanHandoff[] = []
  commentBudget: CommentBudget | undefined
  activeTestCaseId: string | undefined
  scenario: 'general' | 'testing' | 'comments' = 'general'
  readonly evidence = new Map<string, Buffer>()
  objective = ''
  request: string | undefined
  successCriteria = ''
  control: 'idle' | 'agent' | 'paused' | 'manual' | 'reconciling' | 'ended' = 'idle'
  result: BoardResult | undefined
  modelConfig: ConfiguredModel | undefined
  private evidenceBytes = 0
  private readonly evidenceFiles: Record<string, string> = {}
  constructor(state?: WorkbenchState, private readonly storage?: WorkbenchStorage, private readonly now: () => number = Date.now) {
    this.createdAt = state?.createdAt ?? new Date().toISOString()
    if (state) {
      // Archives predating explicit budgets retain their original default and trace usage.
      const operations: Record<string, number> = {}
      for (const trace of state.traces) if (!['model', 'environment', 'apk_inspect'].includes(trace.kind)) operations[trace.deviceId] = (operations[trace.deviceId] ?? 0) + 1
      this.executionBudget = validatedExecutionBudget(state.executionBudget ?? { initialLimits: { operationLimit: LEGACY_EXECUTION_BUDGET, inferenceLimit: LEGACY_EXECUTION_BUDGET }, operationLimit: LEGACY_EXECUTION_BUDGET, inferenceLimit: LEGACY_EXECUTION_BUDGET, operations, extensions: [] })
      this.stopBeforeSubmit = state.stopBeforeSubmit === true ? true : undefined
      this.contentReview = state.contentReview === true ? true : undefined
      this.connectionRecovery = structuredClone(state.connectionRecovery)
      if (this.connectionRecovery && this.connectionRecovery.status !== 'resolved') this.connectionRecovery.status = 'waiting_recheck'
      this.inputDiagnostic = structuredClone(state.inputDiagnostic)
      if (this.inputDiagnostic && this.inputDiagnostic.status !== 'resolved') this.inputDiagnostic.status = 'blocked'
      this.apk = structuredClone(state.apk)
      if (this.apk?.status === 'installing') this.apk.status = 'unknown'
      this.environment = structuredClone(state.environment)
      if (this.environment) this.environment.stale = true
      this.objective = state.objective; this.successCriteria = state.successCriteria; this.request = state.request
      this.result = state.result; this.control = this.result ? 'ended' : 'paused'
      this.modelConfig = state.modelConfig
      this.scenario = state.scenario ?? 'general'
      this.commentBudget = structuredClone(state.commentBudget)
      this.testCases.push(...structuredClone(state.testCases ?? []))
      // A previous handback cannot authorize a restored session without another human decision.
      this.handoffs.push(...structuredClone(state.handoffs ?? []).map(item => item.status === 'resolved' ? item : { ...item, status: 'waiting_user' as const }))
      // A restored case needs a fresh begin and observation; its old result is immutable.
      this.traces.push(...state.traces.map(t => t.status === 'running' ? { ...t, status: 'unknown' as const } : t))
      this.reviews.push(...structuredClone(state.reviews).map(r => r.status === 'approved' ? { ...r, status: 'pending' as const } : r))
      for (const review of this.reviews) {
        // A saved input read and a prior replacement decision do not authorize a restored phone.
        if (review.platformInput) review.platformInput.status = 'unreadable'
        review.replacementDecisions = (review.replacementDecisions ?? []).map(decision => ({ ...decision, usedAt: decision.usedAt ?? 'restored' }))
        review.inputAttempts = (review.inputAttempts ?? []).map(attempt => attempt.outcome === 'pending' ? { ...attempt, outcome: 'unknown' } : attempt)
      }
      Object.assign(this.evidenceFiles, state.evidenceFiles)
    }
  }
  checkpoint(): void { this.storage?.save() }
  blockConnection(deviceId: string): void {
    if (this.connectionRecovery?.deviceId === deviceId && this.connectionRecovery.status === 'waiting_recheck') return
    // Keep the barrier in memory even if durable storage fails.
    this.connectionRecovery = { deviceId, detectedAt: new Date(this.now()).toISOString(), status: 'waiting_recheck' }
    this.checkpoint()
  }
  recheckConnection(deviceId: string): void {
    const previous = this.connectionRecovery
    if (!previous || previous.status === 'resolved') return
    if (previous.deviceId !== deviceId) throw new Error('connection_device_frozen')
    this.connectionRecovery = { ...previous, status: 'waiting_observation', recheckedAt: new Date(this.now()).toISOString() }
    try { this.checkpoint() } catch (error) { this.connectionRecovery = previous; throw error }
  }
  resolveConnection(deviceId: string, observationId: string): void {
    const previous = this.connectionRecovery
    if (!previous || previous.status === 'resolved') return
    if (previous.deviceId !== deviceId) throw new Error('connection_device_frozen')
    if (previous.status !== 'waiting_observation') throw new Error('connection_recheck_required')
    this.connectionRecovery = { ...previous, status: 'resolved', resolvedAt: new Date(this.now()).toISOString(), evidenceObservationId: observationId }
    try { this.checkpoint() } catch (error) { this.connectionRecovery = previous; throw error }
  }
  get operationLimit(): number { return this.executionBudget?.operationLimit ?? BASE_EXECUTION_BUDGET }
  get inferenceLimit(): number { return this.executionBudget?.inferenceLimit ?? BASE_EXECUTION_BUDGET }
  configureExecutionBudget(value: ExecutionBudgetInput): void {
    const input = executionBudgetInput(value)
    const previous = structuredClone(this.executionBudget)
    const initial = this.executionBudget?.initialLimits
    const started = Boolean(this.executionBudget?.extensions.length || this.inferenceCount || Object.values(this.executionBudget?.operations ?? {}).some(count => count > 0) || this.traces.some(trace => !['environment', 'apk_inspect'].includes(trace.kind)))
    if (initial) {
      if ((input.operationLimit === undefined || input.operationLimit === initial.operationLimit) && (input.inferenceLimit === undefined || input.inferenceLimit === initial.inferenceLimit)) return
      if (started || input.operationLimit !== undefined && input.operationLimit > initial.operationLimit || input.inferenceLimit !== undefined && input.inferenceLimit > initial.inferenceLimit) throw new Error('execution_budget_frozen')
    }
    if (started) throw new Error('execution_budget_started: declare the agreed limits before operations')
    const limits = { operationLimit: input.operationLimit ?? initial?.operationLimit ?? BASE_EXECUTION_BUDGET, inferenceLimit: input.inferenceLimit ?? initial?.inferenceLimit ?? BASE_EXECUTION_BUDGET }
    this.executionBudget = { initialLimits: limits, ...limits, operations: {}, extensions: [] }
    try { this.checkpoint() } catch (error) { this.executionBudget = previous; throw error }
  }
  get inferenceCount(): number { return this.traces.filter(trace => trace.kind === 'model').length }
  operationCount(deviceId: string): number {
    return this.executionBudget?.operations[deviceId] ?? this.traces.filter(trace => trace.deviceId === deviceId && !['model', 'environment', 'apk_inspect'].includes(trace.kind)).length
  }
  reserveOperation(deviceId: string, count: number): void {
    this.executionBudget ??= { initialLimits: { operationLimit: BASE_EXECUTION_BUDGET, inferenceLimit: BASE_EXECUTION_BUDGET }, operationLimit: BASE_EXECUTION_BUDGET, inferenceLimit: BASE_EXECUTION_BUDGET, operations: {}, extensions: [] }
    this.executionBudget.operations[deviceId] = count
    this.checkpoint()
  }
  extendExecutionBudget(deviceId: string, additional: number, expectedOperationLimit: number, expectedInferenceLimit: number, now = this.now()): void {
    if (!Number.isInteger(additional) || additional < 1 || additional > 100) throw new Error('invalid_budget_extension')
    if (this.control !== 'ended' || this.result?.outcome !== 'blocked' || this.commentStopReason(now)) throw new Error('budget_extension_unavailable')
    if (this.operationLimit !== expectedOperationLimit || this.inferenceLimit !== expectedInferenceLimit) throw new Error('budget_extension_changed')
    const operations = this.operationCount(deviceId), inference = this.inferenceCount
    if (operations < this.operationLimit && inference < this.inferenceLimit) throw new Error('execution_budget_not_exhausted')
    if ((this.executionBudget?.extensions.length ?? 0) >= 100) throw new Error('budget_extension_capacity')
    const previous = structuredClone(this.executionBudget)
    this.executionBudget = { ...(this.executionBudget?.initialLimits ? { initialLimits: this.executionBudget.initialLimits } : {}), operations: { ...this.executionBudget?.operations, [deviceId]: operations }, operationLimit: operations + additional, inferenceLimit: inference + additional,
      extensions: [...this.executionBudget?.extensions ?? [], { id: randomUUID(), grantedAt: new Date(now).toISOString(), additional, previousOperationLimit: this.operationLimit, previousInferenceLimit: this.inferenceLimit,
        operationLimit: operations + additional, inferenceLimit: inference + additional, previousResult: structuredClone(this.result) }] }
    try { this.checkpoint() } catch (error) { this.executionBudget = previous; throw error }
  }
  blockInput(diagnostic: InputDiagnostic): void {
    // Denied input stays blocked even if the archive cannot be written.
    this.inputDiagnostic = structuredClone(diagnostic)
    this.checkpoint()
  }
  recheckInput(deviceId: string): void {
    const previous = this.inputDiagnostic
    if (!previous || previous.deviceId !== deviceId || previous.status === 'resolved') return
    this.inputDiagnostic = { ...previous, status: 'recheck_pending', recheckedAt: new Date(this.now()).toISOString() }
    try { this.checkpoint() } catch (error) { this.inputDiagnostic = previous; throw error }
  }
  resolveInput(deviceId: string): void {
    const previous = this.inputDiagnostic
    if (!previous || previous.deviceId !== deviceId || previous.status !== 'recheck_pending') return
    this.inputDiagnostic = { ...previous, status: 'resolved', resolvedAt: new Date(this.now()).toISOString() }
    try { this.checkpoint() } catch (error) { this.inputDiagnostic = previous; throw error }
  }
  saveApk(apk: ApkRecord): void {
    const previous = this.apk
    if (previous && (previous.sha256 !== apk.sha256 || previous.deviceId !== apk.deviceId || previous.allowTestApk !== apk.allowTestApk)) throw new Error('apk_frozen: preserve the original package bytes and installation options')
    this.apk = structuredClone(apk)
    try { this.checkpoint() } catch (error) { this.apk = previous; throw error }
  }
  confirmApkUpdate(id: string, sha256: string, existingVersion: string): void {
    const apk = this.apk
    if (!apk || apk.status !== 'prepared' || !apk.existingApp || apk.id !== id || apk.sha256 !== sha256 || (apk.existingApp.version ?? 'unknown') !== existingVersion) throw new Error('apk_update_changed: inspect the current package before confirming')
    this.saveApk({ ...apk, updateApprovedAt: new Date().toISOString() })
  }
  configureEnvironment(spec: EnvironmentSpec, deviceId: string, os: 'android' | 'ios' = 'android'): void {
    if (this.environment) {
      if (this.environment.deviceId !== deviceId || JSON.stringify(this.environment.spec) !== JSON.stringify(spec)) throw new Error('environment_frozen: preserve the original app and prerequisites')
      return
    }
    if (this.traces.some(trace => !['observe', 'model', 'environment'].includes(trace.kind))) throw new Error('environment_started: declare prerequisites before phone actions')
    this.saveEnvironment(initialEnvironment(spec, deviceId, os))
  }
  saveEnvironment(state: EnvironmentState): void {
    const previous = this.environment
    this.environment = structuredClone(state)
    try { this.checkpoint() } catch (error) { this.environment = previous; throw error }
  }
  invalidateEnvironment(): void {
    // Revoke first: a failed durable write must never leave stale readiness active.
    if (this.environment) { this.environment.stale = true; this.checkpoint() }
  }
  get pendingHandoff(): HumanHandoff | undefined { return this.handoffs.find(item => item.status !== 'resolved') }
  requestHandoff(category: HumanHandoff['category'], reason: string): HumanHandoff {
    if (!handoffCategories.includes(category) || typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new Error('invalid_handoff')
    if (this.pendingHandoff) return this.pendingHandoff
    if (this.handoffs.length >= 100) throw new Error('handoff_capacity')
    const item: HumanHandoff = { id: randomUUID(), category, reason: reason.trim(), requestedAt: new Date().toISOString(), status: 'waiting_user' }
    this.handoffs.push(item)
    try { this.checkpoint() } catch (error) { this.handoffs.pop(); throw error }
    return item
  }
  resumeHandoff(): void { this.updateHandoff({ status: 'waiting_observation', resumedAt: new Date().toISOString() }) }
  pauseHandoff(): void { if (this.pendingHandoff?.status === 'waiting_observation') this.updateHandoff({ status: 'waiting_user' }) }
  resolveHandoff(evidenceObservationId: string): void {
    if (this.pendingHandoff?.status === 'waiting_observation') this.updateHandoff({ status: 'resolved', resolvedAt: new Date().toISOString(), evidenceObservationId })
  }
  private updateHandoff(patch: Partial<HumanHandoff>): void {
    const item = this.pendingHandoff
    if (!item) return
    const previous = { ...item }
    Object.assign(item, patch)
    try { this.checkpoint() } catch (error) { Object.keys(item).forEach(key => delete (item as unknown as Record<string, unknown>)[key]); Object.assign(item, previous); throw error }
  }
  hasEvidence(id: string): boolean { return this.storage ? Boolean(this.evidenceFiles[id]) : this.evidence.has(id) }
  configureCommentBudget(input: CommentBudgetInput, now = this.now()): void {
    const budget = createCommentBudget(input, now)
    if (this.commentBudget) {
      if (this.commentBudget.targetCount !== input.targetCount || this.commentBudget.maxDurationSeconds !== input.maxDurationSeconds) throw new Error('comment_budget_frozen: do not silently extend the saved stopping condition')
      return
    }
    if (this.reviews.length) throw new Error('comment_budget_started: declare the agreed limit before drafting')
    this.commentBudget = budget
    try { this.checkpoint() } catch (error) { this.commentBudget = undefined; throw error }
  }
  get comments() { return commentSummary(this.reviews, this.commentBudget) }
  commentStopReason(now = this.now()): CommentBudget['stopReason'] {
    return this.commentBudget?.stopReason ?? (this.commentBudget?.targetCount && this.comments.sent >= this.commentBudget.targetCount ? 'target_reached'
      : this.commentBudget?.deadlineAt && now >= Date.parse(this.commentBudget.deadlineAt) ? 'time_limit' : undefined)
  }
  stopComments(reason: NonNullable<CommentBudget['stopReason']>, now = this.now()): void {
    if (!this.commentBudget || this.commentBudget.stopReason) return
    this.commentBudget = { ...this.commentBudget, stopReason: reason, stoppedAt: new Date(now).toISOString() }
    this.checkpoint()
  }
  private assertCommentSlot(): void {
    if (this.commentStopReason()) throw new Error('comment_budget_exhausted: preserve results and stop this run')
    if (this.commentBudget?.targetCount && this.comments.reserved >= this.commentBudget.targetCount) throw new Error('comment_slots_reserved: unknown and submitted sends occupy target slots; verify rather than sending replacements')
  }
  private versions(review: CommentReview): DraftVersion[] {
    return review.draftVersions ?? [{ version: 1, source: 'generated', draft: review.originalDraft ?? review.draft, savedAt: 'unknown' }, ...(review.originalDraft && review.originalDraft !== review.draft ? [{ version: review.contentVersion ?? 2, source: 'human' as const, draft: review.draft, savedAt: 'unknown' }] : [])]
  }
  private addVersion(review: CommentReview, draft: string, source: DraftVersion['source'], evidenceObservationId?: string): DraftVersion[] {
    if (typeof draft !== 'string' || draft.length > 2000 || source !== 'platform' && !draft.trim()) throw new Error('invalid_review_draft')
    const versions = this.versions(review)
    if (versions.length >= 100) throw new Error('review_version_capacity')
    return [...versions, { version: Math.max(...versions.map(item => item.version)) + 1, source, draft, savedAt: new Date().toISOString(), ...(evidenceObservationId ? { evidenceObservationId } : {}) }]
  }
  saveDraft(id: string, draft: string, expectedVersion?: number): CommentReview {
    const review = this.reviews.find(item => item.id === id)
    if (!review || review.status !== 'pending') throw new Error('review_not_pending')
    if (expectedVersion !== undefined && expectedVersion !== (review.contentVersion ?? 1)) throw new Error('review_version_changed: retain your text and compare the saved versions')
    if (draft === review.draft) return review
    const versions = this.addVersion(review, draft, 'human')
    return this.updateReview(id, { draft, draftVersions: versions, contentVersion: versions.at(-1)!.version })
  }
  savePlatformDraft(id: string, draft: string, evidenceObservationId: string): CommentReview {
    return this.savePlatformInput(id, draft, evidenceObservationId, 'model_observation')
  }
  savePlatformInput(id: string, text: string | undefined, evidenceObservationId: string, source: PlatformInput['source']): CommentReview {
    const review = this.reviews.find(item => item.id === id)
    if (!review || !['pending', 'approved'].includes(review.status)) throw new Error('review_input_unavailable')
    if (!this.hasEvidence(evidenceObservationId)) throw new Error('review_evidence_missing')
    if (text !== undefined && (typeof text !== 'string' || text.length > 2000 || text.includes('\0'))) throw new Error('invalid_platform_input')
    if (review.platformInput?.evidenceObservationId === evidenceObservationId && review.platformInput.text === text && review.platformInput.source === source) return review
    const versions = text === undefined ? this.versions(review) : this.addVersion(review, text, 'platform', evidenceObservationId)
    const version = text === undefined ? (review.platformInput?.version ?? 0) + 1 : versions.at(-1)!.version
    return this.updateReview(id, { draftVersions: versions, platformInput: { version, text, source, status: text === undefined ? 'unreadable' : text === '' ? 'empty' : text === review.draft ? 'matches' : 'differs', evidenceObservationId, readAt: new Date(this.now()).toISOString(), contentVersion: review.contentVersion ?? 1 } })
  }
  get pendingReplacement(): CommentReview | undefined {
    return this.reviews.find(review => review.status === 'approved' && review.platformInput?.status === 'differs' && !review.inputAttempts?.some(attempt => attempt.platformVersion === review.platformInput!.version && attempt.beforeObservationId === review.platformInput!.evidenceObservationId) && !this.replacementAllowed(review))
  }
  private replacementAllowed(review: CommentReview): boolean {
    const decision = review.replacementDecisions?.at(-1)
    return Boolean(decision?.decision === 'replace' && !decision.usedAt && decision.originalText === review.platformInput?.text && decision.contentVersion === (review.contentVersion ?? 1))
  }
  decideReplacement(id: string, decision: 'replace' | 'keep', platformVersion: number, contentVersion: number): void {
    const review = this.reviews.find(item => item.id === id), input = review?.platformInput
    if (!review || !['pending', 'approved'].includes(review.status) || !input || input.status !== 'differs' || input.text === undefined) throw new Error('replacement_unavailable')
    if (input.version !== platformVersion || (review.contentVersion ?? 1) !== contentVersion) throw new Error('replacement_changed: inspect the current phone original and final draft')
    const entry: ReplacementDecision = { decision, platformVersion, contentVersion, originalText: input.text, decidedAt: new Date(this.now()).toISOString() }
    if ((review.replacementDecisions?.length ?? 0) >= 100) throw new Error('replacement_decision_capacity')
    this.updateReview(id, { replacementDecisions: [...(review.replacementDecisions ?? []), entry], ...(decision === 'keep' ? { status: 'skipped', skipReason: '用户保留手机原稿；未填入、未发送', reviewedAt: entry.decidedAt } : {}) })
  }
  assertPlatformInput(id: string, observationId: string, action: 'text' | 'replace_text' | 'send'): CommentReview {
    const review = this.reviews.find(item => item.id === id), input = review?.platformInput
    if (!review || review.status !== 'approved' || review.approvedVersion !== (review.contentVersion ?? 1)) throw new Error('review_required')
    if (!input || input.evidenceObservationId !== observationId || input.contentVersion !== review.approvedVersion || input.status === 'unreadable') throw new Error('comment_input_unverified: read the current focused comment field before filling or sending')
    if (action === 'send' && (input.source !== 'device_clipboard' || input.text !== review.draft || input.status !== 'matches')) throw new Error('comment_input_mismatch: exact device-read input must match the approved final text before sending')
    if (action === 'text' && input.status !== 'empty') throw new Error(input.status === 'matches' ? 'comment_input_already_matches: do not append the same text again' : 'comment_original_exists: preserve it and obtain the human replacement decision')
    if (action === 'replace_text' && (input.source !== 'device_clipboard' || input.status !== 'differs' || !this.replacementAllowed(review))) throw new Error('comment_replacement_required: exact original and approved final need a saved human replacement decision')
    return review
  }
  prepareInput(id: string, observationId: string, replacement: boolean): void {
    const review = this.assertPlatformInput(id, observationId, replacement ? 'replace_text' : 'text')
    if ((review.inputAttempts?.length ?? 0) >= 100 || review.inputAttempts?.some(attempt => attempt.beforeObservationId === observationId)) throw new Error('comment_input_attempt_recorded: read the current field, never replay an old fill intent')
    const now = new Date(this.now()).toISOString()
    this.updateReview(id, { inputAttempts: [...(review.inputAttempts ?? []), { contentVersion: review.approvedVersion!, platformVersion: review.platformInput!.version, beforeObservationId: observationId, startedAt: now, outcome: 'pending' }], ...(replacement ? { replacementDecisions: review.replacementDecisions!.map((entry, index, entries) => index === entries.length - 1 ? { ...entry, usedAt: now } : entry) } : {}) })
  }
  finishInput(id: string, observationId?: string): void {
    const review = this.reviews.find(item => item.id === id)
    if (!review || !review.inputAttempts?.length) return
    this.updateReview(id, { inputAttempts: review.inputAttempts.map((attempt, index, attempts) => index === attempts.length - 1 ? { ...attempt, outcome: observationId ? 'executed' : 'unknown', ...(observationId ? { afterObservationId: observationId } : {}) } : attempt) })
  }
  defineTest(input: TestCaseDefinition, origin?: TestCase['origin']): TestCase {
    const definition = validateTestDefinition(input)
    const existing = this.testCases.find(test => test.definition.title === definition.title)
    if (existing) throw new Error('test_case_exists: preserve the original definition; use the returned caseId or a new linked run')
    if (definition.dependencies.some(id => !this.testCases.some(test => test.id === id))) throw new Error('test_dependency_unknown')
    if (this.testCases.length >= 100) throw new Error('test_case_capacity')
    const test: TestCase = { id: randomUUID(), definition, createdAt: new Date().toISOString(), ...(origin ? { origin: structuredClone(origin) } : {}) }
    const previous = this.scenario
    this.scenario = 'testing'; this.testCases.push(test)
    try { this.checkpoint() } catch (error) { this.testCases.pop(); this.scenario = previous; throw error }
    return test
  }
  beginTest(id: string): TestCase {
    const test = this.testCases.find(test => test.id === id)
    if (!test || test.result) throw new Error('test_case_unavailable: create a new run rather than replaying a completed case')
    if (this.activeTestCaseId && this.activeTestCaseId !== id && !this.testCases.find(item => item.id === this.activeTestCaseId)?.result) throw new Error('test_case_pending: record the current case before switching')
    if (test.definition.dependencies.some(id => this.testCases.find(test => test.id === id)?.result?.status !== 'passed')) throw new Error('test_dependency_blocked: do not execute dependent checks; record not_checked with the reason')
    const previous = this.activeTestCaseId, previousStop = this.stopBeforeSubmit
    this.activeTestCaseId = id
    if (requestsPreSubmitStop(test.definition.stoppingCondition)) this.stopBeforeSubmit = true
    try { this.checkpoint() } catch (error) { this.activeTestCaseId = previous; this.stopBeforeSubmit = previousStop; throw error }
    return test
  }
  recordTest(id: string, input: TestCaseResultInput): TestCase {
    const test = this.testCases.find(test => test.id === id)
    if (!test || test.result) throw new Error('test_result_immutable: preserve the old result and create a new linked run')
    const result = validateTestResult(test, input)
    if (result.evidenceObservationIds.some(id => !this.hasEvidence(id))) throw new Error('test_evidence_missing: cite evidence recorded by this task')
    if ((result.executedSteps.length || ['passed', 'failed'].includes(result.status)) && this.activeTestCaseId !== id) throw new Error('test_case_not_active')
    if ((result.executedSteps.length || ['passed', 'failed'].includes(result.status)) && test.definition.dependencies.some(id => this.testCases.find(test => test.id === id)?.result?.status !== 'passed')) throw new Error('test_dependency_blocked')
    test.result = { ...result, recordedAt: new Date().toISOString() }
    try { this.checkpoint() } catch (error) { delete test.result; throw error }
    return test
  }

  begin(deviceId: string, kind: string, now: number, details: { label?: string | undefined; step?: string | undefined } = {}): TraceEntry {
    const trace: TraceEntry = { id: randomUUID(), deviceId, kind, startedAt: new Date(now).toISOString(), status: 'running', ...(details.label ? { label: details.label } : {}), ...(details.step ? { step: details.step.slice(0, 200) } : {}) }
    this.traces.push(trace)
    try { this.checkpoint() } catch (error) { this.traces.pop(); throw error }
    return trace
  }
  finish(trace: TraceEntry, now: number, status: TraceEntry['status'], observationId?: string, code?: string): void {
    trace.durationMs = Math.max(0, now - Date.parse(trace.startedAt))
    trace.status = status
    if (observationId) trace.observationId = observationId
    if (code) trace.code = code
    this.checkpoint()
  }
  capture(id: string, data: Buffer): void {
    if (this.evidenceFiles[id]) return
    const name = this.evidenceName(id) + '.jpg'
    this.storage?.capture(id, name, data)
    this.evidenceFiles[id] = name
    if (data.length > 2_000_000) { this.checkpoint(); return }
    // Bound retained evidence to 32 MB; missing evidence stays explicit in exports.
    while (this.evidenceBytes + data.length > 32_000_000) {
      const oldest = this.evidence.keys().next().value
      if (!oldest) break
      this.evidenceBytes -= this.evidence.get(oldest)!.length
      this.evidence.delete(oldest)
    }
    this.evidence.set(id, Buffer.from(data))
    this.evidenceBytes += data.length
    this.checkpoint()
  }
  requestReview(request: { account: string; target: string; context: string; draft: string; kind?: ContentKind; title?: string }): CommentReview {
    const { kind, title, ...input } = request
    for (const [key, value] of Object.entries(input)) {
      if (typeof value !== 'string' || !value.trim() || value.length > (key === 'context' ? 4000 : 2000)) throw new Error('invalid_review')
    }
    if (kind !== undefined && !CONTENT_KINDS.includes(kind)) throw new Error('invalid_review')
    if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 200)) throw new Error('invalid_review')
    // A comment or reply is one per account and target; posts and messages may repeat there, but never with the same text.
    const repeatable = kind === 'post' || kind === 'message'
    if (repeatable && this.reviews.some(r => r.kind === kind && r.account === input.account && r.target === input.target && r.draft === input.draft && ['submitted', 'sent', 'unknown'].includes(r.status))) throw new Error('content_already_published: this text was already published here; do not publish it again')
    const existing = this.reviews.find(r => r.account === input.account && r.target === input.target && r.status !== 'skipped' && (!repeatable || r.kind === kind && ['pending', 'approved'].includes(r.status)))
    if (existing) {
      if (existing.draft !== input.draft && !this.versions(existing).some(item => item.source === 'generated' && item.draft === input.draft)) {
        if (!['pending', 'approved'].includes(existing.status)) throw new Error('review_exists: preserve the submitted content')
        return this.updateReview(existing.id, { draftVersions: this.addVersion(existing, input.draft, 'generated') })
      }
      return existing
    }
    this.assertCommentSlot()
    const historical = repeatable ? undefined : this.storage?.previousComment(input.account, input.target)
    if (historical) throw new Error(historical.status === 'sent' ? 'comment_already_sent: this account has a verified historical comment on this target' : 'comment_pending_verification: verify the historical submission; do not send again')
    if (this.reviews.some(r => r.status === 'pending' || r.status === 'approved' || r.status === 'submitted' || r.status === 'unknown')) throw new Error('review_pending: finish or verify the previous comment first')
    if (this.reviews.length >= 100) throw new Error('review_capacity')
    const review: CommentReview = { ...input, ...(kind ? { kind } : {}), ...(title ? { title: title.trim() } : {}), originalDraft: input.draft, contentVersion: 1, draftVersions: [{ version: 1, source: 'generated', draft: input.draft, savedAt: new Date().toISOString() }], decisions: [], id: randomUUID(), status: 'pending' }
    this.reviews.push(review)
    try { this.checkpoint() } catch (error) { this.reviews.pop(); throw error }
    return review
  }
  decide(id: string, decision: 'approve' | 'skip', draft?: string, reason?: string, expectedVersion?: number): void {
    const review = this.reviews.find(r => r.id === id)
    if (!review || review.status !== 'pending') throw new Error('review_not_pending')
    if (expectedVersion !== undefined && expectedVersion !== (review.contentVersion ?? 1)) throw new Error('review_version_changed: retain your edit and inspect the saved version')
    if (decision === 'approve') this.assertCommentSlot()
    const previous = { ...review }
    if (draft !== undefined) {
      if (!draft.trim() || draft.length > 2000) throw new Error('invalid_review_draft')
      if (draft !== review.draft) { review.draftVersions = this.addVersion(review, draft, 'human'); review.contentVersion = review.draftVersions.at(-1)!.version }
      review.draft = draft
    }
    if (decision === 'skip') review.skipReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 2000) : '用户选择跳过'
    review.status = decision === 'approve' ? 'approved' : 'skipped'
    review.reviewedAt = new Date().toISOString()
    review.decisions = [...(review.decisions ?? []), { decision, contentVersion: review.contentVersion ?? 1, decidedAt: review.reviewedAt, ...(review.skipReason ? { reason: review.skipReason } : {}) }]
    if (decision === 'approve') review.approvedVersion = review.contentVersion ?? 1
    this.comparePlatformInput(review)
    try { this.checkpoint() } catch (error) { Object.keys(review).forEach(key => delete (review as unknown as Record<string, unknown>)[key]); Object.assign(review, previous); throw error }
  }
  updateReview(id: string, patch: Partial<CommentReview>): CommentReview {
    const review = this.reviews.find(r => r.id === id)
    if (!review) throw new Error('review_not_found')
    const previous = { ...review }
    Object.assign(review, patch)
    this.comparePlatformInput(review)
    try { this.checkpoint() } catch (error) { Object.keys(review).forEach(key => delete (review as unknown as Record<string, unknown>)[key]); Object.assign(review, previous); throw error }
    return review
  }
  private comparePlatformInput(review: CommentReview): void {
    const input = review.platformInput
    if (!input || input.status === 'unreadable' || input.text === undefined) return
    review.platformInput = { ...input, contentVersion: review.contentVersion ?? 1, status: input.text === '' ? 'empty' : input.text === review.draft ? 'matches' : 'differs' }
  }
  prepareSubmission(id: string): void {
    const review = this.reviews.find(r => r.id === id)
    if (!review || review.status !== 'approved') throw new Error('review_required')
    this.assertCommentSlot()
    if (review.approvedVersion !== undefined && review.approvedVersion !== review.contentVersion) throw new Error('review_version_changed')
    const historical = this.storage?.previousComment(review.account, review.target)
    if (historical) throw new Error('comment_duplicate_or_unknown: inspect the saved historical result before sending')
    this.updateReview(id, { status: 'submitted', submittedAt: new Date().toISOString() })
  }
  snapshot(): WorkbenchState {
    return { connectionRecovery: this.connectionRecovery, executionBudget: this.executionBudget, stopBeforeSubmit: this.stopBeforeSubmit, contentReview: this.contentReview, inputDiagnostic: this.inputDiagnostic, apk: this.apk, environment: this.environment, createdAt: this.createdAt, objective: this.objective, ...(this.request ? { request: this.request } : {}), successCriteria: this.successCriteria,
      scenario: this.scenario, testCases: this.testCases, activeTestCaseId: this.activeTestCaseId, handoffs: this.handoffs, commentBudget: this.commentBudget,
      control: this.control, result: this.result, traces: this.traces, reviews: this.reviews,
      evidenceCount: Object.keys(this.evidenceFiles).length, evidenceFiles: { ...this.evidenceFiles }, model: this.modelConfig?.name ?? '跟随 WorkBuddy', modelConfig: this.modelConfig }
  }
  markdown(todos: readonly TaskStep[], context: { readonly devices?: readonly string[] } = {}): string {
    const clean = (value: string) => value.replace(/\r/g, '').replace(/^#/gm, '\\#')
    const cell = (value: string) => clean(value).replace(/\|/gu, '｜').replace(/\n+/gu, ' ')
    const pad = (value: number) => String(value).padStart(2, '0')
    const time = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
    const clock = (iso: string) => time(iso).slice(11) || iso
    const span = (ms: number) => ms < 1000 ? `${Math.max(0, Math.round(ms))} 毫秒` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} 秒` : `${Math.floor(ms / 60_000)} 分 ${Math.round(ms % 60_000 / 1000)} 秒`
    const outcomes: Record<BoardResult['outcome'], string> = { completed: '已完成', blocked: '受阻', unknown: '结果未知', cancelled: '已取消', stopped: '已停止' }
    const ended = Boolean(this.result)
    const stepStates: Record<string, string> = { completed: '✅ 已完成', failed: '❌ 失败', skipped: '⏭ 已跳过', awaiting_user: ended ? '⏸ 未完成' : '⏳ 待你处理', in_progress: ended ? '⏸ 未完成' : '▶ 进行中', pending: ended ? '⏸ 未执行' : '○ 待执行' }
    const traceStates: Record<TraceEntry['status'], string> = { running: '进行中', executed: '完成', failed: '失败', unknown: '结果未知' }
    const isOperation = (t: TraceEntry) => t.kind !== 'model'
    const end = (t: TraceEntry) => Date.parse(t.startedAt) + (t.durationMs ?? 0)
    const kept = (id: string) => this.storage ? Boolean(this.evidenceFiles[id]) : this.evidence.has(id)
    const picture = (id: string) => `evidence/${this.evidenceFiles[id] ?? this.evidenceName(id) + '.jpg'}`
    const started = Date.parse(this.createdAt), last = this.traces.length ? Math.max(...this.traces.map(end)) : NaN
    const done = todos.filter(t => t.status === 'completed').length
    const summary: Array<[string, string]> = [
      ['任务', this.objective || '未提供'], ['结束条件', this.successCriteria || '未提供'], ['状态', this.result ? outcomes[this.result.outcome] : '未结束'],
      ['开始时间', time(this.createdAt)], ...(Number.isFinite(last) && Number.isFinite(started) ? [['用时', span(last - started)] as [string, string]] : []),
      ...(context.devices?.length ? [['执行设备', context.devices.join('、')] as [string, string]] : []),
      ['执行模型', this.modelConfig ? `${this.modelConfig.name}（${this.modelConfig.model}）` : '跟随 WorkBuddy'],
      ...(this.contentReview ? [['发内容前审核', '已开启（发布文字内容前需用户批准）'] as [string, string]] : []),
      ['执行步骤', todos.length ? `${done} / ${todos.length} 已完成` : '未拆分步骤'], ['设备操作', `${this.traces.filter(isOperation).length} 次`],
    ]
    const stepNames = new Set(todos.map(t => t.content))
    const steps = todos.flatMap((todo, index) => {
      const entries = this.traces.filter(t => t.step === todo.content), operations = entries.filter(isOperation)
      const shot = [...entries].reverse().find(t => t.observationId && kept(t.observationId))
      return [
        `### ${index + 1}. ${clean(todo.content)}　${stepStates[todo.status] ?? todo.status}`,
        entries.length ? `用时 ${span(Math.max(...entries.map(end)) - Math.min(...entries.map(t => Date.parse(t.startedAt))))} · ${operations.length} 次设备操作` : '没有执行记录',
        ...(todo.reason ? [`说明：${clean(todo.reason)}`] : []),
        ...entries.map(t => `- ${clock(t.startedAt)}　${clean(t.label ?? t.kind)}${t.status === 'executed' ? '' : `（${traceStates[t.status]}${t.code ? '：' + t.code : ''}）`}${t.durationMs === undefined ? '' : ` · ${span(t.durationMs)}`}`),
        ...(shot ? [`![步骤 ${index + 1} 的最后画面](${picture(shot.observationId!)})`] : []), '',
      ]
    })
    const others = this.traces.filter(t => !t.step || !stepNames.has(t.step))
    const lines = ['# OpenGUI 任务报告', '', `> ${clean(this.result?.summary || '尚未收到业务结果结论。工具执行回执不代表检查通过或评论发送成功。').replace(/\n/gu, '\n> ')}`, '',
      '| 项目 | 内容 |', '| --- | --- |', ...summary.map(([key, value]) => `| ${key} | ${cell(value)} |`), '',
      ...(this.stopBeforeSubmit ? ['执行限制：停在提交前。已声明的提交、发送、发布、付款、删除及 Enter 由运行时阻止；点击／滑动省略副作用标记时不执行。标为无副作用的用途仍需正确判断当前画面，不构成独立视觉验证。', ''] : []),
      ...(this.executionBudget?.initialLimits ? [`执行预算：手机操作最多 ${this.operationLimit} 次（包含观察与动作）；插件内模型调用最多 ${this.inferenceLimit} 次。宿主模型调用不计入插件内模型预算。恢复保留已用次数，追加需原工作台用户授权。`, ''] : []),
      '## 执行步骤', ...(todos.length ? steps : ['未拆分执行步骤。', '']),
      ...(others.length ? ['### 准备与其他操作', ...others.map(t => `- ${clock(t.startedAt)}　${clean(t.label ?? t.kind)}${t.status === 'executed' ? '' : `（${traceStates[t.status]}${t.code ? '：' + t.code : ''}）`}${t.durationMs === undefined ? '' : ` · ${span(t.durationMs)}`}`), ''] : []),
      ...(this.connectionRecovery ? ['## 原设备连接恢复', `检测：${this.connectionRecovery.detectedAt}；状态：${this.connectionRecovery.status}`, '设备断开或调试授权失去时暂停控制；只恢复原设备，不重放未知动作。', ...(this.connectionRecovery.recheckedAt ? [`用户重新检测：${this.connectionRecovery.recheckedAt}`] : []), ...(this.connectionRecovery.resolvedAt ? [`新画面：${this.connectionRecovery.resolvedAt}；证据：${this.connectionRecovery.evidenceObservationId}。连接恢复不证明之前的业务动作成功。`] : []), ''] : []),
      ...(this.executionBudget?.extensions.length ? ['## 用户追加执行预算', ...this.executionBudget.extensions.map(extension => `- ${extension.grantedAt}：追加最多 ${extension.additional} 次手机操作与插件内模型调用；累计上限分别为 ${extension.operationLimit}／${extension.inferenceLimit}。上一轮 ${extension.previousResult.outcome}：${clean(extension.previousResult.summary ?? '未提供结论')}。原目标、设备、审核与已发生结果不因此改变。`), ''] : []),
      ...(this.inputDiagnostic ? ['## 设备输入权限诊断', `来源：${this.inputDiagnostic.source}；状态：${this.inputDiagnostic.status}；检测：${this.inputDiagnostic.detectedAt}`, 'Android 明确拒绝输入注入；不根据画面未变化推断权限失败，不自动重放失败动作。', clean(this.inputDiagnostic.guidance), ...(this.inputDiagnostic.recheckedAt ? [`用户重新检测：${this.inputDiagnostic.recheckedAt}；连接及截图正常不证明触控权限已恢复。`] : []), ...(this.inputDiagnostic.resolvedAt ? [`后续输入回执及结果截图返回：${this.inputDiagnostic.resolvedAt}；系统权限开关未直接读取，业务结果仍须核对。`] : []), ''] : []),
      ...(this.apk ? ['## APK 准备', `文件：${clean(this.apk.fileName)}；包名：${clean(this.apk.packageName)}；版本：${clean(this.apk.versionName ?? '未解析')}；版本代码：${this.apk.versionCode ?? '未解析'}；最低 SDK：${this.apk.minSdk}`, `大小：${this.apk.bytes} 字节；SHA-256：${this.apk.sha256}`, ...(this.apk.existingApp ? [`覆盖已安装应用：现有版本 ${clean(this.apk.existingApp.version ?? '未能读取')}；用户确认：${this.apk.updateApprovedAt ?? '待确认'}。安装将替换应用程序并保留原数据，应用自身迁移可能改变数据。`] : []), `状态：${this.apk.status}；准备：${this.apk.preparedAt}${this.apk.startedAt ? '；开始安装：' + this.apk.startedAt : ''}${this.apk.finishedAt ? '；结束：' + this.apk.finishedAt : ''}${this.apk.code ? '；结果码：' + this.apk.code : ''}`, '安装成功仅表示安装事务成功；账号、权限、服务与业务结果仍须重新检查。不自动重试失败／未知安装。', ''] : []),
      ...(this.environment ? ['## 环境准备', `目标应用：${clean(this.environment.spec.packageName)}${this.environment.spec.expectedVersion ? '；要求版本 ' + clean(this.environment.spec.expectedVersion) : ''}`, `检查时间：${this.environment.checkedAt ?? '尚未检查'}；当前${environmentReady(this.environment) ? '已满足声明的前置条件' : this.environment.stale ? '需要重新检查，旧结果不能授权执行' : '存在失败或待确认项'}`, '账号与服务状态由模型比较画面记录，不属于独立验证；未声明条件不代表已检查。', ...this.environment.checks.map(item => `- ${clean(item.label)} · ${item.status} · ${item.source} · ${item.required ? '必需' : '提示'}：${clean(item.detail)}${item.evidenceObservationId ? '；证据 ' + item.evidenceObservationId : ''}`), ''] : []),
      ...(this.testCases.length ? this.testMarkdown(clean) : []),
      ...(this.handoffs.length ? ['## 人工处理记录', '重新观察完成只表示已取得交还后的新画面，不代表安全验证通过或支付成功。', ...this.handoffs.map(item => `- ${item.requestedAt} · ${item.category} · ${item.status}\n  原因：${clean(item.reason)}${item.resumedAt ? `\n  用户交还控制：${item.resumedAt}` : ''}${item.resolvedAt ? `\n  重新观察完成：${item.resolvedAt} · 证据 ${item.evidenceObservationId}` : ''}`), ''] : []),
      ...(this.reviews.length || this.commentBudget ? [this.contentReview && this.scenario !== 'comments' ? '## 内容审核' : '## 评论审核', ...(this.commentBudget ? [`已核验 ${this.comments.sent}／${this.commentBudget.targetCount ?? '未约定数量'}；已提交 ${this.comments.submitted}；结果未知 ${this.comments.unknown}；跳过 ${this.comments.skipped}。`, `开始：${this.commentBudget.startedAt}；时限：${this.commentBudget.deadlineAt ?? '未约定'}；停止原因：${this.commentBudget.stopReason ?? '尚未停止'}。暂停与人工等待计入约定运行时长；提交／未知不计成功，但占用目标名额。`] : []), ...this.reviews.flatMap(r => [`- ${r.kind ? `${({ post: '帖子', comment: '评论', reply: '回复', message: '私信' } as const)[r.kind]} · ` : ''}${clean(r.account)} · ${clean(r.target)} · ${r.status} · 内容版本 ${r.contentVersion ?? 1}${r.title ? `\n  标题：${clean(r.title)}` : ''}\n  ${clean(r.draft)}${r.skipReason ? `\n  跳过原因：${clean(r.skipReason)}` : ''}${r.submittedAt ? `\n  提交时间：${r.submittedAt}` : ''}`, ...this.versions(r).map(item => `  - 版本 ${item.version} · ${item.source} · ${item.savedAt}${item.evidenceObservationId ? ` · 证据 ${item.evidenceObservationId}` : ''}\n    ${clean(item.draft)}`), ...(r.decisions ?? []).map(item => `  - 人工决定 ${item.decision} · 内容版本 ${item.contentVersion} · ${item.decidedAt}${item.reason ? ` · ${clean(item.reason)}` : ''}`), ...(r.platformInput ? [`  - 当前输入 ${r.platformInput.status} · ${r.platformInput.source} · ${r.platformInput.readAt} · 证据 ${r.platformInput.evidenceObservationId}；原稿记录不是覆盖许可。`] : []), ...(r.replacementDecisions ?? []).map(item => `  - 原稿决定 ${item.decision === 'keep' ? '保留，不发送' : '允许一次替换'} · 原稿版本 ${item.platformVersion} · 最终稿版本 ${item.contentVersion} · ${item.decidedAt}${item.usedAt ? ` · 已消耗 ${item.usedAt}` : ''}\n    ${clean(item.originalText)}`), ...(r.inputAttempts ?? []).map(item => `  - 填入事务 ${item.outcome} · 最终稿版本 ${item.contentVersion} · ${item.startedAt} · 执行前证据 ${item.beforeObservationId}${item.afterObservationId ? ` · 执行后证据 ${item.afterObservationId}` : ''}`)]), ''] : []),
      '## 附录：完整执行记录', this.modelConfig ? '工具和模型请求耗时均为实际调用往返时间；模型耗时包含网络。' : '仅记录实际工具调用耗时；宿主未提供模型推理耗时。', '',
      '| 时间 | 操作 | 所属步骤 | 结果 | 耗时 |', '| --- | --- | --- | --- | --- |',
      ...this.traces.map(t => `| ${clock(t.startedAt)} | ${cell(t.label ?? t.kind)} | ${cell(t.step ?? '—')} | ${traceStates[t.status]}${t.code ? '：' + cell(t.code) : ''} | ${t.durationMs === undefined ? '进行中' : span(t.durationMs)} |`), '',
      '## 附录：截图证据', ...this.traces.filter(t => t.observationId).map(t => (this.storage ? this.evidenceFiles[t.observationId!] : this.evidence.has(t.observationId!))
        ? `- [${t.observationId}](evidence/${this.evidenceName(t.observationId!)}.jpg)` : `- ${t.observationId}：证据未保留`), '',
      this.storage ? '任务、审核记录和截图已自动归档到本地；恢复后必须重新观察，原审核需重新确认。' : '当前记录仅保留于运行时。',
      '未执行、结果未知和待核验项目不计为业务成功。']
    return lines.join('\n')
  }
  private testMarkdown(clean: (value: string) => string): string[] {
    const summary = testSummary(this.testCases), labels = { passed: '通过', failed: '失败', unverified: '待确认', not_checked: '未检查' }
    const lines = ['## 测试检查清单', `共 ${summary.total} 项：通过 ${summary.passed}，失败 ${summary.failed}，待确认 ${summary.unverified}，未检查 ${summary.notChecked}，未记录结果 ${summary.planned}。`, '步骤执行完毕不代表全部检查通过；环境受阻不能当作产品缺陷。', '']
    for (const test of this.testCases) {
      const { definition: d, result: r } = test, comparison = retestComparison(test)
      lines.push(`### ${clean(d.title)}（${test.id}）`, `结果：${r ? labels[r.status] : '尚未执行／未记录结果'}`, `应用：${clean(d.context.app)} · 版本：${clean(d.context.version)}`, `环境：${clean(d.context.environment)} · 账号：${clean(d.context.account)} · 起点：${clean(d.context.startPage)}`,
        `前置条件：${d.prerequisites.map(clean).join('；') || '无'}`, `测试数据来源：${d.testData.source}；${clean(d.testData.description)}`, `预期：${clean(d.expected)}`, `预期来源：${d.expectedSource.kind}；${clean(d.expectedSource.reference)}`, `停止条件：${clean(d.stoppingCondition)}`,
        '计划步骤：', ...d.steps.map((step, index) => `${index + 1}. ${clean(step)}`), `实际表现：${clean(r?.actual ?? '尚未记录')}`, ...(r?.reason ? [`原因／未检查范围：${clean(r.reason)}`] : []), ...(r?.checkedStepIndexes ? [`已核对计划步骤：${r.checkedStepIndexes.map(index => index + 1).join('、') || '无'}`] : []), '实际执行／复现步骤：', ...(r?.executedSteps.map((step, index) => `${index + 1}. ${clean(step)}`) ?? ['未执行']),
        ...(r?.reproduction ? [`复现结论：${r.reproduction}；本次未复现不代表问题不存在。`] : []),
        ...(r?.status === 'failed' ? [`缺陷编号：DEF-${test.id.slice(0, 8)}；发生位置：${clean(d.context.app)}／${clean(r.page ?? '未知页面')}；缺陷关联此用例的输入、预期、实际与复现步骤，未推断源码根因。`] : []),
        ...(r?.evidenceObservationIds.map(id => `- [证据 ${id}](evidence/${this.evidenceFiles[id] ?? this.evidenceName(id) + '.jpg'})`) ?? ['无检查证据']),
        ...(comparison ? [`关联原任务：${test.origin!.taskId}／${test.origin!.caseId}`, `上次：${comparison.previous}；本次：${comparison.current}；${comparison.conclusion}`, `条件变化：${comparison.differences.join('、') || '无'}`] : []), '')
    }
    return lines
  }
  evidenceName(id: string): string { return `frame-${this.traces.findIndex(t => t.observationId === id) + 1}` }
}
