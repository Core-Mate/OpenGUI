import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TaskStore, type StoredTask } from '../src/task-store.ts'
import { Workbench } from '../src/workbench.ts'
import { ViewerServer } from '../src/viewer.ts'
import { a } from './viewer-fixture.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'opengui-archive-')); directories.push(directory)
  const store = new TaskStore(directory)
  return { directory, store }
}
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
function saved(board: Workbench): StoredTask {
  return { version: 1, id, owner: 'old-host', devices: [a], board: board.snapshot(), todos: [{ stepId: 'step-1', content: 'Check UI', status: 'in_progress' }], updatedAt: new Date().toISOString() }
}

describe('durable task records', () => {
  it('archives human handling history and resets an unfinished historical handback on restore', () => {
    const { store } = fixture(), board = new Workbench()
    board.requestHandoff('payment', 'Review the payment prompt on the original phone; stop before confirming payment')
    board.resumeHandoff()
    store.save(saved(board), board.markdown([]))
    const restored = new Workbench(store.load(id).board)
    expect(restored.pendingHandoff).toMatchObject({ category: 'payment', status: 'waiting_user', resumedAt: expect.any(String) })
    restored.resolveHandoff('old-frame')
    expect(restored.pendingHandoff?.status).toBe('waiting_user')
    restored.resumeHandoff(); restored.resolveHandoff('fresh-frame')
    store.save(saved(restored), restored.markdown([]))
    const completed = new Workbench(store.load(id).board)
    expect(completed.pendingHandoff).toBeUndefined()
    expect(completed.handoffs[0]).toMatchObject({ status: 'resolved', evidenceObservationId: 'fresh-frame' })
    expect(readFileSync(join(store.path(id), 'report.md'), 'utf8')).toContain('fresh-frame')
  })
  it('archives reports and evidence beyond the memory cache and rejects historical duplicates after restart', () => {
    const { directory, store } = fixture()
    let board: Workbench
    board = new Workbench(undefined, {
      save: () => store.save(saved(board), board.markdown([])),
      capture: (_id, name, data) => store.evidence(id, name, data),
      previousComment: (account, target) => store.previousComment(account, target, id),
    })
    const review = board.requestReview({ account: 'qa', target: 'post:1', context: 'Original post', draft: 'Original draft' })
    board.decide(review.id, 'approve', 'User edit 😀\nSecond line')
    board.prepareSubmission(review.id)
    expect(store.load(id).board.reviews[0]).toMatchObject({ status: 'submitted', contentVersion: 2, originalDraft: 'Original draft', draft: 'User edit 😀\nSecond line' })
    expect(store.load(id).board.reviews[0]?.draftVersions).toHaveLength(2)
    expect(store.load(id).board.reviews[0]?.decisions?.[0]).toMatchObject({ decision: 'approve', contentVersion: 2 })
    const trace = board.begin('a', 'observe', Date.now()); board.finish(trace, Date.now(), 'executed', 'image')
    board.capture('image', Buffer.from('actual-image'))
    expect(readFileSync(join(directory, id, 'evidence/frame-1.jpg'), 'utf8')).toBe('actual-image')
    board.updateReview(review.id, { status: 'sent', evidenceObservationId: 'image' })
    const restarted = new TaskStore(directory)
    expect(restarted.previousComment('qa', 'post:1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')?.status).toBe('sent')
    expect(restarted.previousComment('other-account', 'post:1', id)).toBeUndefined()
    expect(readFileSync(join(directory, id, 'report.md'), 'utf8')).toContain('User edit 😀')
    expect(restarted.load(id).board).not.toHaveProperty('boardToken')
  })

  it('does not approve or submit when durable saving fails', () => {
    let failing = false
    const board = new Workbench(undefined, { save: () => { if (failing) throw new Error('disk full') }, capture() {}, previousComment: () => undefined })
    const review = board.requestReview({ account: 'qa', target: 'post', context: 'Source', draft: 'Draft' })
    failing = true
    expect(() => board.decide(review.id, 'approve', 'Changed')).toThrow('disk full')
    expect(review).toMatchObject({ status: 'pending', draft: 'Draft', contentVersion: 1 })
    failing = false; board.decide(review.id, 'approve'); failing = true
    expect(() => board.prepareSubmission(review.id)).toThrow('disk full')
    expect(review.status).toBe('approved')
    expect(review.submittedAt).toBeUndefined()
  })

  it('fails closed when historical records cannot be read', () => {
    const { store, directory } = fixture(), board = new Workbench()
    store.save(saved(board), 'Report')
    writeFileSync(join(directory, id, 'task.json'), '{ broken')
    expect(() => store.previousComment('qa', 'post', 'new')).toThrow()
    expect(() => store.path('../../outside')).toThrow('invalid_task_id')
  })

  it('restores data with new viewing grants and first-frame gating, never old approvals or observation authority', async () => {
    const { store } = fixture(), board = new Workbench()
    const review = board.requestReview({ account: 'qa', target: 'post', context: 'Source', draft: 'Draft' }); board.decide(review.id, 'approve')
    store.save(saved(board), board.markdown([]))
    const viewer = new ViewerServer({ async prepare() {}, async subscribe() { return () => {} }, async dispose() {} }, Date.now, store)
    try {
      const restored = await viewer.open('new-host', [a], AbortSignal.timeout(1000), id)
      expect(restored.viewerId).toBe(id)
      expect(restored.firstDisplayEstablished).toBe(false)
      expect(restored.board.reviews[0]?.status).toBe('pending')
      expect(restored.todos[0]?.stepId).toBe('step-1')
      expect(() => viewer.assertReady(id)).toThrow('waiting_for_frame')
      expect(store.load(id).owner).toBe('new-host')
    } finally { await viewer.dispose() }
  })
})
