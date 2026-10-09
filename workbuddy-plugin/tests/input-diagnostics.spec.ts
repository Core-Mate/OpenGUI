import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inputDiagnostic, inputPermissionDenied, inputPermissionError } from '../src/input-diagnostics.ts'
import { Workbench } from '../src/workbench.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { TaskStore } from '../src/task-store.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

const resources: Array<() => Promise<unknown>> = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of resources.splice(0).reverse()) await close() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'opengui-input-diagnostic-')); resources.push(() => rm(root, { recursive: true, force: true }))
  const store = new TaskStore(join(root, 'reports')), { viewer, sinks } = setup(undefined, store), host = new FakeHost()
  host.devices[0] = { ...host.devices[0]!, manufacturer: 'Xiaomi', model: 'Redmi Note QA' }
  const service = new WorkBuddyOpenGuiService({ host, viewers: viewer }); resources.push(() => service.dispose())
  const signal = AbortSignal.timeout(10000), display = await service.openViewer(['phone-a'], signal), page = await connect(display.url, 'phone-a')
  sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  const session = await service.openSession(['phone-a'], signal, 'control', { viewerId: display.viewerId })
  const board = viewer.board(display.viewerId), act = vi.spyOn(host, 'act'), original = host.act.bind(host)
  const action = (name: string, token = new URL(display.workbenchUrl).hash.slice(7)) => fetch(`${display.url}board`, { method: 'POST', headers: { Origin: new URL(display.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': token }, body: JSON.stringify({ action: name }) })
  const input = (observationId: string) => service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId }, signal)
  return { service, host, store, viewer, display, session, board, act, original, signal, action, input }
}

describe('receipt-backed device input diagnosis', () => {
  it('recognizes explicit input denials without inventing them from unrelated errors or unchanged screens', () => {
    for (const text of ['device unauthorized', 'device offline', 'SecurityException: cannot read package', 'unchanged screen', 'INJECT_EVENTS', 'input injection timed out']) expect(inputPermissionDenied(text)).toBe(false)
    expect(inputPermissionDenied('java.lang.SecurityException: Injecting to another application requires INJECT_EVENTS permission')).toBe(true)
    expect(inputPermissionDenied('Injecting input events requires the caller (or the source of the instrumentation, if any) to have the INJECT_EVENTS permission.')).toBe(true)
  })
  it('shows vendor guidance only from available metadata and does not preserve raw device messages', () => {
    const device = new FakeHost().devices[0]!
    expect(inputDiagnostic({ ...device, manufacturer: 'Xiaomi' }, 0).guidance).toContain('这与“USB 调试”是不同的选项')
    expect(inputDiagnostic(device, 0).guidance).toContain('具体入口以手机系统为准')
    expect(JSON.stringify(inputDiagnostic(device, 0))).not.toContain(device.serial)
  })
  it('archives a denial, pauses control, requires a human recheck and resolves only from a subsequent input receipt', async () => {
    const f = await fixture(), frame = await f.service.observe(f.session.sessionId, undefined, f.signal)
    f.act.mockRejectedValueOnce(inputPermissionError())
    await expect(f.input(frame.observationId)).rejects.toMatchObject({ code: 'input_permission_denied' })
    expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ controlMode: 'paused', inputDiagnostic: { status: 'blocked', source: 'device_input_receipt' } })
    expect(f.store.load(f.display.viewerId)!.board.inputDiagnostic?.status).toBe('blocked')
    expect(f.board.traces.at(-1)).toMatchObject({ status: 'unknown', code: 'input_permission_denied' })
    await expect(f.input(frame.observationId)).rejects.toMatchObject({ code: 'task_paused' }); expect(f.act).toHaveBeenCalledTimes(1)
    expect((await f.action('recheck', 'wrong')).status).toBe(403); expect(f.board.inputDiagnostic?.status).toBe('blocked')
    expect((await f.action('resume')).status).toBe(200)
    const read = await f.service.observe(f.session.sessionId, undefined, f.signal)
    expect(f.board.inputDiagnostic?.status).toBe('blocked'); expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('paused')
    expect((await f.action('recheck')).status).toBe(200); expect(f.board.inputDiagnostic?.status).toBe('recheck_pending')
    await expect(f.input(read.observationId)).rejects.toMatchObject({ code: 'task_paused' })
    const fresh = await f.service.observe(f.session.sessionId, undefined, f.signal)
    await expect(f.service.closeSession(f.session.sessionId, { outcome: 'completed', evidenceObservationIds: [fresh.observationId] })).rejects.toThrow('input_permission_unverified')
    const waited = await f.service.act(f.session.sessionId, undefined, { action: 'wait', waitMs: 1, observationId: fresh.observationId }, f.signal)
    expect(f.board.inputDiagnostic?.status).toBe('recheck_pending')
    await f.input(waited.observationId)
    expect(f.board.inputDiagnostic).toMatchObject({ status: 'resolved', recheckedAt: expect.any(String), resolvedAt: expect.any(String) })
    expect(f.store.load(f.display.viewerId)!.board.inputDiagnostic?.status).toBe('resolved')
    expect(f.board.markdown([])).toContain('设备输入权限诊断'); expect(f.board.markdown([])).toContain('系统权限开关未直接读取')
  })
  it('does not diagnose input permission from failed screenshots or generic action failures', async () => {
    const f = await fixture()
    vi.spyOn(f.host, 'observe').mockRejectedValueOnce(inputPermissionError())
    await expect(f.service.observe(f.session.sessionId, undefined, f.signal)).rejects.toMatchObject({ code: 'input_permission_denied' })
    expect(f.board.inputDiagnostic).toBeUndefined()
    const frame = await f.service.observe(f.session.sessionId, undefined, f.signal)
    f.act.mockRejectedValueOnce(new Error('device offline'))
    await expect(f.input(frame.observationId)).rejects.toThrow('device offline'); expect(f.board.inputDiagnostic).toBeUndefined()
  })
  it('revokes control before a denied-input archive write fails', async () => {
    const f = await fixture(), frame = await f.service.observe(f.session.sessionId, undefined, f.signal)
    const save = f.store.save.bind(f.store)
    vi.spyOn(f.store, 'save').mockImplementation((task, markdown) => { if (task.board.inputDiagnostic?.status === 'blocked') throw new Error('disk full'); save(task, markdown) })
    f.act.mockRejectedValueOnce(inputPermissionError())
    await expect(f.input(frame.observationId)).rejects.toThrow('disk full')
    expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('paused'); expect(f.board.inputDiagnostic?.status).toBe('blocked')
    await expect(f.input(frame.observationId)).rejects.toMatchObject({ code: 'task_paused' }); expect(f.act).toHaveBeenCalledTimes(1)
  })
  it('keeps input blocked when a recheck decision cannot be saved and revokes a restored pending check', () => {
    let fail = false
    const board = new Workbench(undefined, { save() { if (fail) throw new Error('disk full') }, capture() {}, previousComment() { return undefined } })
    board.blockInput(inputDiagnostic(new FakeHost().devices[0]!, 0)); fail = true
    expect(() => board.recheckInput('phone-a')).toThrow('disk full'); expect(board.inputDiagnostic?.status).toBe('blocked')
    fail = false; board.recheckInput('other-phone'); expect(board.inputDiagnostic?.status).toBe('blocked')
    board.recheckInput('phone-a'); expect(board.inputDiagnostic?.status).toBe('recheck_pending')
    const restored = new Workbench(board.snapshot()); expect(restored.inputDiagnostic?.status).toBe('blocked')
    restored.resolveInput('phone-a'); expect(restored.inputDiagnostic?.status).toBe('blocked')
  })
})
