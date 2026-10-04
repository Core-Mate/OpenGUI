import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ajv } from 'ajv'
import { createControlTask, WorkBuddyOpenGuiService } from '../src/service.ts'
import { callOpenGuiTool, OPENGUI_WORKBUDDY_TOOLS } from '../src/tools.ts'
import type { TaskStep } from '../src/todos.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

const services: WorkBuddyOpenGuiService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.dispose() })

async function control(contents = ['Open app', 'Search', 'Read first post', 'Read second post', 'Read third post', 'Deliver summary']) {
  const { viewer, sinks } = setup(), host = new FakeHost()
  const service = new WorkBuddyOpenGuiService({ viewers: viewer, host })
  services.push(service)
  const signal = AbortSignal.timeout(10_000), task = createControlTask(), options = { owner: 'task-a', task }
  const display = await service.openViewer(['phone-a'], signal, options)
  const page = await connect(display.url, 'phone-a')
  sinks.get('phone-a')!.sendBinary(Buffer.from([2]))
  await page.receipt()
  const plan = await callOpenGuiTool(service, 'opengui_todo_write', { viewerId: display.viewerId, todos: contents.map(content => ({ content, status: 'pending' })) }, signal, options) as { todos: readonly TaskStep[] }
  const session = await service.openSession(['phone-a'], signal, 'control', { ...options, viewerId: display.viewerId })
  const observe = (index: number, evidenceObservationId?: string) => callOpenGuiTool(service, 'opengui_observe', { sessionId: session.sessionId, taskNodeIndex: index, ...(evidenceObservationId ? { evidenceObservationId } : {}) }, signal, options) as ReturnType<typeof service.observe>
  const act = (index: number, observationId: string) => callOpenGuiTool(service, 'opengui_act', { sessionId: session.sessionId, taskNodeIndex: index, action: 'key', key: 'Back', observationId }, signal, options) as ReturnType<typeof service.act>
  return { service, host, viewer, display, session, signal, task, options, observe, act, plan: plan.todos }
}

describe('task nodes synchronized with existing phone operations', () => {
  it('updates the board and tool progress atomically while reading successive posts', async () => {
    const c = await control(), original = c.host.act.bind(c.host)
    const dispatch = vi.fn(async (actor: object, _input: Record<string, unknown>) => original(actor))
    c.host.act = dispatch
    let frame = await c.observe(0)
    expect(frame.progress).toMatchObject({ completed: 0, currentNodeIndex: 0, total: 6 })
    frame = await c.act(0, frame.observationId)
    expect(frame.progress?.completed).toBe(0)
    for (const index of [1, 2, 3, 4]) frame = await c.act(index, frame.observationId)
    expect(frame.progress).toMatchObject({ completed: 4, currentNodeIndex: 4, currentNode: 'Read third post', inProgress: 1, pending: 1 })
    expect(dispatch.mock.calls.every(call => !('taskNodeIndex' in (call[1] ?? {})))).toBe(true)
    const board = await fetch(`${c.display.url}status`).then(r => r.json())
    expect(board.progress).toEqual(frame.progress)
    expect(board.todos.map((item: { status: string }) => item.status)).toEqual(['completed', 'completed', 'completed', 'completed', 'in_progress', 'pending'])
    expect(c.service.snapshotSession(c.session.sessionId).progress).toEqual(frame.progress)
    const schema = OPENGUI_WORKBUDDY_TOOLS.find(tool => tool.name === 'opengui_act')!.outputSchema
    const { screenshot: { data: _image, ...metadata }, ...result } = frame
    expect(new Ajv().compile(schema)({ ...result, screenshot: metadata })).toBe(true)
  })

  it('rejects missing, skipped, regressed and stale node transitions before dispatch without losing valid evidence', async () => {
    const c = await control(), dispatch = vi.spyOn(c.host, 'act')
    await expect(c.service.observe(c.session.sessionId, undefined, c.signal)).rejects.toMatchObject({ code: 'task_node_required' })
    let frame = await c.observe(0)
    await expect(c.act(2, frame.observationId)).rejects.toMatchObject({ code: 'task_node_out_of_order', executionState: 'not_executed' })
    await expect(c.act(1, 'stale')).rejects.toMatchObject({ code: 'observation_required' })
    await expect(c.observe(1)).rejects.toMatchObject({ code: 'task_node_unverified' })
    expect(dispatch).not.toHaveBeenCalled()
    expect((await c.viewer.status(c.display.viewerId, 'task-a')).progress?.completed).toBe(0)
    frame = await c.act(1, frame.observationId)
    await expect(c.act(0, frame.observationId)).rejects.toMatchObject({ code: 'task_node_out_of_order' })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(c.service.snapshotSession(c.session.sessionId).progress?.completed).toBe(1)
  })

  it('requires current evidence when observe advances and preserves nodes during observation recovery', async () => {
    const c = await control(['First', 'Second']), frame = await c.observe(0)
    await expect(c.observe(1, 'stale')).rejects.toMatchObject({ code: 'observation_required' })
    const next = await c.observe(1, frame.observationId)
    expect(next.progress).toMatchObject({ completed: 1, currentNodeIndex: 1 })
    expect((await c.observe(1)).progress).toEqual(next.progress)
  })

  it('retains a verified previous node when the next action fails and never completes unfinished nodes on cancellation', async () => {
    const c = await control(['First', 'Second']), frame = await c.observe(0)
    vi.spyOn(c.host, 'act').mockRejectedValueOnce(new Error('transport failed'))
    await expect(c.act(1, frame.observationId)).rejects.toThrow('transport failed')
    expect(c.service.snapshotSession(c.session.sessionId).progress).toMatchObject({ completed: 1, currentNodeIndex: 1 })
    await expect(c.act(1, frame.observationId)).rejects.toMatchObject({ code: 'observation_required' })
    await c.observe(1)
    expect((await c.service.cancel(c.session.sessionId)).progress).toMatchObject({ completed: 1, currentNodeIndex: 1, pending: 0 })
  })

  it('completes only the verified last node and blocks premature whole-task completion', async () => {
    const c = await control(['First', 'Second']), frame = await c.observe(0)
    await expect(c.service.closeSession(c.session.sessionId, { outcome: 'completed', evidenceObservationIds: [frame.observationId] })).rejects.toMatchObject({ code: 'task_nodes_incomplete' })
    const next = await c.act(1, frame.observationId)
    await expect(c.service.closeSession(c.session.sessionId, { outcome: 'completed', evidenceObservationIds: [frame.observationId] })).rejects.toMatchObject({ code: 'completion_unverified' })
    const closed = await c.service.closeSession(c.session.sessionId, { outcome: 'completed', evidenceObservationIds: [next.observationId] })
    expect(closed.progress).toEqual({ completed: 2, total: 2, inProgress: 0, pending: 0, message: '已完成 2 / 2，任务步骤已全部完成' })
    expect((await c.viewer.status(c.display.viewerId, 'task-a')).progress).toEqual(closed.progress)
    await c.service.closeSession(c.session.sessionId, { outcome: 'completed' })
    expect(c.service.snapshotSession(c.session.sessionId).progress).toEqual(closed.progress)
  })

  it('preserves protected nodes across control-session recovery', async () => {
    const c = await control(['First', 'Second']), frame = await c.observe(0)
    await c.act(1, frame.observationId)
    const prior = (await c.viewer.status(c.display.viewerId, 'task-a')).todos
    expect(() => c.viewer.writeTodos(c.display.viewerId, 'task-a', prior.map(item => ({ ...item, status: 'completed' })))).toThrow('synchronized completed/active steps')
    expect(() => c.viewer.writeTodos(c.display.viewerId, 'task-a', [...prior].reverse())).toThrow('synchronized completed/active steps')
    expect(() => c.viewer.writeTodos(c.display.viewerId, 'other-task', prior)).toThrow('foreign_viewer')
    c.viewer.writeTodos(c.display.viewerId, 'task-a', [...prior, { content: 'Third', status: 'pending' }])
    await c.service.closeSession(c.session.sessionId)
    const recovered = await c.service.openSession(['phone-a'], c.signal, 'control', { ...c.options, viewerId: c.display.viewerId })
    expect(recovered.progress).toMatchObject({ completed: 1, currentNodeIndex: 1, total: 3 })
    expect((await c.service.observe(recovered.sessionId, undefined, c.signal, 1)).progress).toMatchObject({ completed: 1, total: 3, currentStepId: recovered.progress?.currentStepId, message: '已完成 1 / 3，正在Second' })
  })

  it('blocks overlapping node transitions and aborted work without consuming progress', async () => {
    const c = await control(['First', 'Second']), frame = await c.observe(0)
    let release!: () => void
    const original = c.host.act.bind(c.host)
    vi.spyOn(c.host, 'act').mockImplementationOnce(async actor => { await new Promise<void>(resolve => { release = resolve }); return original(actor) })
    const pending = c.act(0, frame.observationId)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await expect(c.act(1, frame.observationId)).rejects.toMatchObject({ code: 'task_node_busy' })
    release()
    const next = await pending
    await expect(c.service.act(c.session.sessionId, undefined, { action: 'key', key: 'Back', observationId: next.observationId, taskNodeIndex: 1 }, AbortSignal.abort())).rejects.toThrow()
    expect(c.service.snapshotSession(c.session.sessionId).progress?.completed).toBe(0)
  })
})


describe('stable task step identifiers at the control boundary', () => {
  it('uses runtime-assigned IDs for atomic transitions and returns the identical board message', async () => {
    const c = await control(['打开 App', '搜索', '浏览第 1 个帖子', '浏览第 2 个帖子', '浏览第 3 个帖子', '汇总'])
    const observed = await callOpenGuiTool(c.service, 'opengui_observe', { sessionId: c.session.sessionId, stepId: c.plan[0]!.stepId }, c.signal, c.options) as Awaited<ReturnType<typeof c.service.observe>>
    let frame = observed
    for (const index of [1, 2, 3]) frame = await callOpenGuiTool(c.service, 'opengui_act', { sessionId: c.session.sessionId, action: 'key', key: 'Back', stepId: c.plan[index]!.stepId, observationId: frame.observationId }, c.signal, c.options) as typeof frame
    expect(frame.progress).toMatchObject({ completed: 3, total: 6, currentStepId: c.plan[3]!.stepId, nextStepId: c.plan[4]!.stepId, message: '已完成 3 / 6，正在浏览第 2 个帖子' })
    expect((await fetch(`${c.display.url}status`).then(r => r.json())).progress).toEqual(frame.progress)
    expect(c.service.snapshotSession(c.session.sessionId).progress).toEqual(frame.progress)
  })

  it('rejects foreign IDs and conflicting index metadata before sending a phone action', async () => {
    const c = await control(['First', 'Second']), dispatch = vi.spyOn(c.host, 'act')
    const frame = await c.service.observe(c.session.sessionId, undefined, c.signal, undefined, undefined, c.plan[0]!.stepId)
    const action = { action: 'key', key: 'Back', observationId: frame.observationId }
    await expect(c.service.act(c.session.sessionId, undefined, { ...action, stepId: 'foreign-step' }, c.signal)).rejects.toMatchObject({ code: 'task_step_unknown', executionState: 'not_executed' })
    await expect(c.service.act(c.session.sessionId, undefined, { ...action, stepId: c.plan[1]!.stepId, taskNodeIndex: 0 }, c.signal)).rejects.toMatchObject({ code: 'task_node_mismatch' })
    expect(dispatch).not.toHaveBeenCalled()
    expect(c.service.snapshotSession(c.session.sessionId).progress?.completed).toBe(0)
  })

  it('keeps identity when pending steps are renamed/reordered and rejects stale index-only calls', async () => {
    const c = await control(['First', 'Second', 'Third'])
    const frame = await c.service.observe(c.session.sessionId, undefined, c.signal, undefined, undefined, c.plan[0]!.stepId)
    const active = (await c.viewer.status(c.display.viewerId, 'task-a')).todos[0]!
    c.viewer.writeTodos(c.display.viewerId, 'task-a', [active, { ...c.plan[2]!, content: 'Renamed third' }, c.plan[1]!])
    const dispatch = vi.spyOn(c.host, 'act')
    await expect(c.act(1, frame.observationId)).rejects.toMatchObject({ code: 'task_node_id_required' })
    await expect(c.service.act(c.session.sessionId, undefined, { action: 'key', key: 'Back', observationId: frame.observationId, stepId: c.plan[1]!.stepId }, c.signal)).rejects.toMatchObject({ code: 'task_node_out_of_order' })
    expect(dispatch).not.toHaveBeenCalled()
    const next = await c.service.act(c.session.sessionId, undefined, { action: 'key', key: 'Back', observationId: frame.observationId, stepId: c.plan[2]!.stepId }, c.signal)
    expect(next.progress).toMatchObject({ completed: 1, currentStepId: c.plan[2]!.stepId, currentNodeIndex: 1, currentNode: 'Renamed third', nextStepId: c.plan[1]!.stepId })
    await c.service.closeSession(c.session.sessionId)
    const recovered = await c.service.openSession(['phone-a'], c.signal, 'control', { ...c.options, viewerId: c.display.viewerId })
    const resumed = await c.service.observe(recovered.sessionId, undefined, c.signal, undefined, undefined, c.plan[2]!.stepId)
    expect(resumed.progress).toMatchObject({ completed: 1, currentStepId: c.plan[2]!.stepId, currentNode: 'Renamed third' })
  })

  it('shows a paused message while retaining unfinished IDs after cancellation', async () => {
    const c = await control(['First', 'Second'])
    await c.service.observe(c.session.sessionId, undefined, c.signal, undefined, undefined, c.plan[0]!.stepId)
    const stopped = await c.service.cancel(c.session.sessionId)
    expect(stopped.progress).toMatchObject({ completed: 0, currentStepId: c.plan[0]!.stepId, message: '已完成 0 / 2，任务暂停，未完成：First' })
    expect((await c.viewer.status(c.display.viewerId, 'task-a')).progress).toEqual(stopped.progress)
  })
})
