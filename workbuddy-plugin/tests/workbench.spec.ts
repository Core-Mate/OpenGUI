import { describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
import { WorkBuddyOpenGuiService, type WorkBuddyPhoneHost } from '../src/service.ts'
import { Workbench } from '../src/workbench.ts'
import { wordReport } from '../src/report-export.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'
import { callOpenGuiTool, validateToolArguments } from '../src/tools.ts'
import { callBudgetMs } from '../src/state.ts'

async function fixture(beforeSession?: (board: Workbench) => void) {
  const { viewer, sinks } = setup(); const host: WorkBuddyPhoneHost = new FakeHost()
  const service = new WorkBuddyOpenGuiService({ host, viewers: viewer }), signal = AbortSignal.timeout(5000)
  const opened = await service.openViewer(['phone-a'], signal)
  const page = await connect(opened.url, 'phone-a')
  sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  beforeSession?.(viewer.board(opened.viewerId))
  const session = await service.openSession(['phone-a'], signal, 'control', { viewerId: opened.viewerId, objective: 'Check a page', successCriteria: 'Verify the requested result from the current screen' })
  const action = (input: Record<string, unknown>, token = new URL(opened.workbenchUrl).hash.slice(7)) => fetch(`${opened.url}board`, {
    method: 'POST', headers: { Origin: new URL(opened.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': token }, body: JSON.stringify(input),
  })
  return { viewer, host, service, signal, opened, session, action }
}

describe('receipt-backed workbench', () => {
  it('records a sensitive-flow handoff, preserves its lease and requires fresh observation after real handback', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act'), board = f.viewer.board(f.opened.viewerId)
    try {
      const previous = await f.service.observe(f.session.sessionId, undefined, f.signal)
      const lease = f.service.snapshotSession(f.session.sessionId).leaseExpiresAt
      const pending = await callOpenGuiTool(f.service, 'opengui_handoff', { sessionId: f.session.sessionId, category: 'otp', reason: '登录页面需要验证码，请在原手机处理后交还控制。', waitMs: 0 }, f.signal)
      expect(pending).toMatchObject({ state: 'active', controlMode: 'manual', activity: 'paused', leaseExpiresAt: lease, handoff: { category: 'otp', status: 'waiting_user' } })
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', key: 'Back', observationId: previous.observationId }, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      await f.service.requestHandoff(f.session.sessionId, 'otp', 'Retry must preserve the original request', 0, f.signal)
      expect(board.handoffs).toHaveLength(1)
      expect(board.pendingHandoff?.reason).toContain('原手机')
      expect((await f.action({ action: 'recheck' })).status).toBe(200)
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('manual')
      expect((await f.action({ action: 'resume' })).status).toBe(200)
      expect(board.pendingHandoff).toMatchObject({ status: 'waiting_observation', resumedAt: expect.any(String) })
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', observationId: previous.observationId }, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      const fresh = await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(board.pendingHandoff).toBeUndefined()
      expect(board.handoffs[0]).toMatchObject({ status: 'resolved', evidenceObservationId: fresh.observationId, resolvedAt: expect.any(String) })
      expect(board.markdown([])).toContain('人工处理记录')
      expect(act).not.toHaveBeenCalled()
    } finally { await f.service.dispose() }
  })

  it('revokes control even if saving a handoff fails', async () => {
    const f = await fixture(), board = f.viewer.board(f.opened.viewerId), act = vi.spyOn(f.host, 'act')
    try {
      const previous = await f.service.observe(f.session.sessionId, undefined, f.signal)
      vi.spyOn(board, 'checkpoint').mockImplementation(() => { throw new Error('disk full') })
      await expect(f.service.requestHandoff(f.session.sessionId, 'password', 'Please handle the password field on the original phone', 0, f.signal)).rejects.toThrow('disk full')
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('manual')
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', observationId: previous.observationId }, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      expect(act).not.toHaveBeenCalled()
      vi.restoreAllMocks()
    } finally { await f.service.dispose() }
  })

  it('aborts in-flight phone dispatch when requesting human handling without replaying the mutation', async () => {
    const f = await fixture()
    try {
      const frame = await f.service.observe(f.session.sessionId, undefined, f.signal)
      let entered!: () => void
      const started = new Promise<void>(resolve => { entered = resolve })
      const act = vi.spyOn(f.host, 'act').mockImplementation(async (_actor, _input, signal) => {
        entered()
        return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }))
      })
      const pending = f.service.act(f.session.sessionId, undefined, { action: 'tap', observationId: frame.observationId }, f.signal)
      const rejected = expect(pending).rejects.toMatchObject({ code: 'task_paused' })
      await started
      await f.service.requestHandoff(f.session.sessionId, 'security', 'Handle the security challenge on the phone', 0, f.signal)
      await rejected
      expect(f.viewer.board(f.opened.viewerId).traces.at(-1)?.status).toBe('unknown')
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('manual')
      expect(act).toHaveBeenCalledTimes(1)
    } finally { await f.service.dispose() }
  })

  it('keeps an unresolved historical handoff in manual mode when opening new control authority', async () => {
    const f = await fixture(board => board.requestHandoff('security', 'Review the security prompt on the original phone'))
    try {
      expect(f.session).toMatchObject({ controlMode: 'manual', handoff: { status: 'waiting_user' } })
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      expect((await f.action({ action: 'resume' })).status).toBe(200)
      await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(f.viewer.board(f.opened.viewerId).pendingHandoff).toBeUndefined()
    } finally { await f.service.dispose() }
  })

  it('does not release a handoff when observing after handback fails', async () => {
    const f = await fixture(), board = f.viewer.board(f.opened.viewerId)
    try {
      await f.service.requestHandoff(f.session.sessionId, 'verification', 'Handle identity verification on the phone', 0, f.signal)
      expect((await f.action({ action: 'resume' })).status).toBe(200)
      vi.spyOn(f.host, 'observe').mockRejectedValueOnce(new Error('capture failed'))
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toThrow('capture failed')
      expect(board.pendingHandoff?.status).toBe('waiting_observation')
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('reconciling')
      await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(board.pendingHandoff).toBeUndefined()
    } finally { await f.service.dispose() }
  })

  it('keeps manual control if the human handback cannot be archived', async () => {
    const f = await fixture(), board = f.viewer.board(f.opened.viewerId)
    try {
      await f.service.requestHandoff(f.session.sessionId, 'payment', 'Review the payment prompt on the phone', 0, f.signal)
      const saving = vi.spyOn(board, 'checkpoint').mockImplementation(() => { throw new Error('disk full') })
      expect((await f.action({ action: 'resume' })).status).not.toBe(200)
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('manual')
      expect(board.pendingHandoff?.status).toBe('waiting_user')
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      saving.mockRestore()
      expect((await f.action({ action: 'resume' })).status).toBe(200)
      await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(board.pendingHandoff).toBeUndefined()
    } finally { await f.service.dispose() }
  })

  it('rejects self-resume and secret-value arguments on the handoff boundary', () => {
    const request = { sessionId: 's', category: 'otp', reason: 'Handle verification on the phone' }
    expect(() => validateToolArguments('opengui_handoff', request)).not.toThrow()
    for (const patch of [{ resume: true }, { code: '123456' }, { password: 'fixture-secret' }, { category: 'approve' }, { waitMs: 30001 }]) {
      expect(() => validateToolArguments('opengui_handoff', { ...request, ...patch })).toThrow()
    }
  })
  it('resumes a bounded review wait after a real decision without renewing the control lease', async () => {
    const f = await fixture()
    try {
      const review = f.service.reviewComment(f.session.sessionId, { account: 'qa', target: 'post:wait', context: 'Source', draft: 'Draft' }) as { id: string }
      const lease = (await f.service.status(f.session.sessionId, f.signal)).leaseExpiresAt
      const waiting = f.service.waitForUser(f.session.sessionId, 1000, f.signal, true)
      expect((await f.action({ action: 'review', reviewId: review.id, decision: 'skip' })).status).toBe(200)
      expect(await waiting).toMatchObject({ reviews: [{ status: 'skipped' }] })
      expect((await f.service.status(f.session.sessionId, f.signal)).leaseExpiresAt).toBe(lease)
      const aborted = new AbortController(); aborted.abort(new Error('stop waiting'))
      await expect(f.service.waitForUser(f.session.sessionId, 1000, aborted.signal, true)).rejects.toThrow('stop waiting')
    } finally { await f.service.dispose() }
  })
  it('opens connection guidance without preparing video or inheriting task readiness', async () => {
    const { viewer, prepare } = setup()
    const guide = await viewer.open('task', [], AbortSignal.timeout(1000))
    expect(prepare).not.toHaveBeenCalled()
    expect(guide.firstDisplayEstablished).toBe(false)
    const page = await fetch(guide.url).then(r => r.text())
    expect(page).toContain('接入指引'); expect(page).toContain('选择设备')
    const task = await viewer.open('task', [{ id: 'a', serial: 'a', name: 'a' }], AbortSignal.timeout(1000))
    expect(task.viewerId).not.toBe(guide.viewerId)
    expect(() => viewer.assertReady(task.viewerId)).toThrow('waiting_for_frame')
  })

  it('keeps board capability out of HTTP status and rejects read-only/cross-origin writes', async () => {
    const f = await fixture()
    try {
      const state = await fetch(`${f.opened.url}status`).then(r => r.text())
      expect(state).not.toContain(new URL(f.opened.workbenchUrl).hash.slice(7))
      expect(state).not.toContain('workbenchUrl')
      expect((await f.action({ action: 'takeover' }, '')).status).toBe(403)
      expect((await fetch(`${f.opened.url}board`, { method: 'POST', headers: { Origin: 'https://invalid.example' } })).status).toBe(403)
      expect((await f.action({ action: 'tap', x: 10 })).status).toBe(400)
      expect((await f.service.status(f.session.sessionId, f.signal)).controlMode).toBe('agent')
    } finally { await f.service.dispose() }
  })

  it('blocks actions during takeover and after handback until a new observation', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act')
    try {
      const previous = await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect((await f.action({ action: 'takeover' })).status).toBe(200)
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', observationId: previous.observationId }, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      expect((await f.action({ action: 'resume' })).status).toBe(200)
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', observationId: previous.observationId }, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      expect(act).not.toHaveBeenCalled()
      const fresh = await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(fresh.observationId).not.toBe(previous.observationId)
      await f.service.act(f.session.sessionId, undefined, { action: 'key', observationId: fresh.observationId }, f.signal)
      expect(act).toHaveBeenCalledTimes(1)
    } finally { await f.service.dispose() }
  })

  it('keeps one status wait open across a long takeover and returns as soon as control is resumed', async () => {
    expect(() => validateToolArguments('opengui_status', { sessionId: 's', waitMs: 600_000 })).not.toThrow()
    expect(() => validateToolArguments('opengui_status', { sessionId: 's', waitMs: 600_001 })).toThrow()
    expect(() => validateToolArguments('opengui_viewer_status', { viewerId: 'v', waitMs: 600_000 })).toThrow()
    expect(callBudgetMs({})).toBe(120_000); expect(callBudgetMs({ waitMs: 600_000 })).toBe(630_000)
    const f = await fixture()
    try {
      await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect((await f.action({ action: 'takeover' })).status).toBe(200)
      const start = Date.now(); let offset = 0
      vi.spyOn(Date, 'now').mockImplementation(() => start + offset)
      let settled = false
      const waiting = callOpenGuiTool(f.service, 'opengui_status', { sessionId: f.session.sessionId, waitMs: 600_000 }, AbortSignal.timeout(10_000)).then(value => { settled = true; return value })
      // The former 30 s cap would have returned here and let the host turn end.
      offset = 31_000
      await new Promise(resolve => setTimeout(resolve, 300))
      expect(settled).toBe(false)
      expect((await f.action({ action: 'resume' })).status).toBe(200)
      expect(await waiting).toMatchObject({ controlMode: 'reconciling' })
    } finally { vi.restoreAllMocks(); await f.service.dispose() }
  })

  it('aborts an in-flight mutation on takeover and records its outcome as unknown', async () => {
    const f = await fixture()
    try {
      const frame = await f.service.observe(f.session.sessionId, undefined, f.signal)
      let entered!: () => void
      const started = new Promise<void>(resolve => { entered = resolve })
      f.host.act = async (_actor, _input, signal) => {
        entered()
        return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }))
      }
      const work = f.service.act(f.session.sessionId, undefined, { action: 'tap', observationId: frame.observationId }, f.signal)
      const failure = expect(work).rejects.toMatchObject({ code: 'task_paused' })
      await started
      expect((await f.action({ action: 'takeover' })).status).toBe(200)
      await failure
      expect(f.viewer.board(f.opened.viewerId).traces.at(-1)?.status).toBe('unknown')
      expect((await f.service.status(f.session.sessionId, f.signal)).controlMode).toBe('manual')
    } finally { await f.service.dispose() }
  })

  it('keeps a takeover through connection rechecks and no longer accepts a separate pause', async () => {
    const f = await fixture(), observe = vi.spyOn(f.host, 'observe')
    try {
      await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect((await f.action({ action: 'takeover' })).status).toBe(200)
      expect((await f.action({ action: 'recheck' })).status).toBe(200)
      expect((await f.service.status(f.session.sessionId, f.signal)).controlMode).toBe('manual')
      // Takeover is the pause: no screenshot reaches the host while the person controls the phone.
      const captured = observe.mock.calls.length
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      expect(observe.mock.calls.length).toBe(captured)
      expect((await f.action({ action: 'resume' })).status).toBe(200)
      expect((await f.service.status(f.session.sessionId, f.signal)).controlMode).toBe('reconciling')
      await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect((await f.action({ action: 'pause' })).status).toBe(400)
      expect((await f.service.status(f.session.sessionId, f.signal)).controlMode).toBe('agent')
    } finally { await f.service.dispose() }
  })

  it('requires human review, respects edited text, prevents resending and counts only verified sends', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act')
    try {
      let frame = await f.service.observe(f.session.sessionId, undefined, f.signal)
      const review = f.service.reviewComment(f.session.sessionId, { account: 'qa', target: 'post:1', context: 'Source post', draft: 'Draft' }) as { id: string }
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'text', text: 'Draft', observationId: frame.observationId, reviewId: review.id }, f.signal)).rejects.toMatchObject({ code: 'review_required' })
      expect((await f.action({ action: 'review', reviewId: review.id, decision: 'approve', draft: 'User edit 😀\nNext line' })).status).toBe(200)
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'text', text: 'Draft', observationId: frame.observationId, reviewId: review.id }, f.signal)).rejects.toMatchObject({ code: 'review_changed' })
      expect(act).not.toHaveBeenCalled()
      frame = await f.service.commentInput(f.session.sessionId, review.id, frame.observationId, { left: 10, top: 10, right: 20, bottom: 20 }, f.signal)
      frame = await f.service.act(f.session.sessionId, undefined, { action: 'text', text: 'User edit 😀\nNext line', observationId: frame.observationId, reviewId: review.id }, f.signal)
      frame = await f.service.commentInput(f.session.sessionId, review.id, frame.observationId, { left: 10, top: 10, right: 20, bottom: 20 }, f.signal)
      frame = await f.service.act(f.session.sessionId, undefined, { action: 'tap', observationId: frame.observationId, reviewId: review.id, externalSideEffect: 'send' }, f.signal)
      expect(f.viewer.board(f.opened.viewerId).reviews[0]?.status).toBe('submitted')
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'tap', observationId: frame.observationId, reviewId: review.id, externalSideEffect: 'send' }, f.signal)).rejects.toMatchObject({ code: 'review_required' })
      expect(() => f.service.verifyComment(f.session.sessionId, review.id, 'old-frame')).toThrow('comment_unverified')
      expect(f.service.verifyComment(f.session.sessionId, review.id, frame.observationId).status).toBe('sent')
      expect(act).toHaveBeenCalledTimes(4)
      expect(f.viewer.board(f.opened.viewerId).reviews.filter(r => r.status === 'sent')).toHaveLength(1)
    } finally { await f.service.dispose() }
  })

  it('exports readable Unicode DOCX and a ZIP whose evidence references resolve', async () => {
    const f = await fixture()
    try {
      const frame = await f.service.observe(f.session.sessionId, undefined, f.signal)
      await f.service.closeSession(f.session.sessionId, { outcome: 'completed', summary: '检查完成；提交未执行。', evidenceObservationIds: [frame.observationId] })
      const report = await fetch(`${f.opened.url}report?format=md`).then(r => r.text())
      expect(report).toContain('检查完成；提交未执行。')
      expect(report).toContain('evidence/frame-1.jpg')
      const archive = unzipSync(new Uint8Array(await fetch(`${f.opened.url}report?format=zip`).then(r => r.arrayBuffer())))
      expect(Buffer.from(archive['evidence/frame-1.jpg']!).toString()).toBe('jpeg')
      expect(Buffer.from(archive['report.md']!).toString()).toBe(report)
      const docx = unzipSync(new Uint8Array(await fetch(`${f.opened.url}report?format=docx`).then(r => r.arrayBuffer())))
      expect(Buffer.from(docx['word/document.xml']!).toString()).toContain('检查完成；提交未执行。')
      expect(docx['[Content_Types].xml']).toBeDefined()
      expect((await fetch(`${f.opened.url}report?format=bad`)).status).toBe(400)
    } finally { await f.service.dispose() }
  })

  it('bounds retained evidence, escapes XML and keeps action inputs out of trace', () => {
    const board = new Workbench()
    for (let i = 0; i < 40; i++) board.capture(String(i), Buffer.alloc(1_000_000))
    expect(board.evidence.size).toBe(32)
    expect(board.evidence.has('0')).toBe(false)
    const document = unzipSync(wordReport('中文 <&> \u0001'))
    expect(Buffer.from(document['word/document.xml']!).toString()).toContain('中文 &lt;&amp;&gt; ')
    expect(Buffer.from(document['word/document.xml']!).toString()).not.toContain('\u0001')
    const trace = board.begin('device', 'text', 1000)
    board.finish(trace, 1100, 'executed', 'observed')
    expect(JSON.stringify(board.snapshot())).not.toContain('password')
    expect(trace.durationMs).toBe(100)
  })

  it('rejects partial review requests, approval arguments and multiple task devices at the MCP boundary', () => {
    expect(() => validateToolArguments('opengui_review_comment', { sessionId: 's', draft: 'x' })).toThrow()
    expect(() => validateToolArguments('opengui_review_comment', { sessionId: 's', decision: 'approve' })).toThrow()
    expect(() => validateToolArguments('opengui_open_session', { deviceIds: ['a', 'b'] })).toThrow()
    expect(() => validateToolArguments('opengui_review_comment', { sessionId: 's' })).not.toThrow()
  })
})
