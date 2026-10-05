import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsPreSubmitStop } from '../src/stop-policy.ts'
import { WorkBuddyOpenGuiService, createControlTask } from '../src/service.ts'
import { Workbench } from '../src/workbench.ts'
import { AutomationCoordinator } from '../src/automation.ts'
import { handleHostHook } from '../src/host-hook.ts'
import { validateToolArguments } from '../src/tools.ts'
import { FakeHost } from './fake-host.ts'
import { ReadyViewer } from './ready-viewer.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function fixture(restricted = true) {
  const host = new FakeHost(), viewer = new ReadyViewer(), service = new WorkBuddyOpenGuiService({ host, viewers: viewer })
  cleanups.push(() => service.dispose())
  const task = createControlTask(), signal = AbortSignal.timeout(10_000)
  const session = await service.openSession(['phone-a'], signal, 'control', { task, objective: 'Fill the form', ...(restricted ? { successCriteria: 'Before final submit' } : {}) })
  const image = await service.observe(session.sessionId, undefined, signal)
  return { host, viewer, service, task, signal, session, image }
}

describe('pre-submit task restriction', () => {
  it('recognizes explicit Chinese and English endpoints without treating ordinary submit checks as restrictions', () => {
    for (const value of ['填完信息，停在提交前', '不要点击提交', 'Stop before final submission', 'Before final submit', "Don't send"]) expect(requestsPreSubmitStop(value)).toBe(true)
    for (const value of ['检查提交成功后的页面', 'Verify submission success', undefined]) expect(requestsPreSubmitStop(value)).toBe(false)
  })

  it('does not latch on content constraints or review-gated sending', () => {
    for (const value of ['不要提交，等我确认', '别发送。', '请不要真的点提交按钮', 'Do not submit the form.', '做到提交前就停']) expect(requestsPreSubmitStop(value)).toBe(true)
    for (const value of [
      '用友好语气回复，评论时不要发送广告',
      '起草回复，先让我审核，未经审核不要发送',
      '@opengui 帮我处理帖子下的评论，交给我审核后发送。不需要回复的直接跳过并记录原因。',
      "Reply politely and don't send duplicates",
      '不要发布营销内容或链接',
    ]) expect(requestsPreSubmitStop(value)).toBe(false)
  })

  it.each(['submit', 'send', 'publish', 'purchase', 'delete', 'Enter'])('rejects %s before phone dispatch or task progress changes', async operation => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act'), sync = vi.spyOn(f.viewer, 'syncNode')
    const input = operation === 'Enter' ? { action: 'key', key: 'Enter' } : { action: 'tap', x: 20, y: 40, externalSideEffect: operation }
    await expect(f.service.act(f.session.sessionId, undefined, { ...input, observationId: f.image.observationId }, f.signal)).rejects.toMatchObject({ code: 'stop_before_submit', executionState: 'not_executed' })
    expect(act).not.toHaveBeenCalled(); expect(sync).not.toHaveBeenCalled()
    expect(f.service.snapshotSession(f.session.sessionId).stopBeforeSubmit).toBe(true)
  })

  it('uses clipboard-only multiline input and permits preparation and navigation', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act')
    let image = await f.service.act(f.session.sessionId, undefined, { action: 'text', text: 'line one\nline two', observationId: f.image.observationId }, f.signal)
    expect(act).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ forceClipboard: true, text: 'line one\nline two' }), expect.any(AbortSignal))
    image = await f.service.act(f.session.sessionId, undefined, { action: 'key', key: 'Back', observationId: image.observationId }, f.signal)
    expect(image.observationId).toBeTruthy()
  })

  it.each(['tap', 'swipe'])('rejects an unclassified %s before dispatch, progress or observation consumption', async action => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act'), sync = vi.spyOn(f.viewer, 'syncNode')
    const input = { action, observationId: f.image.observationId, x: 20, y: 40, x1: 10, y1: 20, x2: 30, y2: 40 }
    await expect(f.service.act(f.session.sessionId, undefined, input, f.signal)).rejects.toMatchObject({ code: 'stop_action_unclassified', executionState: 'not_executed', recovery: 'replan' })
    expect(act).not.toHaveBeenCalled(); expect(sync).not.toHaveBeenCalled()
    expect(f.host.status(f.task.actors.get('serial-a')!).observationId).toBe(f.image.observationId)
  })

  it('accepts explicitly classified preparation within the frozen endpoint', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act')
    await f.service.act(f.session.sessionId, undefined, { action: 'tap', x: 20, y: 40, externalSideEffect: 'none', observationId: f.image.observationId }, f.signal)
    expect(act).toHaveBeenCalledTimes(1)
    expect(f.service.snapshotSession(f.session.sessionId).stopBeforeSubmit).toBe(true)
  })

  it('preserves legacy unmarked navigation for tasks without a pre-submit restriction', async () => {
    const f = await fixture(false), act = vi.spyOn(f.host, 'act')
    await f.service.act(f.session.sessionId, undefined, { action: 'tap', x: 20, y: 40, observationId: f.image.observationId }, f.signal)
    expect(act).toHaveBeenCalledTimes(1)
  })

  it('does not impose a pre-submit endpoint on an unrestricted task', async () => {
    const f = await fixture(false), act = vi.spyOn(f.host, 'act')
    await f.service.act(f.session.sessionId, undefined, { action: 'tap', x: 20, y: 40, externalSideEffect: 'submit', observationId: f.image.observationId }, f.signal)
    expect(act).toHaveBeenCalledTimes(1); expect(f.service.snapshotSession(f.session.sessionId).stopBeforeSubmit).toBeUndefined()
  })

  it('retains the restriction through task recovery and archived board restoration', async () => {
    const f = await fixture()
    const restored = new Workbench(f.viewer.board('unit-viewer').snapshot())
    expect(restored.stopBeforeSubmit).toBe(true); expect(restored.markdown([])).toContain('停在提交前')
    await f.service.cancel(f.session.sessionId)
    const recovered = await f.service.openSession(['phone-a'], f.signal, 'control', { task: f.task })
    await expect(f.service.act(recovered.sessionId, undefined, { action: 'key', key: 'Enter' }, f.signal)).rejects.toMatchObject({ code: 'stop_before_submit' })
    await expect(f.service.act(recovered.sessionId, undefined, { action: 'tap' }, f.signal)).rejects.toMatchObject({ code: 'stop_action_unclassified', executionState: 'not_executed' })
  })

  it('latches an active case endpoint and fails closed on durable save failure', async () => {
    const f = await fixture(false), board = f.viewer.board('unit-viewer'), act = vi.spyOn(f.host, 'act')
    const test = board.defineTest({ title: 'Form check', kind: 'flow', context: { app: 'QA', version: '1', environment: 'test', account: 'qa', startPage: 'form' }, prerequisites: [], testData: { source: 'none', description: 'No input' }, steps: ['Read page'], expected: 'Form visible', expectedSource: { kind: 'user', reference: 'Task' }, stoppingCondition: 'Before final submit', dependencies: [] })
    board.beginTest(test.id); expect(board.stopBeforeSubmit).toBe(true)
    expect(f.service.snapshotSession(f.session.sessionId).stopBeforeSubmit).toBe(true)
    const checkpoint = vi.spyOn(board, 'checkpoint').mockImplementation(() => { throw new Error('disk full') })
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'text', text: 'value', observationId: f.image.observationId }, f.signal)).rejects.toThrow('disk full')
    expect(act).not.toHaveBeenCalled(); checkpoint.mockRestore()
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'tap', externalSideEffect: 'submit', observationId: f.image.observationId }, f.signal)).rejects.toMatchObject({ code: 'stop_before_submit' })
  })

  it('forwards only a derived restriction from the native user prompt and keeps it through model calls', async () => {
    const host = new FakeHost(), service = new WorkBuddyOpenGuiService({ host, viewers: new ReadyViewer() }), automation = new AutomationCoordinator(service)
    cleanups.push(() => service.dispose())
    const hostEvent = vi.fn(event => automation.event(event)), connect = vi.fn(async () => ({ hostEvent, close() {} }))
    await handleHostHook({ hook_event_name: 'UserPromptSubmit', session_id: 'host', prompt: '填写表单，停在提交前。秘密输入不保存。' }, connect)
    expect(connect).toHaveBeenCalledWith(true)
    expect(hostEvent.mock.calls[0]![0]).toEqual({ hook_event_name: 'UserPromptSubmit', session_id: 'host', stop_before_submit: true })
    const args = { deviceId: 'phone-a', objective: 'Fill the form' }, claim = await automation.event({ hook_event_name: 'PreToolUse', session_id: 'host', tool_name: 'opengui_open_session', tool_input: args })
    const task = automation.consume(claim.hostContext, 'opengui_open_session', args)!
    expect(task.execution.stopBeforeSubmit).toBe(true)
    const session = await service.openSession(['phone-a'], AbortSignal.timeout(5000), 'control', { task: task.execution })
    automation.attach(task, session.sessionId, true)
    await automation.event({ hook_event_name: 'UserPromptSubmit', session_id: 'host' })
    expect(task.execution.stopBeforeSubmit).toBe(true)
    await expect(service.act(session.sessionId, undefined, { action: 'tap', externalSideEffect: 'submit' }, AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'stop_before_submit' })
  })

  it('forwards only a request addressed to OpenGUI and attaches it to the task it starts', async () => {
    const host = new FakeHost(), service = new WorkBuddyOpenGuiService({ host, viewers: new ReadyViewer() }), automation = new AutomationCoordinator(service)
    cleanups.push(() => service.dispose())
    const hostEvent = vi.fn(event => automation.event(event)), connect = vi.fn(async () => ({ hostEvent, close() {} }))
    await handleHostHook({ hook_event_name: 'UserPromptSubmit', session_id: 'host', prompt: '今天天气怎么样' }, connect)
    expect(connect).toHaveBeenLastCalledWith(false)
    expect(hostEvent.mock.calls.at(-1)![0]).not.toHaveProperty('prompt')
    await handleHostHook({ hook_event_name: 'UserPromptSubmit', session_id: 'host', prompt: '  @opengui 帮我测试登录页  ' }, connect)
    expect(connect).toHaveBeenLastCalledWith(true)
    expect(hostEvent.mock.calls.at(-1)![0]).toMatchObject({ prompt: '@opengui 帮我测试登录页' })
    const args = { objective: 'Test the login page' }, claim = await automation.event({ hook_event_name: 'PreToolUse', session_id: 'host', tool_name: 'opengui_open_viewer', tool_input: args })
    expect(automation.consume(claim.hostContext, 'opengui_open_viewer', args)!.execution.request).toBe('@opengui 帮我测试登录页')
  })

  it('accepts an explicit true restriction but rejects a model attempt to disable it', () => {
    expect(() => validateToolArguments('opengui_open_session', { stopBeforeSubmit: true })).not.toThrow()
    expect(() => validateToolArguments('opengui_open_session', { stopBeforeSubmit: false })).toThrow('invalid arguments')
    expect(() => validateToolArguments('opengui_act', { sessionId: 'session', action: 'tap', observationId: 'obs', externalSideEffect: 'submit' })).not.toThrow()
  })
})
