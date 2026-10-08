import { apkFile } from './apk-fixture.ts'
import { inputPermissionError } from '../src/input-diagnostics.ts'
import { initialEnvironment, environmentSpec, type EnvironmentSpec } from '../src/environment.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoreMateClient, modelCoordinateSpace, type ConfiguredModel } from '../src/coremate-client.ts'
import { modelFailureCode, toScreenshotPixels, transientModelFailure } from '../src/configured-runner.ts'
import { TaskStore } from '../src/task-store.ts'
import { createControlTask, WorkBuddyOpenGuiService } from '../src/service.ts'
import { callOpenGuiTool } from '../src/tools.ts'
import { setup, connect } from './viewer-fixture.ts'
import { FakeHost } from './fake-host.ts'
import type { CommentBudgetInput } from '../src/comments.ts'

const resources: Array<() => Promise<void> | void> = []
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })
type Json = Record<string, any>
async function fixture(protocol: ConfiguredModel['protocol'] = 'openai_chat', commentBudget?: CommentBudgetInput, persist = false) {
  const directory = mkdtempSync(join(tmpdir(), 'opengui-runner-'))
  resources.push(() => rmSync(directory, { recursive: true, force: true }))
  const model: ConfiguredModel = { id: '7', revision: '2026-10-01T00:00:00.000Z', name: 'Published vision model', model: 'fixture-vlm', protocol, recommended: true, reasoningEffort: 'low' }
  const catalog = { success: true, data: [{ id: 7, agentName: 'gui-agent-core', phoneModelKind: 'text', configName: model.name, modelName: model.model, baseUrl: 'https://provider.example/v1', hasApiKey: true, apiKey: null, isActive: true, updatedAt: model.revision, extra: { guiAgentCoreApi: protocol === 'openai_responses' ? 'openai-responses' : 'openai-completions', guiAgentCoreReasoningEffort: 'low' } }] }
  const client = new CoreMateClient(directory, (async (url: string) => new Response(JSON.stringify(url.endsWith('/desktop-text-models') ? catalog : { user: { id: 42, phoneNumber: '13800001234' }, token: 'fixture-session' }))) as typeof fetch)
  client.configure('http://127.0.0.1:1'); await client.login('13800001234', '123456'); client.selectModel(model.id)
  const { viewer, sinks } = setup(client, persist ? new TaskStore(join(directory, 'reports')) : undefined), host = new FakeHost(), service = new WorkBuddyOpenGuiService({ host, viewers: viewer, account: client })
  resources.push(() => service.dispose())
  const signal = AbortSignal.timeout(10_000), task = createControlTask(), options = { owner: 'runner-task', task }
  const display = await service.openViewer(['phone-a'], signal, options), page = await connect(display.url, 'phone-a')
  viewer.board(display.viewerId).modelConfig = model
  sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  viewer.writeTodos(display.viewerId, 'runner-task', [{ content: 'Check the visible page', status: 'pending' }])
  const session = await service.openSession(['phone-a'], signal, 'control', { ...options, ...(commentBudget ? { commentBudget, scenario: 'comments' } : {}), viewerId: display.viewerId, objective: 'Check the visible page', successCriteria: 'Verify the requested result from the current screen' })
  const action = (body: Json) => fetch(`${display.url}board`, { method: 'POST', headers: { Origin: new URL(display.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(display.workbenchUrl).hash.slice(7) }, body: JSON.stringify(body) })
  const call = (name: string, args: Json) => protocol === 'openai_chat'
    ? { choices: [{ message: { content: null, tool_calls: [{ id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }
    : { output: [{ type: 'function_call', call_id: `call-${name}`, name, arguments: JSON.stringify(args) }] }
  return { client, host, service, viewer, display, signal, session, action, call, task }
}

function latestImage(request: Json): Json {
  const content = request.messages?.filter((m: Json) => Array.isArray(m.content)).at(-1)?.content ?? request.input?.filter((m: Json) => Array.isArray(m.content)).at(-1)?.content
  return JSON.parse(content.find((p: Json) => p.type === 'text' || p.type === 'input_text').text)
}

describe('configured phone executor', () => {
  it.each([false, true])('waits through unchanged review state and continues after skip (progress=%s)', async progress => {
    const f = await fixture(), board = f.viewer.board(f.display.viewerId), notify = vi.fn(), act = vi.spyOn(f.host, 'act')
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async () => infer.mock.calls.length === 1
      ? f.call('opengui_review_comment', { account: 'qa-private-account', target: 'post:private', context: 'Private source', draft: 'Private draft' })
      : f.call('opengui_close_session', { outcome: 'blocked', summary: 'The user skipped the only requested comment; nothing was sent.' }))
    let settled = false
    let waiting = f.service.executeConfigured(f.session.sessionId, 2000, f.signal, progress ? notify : undefined)
    await vi.waitFor(() => expect(board.reviews[0]?.status).toBe('pending'))
    if (!progress) {
      expect(await waiting).toMatchObject({ state: 'active', event: { changed: true, delivery: 'event_wait' } })
      waiting = f.service.executeConfigured(f.session.sessionId, 2000, f.signal)
    }
    void waiting.then(() => { settled = true })
    const review = board.reviews[0]!
    board.saveDraft(review.id, 'Human draft still awaiting approval', review.contentVersion)
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(settled).toBe(false)
    expect(infer).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls.filter(([message]) => message.includes('内容待审核'))).toHaveLength(progress ? 1 : 0)
    expect(JSON.stringify(notify.mock.calls)).not.toMatch(/private|Private|Human draft/u)
    expect((await f.action({ action: 'review', reviewId: review.id, decision: 'skip' })).status).toBe(200)
    await waiting
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId).state).toBe('closed'))
    expect(infer).toHaveBeenCalledTimes(2); expect(act).not.toHaveBeenCalled()
    expect((await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)).result?.outcome).toBe('blocked')
  })

  it('returns from a long execute wait at the next settled step instead of polling on a timer', async () => {
    const f = await fixture()
    const plan = f.viewer.writeTodos(f.display.viewerId, 'runner-task', [{ content: 'Check the visible page', status: 'pending' }, { content: 'Confirm the result', status: 'pending' }])
    const [first, second] = plan.todos.map(step => step.stepId!)
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body, signal) => {
      if (infer.mock.calls.length === 1) return f.call('opengui_observe', { stepId: first })
      if (infer.mock.calls.length === 2) return f.call('opengui_observe', { stepId: second, evidenceObservationId: latestImage(body).observationId })
      return new Promise<Json>((_resolve, reject) => { signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }) })
    })
    const started = Date.now()
    const status = await f.service.executeConfigured(f.session.sessionId, 600_000, f.signal)
    expect(Date.now() - started).toBeLessThan(8000)
    expect(status).toMatchObject({ state: 'active' })
    expect(f.viewer.taskSteps(f.display.viewerId).map(step => step.status)).toEqual(['completed', 'in_progress'])
    await f.service.cancel(f.session.sessionId)
  })
  it('uses the saved inference ceiling rather than an independent one-hundred-round cutoff', async () => {
    const f = await fixture(), board = f.viewer.board(f.display.viewerId)
    board.configureExecutionBudget({ inferenceLimit: 101 })
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async () => f.call('opengui_environment', { command: 'read' }))
    await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    expect(infer).toHaveBeenCalledTimes(101)
    expect(board.inferenceCount).toBe(101)
    expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', result: { outcome: 'blocked' } })
  })
  it.each(['openai_chat', 'openai_responses'] as const)('pauses %s inference after disconnect and observes again only after a human recheck', async protocol => {
    const f = await fixture(protocol), act = vi.spyOn(f.host, 'act'), images: string[] = []
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body, signal) => {
      const image = latestImage(body); images.push(image.observationId)
      if (infer.mock.calls.length === 1) return new Promise<Json>((_resolve, reject) => { signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }) })
      expect(JSON.stringify(body)).toContain('connection recovery')
      return f.call('opengui_close_session', { outcome: 'blocked', summary: 'Connection inspected without replaying an uncertain action', evidenceObservationIds: [image.observationId] })
    })
    await f.service.executeConfigured(f.session.sessionId, 10, f.signal)
    await vi.waitFor(() => expect(infer).toHaveBeenCalledTimes(1))
    const phone = f.host.devices.find(device => device.id === 'phone-a')!
    phone.connected = false
    await f.service.status(f.session.sessionId, f.signal)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(infer).toHaveBeenCalledTimes(1)
    expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ controlMode: 'paused', connectionRecovery: { status: 'waiting_recheck' } })
    phone.connected = true
    await f.service.status(f.session.sessionId, f.signal)
    expect(infer).toHaveBeenCalledTimes(1)
    expect((await f.action({ action: 'recheck' })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId).state).toBe('closed'))
    expect(infer).toHaveBeenCalledTimes(2)
    expect(images[1]).not.toBe(images[0]); expect(act).not.toHaveBeenCalled()
  })
  it.each(['openai_chat', 'openai_responses'] as const)('rejects an omitted gesture classification in %s without completing the node', async protocol => {
    const f = await fixture(protocol), act = vi.spyOn(f.host, 'act')
    f.service.restrictTask(f.task)
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body)
      if (infer.mock.calls.length === 1) return f.call('opengui_act', { action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, observationId: image.observationId, stepId: image.progress.currentStepId })
      expect(JSON.stringify(body)).toContain('stop_action_unclassified')
      expect(JSON.stringify(body)).toContain('not_executed')
      return f.call('opengui_close_session', { outcome: 'blocked', summary: 'Control purpose could not be classified; final submission was not checked', evidenceObservationIds: [image.observationId] })
    })
    expect(await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)).toMatchObject({ state: 'closed', stopBeforeSubmit: true, result: { outcome: 'blocked' } })
    expect(infer).toHaveBeenCalledTimes(2); expect(act).not.toHaveBeenCalled()
    expect(f.viewer.taskSteps(f.display.viewerId)[0]?.status).not.toBe('completed')
  })
  it.each(['openai_chat', 'openai_responses'] as const)('honors the exact finite inference grant in %s without resetting old calls', async protocol => {
    const f = await fixture(protocol, undefined, true), board = f.viewer.board(f.display.viewerId), observe = vi.spyOn(f.host, 'observe'), act = vi.spyOn(f.host, 'act'), assign = vi.spyOn(f.host, 'assignTarget')
    const previousActor = f.task.actors.get('serial-a')
    board.configureExecutionBudget({ operationLimit: 100, inferenceLimit: 100 })
    for (let count = 0; count < 100; count++) board.traces.push({ id: 'old-model-' + count, deviceId: 'phone-a', kind: 'model', startedAt: new Date().toISOString(), status: 'executed' })
    board.checkpoint()
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async () => f.call('opengui_environment', { command: 'read' }))
    await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', result: { outcome: 'blocked' } })
    expect(infer).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled()
    expect((await f.action({ action: 'budget_extend', additional: 2, operationLimit: 100, inferenceLimit: 100 })).status).toBe(200)
    const session = await f.service.openSession(['phone-a'], f.signal, 'control', { task: f.task, owner: 'runner-task', viewerId: f.display.viewerId })
    expect(assign.mock.calls[0]![0]).not.toBe(previousActor)
    await f.service.executeConfigured(session.sessionId, 1000, f.signal)
    expect(infer).toHaveBeenCalledTimes(2); expect(observe).toHaveBeenCalledTimes(1); expect(act).not.toHaveBeenCalled()
    expect(board.inferenceCount).toBe(102); expect(board.inferenceLimit).toBe(102)
    expect(board.executionBudget?.extensions).toHaveLength(1)
    expect(f.service.snapshotSession(session.sessionId).result?.outcome).toBe('blocked')
    expect(f.viewer.taskSteps(f.display.viewerId)[0]?.status).not.toBe('completed')
  })
  it.each(['openai_chat', 'openai_responses'] as const)('blocks final submission from %s and exposes the frozen endpoint to inference', async protocol => {
    const f = await fixture(protocol), act = vi.spyOn(f.host, 'act')
    f.service.restrictTask(f.task)
    const requests: Json[] = []
    vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      requests.push(body)
      const image = latestImage(body)
      if (requests.length === 1) return f.call('opengui_act', { action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, externalSideEffect: 'submit', observationId: image.observationId, stepId: image.progress.currentStepId })
      expect(JSON.stringify(body)).toContain('stop_before_submit')
      return f.call('opengui_close_session', { outcome: 'blocked', summary: 'Final submission is outside the agreed endpoint and was not checked', evidenceObservationIds: [image.observationId] })
    })
    const result = await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    expect(result).toMatchObject({ state: 'closed', stopBeforeSubmit: true, result: { outcome: 'blocked' } })
    const initial = (requests[0]!.messages ?? requests[0]!.input).find((message: Json) => message.role === 'user' && typeof message.content === 'string')
    expect(JSON.parse(initial.content).stopBeforeSubmit).toBe(true)
    expect(requests).toHaveLength(2)
    expect(act).not.toHaveBeenCalled()
    expect(f.viewer.taskSteps(f.display.viewerId)[0]?.status).not.toBe('completed')
  })
  it.each(['openai_chat', 'openai_responses'] as const)('ends %s at the comment target without another inference or phone action', async protocol => {
    const f = await fixture(protocol, { targetCount: 1 }), board = f.viewer.board(f.display.viewerId), act = vi.spyOn(f.host, 'act')
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body), review = board.reviews[0], common = { stepId: image.progress.currentStepId, observationId: image.observationId }
      switch (inference.mock.calls.length) {
        case 1: expect(JSON.stringify(body)).toContain('targetCount'); return f.call('opengui_review_comment', { account: 'qa', target: 'post:bounded', context: 'Fixture source', draft: 'Draft' })
        case 2: case 4: return f.call('opengui_comment_input', { reviewId: review!.id, observationId: image.observationId, targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } })
        case 3: return f.call('opengui_act', { ...common, action: 'text', text: review!.draft, reviewId: review!.id })
        case 5: return f.call('opengui_act', { ...common, action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, externalSideEffect: 'send', reviewId: review!.id })
        case 6: return f.call('opengui_verify_comment', { reviewId: review!.id, evidenceObservationId: image.observationId })
        default: throw new Error('Inference must stop at the verified limit')
      }
    })
    await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    await f.action({ action: 'review', reviewId: board.reviews[0]!.id, decision: 'approve', draft: 'Exact human edit', expectedVersion: 1 })
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', result: { outcome: 'stopped' }, comments: { sent: 1, stopReason: 'target_reached' } }))
    expect(inference).toHaveBeenCalledTimes(6); expect(act).toHaveBeenCalledTimes(4)
    expect(board.reviews[0]).toMatchObject({ draft: 'Exact human edit', approvedVersion: 2, status: 'sent' })
  })

  it.each(['openai_chat', 'openai_responses'] as const)('waits for the separate replacement choice in %s without another inference', async protocol => {
    const f = await fixture(protocol, { targetCount: 1 }), board = f.viewer.board(f.display.viewerId), originalAct = f.host.act.bind(f.host)
    f.host.act = async (actor, input) => { if (input?.action === 'read_text' && !board.reviews[0]?.inputAttempts?.length) f.host.actors.get(actor)!.focusedText = 'Existing phone original'; return originalAct(actor, input) }
    const act = vi.spyOn(f.host, 'act')
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body), review = board.reviews[0]!, common = { observationId: image.observationId, stepId: image.progress.currentStepId }
      switch (infer.mock.calls.length) {
        case 1: return f.call('opengui_review_comment', { account: 'qa', target: 'post:replace', context: 'Fixture source', draft: 'Approved final 😀\n第二行' })
        case 2: case 4: case 6: return f.call('opengui_comment_input', { reviewId: review.id, observationId: image.observationId, targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } })
        case 3: expect(JSON.stringify(body)).toContain('Saved human review/replacement decisions'); return f.call('opengui_observe', { stepId: common.stepId })
        case 5: return f.call('opengui_act', { ...common, action: 'replace_text', text: review.draft, reviewId: review.id })
        case 7: return f.call('opengui_act', { ...common, action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, externalSideEffect: 'send', reviewId: review.id })
        case 8: return f.call('opengui_verify_comment', { reviewId: review.id, evidenceObservationId: image.observationId })
        default: throw new Error('Unexpected additional inference')
      }
    })
    await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    await f.action({ action: 'review', reviewId: board.reviews[0]!.id, decision: 'approve' })
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId).replacementPending).toBe(true))
    expect(infer).toHaveBeenCalledTimes(2); expect(act.mock.calls.filter(call => call[1]?.action !== 'read_text')).toHaveLength(0)
    expect((await f.service.executeConfigured(f.session.sessionId, 30000, f.signal)).replacementPending).toBe(true)
    expect(infer).toHaveBeenCalledTimes(2)
    const review = board.reviews[0]!
    expect((await f.action({ action: 'comment_original', reviewId: review.id, decision: 'replace', platformVersion: review.platformInput!.version, contentVersion: review.contentVersion })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', comments: { sent: 1 } }))
    expect(infer).toHaveBeenCalledTimes(8)
    expect(act.mock.calls.filter(call => call[1]?.action !== 'read_text').map(call => call[1]?.action)).toEqual(['replace_text', 'tap'])
    expect(review.replacementDecisions?.[0]?.usedAt).toBeTruthy()
  })

  it.each(['openai_chat', 'openai_responses'] as const)('pauses %s inference on a device input denial and observes after the human recheck', async protocol => {
    const f = await fixture(protocol), board = f.viewer.board(f.display.viewerId)
    const act = vi.spyOn(f.host, 'act').mockRejectedValueOnce(inputPermissionError()), observe = vi.spyOn(f.host, 'observe')
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body), stepId = f.viewer.progress(f.display.viewerId)!.currentStepId
      if (infer.mock.calls.length === 1) return f.call('opengui_act', { action: 'key', key: 'Home', observationId: image.observationId, stepId })
      expect(JSON.stringify(body)).toContain('recheck_pending')
      expect(observe).toHaveBeenCalledTimes(2)
      if (infer.mock.calls.length === 2) return f.call('opengui_act', { action: 'key', key: 'Back', observationId: image.observationId, stepId })
      return f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [image.observationId] })
    })
    await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ controlMode: 'paused', inputDiagnostic: { status: 'blocked' } }))
    expect(infer).toHaveBeenCalledTimes(1); expect(act).toHaveBeenCalledTimes(1)
    expect((await f.action({ action: 'recheck' })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', inputDiagnostic: { status: 'resolved' } }))
    expect(infer).toHaveBeenCalledTimes(3); expect(act).toHaveBeenCalledTimes(2)
    expect(act.mock.calls[1]![1]).toMatchObject({ key: 'Back' }); expect(board.traces.some(trace => trace.code === 'input_permission_denied')).toBe(true)
  })

  it.each(['openai_chat', 'openai_responses'] as const)('checks declared prerequisites through the %s executor before completion', async protocol => {
    const f = await fixture(protocol), board = f.viewer.board(f.display.viewerId)
    board.configureEnvironment(environmentSpec({ packageName: 'com.example', requireAccount: true }), 'phone-a')
    const check = vi.fn(async (_device, spec: EnvironmentSpec) => {
      const state = initialEnvironment(spec, 'phone-a'); state.stale = false; state.checkedAt = new Date().toISOString()
      state.checks.filter(item => item.source === 'adb').forEach(item => item.status = 'passed')
      return state
    })
    Object.assign(f.host, { checkEnvironment: check })
    const act = vi.spyOn(f.host, 'act')
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body)
      const definitions = body.tools as Json[]
      expect(definitions.some(tool => (tool.function?.name ?? tool.name) === 'opengui_environment')).toBe(true)
      switch (inference.mock.calls.length) {
        case 1: return f.call('opengui_environment', { command: 'check' })
        case 2: return f.call('opengui_environment', { command: 'verify', verification: { check: 'account', status: 'passed', detail: 'Visible required QA account', evidenceObservationId: image.observationId } })
        default: return f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [image.observationId] })
      }
    })
    await f.service.executeConfigured(f.session.sessionId, 3000, f.signal)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', result: { outcome: 'completed' } }))
    expect(check).toHaveBeenCalledTimes(1); expect(inference).toHaveBeenCalledTimes(3); expect(act).not.toHaveBeenCalled()
    expect(board.environment?.checks.find(item => item.id === 'account')).toMatchObject({ status: 'passed', source: 'model_observation' })
  })

  it.each(['openai_chat', 'openai_responses'] as const)('installs the host-prepared original APK through the %s executor and requires a new observation', async protocol => {
    const f = await fixture(protocol), directory = mkdtempSync(join(tmpdir(), 'opengui-runner-apk-'))
    resources.push(() => rmSync(directory, { recursive: true, force: true }))
    let installed = false
    const install = vi.fn(async () => { installed = true })
    Object.assign(f.host, { installApk: install, checkEnvironment: async (_device, spec: EnvironmentSpec) => {
      const state = initialEnvironment(spec, 'phone-a'); state.stale = false; state.checks.forEach(item => item.status = item.id === 'app' && !installed ? 'failed' : 'passed'); return state
    } })
    const prepared = await f.service.apk(f.session.sessionId, 'inspect', f.signal, await apkFile(directory), undefined, true)
    const observe = vi.spyOn(f.host, 'observe')
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body)
      if (inference.mock.calls.length === 1) {
        expect(JSON.stringify(body)).toContain(prepared.apk!.sha256)
        expect((body.tools as Json[]).some(tool => (tool.function?.name ?? tool.name) === 'opengui_prepare_apk')).toBe(true)
        return f.call('opengui_prepare_apk', { command: 'install', artifactId: prepared.apk!.id })
      }
      // The executor captures a fresh post-install screen before another inference.
      expect(observe).toHaveBeenCalledTimes(2)
      return f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [image.observationId] })
    })
    await f.service.executeConfigured(f.session.sessionId, 3000, f.signal)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', apk: { status: 'installed' } }))
    expect(install).toHaveBeenCalledTimes(1); expect(observe).toHaveBeenCalledTimes(2); expect(inference).toHaveBeenCalledTimes(2)
  })

  it.each(['openai_chat', 'openai_responses'] as const)('waits for a real human update decision before %s inference or installation', async protocol => {
    const f = await fixture(protocol), directory = mkdtempSync(join(tmpdir(), 'opengui-runner-update-'))
    resources.push(() => rmSync(directory, { recursive: true, force: true }))
    const install = vi.fn(async () => {})
    Object.assign(f.host, { installApk: install, checkEnvironment: async (_device, spec: EnvironmentSpec) => {
      const state = initialEnvironment(spec, 'phone-a'); state.stale = false; state.checks.forEach(item => item.status = 'passed'); state.checks.find(item => item.id === 'version')!.observedValue = '1.0'; return state
    } })
    const prepared = await f.service.apk(f.session.sessionId, 'inspect', f.signal, await apkFile(directory), undefined, true)
    const infer = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => infer.mock.calls.length === 1 ? f.call('opengui_prepare_apk', { command: 'install', artifactId: prepared.apk!.id }) : f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [latestImage(body).observationId] }))
    const waiting = await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    expect(waiting.apk?.updateApprovedAt).toBeUndefined(); expect(infer).not.toHaveBeenCalled(); expect(install).not.toHaveBeenCalled()
    expect((await f.action({ action: 'apk_update_confirm', artifactId: prepared.apk!.id, sha256: prepared.apk!.sha256, existingVersion: '1.0' })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId).state).toBe('closed'))
    expect(install).toHaveBeenCalledTimes(1); expect(infer).toHaveBeenCalledTimes(2)
  })

  it('aborts an in-flight inference at the saved comment deadline', async () => {
    const f = await fixture('openai_chat', { maxDurationSeconds: 1 }), act = vi.spyOn(f.host, 'act')
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, _body, signal) => {
      entered(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    })
    await f.service.executeConfigured(f.session.sessionId, 0, f.signal); await started
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ state: 'closed', result: { outcome: 'stopped' }, comments: { stopReason: 'time_limit' } }), { timeout: 2500 })
    expect(inference).toHaveBeenCalledTimes(1); expect(act).not.toHaveBeenCalled()
    expect(f.viewer.board(f.display.viewerId).traces.filter(trace => trace.kind === 'model').at(-1)?.status).toBe('failed')
  })
  it.each(['openai_chat', 'openai_responses'] as const)('pauses %s inference and the remaining batch after a model-requested handoff', async protocol => {
    const f = await fixture(protocol), act = vi.spyOn(f.host, 'act'), observe = vi.spyOn(f.host, 'observe'), board = f.viewer.board(f.display.viewerId)
    let previous: string | undefined
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body)
      if (inference.mock.calls.length === 1) {
        previous = image.observationId
        const handoff: Json = f.call('opengui_handoff', { category: 'security', reason: '请在原手机上确认安全提示，完成后交还控制。' })
        const blocked: Json = f.call('opengui_close_session', { outcome: 'blocked', summary: 'Must not dispatch this remainder during manual control' })
        if (protocol === 'openai_chat') handoff.choices[0].message.tool_calls.push(...blocked.choices[0].message.tool_calls)
        else handoff.output.push(...blocked.output)
        return handoff
      }
      expect(image.observationId).not.toBe(previous)
      expect(JSON.stringify(body)).toContain('安全提示')
      return f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [image.observationId] })
    })
    const waiting = await f.service.executeConfigured(f.session.sessionId, 2000, f.signal)
    expect(waiting).toMatchObject({ state: 'active', controlMode: 'manual', handoff: { category: 'security', status: 'waiting_user' }, progress: { awaitingUser: 1, completed: 0 } })
    expect(inference).toHaveBeenCalledTimes(1)
    expect(act).not.toHaveBeenCalled()
    expect(observe).toHaveBeenCalledTimes(1)
    expect((await f.action({ action: 'resume' })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId).state).toBe('closed'))
    expect(inference).toHaveBeenCalledTimes(2)
    expect(observe).toHaveBeenCalledTimes(2)
    expect(board.handoffs[0]).toMatchObject({ status: 'resolved', evidenceObservationId: expect.any(String) })
  })
  it('records structured test cases through the selected executor before completing the run', async () => {
    const f = await fixture(), board = f.viewer.board(f.display.viewerId)
    board.scenario = 'testing'
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body), test = board.testCases[0]
      switch (inference.mock.calls.length) {
        case 1: return f.call('opengui_test_case', { command: 'define', definition: { title: 'Visible page', kind: 'flow', stepId: image.progress.currentStepId, context: { app: 'Fixture', version: 'unknown', environment: 'test', account: 'qa', startPage: 'Home' }, prerequisites: [], testData: { source: 'none', description: 'No input' }, steps: ['Inspect the screen'], expected: 'Home page visible', expectedSource: { kind: 'user', reference: 'Fixture task' }, stoppingCondition: 'Before submission', dependencies: [] } })
        case 2: return f.call('opengui_test_case', { command: 'begin', caseId: test!.id })
        case 3: return f.call('opengui_test_case', { command: 'result', caseId: test!.id, result: { status: 'passed', actual: 'Home page visible', executedSteps: ['Inspected screen'], checkedStepIndexes: [0], evidenceObservationIds: [image.observationId] } })
        default: return f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [image.observationId], summary: 'Check passed; submission was not attempted' })
      }
    })
    const closed = await f.service.executeConfigured(f.session.sessionId, 2000, f.signal)
    expect(closed).toMatchObject({ state: 'closed', tests: { passed: 1, planned: 0 }, progress: { completed: 1 } })
    expect(inference).toHaveBeenCalledTimes(4)
    expect(board.markdown(f.viewer.taskSteps(f.display.viewerId))).toContain('Home page visible')
  })

  it.each(['openai_chat', 'openai_responses'] as const)('executes %s calls on the bound phone and records real inference timing', async protocol => {
    const f = await fixture(protocol), act = vi.spyOn(f.host, 'act'), requests: Json[] = []
    vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      requests.push(body)
      await new Promise(resolve => setTimeout(resolve, 10))
      const image = latestImage(body)
      const result: Json = requests.length === 1 ? f.call('opengui_act', { action: 'key', key: 'Back', stepId: image.progress.currentStepId, observationId: image.observationId })
        : f.call('opengui_close_session', { outcome: 'completed', summary: 'Observed the result; submission was not checked by agreement.', evidenceObservationIds: [image.observationId] })
      if (protocol === 'openai_responses' && requests.length === 1) result.output.unshift({ type: 'reasoning', id: 'rs-fixture', summary: [], encrypted_content: 'fixture-opaque-state' })
      return result
    })
    const result = await f.service.executeConfigured(f.session.sessionId, 2000, f.signal)
    expect(result).toMatchObject({ state: 'closed', result: { outcome: 'completed' }, executor: { mode: 'configured', model: 'Published vision model', started: true } })
    expect(act).toHaveBeenCalledTimes(1)
    expect(f.viewer.board(f.display.viewerId).traces.filter(t => t.kind === 'model').map(t => t.durationMs)).toEqual([expect.any(Number), expect.any(Number)])
    const definitions = requests[0]!.tools
    expect(JSON.stringify(definitions)).not.toContain('hostContext')
    expect(JSON.stringify(definitions)).not.toContain('sessionId')
    if (protocol === 'openai_responses') {
      expect(requests[1]!.input.some((item: Json) => item.type === 'function_call_output')).toBe(true)
      expect(requests[1]!.input.some((item: Json) => item.id === 'rs-fixture' && item.encrypted_content === 'fixture-opaque-state')).toBe(true)
    }
  })

  it('aborts inference on takeover, fences parallel host actions, then observes fresh evidence on handback', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act'), observe = vi.spyOn(f.host, 'observe')
    await expect(callOpenGuiTool(f.service, 'opengui_observe', { sessionId: f.session.sessionId }, f.signal)).rejects.toMatchObject({ code: 'executor_owned' })
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const inference = vi.spyOn(f.client, 'infer').mockImplementationOnce(async (_model, _body, signal) => {
      entered(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    }).mockImplementation(async (_model, body) => f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [latestImage(body).observationId] }))
    await f.service.executeConfigured(f.session.sessionId, 0, f.signal); await started
    await expect(callOpenGuiTool(f.service, 'opengui_act', { sessionId: f.session.sessionId, action: 'key', key: 'Back', observationId: 'old' }, f.signal)).rejects.toMatchObject({ code: 'executor_owned' })
    expect((await f.action({ action: 'takeover' })).status).toBe(200)
    await vi.waitFor(() => expect(f.viewer.board(f.display.viewerId).traces.filter(t => t.kind === 'model')[0]?.status).toBe('failed'))
    expect(act).not.toHaveBeenCalled(); expect(inference).toHaveBeenCalledTimes(1)
    expect((await f.action({ action: 'resume' })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId).result?.outcome).toBe('completed'))
    expect(observe).toHaveBeenCalledTimes(2)
  })

  it('waits for an actual human decision and sends only the edited approved draft', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act'), board = f.viewer.board(f.display.viewerId)
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async (_model, body) => {
      const image = latestImage(body), review = board.reviews[0], common = { stepId: image.progress.currentStepId, observationId: image.observationId }
      switch (inference.mock.calls.length) {
        case 1: return f.call('opengui_review_comment', { account: 'qa', target: 'post:1', context: 'Fixture source post', draft: 'Original draft' })
        case 2: case 4: return f.call('opengui_comment_input', { reviewId: review!.id, observationId: image.observationId, targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } })
        case 3: expect(JSON.stringify(body)).toContain('Human edit'); return f.call('opengui_act', { ...common, action: 'text', text: review!.draft, reviewId: review!.id })
        case 5: return f.call('opengui_act', { ...common, action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, reviewId: review!.id, externalSideEffect: 'send' })
        case 6: return f.call('opengui_verify_comment', { reviewId: review!.id, evidenceObservationId: image.observationId })
        default: return f.call('opengui_close_session', { outcome: 'completed', evidenceObservationIds: [image.observationId] })
      }
    })
    await f.service.executeConfigured(f.session.sessionId, 1000, f.signal)
    expect(board.reviews[0]?.status).toBe('pending'); expect(inference).toHaveBeenCalledTimes(1); expect(act).not.toHaveBeenCalled()
    expect((await f.action({ action: 'review', reviewId: board.reviews[0]!.id, decision: 'approve', draft: 'Human edit 😀\nSecond line' })).status).toBe(200)
    await vi.waitFor(() => expect(f.service.snapshotSession(f.session.sessionId).state).toBe('closed'))
    expect(board.reviews[0]).toMatchObject({ status: 'sent', draft: 'Human edit 😀\nSecond line', contentVersion: 2 })
    expect(act).toHaveBeenCalledTimes(4)
    expect(act.mock.calls.find(call => call[1]?.action === 'text')?.[1]).toMatchObject({ action: 'text', text: 'Human edit 😀\nSecond line' })
  })

  it('rejects model-supplied foreign session arguments before phone dispatch', async () => {
    const f = await fixture(), act = vi.spyOn(f.host, 'act')
    const inference = vi.spyOn(f.client, 'infer').mockImplementation(async () => inference.mock.calls.length === 1
      ? f.call('opengui_act', { sessionId: 'another-task', action: 'key', key: 'Back', observationId: 'foreign' })
      : f.call('opengui_close_session', { outcome: 'blocked', summary: 'Task scope rejected' }))
    expect((await f.service.executeConfigured(f.session.sessionId, 2000, f.signal)).result?.outcome).toBe('blocked')
    expect(act).not.toHaveBeenCalled()
  })
  it('uses screenshot pixels by default and converts only 0-1000 model families', () => {
    expect(['deepseek-v4.1-flash', 'vendor-vision-a', 'vendor-vision-b'].map(model => modelCoordinateSpace({ model }))).toEqual(['screenshot_pixels', 'screenshot_pixels', 'screenshot_pixels'])
    expect(['qwen3.6-plus', 'doubao-seed-2-1-pro-260628'].map(model => modelCoordinateSpace({ model }))).toEqual(['normalized_1000', 'normalized_1000'])
    expect(modelCoordinateSpace({ model: 'qwen3.6-plus', coordinateSpace: 'screenshot_pixels' })).toBe('screenshot_pixels')
    const screen = { width: 591, height: 1280 }
    expect(toScreenshotPixels({ action: 'tap', targetBBox: { left: 36, top: 345, right: 960, bottom: 380 } }, 'normalized_1000', screen).targetBBox).toEqual({ left: 21, top: 442, right: 567, bottom: 486 })
    expect(toScreenshotPixels({ action: 'swipe', x1: 500, y1: 800, x2: 500, y2: 1200 }, 'normalized_1000', screen)).toMatchObject({ x1: 296, y1: 1024, x2: 296, y2: 1280 })
    const pixels = { action: 'tap', targetBBox: { left: 22, top: 430, right: 570, bottom: 494 } }
    expect(toScreenshotPixels(pixels, 'screenshot_pixels', screen)).toBe(pixels)
  })
  it('retries a transient model failure instead of ending the run, and names a persistent one', async () => {
    const f = await fixture(), board = f.viewer.board(f.display.viewerId)
    const infer = vi.spyOn(f.client, 'infer').mockImplementationOnce(async () => { throw new TypeError('fetch failed') }).mockImplementation(async (_model, body) => {
      const image = latestImage(body)
      return f.call('opengui_close_session', { outcome: 'completed', summary: 'Verified the visible page', evidenceObservationIds: [image.observationId] })
    })
    await f.service.executeConfigured(f.session.sessionId, 10_000, f.signal)
    expect(infer).toHaveBeenCalledTimes(2)
    expect(f.service.snapshotSession(f.session.sessionId).result?.outcome).toBe('completed')
    expect(board.traces.filter(trace => trace.kind === 'model').map(trace => trace.status)).toEqual(['executed'])
    expect(modelFailureCode(new Error('model_upstream_error: HTTP 400'))).toBe('model_upstream_error')
    expect([transientModelFailure(new Error('model_upstream_error: HTTP 503')), transientModelFailure(new Error('model_upstream_error: HTTP 400')), transientModelFailure(new Error('invalid_model_response'))]).toEqual([true, false, false])
  }, 15_000)
})
