import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Workbench } from '../src/workbench.ts'
import { retestComparison, type TestCase, type TestCaseDefinition, type TestCaseResultInput } from '../src/test-cases.ts'
import { createControlTask, WorkBuddyOpenGuiService } from '../src/service.ts'
import { callOpenGuiTool, validateToolArguments } from '../src/tools.ts'
import { TaskStore, type StoredTask } from '../src/task-store.ts'
import { TaskPlan } from '../src/todos.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect, a } from './viewer-fixture.ts'

const context = { app: 'QA App', version: '1', environment: 'test', account: 'qa', startPage: 'Login' }
const definition = (title = 'Login check', stepId?: string): TestCaseDefinition => ({ title, kind: 'flow', ...(stepId ? { stepId } : {}), context, prerequisites: ['Test account exists'], testData: { source: 'user', description: 'Provided test account, credentials omitted' }, steps: ['Inspect the login page'], expected: 'Login button is visible', expectedSource: { kind: 'user', reference: 'User task' }, stoppingCondition: 'Before final submit', dependencies: [] })
const result = (id: string, status: 'passed' | 'failed' = 'passed'): TestCaseResultInput => ({ status, page: 'Login page', actual: status === 'passed' ? 'Login button is visible' : 'Login button is missing', executedSteps: ['Inspected the page'], checkedStepIndexes: [0], evidenceObservationIds: [id] })
const resources: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })

async function fixture(contents = ['Check login', 'Dependent check', 'Independent check'], store?: TaskStore, operationLimit?: number) {
  const { viewer, sinks } = setup(undefined, store), host = new FakeHost(), service = new WorkBuddyOpenGuiService({ viewers: viewer, host })
  resources.push(() => service.dispose())
  const signal = AbortSignal.timeout(10_000), options = { owner: 'case-task', task: createControlTask() }
  const display = await service.openViewer(['phone-a'], signal, options), page = await connect(display.url, 'phone-a')
  sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  const plan = viewer.writeTodos(display.viewerId, options.owner, contents.map(content => ({ content, status: 'pending' }))).todos
  const session = await service.openSession(['phone-a'], signal, 'control', { ...options, viewerId: display.viewerId, objective: 'Check login', successCriteria: 'Before final submit', ...(operationLimit === undefined ? {} : { executionBudget: { operationLimit } }) })
  const call = (args: Record<string, unknown>) => callOpenGuiTool(service, 'opengui_test_case', { sessionId: session.sessionId, ...args }, signal, options) as Promise<{ test: TestCase; summary: Record<string, number> }>
  const observe = (index = 0, evidence?: string) => service.observe(session.sessionId, undefined, signal, undefined, evidence, plan[index]!.stepId)
  return { service, viewer, host, display, session, signal, plan, call, observe }
}

describe('structured checks and immutable evidence results', () => {
  it('rejects unrecorded and out-of-order case transitions without changing progress or dispatching', async () => {
    const f = await fixture()
    const cases = await Promise.all(f.plan.map((step, index) => f.call({ command: 'define', definition: definition(`Check ${index}`, step.stepId) })))
    const dispatch = vi.spyOn(f.host, 'observe')
    await f.call({ command: 'begin', caseId: cases[0]!.test.id })
    const image = await f.observe()
    const before = f.viewer.taskSteps(f.display.viewerId)
    await expect(f.call({ command: 'begin', caseId: cases[1]!.test.id })).rejects.toThrow('test_results_incomplete')
    expect(f.viewer.taskSteps(f.display.viewerId)).toEqual(before)
    await f.call({ command: 'result', caseId: cases[0]!.test.id, result: result(image.observationId) })
    await expect(f.call({ command: 'begin', caseId: cases[2]!.test.id })).rejects.toMatchObject({ code: 'task_node_out_of_order' })
    expect(f.viewer.taskSteps(f.display.viewerId)).toEqual(before)
    expect(f.viewer.board(f.display.viewerId).activeTestCaseId).toBe(cases[0]!.test.id)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('rolls back case activation and plan advancement together when saving fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-case-transition-'))
    resources.push(() => rmSync(directory, { recursive: true, force: true }))
    const store = new TaskStore(directory), f = await fixture(['First', 'Second'], store)
    const first = (await f.call({ command: 'define', definition: definition('First', f.plan[0]!.stepId) })).test
    const second = (await f.call({ command: 'define', definition: definition('Second', f.plan[1]!.stepId) })).test
    await f.call({ command: 'begin', caseId: first.id })
    const image = await f.observe()
    await f.call({ command: 'result', caseId: first.id, result: result(image.observationId) })
    const before = f.viewer.taskSteps(f.display.viewerId), saved = store.load(f.display.viewerId)
    const board = f.viewer.board(f.display.viewerId), stop = board.stopBeforeSubmit
    const save = vi.spyOn(store, 'save').mockImplementationOnce(() => { throw new Error('disk full') })
    await expect(f.call({ command: 'begin', caseId: second.id })).rejects.toThrow('disk full')
    expect(f.viewer.taskSteps(f.display.viewerId)).toEqual(before)
    expect(board.activeTestCaseId).toBe(first.id); expect(board.stopBeforeSubmit).toBe(stop)
    expect(store.load(f.display.viewerId)).toEqual(saved)
    save.mockRestore()
    await f.call({ command: 'begin', caseId: second.id })
    expect(store.load(f.display.viewerId)).toMatchObject({ todos: [{ status: 'completed' }, { status: 'in_progress' }], board: { activeTestCaseId: second.id } })
  })

  it('finishes an observation check and a rejection check without dispatching beyond the hard budget', async () => {
    const f = await fixture(['Inspect page twice', 'Verify budget rejection'], undefined, 2)
    const first = (await f.call({ command: 'define', definition: { ...definition('Inspect page twice', f.plan[0]!.stepId), steps: ['Inspect first image', 'Inspect second image'] } })).test
    const second = (await f.call({ command: 'define', definition: { ...definition('Verify rejection', f.plan[1]!.stepId), expected: 'Third observe is rejected before dispatch', dependencies: [first.id] } })).test
    const dispatch = vi.spyOn(f.host, 'observe')
    await f.call({ command: 'begin', caseId: first.id })
    const initial = await f.observe(), latest = await f.observe()
    await f.call({ command: 'result', caseId: first.id, result: { ...result(latest.observationId), executedSteps: ['Inspected first image', 'Inspected second image'], checkedStepIndexes: [0, 1], evidenceObservationIds: [initial.observationId, latest.observationId] } })
    await f.call({ command: 'begin', caseId: second.id })
    expect(f.service.snapshotSession(f.session.sessionId).progress).toMatchObject({ completed: 1, currentStepId: f.plan[1]!.stepId })
    await expect(f.observe(1)).rejects.toMatchObject({ code: 'budget_exhausted', executionState: 'not_executed' })
    await f.call({ command: 'result', caseId: second.id, result: { ...result(latest.observationId), actual: 'budget_exhausted, not_executed; no new image, operation count remains 2', executedSteps: ['Attempted third observe and inspected rejection'] } })
    const closed = await f.service.closeSession(f.session.sessionId, { outcome: 'completed', evidenceObservationIds: [latest.observationId] })
    expect(closed).toMatchObject({ state: 'closed', progress: { completed: 2, total: 2 }, tests: { passed: 2 } })
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(f.viewer.board(f.display.viewerId).executionBudget).toMatchObject({ operationLimit: 2, extensions: [] })
    expect(f.viewer.taskSteps(f.display.viewerId).map(step => step.status)).toEqual(['completed', 'completed'])
  })

  it('rejects a passing flow with only a subset of its planned checks verified', () => {
    const board = new Workbench(), test = board.defineTest({ ...definition(), steps: ['Inspect home', 'Open login', 'Check input', 'Verify pre-submit stop'] })
    board.beginTest(test.id); board.capture('home', Buffer.from('image'))
    const incomplete = { ...result('home'), executedSteps: ['Inspected home'], checkedStepIndexes: undefined }
    expect(() => board.recordTest(test.id, incomplete)).toThrow('test_step_coverage_required')
    const partial = { ...incomplete, checkedStepIndexes: [0] }
    expect(() => board.recordTest(test.id, partial)).toThrow('test_step_coverage_required')
    expect(test.result).toBeUndefined()
    board.recordTest(test.id, { ...partial, status: 'unverified', reason: 'Login, input and stop were not checked' })
    expect(test.result?.status).toBe('unverified')
  })

  it('accepts full step coverage and rejects duplicate or out-of-range declarations', () => {
    const board = new Workbench(), test = board.defineTest({ ...definition(), steps: ['Inspect home', 'Open login'] })
    board.beginTest(test.id); board.capture('login', Buffer.from('image'))
    expect(() => board.recordTest(test.id, { ...result('login'), checkedStepIndexes: [0, 0] })).toThrow('invalid_test_result')
    expect(() => board.recordTest(test.id, { ...result('login'), checkedStepIndexes: [0, 2] })).toThrow('test_step_index_invalid')
    board.recordTest(test.id, { ...result('login'), executedSteps: ['Inspected home', 'Opened login'], checkedStepIndexes: [0, 1] })
    expect(test.result).toMatchObject({ status: 'passed', checkedStepIndexes: [0, 1] })
  })

  it('requires checks for explicitly declared testing sessions even when the final image is valid', async () => {
    const f = await fixture(['Check page'])
    const board = f.viewer.board(f.display.viewerId); board.scenario = 'testing'
    const image = await f.observe()
    await expect(f.service.closeSession(f.session.sessionId, { outcome: 'completed', evidenceObservationIds: [image.observationId] })).rejects.toThrow('test_results_incomplete')
    expect(f.service.snapshotSession(f.session.sessionId).state).toBe('active')
  })

  it('rejects unknown expectations, absent evidence and fabricated unexecuted steps', () => {
    const board = new Workbench(), test = board.defineTest({ ...definition(), expectedSource: { kind: 'unknown', reference: 'Not provided' } })
    board.beginTest(test.id); board.capture('current', Buffer.from('image'))
    expect(() => board.recordTest(test.id, result('current'))).toThrow('expectation_unknown')
    expect(() => board.recordTest(test.id, { ...result('current'), status: 'not_checked', reason: 'Not attempted' })).toThrow('has_execution')
    board.recordTest(test.id, { status: 'unverified', actual: 'Screen observed; expected behavior unspecified', executedSteps: ['Read screen'], evidenceObservationIds: ['current'], reason: 'Expected result not provided' })
    expect(() => board.recordTest(test.id, result('current'))).toThrow('immutable')
    const next = board.defineTest(definition('Other check')); board.beginTest(next.id)
    expect(() => board.recordTest(next.id, { status: 'failed', actual: 'Button missing', executedSteps: ['Read page'], evidenceObservationIds: ['current'] })).toThrow('failure_page_required')
    expect(() => board.recordTest(next.id, result('foreign-task-image'))).toThrow('evidence_missing')
    expect(() => board.recordTest(next.id, { ...result('current'), evidenceObservationIds: [] })).toThrow('evidence_required')
  })

  it('rolls back definitions and results when durable saving fails and restores no active case', () => {
    let fail = false
    const board = new Workbench(undefined, { save() { if (fail) throw new Error('disk full') }, capture() {}, previousComment: () => undefined })
    fail = true; expect(() => board.defineTest(definition())).toThrow('disk full'); expect(board.testCases).toHaveLength(0)
    fail = false; const test = board.defineTest(definition()); board.beginTest(test.id); board.capture('current', Buffer.from('image'))
    fail = true; expect(() => board.recordTest(test.id, result('current'))).toThrow('disk full'); expect(test.result).toBeUndefined()
    fail = false; const restored = new Workbench(board.snapshot())
    expect(restored.activeTestCaseId).toBeUndefined(); expect(restored.testCases[0]?.definition).toEqual(test.definition)
  })

  it('requires reproduction conclusions and explains context differences without claiming a universal fix', () => {
    const board = new Workbench(), test = board.defineTest({ ...definition(), kind: 'reproduction' })
    board.beginTest(test.id); board.capture('current', Buffer.from('image'))
    expect(() => board.recordTest(test.id, result('current', 'failed'))).toThrow('reproduction_result_required')
    board.recordTest(test.id, { ...result('current', 'failed'), reproduction: 'reproduced' })
    const copied = board.defineTest({ ...definition('Retest'), kind: 'retest', context: { ...context, account: 'different', version: '2' } }, { taskId: 'old', caseId: test.id, context, result: test.result! })
    board.beginTest(copied.id); board.recordTest(copied.id, result('current'))
    expect(retestComparison(copied)).toMatchObject({ comparable: false, differences: ['version', 'account'] })
    expect(board.markdown([])).toContain('暂不能直接判定修复')
    expect(board.markdown([])).toContain('缺陷编号：DEF-')
  })

  it('rejects mixed command fields and bounds case inputs at the MCP boundary', () => {
    expect(() => validateToolArguments('opengui_test_case', { sessionId: 'session', command: 'read', definition: definition() })).toThrow('invalid arguments')
    expect(() => validateToolArguments('opengui_test_case', { sessionId: 'session', command: 'define', definition: { ...definition(), steps: [] } })).toThrow('invalid arguments')
    expect(() => validateToolArguments('opengui_test_case', { sessionId: 'session', command: 'result', caseId: 'case', result: { ...result('id'), recordedAt: 'invented' } })).toThrow('invalid arguments')
  })

  it('blocks stale evidence, step mismatches and unrecorded checks before dispatch, and keeps failing checks distinct from completed steps', async () => {
    const f = await fixture(['Check login']), test = (await f.call({ command: 'define', definition: definition('Login check', f.plan[0]!.stepId) })).test
    let image = await f.observe()
    const act = vi.spyOn(f.host, 'act')
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', key: 'Back', observationId: image.observationId, stepId: f.plan[0]!.stepId }, f.signal)).rejects.toThrow('test_case_required')
    expect(act).not.toHaveBeenCalled()
    await f.call({ command: 'begin', caseId: test.id }); const stale = image.observationId; image = await f.observe()
    await expect(f.call({ command: 'result', caseId: test.id, result: result(stale) })).rejects.toThrow('current_evidence_required')
    await expect(f.service.closeSession(f.session.sessionId, { outcome: 'completed', evidenceObservationIds: [image.observationId] })).rejects.toThrow('test_results_incomplete')
    await f.call({ command: 'result', caseId: test.id, result: result(image.observationId, 'failed') })
    const closed = await f.service.closeSession(f.session.sessionId, { outcome: 'completed', summary: 'Check executed; login button failed expectation', evidenceObservationIds: [image.observationId] })
    expect(closed).toMatchObject({ tests: { failed: 1, passed: 0 }, progress: { completed: 1 } })
    const response = await fetch(`${f.display.url}evidence?observationId=${image.observationId}`)
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect((await fetch(`${f.display.url}evidence?observationId=../../other-task`)).status).toBe(404)
  })

  it('prevents dependent execution after a failed prerequisite while preserving independent checks and skipped counts', async () => {
    const f = await fixture(), first = (await f.call({ command: 'define', definition: definition('Login', f.plan[0]!.stepId) })).test
    const dependent = (await f.call({ command: 'define', definition: { ...definition('Dependent', f.plan[1]!.stepId), dependencies: [first.id] } })).test
    const independent = (await f.call({ command: 'define', definition: definition('Independent', f.plan[2]!.stepId) })).test
    await f.call({ command: 'begin', caseId: first.id }); let image = await f.observe()
    await expect(f.service.observe(f.session.sessionId, undefined, f.signal, undefined, image.observationId, f.plan[1]!.stepId)).rejects.toThrow('test_results_incomplete')
    await f.call({ command: 'result', caseId: first.id, result: result(image.observationId, 'failed') })
    await expect(f.call({ command: 'begin', caseId: dependent.id })).rejects.toThrow('dependency_blocked')
    await f.call({ command: 'result', caseId: dependent.id, result: { status: 'not_checked', actual: 'No dependent execution', executedSteps: [], evidenceObservationIds: [], reason: 'Login prerequisite failed' } })
    await f.call({ command: 'begin', caseId: independent.id }); image = await f.observe(2, image.observationId)
    await f.call({ command: 'result', caseId: independent.id, result: result(image.observationId) })
    const closed = await f.service.closeSession(f.session.sessionId, { outcome: 'completed', evidenceObservationIds: [image.observationId] })
    expect(closed).toMatchObject({ tests: { failed: 1, passed: 1, notChecked: 1 }, progress: { completed: 2, skipped: 1, total: 3 } })
    expect(f.viewer.taskSteps(f.display.viewerId).map(step => step.status)).toEqual(['completed', 'skipped', 'completed'])
  })

  it('links archived retests without altering expectations, inputs or old reports and rejects foreign-account history', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-case-history-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    const store = new TaskStore(directory), board = new Workbench(), old = board.defineTest(definition())
    board.beginTest(old.id); board.capture('old-image', Buffer.from('image')); board.recordTest(old.id, result('old-image', 'failed'))
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const saved: StoredTask = { version: 1, id, owner: 'old-owner', principal: 'local', devices: [a], board: board.snapshot(), todos: [], updatedAt: new Date().toISOString() }
    store.save(saved, board.markdown([])); const originalReport = readFileSync(join(store.path(id), 'report.md'), 'utf8')
    const f = await fixture(['Retest'], store)
    const copied = (await f.call({ command: 'retest', sourceTaskId: id, sourceCaseId: old.id, context: { ...context, version: '2' }, stepId: f.plan[0]!.stepId })).test
    expect(copied.definition).toMatchObject({ expected: old.definition.expected, expectedSource: old.definition.expectedSource, testData: old.definition.testData, stoppingCondition: old.definition.stoppingCondition, steps: old.definition.steps })
    expect(copied.origin).toMatchObject({ taskId: id, caseId: old.id, result: { status: 'failed' } })
    await f.call({ command: 'begin', caseId: copied.id }); const image = await f.observe(); await f.call({ command: 'result', caseId: copied.id, result: result(image.observationId) })
    expect(retestComparison(copied)).toMatchObject({ comparable: true, differences: ['version'], conclusion: '本次相同检查点已通过' })
    expect(readFileSync(join(store.path(id), 'report.md'), 'utf8')).toBe(originalReport)
    const foreignId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; store.save({ ...saved, id: foreignId, principal: 'another-user' }, 'Foreign report')
    await expect(f.call({ command: 'retest', sourceTaskId: foreignId, sourceCaseId: old.id, context, stepId: f.plan[0]!.stepId })).rejects.toThrow('foreign_account')
  })

  it('retains all six plan states and prevents model-forged runtime statuses or completion of skipped steps', () => {
    const plan = new TaskPlan(); plan.revise(['A', 'B', 'C'].map(content => ({ content, status: 'pending' })))
    const [a, b, c] = plan.todos
    expect(() => plan.revise([{ ...a!, status: 'skipped' }, b!, c!])).toThrow('assigned by the runtime')
    plan.select(undefined, undefined, a!.stepId); plan.awaitUser(true)
    expect(plan.progress()).toMatchObject({ awaitingUser: 1, inProgress: 0, currentStepId: a!.stepId })
    plan.awaitUser(false); plan.settle(b!.stepId, 'skipped', 'No dependent execution'); plan.select(undefined, 'verified-image', c!.stepId)
    plan.settle(c!.stepId, 'failed', 'Device tool failed'); plan.finish()
    expect(plan.todos.map(item => item.status)).toEqual(['completed', 'skipped', 'failed'])
    expect(plan.progress()).toMatchObject({ completed: 1, skipped: 1, failed: 1, pending: 0 })
  })
})
