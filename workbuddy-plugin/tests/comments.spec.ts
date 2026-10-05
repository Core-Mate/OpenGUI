import { afterEach, describe, expect, it, vi } from 'vitest'
import { Workbench } from '../src/workbench.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { createCommentBudget, type CommentBudgetInput } from '../src/comments.ts'
import { callOpenGuiTool, validateToolArguments } from '../src/tools.ts'
import { setup, connect } from './viewer-fixture.ts'
import { FakeHost } from './fake-host.ts'

const services: WorkBuddyOpenGuiService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.dispose() })
const source = { account: 'qa', target: 'post:1', context: 'Source post', draft: 'Generated draft' }
async function fixture(commentBudget: CommentBudgetInput) {
  const { viewer, sinks } = setup(), host = new FakeHost(), service = new WorkBuddyOpenGuiService({ viewers: viewer, host })
  services.push(service)
  const signal = AbortSignal.timeout(5000), display = await service.openViewer(['phone-a'], signal)
  const page = await connect(display.url, 'phone-a'); sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  viewer.writeTodos(display.viewerId, 'local', [{ content: 'Review and send comments', status: 'pending' }, { content: 'Unused exploration', status: 'pending' }])
  const session = await service.openSession(['phone-a'], signal, 'control', { viewerId: display.viewerId, scenario: 'comments', commentBudget, objective: 'Review comments on the selected post', successCriteria: 'Stop at the agreed limit' })
  const action = (body: Record<string, unknown>) => fetch(`${display.url}board`, { method: 'POST', headers: { Origin: new URL(display.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(display.workbenchUrl).hash.slice(7) }, body: JSON.stringify(body) })
  const board = viewer.board(display.viewerId), stepId = viewer.progress(display.viewerId)!.nextStepId
  return { viewer, host, service, signal, display, session, action, board, stepId }
}

describe('comment versions and bounded runs', () => {
  it('requires separate original replacement permission and consumes it before dispatch', async () => {
    const f = await fixture({ targetCount: 2 }), act = vi.spyOn(f.host, 'act')
    let image = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.stepId)
    const review = f.service.reviewComment(f.session.sessionId, source) as { id: string }
    // The fixture represents an already focused, natively copyable comment field.
    const original = '手机原稿 <img> 😀\n保留换行'
    const priorAct = f.host.act.bind(f.host)
    f.host.act = async (actor, input) => { if (input?.action === 'read_text' && f.board.reviews[0]?.inputAttempts?.length === undefined) f.host.actors.get(actor)!.focusedText = original; return priorAct(actor, input) }
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, { left: 1, top: 1, right: 90, bottom: 190 }, f.signal)
    await f.action({ action: 'review', reviewId: review.id, decision: 'approve', expectedVersion: 1 })
    expect(f.service.snapshotSession(f.session.sessionId).replacementPending).toBe(true)
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'text', text: source.draft, reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toMatchObject({ code: 'comment_replacement_required' })
    const saved = f.board.reviews[0]!
    expect((await f.action({ action: 'comment_original', reviewId: review.id, decision: 'replace', platformVersion: saved.platformInput!.version + 1, contentVersion: 1 })).status).not.toBe(200)
    expect((await f.action({ action: 'comment_original', reviewId: review.id, decision: 'replace', platformVersion: saved.platformInput!.version, contentVersion: 1 })).status).toBe(200)
    image = await f.service.act(f.session.sessionId, undefined, { action: 'replace_text', text: source.draft, reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)
    expect(f.board.pendingReplacement).toBeUndefined()
    expect(saved.replacementDecisions?.[0]?.usedAt).toBeTruthy()
    expect(saved.inputAttempts?.[0]).toMatchObject({ outcome: 'executed', afterObservationId: image.observationId })
    expect(act.mock.calls.find(call => call[1]?.action === 'replace_text')?.[1]).toMatchObject({ expectedOriginalText: original })
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, { left: 1, top: 1, right: 90, bottom: 190 }, f.signal)
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'text', text: source.draft, reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toThrow('comment_input_already_matches')
    image = await f.service.act(f.session.sessionId, undefined, { action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, externalSideEffect: 'send', reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)
    f.service.verifyComment(f.session.sessionId, review.id, image.observationId)
    expect(saved).toMatchObject({ status: 'sent', draft: source.draft, contentVersion: 1 })
    expect(f.board.markdown([])).toContain('允许一次替换'); expect(f.board.markdown([])).toContain(original)
  })

  it('keeps a different phone original without dispatching a fill or send', async () => {
    const f = await fixture({ targetCount: 2 }), act = vi.spyOn(f.host, 'act')
    const image = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.stepId), review = f.service.reviewComment(f.session.sessionId, source) as { id: string }
    f.service.platformDraft(f.session.sessionId, review.id, 'Existing original', image.observationId)
    await f.action({ action: 'review', reviewId: review.id, decision: 'approve' })
    const saved = f.board.reviews[0]!
    expect((await f.action({ action: 'comment_original', reviewId: review.id, decision: 'keep', platformVersion: saved.platformInput!.version, contentVersion: 1 })).status).toBe(200)
    expect(saved).toMatchObject({ status: 'skipped', draft: source.draft }); expect(f.board.comments.sent).toBe(0)
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'text', text: source.draft, reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toMatchObject({ code: 'review_required' })
    expect(act).not.toHaveBeenCalled()
  })

  it('does not accept a visual text claim as exact pre-send verification', async () => {
    const f = await fixture({ targetCount: 2 }), act = vi.spyOn(f.host, 'act'), image = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.stepId)
    const review = f.service.reviewComment(f.session.sessionId, source) as { id: string }; await f.action({ action: 'review', reviewId: review.id, decision: 'approve' })
    f.service.platformDraft(f.session.sessionId, review.id, source.draft, image.observationId)
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'tap', externalSideEffect: 'send', reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toThrow('comment_input_mismatch')
    expect(act).not.toHaveBeenCalled(); expect(f.board.reviews[0]?.status).toBe('approved')
  })

  it('invalidates replacement permission after human final changes and recovery, and rolls back a failed permission write', () => {
    let fail = false
    const board = new Workbench(undefined, { save() { if (fail) throw new Error('disk full') }, capture() {}, previousComment() { return undefined } }), review = board.requestReview(source)
    board.capture('current', Buffer.from('image')); board.savePlatformInput(review.id, 'Original', 'current', 'device_clipboard')
    fail = true
    expect(() => board.decideReplacement(review.id, 'replace', review.platformInput!.version, 1)).toThrow('disk full')
    expect(review.replacementDecisions).toBeUndefined(); fail = false
    board.decideReplacement(review.id, 'replace', review.platformInput!.version, 1)
    board.saveDraft(review.id, 'Changed final', 1); board.decide(review.id, 'approve', undefined, undefined, review.contentVersion)
    expect(board.pendingReplacement?.id).toBe(review.id)
    board.decideReplacement(review.id, 'replace', review.platformInput!.version, review.contentVersion!)
    const restored = new Workbench(board.snapshot())
    expect(restored.reviews[0]?.platformInput?.status).toBe('unreadable')
    expect(restored.reviews[0]?.replacementDecisions?.at(-1)?.usedAt).toBe('restored')
    expect(() => restored.assertPlatformInput(review.id, 'current', 'replace_text')).toThrow('review_required')
  })

  it('does not dispatch replacement if its durable fill-intent write fails', async () => {
    const f = await fixture({ targetCount: 2 }), act = vi.spyOn(f.host, 'act'), image = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.stepId)
    const review = f.service.reviewComment(f.session.sessionId, source) as { id: string }
    f.board.savePlatformInput(review.id, 'Original', image.observationId, 'device_clipboard'); await f.action({ action: 'review', reviewId: review.id, decision: 'approve' })
    f.board.decideReplacement(review.id, 'replace', f.board.reviews[0]!.platformInput!.version, 1)
    vi.spyOn(f.board, 'checkpoint').mockImplementationOnce(() => { throw new Error('disk full') })
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'replace_text', text: source.draft, reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toThrow('disk full')
    expect(act).not.toHaveBeenCalled(); expect(f.board.reviews[0]?.replacementDecisions?.[0]?.usedAt).toBeUndefined(); expect(f.board.reviews[0]?.inputAttempts).toBeUndefined()
  })

  it('blocks unreadable fields and retains unknown fills after recovery without reviving old permission', () => {
    const board = new Workbench(), review = board.requestReview(source)
    board.capture('current', Buffer.from('image')); board.decide(review.id, 'approve')
    board.savePlatformInput(review.id, undefined, 'current', 'device_clipboard')
    expect(() => board.assertPlatformInput(review.id, 'current', 'text')).toThrow('comment_input_unverified')
    expect(() => board.assertPlatformInput(review.id, 'current', 'send')).toThrow('comment_input_unverified')
    board.savePlatformInput(review.id, 'Original', 'current', 'device_clipboard')
    board.decideReplacement(review.id, 'replace', review.platformInput!.version, 1); board.prepareInput(review.id, 'current', true)
    const restored = new Workbench(board.snapshot())
    expect(restored.reviews[0]?.inputAttempts?.[0]?.outcome).toBe('unknown')
    expect(restored.reviews[0]?.replacementDecisions?.[0]?.usedAt).toBeTruthy()
    expect(restored.reviews[0]?.status).toBe('pending')
    expect(restored.reviews[0]?.platformInput?.status).toBe('unreadable')
  })

  it('preserves generated, human and platform versions without overwriting the approved final text', () => {
    const board = new Workbench(), review = board.requestReview(source)
    board.saveDraft(review.id, 'Human edit 😀\nSecond line', 1)
    expect(review).toMatchObject({ status: 'pending', contentVersion: 2, draft: 'Human edit 😀\nSecond line' })
    board.requestReview({ ...source, draft: 'Late generated alternative' })
    board.requestReview(source)
    expect(review.draftVersions?.map(item => item.source)).toEqual(['generated', 'human', 'generated'])
    expect(review.contentVersion).toBe(2)
    board.capture('fresh', Buffer.from('image')); board.savePlatformDraft(review.id, 'Existing platform input', 'fresh')
    expect(review.contentVersion).toBe(2)
    board.decide(review.id, 'approve', undefined, undefined, 2)
    expect(review).toMatchObject({ approvedVersion: 2, draft: 'Human edit 😀\nSecond line' })
    expect(review.decisions?.[0]).toMatchObject({ decision: 'approve', contentVersion: 2 })
    expect(board.markdown([])).toContain('Existing platform input')
    expect(board.markdown([])).toContain('Late generated alternative')
    const restored = new Workbench(board.snapshot())
    expect(restored.reviews[0]).toMatchObject({ status: 'pending', contentVersion: 2 })
    expect(restored.reviews[0]?.draftVersions).toHaveLength(4)
    expect(restored.reviews[0]?.decisions).toHaveLength(1)
  })

  it('rejects stale edits and rolls back version and approval changes when storage fails', () => {
    let failed = false
    const board = new Workbench(undefined, { save() { if (failed) throw new Error('disk full') }, capture() {}, previousComment() { return undefined } })
    const review = board.requestReview(source); board.saveDraft(review.id, 'Saved edit', 1)
    expect(() => board.saveDraft(review.id, 'Stale edit', 1)).toThrow('review_version_changed')
    expect(() => board.decide(review.id, 'approve', 'Stale approved edit', undefined, 1)).toThrow('review_version_changed')
    failed = true
    expect(() => board.saveDraft(review.id, 'Unsaved edit', 2)).toThrow('disk full')
    expect(() => board.decide(review.id, 'approve', 'Unsaved approval', undefined, 2)).toThrow('disk full')
    expect(review).toMatchObject({ status: 'pending', contentVersion: 2, draft: 'Saved edit' })
    expect(review.draftVersions).toHaveLength(2); expect(review.decisions).toEqual([])
  })

  it('reserves unknown submissions without counting them as successful or allowing replacement sends', () => {
    const board = new Workbench(); board.configureCommentBudget({ targetCount: 1 })
    const review = board.requestReview(source); board.decide(review.id, 'approve'); board.prepareSubmission(review.id)
    board.updateReview(review.id, { status: 'unknown' })
    expect(board.comments).toMatchObject({ sent: 0, unknown: 1, remainingTarget: 1, availableSlots: 0 })
    expect(() => board.requestReview({ ...source, target: 'post:2' })).toThrow('comment_slots_reserved')
    expect(board.commentStopReason()).toBeUndefined()
    expect(() => board.configureCommentBudget({ targetCount: 2 })).toThrow('comment_budget_frozen')
  })

  it('preserves the original deadline across recovery and rejects malformed or self-extended limits', () => {
    let time = 1000
    const board = new Workbench(undefined, undefined, () => time)
    board.configureCommentBudget({ targetCount: 3, maxDurationSeconds: 2 }); time = 2000
    const restored = new Workbench(board.snapshot(), undefined, () => time)
    restored.configureCommentBudget({ targetCount: 3, maxDurationSeconds: 2 })
    expect(restored.commentBudget?.deadlineAt).toBe(new Date(3000).toISOString())
    time = 3000; expect(restored.commentStopReason()).toBe('time_limit')
    for (const budget of [{}, { targetCount: 0 }, { targetCount: 101 }, { maxDurationSeconds: 0 }, { maxDurationSeconds: 1.5 }, { targetCount: 1, resume: true }]) {
      expect(() => createCommentBudget(budget, time)).toThrow()
      expect(() => validateToolArguments('opengui_open_session', { deviceId: 'a', scenario: 'comments', commentBudget: budget })).toThrow()
    }
  })

  it('automatically ends at the verified target while preserving unfinished steps and refusing further sends', async () => {
    const f = await fixture({ targetCount: 1 }), act = vi.spyOn(f.host, 'act')
    let image = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.stepId)
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'tap', externalSideEffect: 'send', observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toMatchObject({ code: 'review_required' })
    const review = f.service.reviewComment(f.session.sessionId, source) as { id: string }
    expect((await f.action({ action: 'review_save', reviewId: review.id, draft: 'Human saved edit', expectedVersion: 1 })).status).toBe(200)
    expect(f.board.reviews[0]).toMatchObject({ status: 'pending', contentVersion: 2 })
    expect((await f.action({ action: 'review', reviewId: review.id, decision: 'approve', expectedVersion: 2 })).status).toBe(200)
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, { left: 10, top: 10, right: 20, bottom: 20 }, f.signal)
    image = await f.service.act(f.session.sessionId, undefined, { action: 'text', text: 'Human saved edit', reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, { left: 10, top: 10, right: 20, bottom: 20 }, f.signal)
    image = await f.service.act(f.session.sessionId, undefined, { action: 'tap', externalSideEffect: 'send', reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)
    expect(f.board.comments).toMatchObject({ sent: 0, submitted: 1, availableSlots: 0 })
    f.service.verifyComment(f.session.sessionId, review.id, image.observationId)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', result: { outcome: 'stopped' }, comments: { sent: 1, targetCount: 1, stopReason: 'target_reached' }, progress: { completed: 0 } }))
    expect(f.viewer.taskSteps(f.display.viewerId).at(-1)?.status).toBe('pending')
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'tap', externalSideEffect: 'send', observationId: image.observationId }, f.signal)).rejects.toThrow('closed')
    expect(act).toHaveBeenCalledTimes(4)
    expect(f.board.markdown([])).toContain('已核验 1／1')
  })

  it('records a phone draft only against fresh evidence and keeps it separate from the local final draft', async () => {
    const f = await fixture({ targetCount: 2 })
    const image = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.stepId), review = f.service.reviewComment(f.session.sessionId, source) as { id: string }
    await expect(callOpenGuiTool(f.service, 'opengui_review_comment', { sessionId: f.session.sessionId, platformDraft: { reviewId: review.id, text: 'Phone original', evidenceObservationId: 'old' } }, f.signal)).rejects.toThrow('platform_draft_unverified')
    await callOpenGuiTool(f.service, 'opengui_review_comment', { sessionId: f.session.sessionId, platformDraft: { reviewId: review.id, text: 'Phone original', evidenceObservationId: image.observationId } }, f.signal)
    expect(f.board.reviews[0]).toMatchObject({ draft: source.draft, contentVersion: 1, draftVersions: [{ source: 'generated' }, { source: 'platform', draft: 'Phone original', evidenceObservationId: image.observationId }] })
  })

  it('stops at the deadline during human review without extending the lease or permitting late approval', async () => {
    const f = await fixture({ targetCount: 2, maxDurationSeconds: 1 }), act = vi.spyOn(f.host, 'act')
    const review = f.service.reviewComment(f.session.sessionId, source) as { id: string }, deadline = f.board.commentBudget!.deadlineAt
    expect((await f.action({ action: 'takeover' })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', result: { outcome: 'stopped' }, comments: { sent: 0, pending: 1, stopReason: 'time_limit', deadlineAt: deadline } }), { timeout: 2500 })
    expect((await f.action({ action: 'review', reviewId: review.id, decision: 'approve' })).status).not.toBe(200)
    expect((await f.action({ action: 'resume' })).status).not.toBe(200)
    expect(act).not.toHaveBeenCalled()
    expect(f.service.reviewComment(f.session.sessionId)).toMatchObject({ reviews: [{ status: 'pending' }] })
  })

  it('aborts an in-flight send at the time limit and preserves its unknown outcome without replay', async () => {
    const f = await fixture({ targetCount: 2, maxDurationSeconds: 1 })
    let image = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.stepId)
    const review = f.service.reviewComment(f.session.sessionId, source) as { id: string }
    await f.action({ action: 'review', reviewId: review.id, decision: 'approve' })
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, { left: 10, top: 10, right: 20, bottom: 20 }, f.signal)
    image = await f.service.act(f.session.sessionId, undefined, { action: 'text', text: source.draft, reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, { left: 10, top: 10, right: 20, bottom: 20 }, f.signal)
    const act = vi.spyOn(f.host, 'act').mockImplementation(async (_actor, _input, signal) => new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })))
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'tap', externalSideEffect: 'send', reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toMatchObject({ code: 'comment_budget_exhausted' })
    expect(f.board.reviews[0]?.status).toBe('unknown')
    expect(f.board.traces.at(-1)?.status).toBe('unknown')
    expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', comments: { sent: 0, unknown: 1, reserved: 1 } })
    expect(act).toHaveBeenCalledTimes(1)
  })
})
