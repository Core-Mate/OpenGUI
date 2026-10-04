import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Workbench } from '../src/workbench.ts'
import { WorkBuddyOpenGuiService, createControlTask, type WorkBuddySessionStatus } from '../src/service.ts'
import { TaskStore } from '../src/task-store.ts'
import { CoreMateClient } from '../src/coremate-client.ts'
import { validatedExecutionBudget, requestedOperationLimit, type ExecutionBudgetInput } from '../src/execution-budget.ts'
import { validateToolArguments, callOpenGuiTool } from '../src/tools.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

const cleanup: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function exhausted() {
  const board = new Workbench()
  board.configureExecutionBudget({ operationLimit: 100, inferenceLimit: 100 })
  board.reserveOperation('phone-a', 100)
  board.control = 'ended'; board.result = { outcome: 'blocked', summary: 'Operation budget exhausted' }
  return board
}
async function fixture(withAccount = false, objective = 'Inspect original page', executionBudget?: ExecutionBudgetInput) {
  const directory = mkdtempSync(join(tmpdir(), 'opengui-budget-'))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  const account = withAccount ? new CoreMateClient(join(directory, 'account'), (async () => new Response(JSON.stringify({ token: 'fixture-session', user: { id: 42, phoneNumber: '13800001234' } }))) as typeof fetch) : undefined
  if (account) { account.configure('http://127.0.0.1:1'); await account.login('13800001234', '123456') }
  const store = new TaskStore(directory), f = setup(account, store), host = new FakeHost()
  const service = new WorkBuddyOpenGuiService({ host, viewers: f.viewer, account })
  cleanup.push(() => service.dispose())
  const task = createControlTask(), signal = AbortSignal.timeout(10_000), owner = 'budget-owner'
  const opened = await service.openViewer(['phone-a'], signal, { task, owner, objective, successCriteria: 'Verify the displayed result' })
  const page = await connect(opened.url, 'phone-a'); f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  const plan = f.viewer.writeTodos(opened.viewerId, owner, [{ content: 'Inspect page', status: 'pending' }]).todos
  const session = await callOpenGuiTool(service, 'opengui_open_session', { deviceIds: ['phone-a'], viewerId: opened.viewerId, ...(executionBudget ? { executionBudget } : {}) }, signal, { task, owner }) as WorkBuddySessionStatus
  const post = (body: Record<string, unknown>, token = new URL(opened.workbenchUrl).hash.slice(7), origin = new URL(opened.url).origin) => fetch(`${opened.url}board`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': token }, body: JSON.stringify(body) })
  return { ...f, host, service, store, task, signal, owner, opened, plan, session, post, account }
}

describe('human-authorized finite continuation budgets', () => {
  it('uses a longer default and permits declared long tasks past one hundred dispatches', async () => {
    const standard = await fixture()
    expect(standard.session.executionBudget).toMatchObject({ operationLimit: 1000, inferenceLimit: 1000 })
    const f = await fixture(false, 'Inspect a long task', { operationLimit: 150 })
    const dispatch = vi.spyOn(f.host, 'observe')
    f.task.operations.set('serial-a', 99); f.viewer.board(f.opened.viewerId).reserveOperation('phone-a', 99)
    for (let count = 0; count < 2; count++) await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(f.service.snapshotSession(f.session.sessionId).devices[0]).toMatchObject({ operationCount: 101, remainingOperations: 49 })
    expect(f.store.load(f.opened.viewerId).board.executionBudget).toMatchObject({ initialLimits: { operationLimit: 150, inferenceLimit: 1000 }, operations: { 'phone-a': 101 } })
    expect(requestedOperationLimit('最多5000次手机操作')).toBe(5000)
    expect(() => validateToolArguments('opengui_open_session', { executionBudget: { operationLimit: 10000 } })).not.toThrow()
  })

  it('retains a saved legacy limit and validates a newly reserved default budget', () => {
    const legacy = new Workbench({ ...new Workbench().snapshot(), executionBudget: { operationLimit: 100, inferenceLimit: 100, operations: { 'phone-a': 99 }, extensions: [] } })
    expect(legacy.operationLimit).toBe(100)
    expect(legacy.operationCount('phone-a')).toBe(99)
    const old = new Workbench()
    old.begin('phone-a', 'observe', Date.now())
    const migrated = new Workbench(old.snapshot())
    expect(migrated.operationLimit).toBe(100); expect(migrated.operationCount('phone-a')).toBe(1)
    const fresh = new Workbench(); fresh.reserveOperation('phone-a', 1)
    const restored = new Workbench(fresh.snapshot())
    expect(restored.operationLimit).toBe(1000)
    expect(restored.operationCount('phone-a')).toBe(1)
  })
  it('routes the declared initial budget through the production tool and does not permit larger replacements', async () => {
    const f = await fixture(false, 'Inspect original page', { operationLimit: 2, inferenceLimit: 1 })
    expect(f.session.executionBudget).toMatchObject({ operationLimit: 2, inferenceLimit: 1, inferenceCount: 0 })
    await f.service.closeSession(f.session.sessionId, { outcome: 'blocked', summary: 'Interrupted before operations' })
    await expect(callOpenGuiTool(f.service, 'opengui_open_session', { deviceIds: ['phone-a'], viewerId: f.opened.viewerId, executionBudget: { operationLimit: 3 } }, f.signal, { task: f.task, owner: f.owner })).rejects.toThrow('frozen')
    const reopened = await f.service.openSession(['phone-a'], f.signal, 'control', { task: f.task, owner: f.owner, viewerId: f.opened.viewerId })
    expect(reopened.executionBudget?.operationLimit).toBe(2)
  })
  it('enforces the explicit phone-operation ceiling in the saved task rather than the longer default', async () => {
    const f = await fixture(false, 'Inspect the page. 最多3次手机操作（包括 observe 与 launch），完成即停。')
    const observe = vi.spyOn(f.host, 'observe')
    expect(f.service.snapshotSession(f.session.sessionId).executionBudget?.operationLimit).toBe(3)
    for (let count = 0; count < 3; count++) await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)
    await expect(f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)).rejects.toMatchObject({ code: 'budget_exhausted' })
    expect(observe).toHaveBeenCalledTimes(3)
    expect(f.store.load(f.opened.viewerId).board.executionBudget).toMatchObject({ operationLimit: 3, operations: { 'phone-a': 3 } })
    expect(new Workbench(f.viewer.board(f.opened.viewerId).snapshot()).operationLimit).toBe(3)
  })
  it('keeps restrictive initial limits across recovery and human extension without granting extra model authority', async () => {
    const f = await fixture(false, 'At most 2 phone operations, including observations')
    const board = f.viewer.board(f.opened.viewerId)
    for (let count = 0; count < 2; count++) await f.service.observe(f.session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)
    await f.service.closeSession(f.session.sessionId, { outcome: 'blocked', summary: 'Reached the declared limit' })
    f.service.endViewerTask(f.owner)
    expect((await f.post({ action: 'budget_extend', additional: 1, operationLimit: 2, inferenceLimit: 1000 })).status).toBe(200)
    const task = createControlTask(), owner = 'bounded-recovery'
    const reopened = await f.service.openViewer(undefined, f.signal, { owner, task, resumeTaskId: f.opened.viewerId })
    const page = await connect(reopened.url, 'phone-a'); f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    const session = await f.service.openSession(undefined, f.signal, 'control', { task, owner, viewerId: reopened.viewerId })
    expect(f.service.snapshotSession(session.sessionId).executionBudget?.operationLimit).toBe(3)
    await f.service.observe(session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)
    await expect(f.service.observe(session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)).rejects.toMatchObject({ code: 'budget_exhausted' })
    expect(board.executionBudget?.initialLimits?.operationLimit).toBe(2)
    expect(new Workbench(f.store.load(f.opened.viewerId).board).operationLimit).toBe(3)
  })
  it('distinguishes a total phone-operation ceiling from click counts, send goals and unrelated numbers', () => {
    expect(requestedOperationLimit('最多３次手机操作（含观察）')).toBe(3)
    expect(requestedOperationLimit('手机操作上限为 4 次', '最多2次手机操作')).toBe(2)
    expect(requestedOperationLimit('No more than 5 device operations')).toBe(5)
    for (const text of ['点击最多3次', '发送3条评论', '最多3次模型调用', 'Android 13，版本1.0，3张截图', 'Verify at least 3 phone operations']) expect(requestedOperationLimit(text)).toBeUndefined()
  })
  it('permits only restrictive initial input before dispatch and rolls back failed durable saves', () => {
    const board = new Workbench()
    board.configureExecutionBudget({ operationLimit: 3 })
    board.configureExecutionBudget({ inferenceLimit: 2 })
    expect(new Workbench(board.snapshot()).snapshot().executionBudget).toMatchObject({ initialLimits: { operationLimit: 3, inferenceLimit: 2 }, operationLimit: 3, inferenceLimit: 2 })
    expect(() => board.configureExecutionBudget({ operationLimit: 4 })).toThrow('frozen')
    board.reserveOperation('phone-a', 1)
    expect(() => board.configureExecutionBudget({ operationLimit: 2 })).toThrow('frozen')
    expect(() => validateToolArguments('opengui_open_session', { executionBudget: { operationLimit: 3, inferenceLimit: 2 } })).not.toThrow()
    for (const input of [{}, { operationLimit: 0 }, { operationLimit: 10001 }, { operationLimit: 1.5 }, { operationLimit: 3, operations: {} }, { additional: 3 }]) expect(() => validateToolArguments('opengui_open_session', { executionBudget: input })).toThrow('invalid arguments')
    const unsaved = new Workbench(undefined, { save() { throw new Error('disk full') }, capture() {}, previousComment: () => undefined })
    expect(() => unsaved.configureExecutionBudget({ operationLimit: 2 })).toThrow('disk full')
    expect(unsaved.operationLimit).toBe(1000)
  })
  it('adds a finite new segment while preserving earlier results, goals and review facts', () => {
    const board = exhausted(); board.objective = 'Original target'
    const review = { id: 'sent', account: 'qa', target: 'post:1', context: 'Source', draft: 'Final', status: 'sent' as const }
    board.reviews.push(review)
    board.extendExecutionBudget('phone-a', 3, 100, 100)
    expect(board.operationLimit).toBe(103); expect(board.inferenceLimit).toBe(3)
    expect(board.executionBudget?.extensions[0]).toMatchObject({ additional: 3, previousOperationLimit: 100, previousInferenceLimit: 100, previousResult: { outcome: 'blocked', summary: 'Operation budget exhausted' } })
    expect(board.objective).toBe('Original target'); expect(board.reviews[0]).toBe(review)
    expect(board.result?.outcome).toBe('blocked'); expect(board.control).toBe('ended')
    const restored = new Workbench(board.snapshot()); expect(restored.operationLimit).toBe(103)
    expect(restored.operationCount('phone-a')).toBe(100); expect(restored.markdown([])).toContain('追加最多 3')
    expect(() => board.extendExecutionBudget('phone-a', 3, 100, 100)).toThrow('changed')
  })

  it('requires actual exhaustion, terminal blocked state, explicit bounded input and unchanged limits', () => {
    for (const amount of [0, -1, 101, 1.5, NaN]) expect(() => exhausted().extendExecutionBudget('phone-a', amount, 100, 100)).toThrow('invalid_budget_extension')
    const board = exhausted()
    board.control = 'agent'; expect(() => board.extendExecutionBudget('phone-a', 1, 100, 100)).toThrow('unavailable')
    board.control = 'ended'
    for (const outcome of ['completed', 'cancelled', 'stopped', 'unknown'] as const) { board.result = { outcome }; expect(() => board.extendExecutionBudget('phone-a', 1, 100, 100)).toThrow('unavailable') }
    board.result = { outcome: 'blocked' }; board.executionBudget!.operations['phone-a'] = 99
    expect(() => board.extendExecutionBudget('phone-a', 1, 100, 100)).toThrow('not_exhausted')
  })

  it('does not extend a reached comment quantity or expired wall-clock limit', () => {
    const board = exhausted()
    board.commentBudget = { targetCount: 1, startedAt: new Date().toISOString(), stopReason: 'target_reached' }
    expect(() => board.extendExecutionBudget('phone-a', 1, 100, 100)).toThrow('unavailable')
    board.commentBudget = { maxDurationSeconds: 1, startedAt: new Date(0).toISOString(), deadlineAt: new Date(1000).toISOString() }
    expect(() => board.extendExecutionBudget('phone-a', 1, 100, 100)).toThrow('unavailable')
    expect(board.executionBudget?.extensions).toEqual([])
  })

  it('rolls back an extension when durable saving fails and rejects corrupt budget records', () => {
    const source = exhausted(), board = new Workbench(source.snapshot(), { save() { throw new Error('disk full') }, capture() {}, previousComment: () => undefined })
    board.control = 'ended'
    expect(() => board.extendExecutionBudget('phone-a', 5, 100, 100)).toThrow('disk full')
    expect(board.operationLimit).toBe(100); expect(board.executionBudget?.extensions).toEqual([])
    for (const limit of [NaN, Infinity, 0, -1, 20001]) expect(() => validatedExecutionBudget({ operationLimit: limit, inferenceLimit: 100, operations: {}, extensions: [] })).toThrow('invalid_execution_budget')
    expect(() => validatedExecutionBudget({ operationLimit: 999, inferenceLimit: 100, operations: {}, extensions: [] })).toThrow('invalid_execution_budget')
  })

  it('denies model-supplied grants, read-only and cross-origin requests and active-run changes', async () => {
    const f = await fixture(), grant = { action: 'budget_extend', additional: 3, operationLimit: 100, inferenceLimit: 100 }
    expect(() => validateToolArguments('opengui_open_session', { executionBudget: grant })).toThrow('invalid arguments')
    expect((await f.post(grant, 'wrong')).status).toBe(403)
    expect((await f.post(grant, undefined, 'https://outside.example')).status).toBe(403)
    expect((await f.post(grant)).status).toBe(400)
    expect(f.viewer.board(f.opened.viewerId).executionBudget?.extensions ?? []).toEqual([])
  })

  it('restores the same archived task and original phone with exactly the added operations and no old observation', async () => {
    const f = await fixture(false, 'Inspect original page', { operationLimit: 100, inferenceLimit: 100 }), board = f.viewer.board(f.opened.viewerId), act = vi.spyOn(f.host, 'act')
    f.task.operations.set('serial-a', 100); board.reserveOperation('phone-a', 100)
    const sent = board.requestReview({ account: 'qa', target: 'post:old', context: 'Source', draft: 'Already sent' })
    board.updateReview(sent.id, { status: 'sent' })
    await f.service.closeSession(f.session.sessionId, { outcome: 'blocked', summary: 'Operation budget exhausted' })
    f.service.endViewerTask(f.owner)
    expect((await f.post({ action: 'budget_extend', additional: 3, operationLimit: 100, inferenceLimit: 100 })).status).toBe(200)
    expect(act).not.toHaveBeenCalled()
    expect((await f.post({ action: 'budget_extend', additional: 3, operationLimit: 100, inferenceLimit: 100 })).status).toBe(400)
    const task = createControlTask(), owner = 'continuation-owner'
    const reopened = await f.service.openViewer(undefined, f.signal, { owner, task, resumeTaskId: f.opened.viewerId })
    expect(reopened).toMatchObject({ viewerId: f.opened.viewerId, firstDisplayEstablished: false, board: { objective: 'Inspect original page', reviews: [{ status: 'sent' }], executionBudget: { operationLimit: 103 } }, todos: f.plan })
    const page = await connect(reopened.url, 'phone-a'); f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    const session = await f.service.openSession(undefined, f.signal, 'control', { owner, task, viewerId: reopened.viewerId })
    await expect(f.service.act(session.sessionId, undefined, { action: 'key', key: 'Back', observationId: 'old' }, f.signal)).rejects.toMatchObject({ code: 'observation_required' })
    for (let count = 0; count < 3; count++) await f.service.observe(session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)
    expect(f.service.snapshotSession(session.sessionId).devices[0]).toMatchObject({ operationCount: 103, remainingOperations: 0 })
    await expect(f.service.observe(session.sessionId, undefined, f.signal, undefined, undefined, f.plan[0]!.stepId)).rejects.toMatchObject({ code: 'budget_exhausted' })
    expect(f.viewer.taskSteps(reopened.viewerId)[0]?.status).not.toBe('completed')
    expect(act).not.toHaveBeenCalled()
    expect(f.store.load(f.opened.viewerId).board.executionBudget?.operations['phone-a']).toBe(103)
  })
  it('rejects a stale account capability after logout without authorizing more work', async () => {
    const f = await fixture(true, 'Inspect original page', { operationLimit: 100, inferenceLimit: 100 }), board = f.viewer.board(f.opened.viewerId)
    f.task.operations.set('serial-a', 100); board.reserveOperation('phone-a', 100)
    await f.service.closeSession(f.session.sessionId, { outcome: 'blocked', summary: 'Operation budget exhausted' })
    await f.account!.logout()
    expect((await f.post({ action: 'budget_extend', additional: 5, operationLimit: 100, inferenceLimit: 100 })).status).toBe(400)
    expect(board.operationLimit).toBe(100); expect(board.executionBudget?.extensions).toEqual([])
  })
})
