import { ReadyViewer } from './ready-viewer.ts'
import { inputPermissionError } from '../src/input-diagnostics.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutomationCoordinator } from '../src/automation.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const close of cleanup.splice(0)) await close() })
function fixture() {
  const host = new FakeHost(), service = new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host })
  const automation = new AutomationCoordinator(service)
  cleanup.push(() => service.dispose())
  const claim = async (host: string, name: string, args: Record<string, unknown> = {}) => {
    const result = await automation.event({ session_id: host, hook_event_name: 'PreToolUse', tool_name: name, tool_input: args })
    return { token: result.hostContext, task: automation.consume(result.hostContext, name, args)! }
  }
  const open = async (host = 'host-a') => {
    const { task } = await claim(host, 'opengui_open_session', { deviceId: 'phone-a' })
    const session = await service.openSession(['phone-a'], AbortSignal.timeout(5000), 'control', { task: task.execution, objective: 'Read Android version', successCriteria: 'Read the version from the result image' })
    automation.attach(task, session.sessionId, true)
    return { task, session }
  }
  return { host, service, automation, claim, open }
}

describe('host-bound autonomous lifecycle', () => {
  it('recognizes an internal comment-budget stop in follow mode without starting another continuation', async () => {
    const f = fixture(), { task, session } = await f.open()
    await f.service.closeSession(session.sessionId, { outcome: 'stopped', summary: 'Saved comment limit reached' })
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    expect(task.outcome).toBe('stopped')
    expect(task.continuations).toBe(0)
    await expect(f.claim('host-a', 'opengui_open_session', { deviceId: 'phone-a' })).rejects.toMatchObject({ code: 'task_ended' })
  })
  it('awaits the configured executor and recognizes its internal completion without host close calls', async () => {
    const f = fixture(), { task, session } = await f.open()
    f.service.viewers.board('unit-viewer').modelConfig = { id: 'phone', revision: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Configured fixture', model: 'fixture-vlm', protocol: 'openai_chat' }
    const next = await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })
    expect(next.reason).toContain('opengui_execute')
    expect(next.reason).toContain('waitMs 600000')
    expect(next.reason).toContain('Never inspect or poll the workbench webpage')
    const image = await f.service.observe(session.sessionId, undefined, AbortSignal.timeout(5000))
    await f.service.closeSession(session.sessionId, { outcome: 'completed', evidenceObservationIds: [image.observationId] })
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    expect(task.outcome).toBe('completed')
    await f.automation.event({ session_id: 'host-a', hook_event_name: 'UserPromptSubmit' })
    expect((await f.claim('host-a', 'opengui_list_devices')).task.id).not.toBe(task.id)
  })
  it('yields for human review without forcing continuation or closing the task, but honors an explicit stop', async () => {
    const f = fixture(), { task, session } = await f.open()
    f.service.reviewComment(session.sessionId, { account: 'qa', target: 'post:1', context: 'Source', draft: 'Draft' })
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    expect(task.continuations).toBe(0)
    await f.automation.event({ session_id: 'host-a', hook_event_name: 'FinalStop' })
    expect(f.service.findSession(session.sessionId)?.state).toBe('active')
    expect(task.outcome).toBe('active')
    await f.automation.event({ session_id: 'host-a', hook_event_name: 'FinalStop', final_stop_reason: 'interrupted' })
    expect(f.service.findSession(session.sessionId)?.state).toBe('cancelled')
    expect(task.outcome).toBe('cancelled')
  })
  it('yields for an approved draft awaiting original replacement permission and preserves the task at final stop', async () => {
    const f = fixture(), { task, session } = await f.open(), signal = AbortSignal.timeout(5000)
    const image = await f.service.observe(session.sessionId, undefined, signal)
    const review = f.service.reviewComment(session.sessionId, { account: 'qa', target: 'post:original', context: 'Source', draft: 'Approved final' }), board = f.service.viewers.board('unit-viewer')
    board.savePlatformInput(review.id, 'Different phone original', image.observationId, 'device_clipboard'); board.decide(review.id, 'approve')
    expect(f.service.snapshotSession(session.sessionId).replacementPending).toBe(true)
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    await f.automation.event({ session_id: 'host-a', hook_event_name: 'FinalStop' })
    expect(task.continuations).toBe(0); expect(f.service.findSession(session.sessionId)?.state).toBe('active')
    expect(board.reviews[0]?.replacementDecisions).toBeUndefined()
  })
  it('preserves an existing-app update wait at final stop without granting install approval', async () => {
    const f = fixture(), { task, session } = await f.open(), board = f.service.viewers.board('unit-viewer')
    board.saveApk({ id: 'apk', deviceId: 'phone-a', fileName: 'qa.apk', packageName: 'com.example', minSdk: 21, testOnly: false, bytes: 100, sha256: 'a'.repeat(64), allowTestApk: false, preparedAt: new Date().toISOString(), status: 'prepared', existingApp: { version: '1.0' } })
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    await f.automation.event({ session_id: 'host-a', hook_event_name: 'FinalStop' })
    expect(f.service.findSession(session.sessionId)?.state).toBe('active'); expect(task.continuations).toBe(0)
    expect(board.apk?.updateApprovedAt).toBeUndefined()
    board.confirmApkUpdate('apk', 'a'.repeat(64), '1.0')
    expect((await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).decision).toBe('block')
  })

  it('retains an established legacy viewing handle at final stop without retaining control', async () => {
    const host = Object.assign(new FakeHost(), { openMirror: async () => {}, mirrorStatus: () => ({ phase: 'running' as const }) })
    const service = new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host })
    cleanup.push(() => service.dispose())
    const automation = new AutomationCoordinator(service)
    const args = { purpose: 'mirror' }
    const claim = await automation.event({ session_id: 'viewer', hook_event_name: 'PreToolUse', tool_name: 'opengui_open_session', tool_input: args })
    const task = automation.consume(claim.hostContext, 'opengui_open_session', args)!
    const session = await service.openSession(['phone-a'], AbortSignal.timeout(5000), 'mirror', { task: task.execution })
    automation.attach(task, session.sessionId, false)
    await service.openMirror(session.sessionId, undefined, AbortSignal.timeout(5000))
    await automation.event({ session_id: 'viewer', hook_event_name: 'FinalStop' })
    expect(service.retainsMirror(session.sessionId)).toBe(true)
    await expect(service.openSession(['phone-a'], AbortSignal.timeout(5000))).resolves.toHaveProperty('sessionId')
  })
  it('continues an unfinished task without opening a display or restoring control authority', async () => {
    const f = fixture()
    const { task, session } = await f.open()
    await f.service.closeSession(session.sessionId)
    const next = await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })
    expect(next.decision).toBe('block')
    expect(next.reason).toContain('NEW control session')
    expect(next.reason).toContain('Do not call opengui_start')
    expect(task.continuations).toBe(1)
    expect(f.service.snapshotSession(session.sessionId).state).toBe('closed')
  })
  it('bounds automatic continuations and releases control at exhaustion', async () => {
    const f = fixture()
    const { task, session } = await f.open()
    for (let index = 0; index < 10; index++) expect((await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).decision).toBe('block')
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    expect(task.outcome).toBe('blocked')
    expect(f.service.snapshotSession(session.sessionId).state).toBe('closed')
    await f.service.openSession(['phone-a'], AbortSignal.timeout(5000))
  })
  it('preserves a denied-input task on normal host stop and still honors explicit interruption', async () => {
    const f = fixture(), { task, session } = await f.open()
    const frame = await f.service.observe(session.sessionId, undefined, AbortSignal.timeout(5000))
    vi.spyOn(f.host, 'act').mockRejectedValueOnce(inputPermissionError())
    await expect(f.service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'input_permission_denied' })
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'FinalStop' })).toEqual({})
    expect(task.outcome).toBe('active'); expect(f.service.snapshotSession(session.sessionId).inputDiagnostic?.status).toBe('blocked')
    await f.automation.event({ session_id: 'host-a', hook_event_name: 'FinalStop', final_stop_reason: 'interrupted' })
    expect(task.outcome).toBe('cancelled')
  })
  it('parks the host turn on a long status wait during takeover so 恢复控制 can resume it', async () => {
    const f = fixture(), { task, session } = await f.open()
    await f.service.requestHandoff(session.sessionId, 'otp', '登录需要验证码', 0, AbortSignal.timeout(5000))
    expect(f.service.snapshotSession(session.sessionId).controlMode).toBe('manual')
    for (let wait = 1; wait <= 12; wait++) {
      const parked = await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })
      expect(parked).toMatchObject({ decision: 'block' })
      expect(String(parked.reason)).toContain(`opengui_status with sessionId ${JSON.stringify(session.sessionId)} and waitMs 600000`)
    }
    // Bounded at about two hours of takeover; the turn may then end while the task stays open.
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    expect(task.outcome).toBe('active')
  })
  it('stops on explicit interruption and does not let another host finish its task', async () => {
    const f = fixture()
    const { task, session } = await f.open()
    expect(await f.automation.event({ session_id: 'foreign-host', hook_event_name: 'FinalStop', final_stop_reason: 'interrupted' })).toEqual({})
    expect(f.service.snapshotSession(session.sessionId).state).toBe('active')
    await f.automation.event({ session_id: 'host-a', hook_event_name: 'FinalStop', final_stop_reason: 'interrupted' })
    expect(task.outcome).toBe('cancelled')
    expect(f.service.snapshotSession(session.sessionId).state).toBe('cancelled')
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
  })
  it('binds exact arguments and rejects forged, replayed and cross-task claims', async () => {
    const f = fixture()
    const args = { deviceId: 'phone-a' }
    const prepared = await f.automation.event({ session_id: 'host-a', hook_event_name: 'PreToolUse', tool_name: 'opengui_open_session', tool_input: args })
    expect(() => f.automation.consume(prepared.hostContext, 'opengui_open_session', { deviceId: 'phone-b' })).toThrow('invalid host context')
    expect(() => f.automation.consume(prepared.hostContext, 'opengui_open_session', args)).toThrow('invalid host context')
    expect(() => f.automation.consume('invented', 'opengui_open_session', args)).toThrow('invalid host context')
    const { session } = await f.open()
    await expect(f.claim('host-b', 'opengui_observe', { sessionId: session.sessionId })).rejects.toThrow('another host task')
    expect(() => f.automation.consume(undefined, 'opengui_observe', { sessionId: session.sessionId })).toThrow('host hook')
  })
  it('keeps frozen devices and accumulated operation budgets across new control sessions', async () => {
    const f = fixture()
    const { task, session } = await f.open()
    await f.service.observe(session.sessionId, undefined, AbortSignal.timeout(5000))
    await f.service.closeSession(session.sessionId)
    const next = await f.service.openSession(undefined, AbortSignal.timeout(5000), 'control', { task: task.execution, skipActivation: true })
    expect(next.devices[0]).toMatchObject({ id: 'phone-a', operationCount: 1, remainingOperations: 999 })
    task.execution.operations.set('serial-a', 1000)
    await expect(f.service.observe(next.sessionId, undefined, AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'budget_exhausted' })
    await f.service.closeSession(next.sessionId)
    await expect(f.service.openSession(['phone-b'], AbortSignal.timeout(5000), 'control', { task: task.execution })).rejects.toMatchObject({ code: 'device_frozen' })
  })
  it('never treats pure viewing or a missing hook as autonomous control', async () => {
    const f = fixture()
    const { task } = await f.claim('host-a', 'opengui_start')
    f.automation.success(task, 'opengui_start', {})
    expect(await f.automation.event({ session_id: 'host-a', hook_event_name: 'Stop' })).toEqual({})
    expect(f.automation.status()).toMatchObject({ available: false })
    expect(f.automation.status(task)).toMatchObject({ available: true, outcome: 'active' })
  })
  it('does not promote an already unknown session by trusting a repeated completion request', async () => {
    const f = fixture()
    const { task, session } = await f.open()
    await f.service.closeSession(session.sessionId)
    await f.service.closeSession(session.sessionId, { outcome: 'completed' })
    f.automation.success(task, 'opengui_close_session', { sessionId: session.sessionId, outcome: 'completed' })
    expect(task.outcome).toBe('unknown')
  })
  it('isolates agents sharing a parent session and cleans all only on session end', async () => {
    const f = fixture()
    const claim = await f.automation.event({ hook_event_name: 'PreToolUse', session_id: 'parent', agent_id: 'a', tool_name: 'opengui_open_session', tool_input: {} })
    const task = f.automation.consume(claim.hostContext, 'opengui_open_session', {})!
    const session = await f.service.openSession(['phone-a'], AbortSignal.timeout(5000), 'control', { task: task.execution })
    f.automation.attach(task, session.sessionId, true)
    await f.automation.event({ hook_event_name: 'FinalStop', session_id: 'parent', agent_id: 'b', final_stop_reason: 'interrupted' })
    expect(f.service.snapshotSession(session.sessionId).state).toBe('active')
    await f.automation.event({ hook_event_name: 'SessionEnd', session_id: 'parent', agent_id: 'b' })
    expect(f.service.snapshotSession(session.sessionId).state).toBe('active')
    await f.automation.event({ hook_event_name: 'SessionEnd', session_id: 'parent' })
    expect(f.service.snapshotSession(session.sessionId).state).toBe('cancelled')
  })
})
