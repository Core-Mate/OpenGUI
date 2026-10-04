import { describe, expect, it, vi } from 'vitest'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { Workbench } from '../src/workbench.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

class Host extends FakeHost {
  onDeviceUnavailable?: (serial: string) => void
  readonly invalidate = vi.fn()
}
async function fixture() {
  const f = setup(), host = new Host(), signal = AbortSignal.timeout(10_000)
  const service = new WorkBuddyOpenGuiService({ host, viewers: f.viewer })
  const opened = await service.openViewer(['phone-a'], signal, { objective: 'Inspect the original page', successCriteria: 'Verify navigation only' })
  const page = await connect(opened.url, 'phone-a')
  f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  const session = await service.openSession(['phone-a'], signal, 'control', { viewerId: opened.viewerId })
  const action = (name: string, token = new URL(opened.workbenchUrl).hash.slice(7)) => fetch(`${opened.url}board`, { method: 'POST', headers: { Origin: new URL(opened.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': token }, body: JSON.stringify({ action: name }) })
  return { ...f, host, signal, service, opened, session, action, board: f.viewer.board(opened.viewerId) }
}

describe('human recheck of the original disconnected device', () => {
  it('pauses without discarding records or substituting another available phone', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act')
    try {
      const plan = f.viewer.writeTodos(f.opened.viewerId, 'local', [{ content: 'Inspect the original page', status: 'pending' }]), stepId = plan.todos[0]!.stepId
      const old = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, stepId)
      const review = f.board.requestReview({ account: 'qa', target: 'post:1', context: 'Original context', draft: 'Human final' })
      f.board.decide(review.id, 'approve'); f.board.prepareSubmission(review.id); f.board.updateReview(review.id, { status: 'unknown' })
      const original = f.host.devices.shift()!
      await f.service.status(f.session.sessionId, f.signal)
      expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'active', controlMode: 'paused', connectionRecovery: { status: 'waiting_recheck' }, comments: { unknown: 1, sent: 0 } })
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      expect((await f.action('recheck', 'wrong')).status).toBe(403)
      expect((await f.action('recheck')).status).toBe(400)
      expect(f.board.connectionRecovery?.status).toBe('waiting_recheck')
      f.host.devices.unshift(original)
      await f.service.status(f.session.sessionId, f.signal)
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('paused')
      expect((await f.action('recheck')).status).toBe(200)
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('reconciling')
      await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', key: 'Home', observationId: old.observationId }, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      const fresh = await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, stepId)
      expect(fresh.observationId).not.toBe(old.observationId)
      expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ sessionId: f.session.sessionId, controlMode: 'agent', devices: [{ id: 'phone-a' }], connectionRecovery: { status: 'resolved', evidenceObservationId: fresh.observationId }, comments: { unknown: 1, sent: 0 } })
      expect(f.viewer.taskSteps(f.opened.viewerId)[0]!.stepId).toBe(stepId)
      expect(review).toMatchObject({ status: 'unknown', draft: 'Human final' })
      expect(f.board.markdown([])).toContain('原设备连接恢复')
      expect(act).not.toHaveBeenCalled()
    } finally { await f.service.dispose() }
  })

  it('does not turn a manual takeover into agent control through connection recheck', async () => {
    const f = await fixture()
    try {
      await f.action('takeover'); f.host.onDeviceUnavailable?.('serial-a')
      expect((await f.action('recheck')).status).toBe(200)
      expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ controlMode: 'manual', connectionRecovery: { status: 'waiting_recheck' } })
      expect((await f.action('resume')).status).toBe(200)
      const fresh = await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(f.board.connectionRecovery).toMatchObject({ status: 'resolved', evidenceObservationId: fresh.observationId })
    } finally { await f.service.dispose() }
  })

  it('keeps the barrier through failed observation and rejects a false completed result', async () => {
    const f = await fixture(), observe = vi.spyOn(f.host, 'observe')
    try {
      f.host.onDeviceUnavailable?.('serial-a'); await f.action('recheck')
      observe.mockRejectedValueOnce(new Error('Capture unavailable'))
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toThrow('Capture unavailable')
      expect(f.board.connectionRecovery?.status).toBe('waiting_observation')
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('reconciling')
      await expect(f.service.closeSession(f.session.sessionId, { outcome: 'completed' })).rejects.toThrow('connection_unverified')
      await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(f.board.connectionRecovery?.status).toBe('resolved')
    } finally { await f.service.dispose() }
  })

  it('revokes control before a failed archive write and does not accept an unsaved recheck', async () => {
    const f = await fixture()
    try {
      const save = vi.spyOn(f.board, 'checkpoint').mockImplementation(() => { throw new Error('disk full') })
      f.host.onDeviceUnavailable?.('serial-a')
      expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ controlMode: 'paused', lastError: 'connection_recovery_save_failed' })
      expect((await f.action('recheck')).status).toBe(400)
      expect(f.board.connectionRecovery?.status).toBe('waiting_recheck')
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'task_paused' })
      save.mockRestore(); expect((await f.action('recheck')).status).toBe(200)
      await f.service.observe(f.session.sessionId, undefined, f.signal)
    } finally { await f.service.dispose() }
  })

  it('keeps uncertain in-flight input unknown and never repeats it after reconnect', async () => {
    const f = await fixture(), originalAct = f.host.act.bind(f.host)
    try {
      const image = await f.service.observe(f.session.sessionId, undefined, f.signal)
      const act = vi.spyOn(f.host, 'act').mockImplementation(async (actor, input, signal) => {
        await new Promise<void>(resolve => { signal!.addEventListener('abort', () => resolve(), { once: true }) })
        return originalAct(actor, input)
      })
      const pending = f.service.act(f.session.sessionId, undefined, { action: 'key', key: 'Home', observationId: image.observationId }, f.signal)
      const outcome = pending.catch(error => error)
      await vi.waitFor(() => expect(act).toHaveBeenCalledTimes(1))
      f.host.onDeviceUnavailable?.('serial-a')
      expect(await outcome).toMatchObject({ executionState: 'outcome_unknown' })
      expect(f.board.traces.find(trace => trace.kind === 'key')?.status).toBe('unknown')
      await f.action('recheck'); await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(act).toHaveBeenCalledTimes(1)
    } finally { await f.service.dispose() }
  })

  it('requires a new human decision after restoring a saved pending recheck', () => {
    const board = new Workbench()
    board.blockConnection('original'); board.recheckConnection('original')
    const restored = new Workbench(board.snapshot())
    expect(restored.connectionRecovery?.status).toBe('waiting_recheck')
    expect(() => restored.recheckConnection('another')).toThrow('connection_device_frozen')
    expect(() => restored.resolveConnection('another', 'unrelated-image')).toThrow('connection_device_frozen')
    expect(() => restored.resolveConnection('original', 'unapproved-image')).toThrow('connection_recheck_required')
    expect(restored.connectionRecovery?.status).toBe('waiting_recheck')
  })

  it('does not restore agent control if saving the fresh-observation resolution fails', async () => {
    const f = await fixture()
    try {
      f.host.onDeviceUnavailable?.('serial-a'); await f.action('recheck')
      const save = vi.spyOn(f.board, 'checkpoint').mockImplementation(() => { if (f.board.connectionRecovery?.status === 'resolved') throw new Error('disk full') })
      await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toThrow('disk full')
      expect(f.board.connectionRecovery?.status).toBe('waiting_observation')
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('reconciling')
      save.mockRestore(); await f.service.observe(f.session.sessionId, undefined, f.signal)
      expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('agent')
    } finally { await f.service.dispose() }
  })
})
