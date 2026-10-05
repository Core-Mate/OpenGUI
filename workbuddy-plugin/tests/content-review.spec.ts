import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { validateToolArguments } from '../src/tools.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

const services: WorkBuddyOpenGuiService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.dispose() })
const post = { kind: 'post' as const, title: '周末徒步路线', account: '科技小观察员', target: '我的主页 · 新笔记', context: '用户要求分享本周徒步经历', draft: '周末走了一条新路线，风景很好。' }
const box = { left: 10, top: 10, right: 20, bottom: 20 }

async function fixture(contentReview: boolean) {
  const { viewer, sinks } = setup(), host = new FakeHost(), service = new WorkBuddyOpenGuiService({ viewers: viewer, host })
  services.push(service)
  const signal = AbortSignal.timeout(5000), display = await service.openViewer(['phone-a'], signal)
  const page = await connect(display.url, 'phone-a'); sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  // The person's 高级选项 choice on the start page.
  viewer.board(display.viewerId).contentReview = contentReview ? true : undefined
  viewer.writeTodos(display.viewerId, 'local', [{ content: 'Publish the approved post', status: 'pending' }])
  const session = await service.openSession(['phone-a'], signal, 'control', { viewerId: display.viewerId, objective: 'Publish a hiking note' })
  const action = (body: Record<string, unknown>) => fetch(`${display.url}board`, { method: 'POST', headers: { Origin: new URL(display.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(display.workbenchUrl).hash.slice(7) }, body: JSON.stringify(body) })
  const board = viewer.board(display.viewerId), stepId = viewer.progress(display.viewerId)!.nextStepId
  const image = await service.observe(session.sessionId, undefined, signal, undefined, undefined, stepId)
  return { viewer, host, service, signal, session, action, board, stepId, image }
}

describe('content review mode (发内容前需要审核)', () => {
  it('requires classified gestures and an approved review before publishing, leaving ordinary typing free', async () => {
    const f = await fixture(true), act = vi.spyOn(f.host, 'act'), at = (extra: Record<string, unknown>) => ({ observationId: f.image.observationId, stepId: f.stepId, ...extra })
    expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ contentReview: true })
    await expect(f.service.act(f.session.sessionId, undefined, at({ action: 'tap', targetBBox: box }), f.signal)).rejects.toMatchObject({ code: 'content_action_unclassified', executionState: 'not_executed' })
    await expect(f.service.act(f.session.sessionId, undefined, at({ action: 'key', key: 'Enter' }), f.signal)).rejects.toMatchObject({ code: 'content_action_unclassified' })
    await expect(f.service.act(f.session.sessionId, undefined, at({ action: 'tap', targetBBox: box, externalSideEffect: 'publish' }), f.signal)).rejects.toMatchObject({ code: 'review_required', executionState: 'not_executed' })
    expect(act).not.toHaveBeenCalled()
    // Navigation and search typing still work without a review.
    let image = await f.service.act(f.session.sessionId, undefined, at({ action: 'tap', targetBBox: box, externalSideEffect: 'none' }), f.signal)
    image = await f.service.act(f.session.sessionId, undefined, { action: 'text', text: '徒步', observationId: image.observationId, stepId: f.stepId }, f.signal)
    expect(act).toHaveBeenCalledTimes(2)
  })

  it('publishes a post only after approval and an exact read-back, records kind and title, and never publishes it twice', async () => {
    const f = await fixture(true)
    let image = f.image
    const review = f.service.reviewComment(f.session.sessionId, post) as { id: string; status: string; kind: string; title: string }
    expect(review).toMatchObject({ status: 'pending', kind: 'post', title: '周末徒步路线' })
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, box, f.signal)
    expect((await f.action({ action: 'review', reviewId: review.id, decision: 'approve', expectedVersion: 1 })).status).toBe(200)
    image = await f.service.act(f.session.sessionId, undefined, { action: 'text', text: post.draft, reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)
    image = await f.service.commentInput(f.session.sessionId, review.id, image.observationId, box, f.signal)
    image = await f.service.act(f.session.sessionId, undefined, { action: 'tap', targetBBox: box, externalSideEffect: 'publish', reviewId: review.id, observationId: image.observationId, stepId: f.stepId }, f.signal)
    f.service.verifyComment(f.session.sessionId, review.id, image.observationId)
    expect(f.board.reviews[0]).toMatchObject({ status: 'sent', kind: 'post', draft: post.draft })
    // The approval was consumed; the same text cannot be published again on that target.
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'tap', targetBBox: box, externalSideEffect: 'publish', observationId: image.observationId, stepId: f.stepId }, f.signal)).rejects.toMatchObject({ code: 'review_required' })
    expect(() => f.service.reviewComment(f.session.sessionId, post)).toThrow('content_already_published')
    // A new post on the same page is allowed and goes through review again.
    expect(f.service.reviewComment(f.session.sessionId, { ...post, draft: '第二篇：路线补充说明。' })).toMatchObject({ status: 'pending', kind: 'post' })
    const report = f.board.markdown([])
    expect(report).toContain('## 内容审核'); expect(report).toContain('帖子 · 科技小观察员'); expect(report).toContain('标题：周末徒步路线'); expect(report).toContain('发内容前审核')
  })

  it('keeps the previous behavior when the option is off', async () => {
    const f = await fixture(false), act = vi.spyOn(f.host, 'act')
    expect(f.service.snapshotSession(f.session.sessionId).contentReview).toBeUndefined()
    await f.service.act(f.session.sessionId, undefined, { action: 'tap', targetBBox: box, externalSideEffect: 'publish', observationId: f.image.observationId, stepId: f.stepId }, f.signal)
    expect(act).toHaveBeenCalledTimes(1)
  })

  it('accepts kind and title only with a draft', () => {
    expect(() => validateToolArguments('opengui_review_comment', { sessionId: 's', ...post })).not.toThrow()
    expect(() => validateToolArguments('opengui_review_comment', { sessionId: 's', kind: 'post' })).toThrow('invalid arguments')
    expect(() => validateToolArguments('opengui_review_comment', { sessionId: 's', ...post, kind: 'like' })).toThrow('invalid arguments')
  })
})
