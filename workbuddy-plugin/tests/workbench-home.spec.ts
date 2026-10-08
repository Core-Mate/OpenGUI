import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoreMateClient } from '../src/coremate-client.ts'
import { createControlTask, WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'
import { connect, setup } from './viewer-fixture.ts'

const cleanups: Array<() => unknown> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(objective?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'opengui-home-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const catalog = { success: true, data: [{ id: 63, agentName: 'gui-agent-core', phoneModelKind: 'text', configName: 'Test model', modelName: 'test', baseUrl: 'https://provider.example/v1', hasApiKey: true, isActive: true, updatedAt: '2026-09-16T11:53:56.433Z', extra: {} }] }
  const account = new CoreMateClient(dir, (async (url: string) => new Response(JSON.stringify(url.endsWith('/desktop-text-models') ? catalog : { token: 'fixture-session', user: { id: 42, phoneNumber: '13800001234' } }))) as typeof fetch)
  account.configure('https://backend.example.test'); await account.login('13800001234', '123456')
  const f = setup(account), host = new FakeHost()
  const service = new WorkBuddyOpenGuiService({ host, viewers: f.viewer, account, confirmStart: true })
  cleanups.push(() => service.dispose())
  const opened = await service.openGuide(AbortSignal.timeout(5000), { owner: 'guide-host', ...(objective ? { objective, successCriteria: 'Original criterion' } : {}) })
  const post = (url: string, body: Record<string, unknown>, token = new URL(opened.workbenchUrl).hash.slice(7)) => fetch(`${url}board`, { method: 'POST', headers: { Origin: new URL(url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': token }, body: JSON.stringify(body) })
  const action = (body: Record<string, unknown>) => post(opened.url, body)
  const status = async () => (await fetch(`${opened.url}status`)).json()
  const start = { action: 'start', modelId: 'host', deviceId: 'phone-a', request: 'Return to the home screen' }
  return { ...f, host, account, service, opened, post, action, status, start }
}

describe('workbench task home', () => {
  it('opens a host-owned composer, rejects invalid requests and closes with the host task', async () => {
    const f = await fixture()
    expect(f.opened).toMatchObject({ startRequired: true, workbenchManaged: false, devices: [], board: { objective: '' } })
    expect(f.viewer.awaitingDeviceTask(f.opened.viewerId)).toBe(true)
    for (const request of ['', '  ', '@opengui', 'x'.repeat(4001)]) expect((await f.action({ ...f.start, request })).status).toBe(400)
    expect(f.prepare).not.toHaveBeenCalled()
    f.service.endViewerTask('guide-host')
    expect(await f.status()).toMatchObject({ taskState: 'ended' })
    expect((await f.action(f.start)).status).toBe(409)
  })
  it('requires a new WorkBuddy request from an ended report and preserves its results', async () => {
    const f = await fixture('Old task'), board = f.viewer.board(f.opened.viewerId)
    board.result = { outcome: 'completed', summary: 'Old report' }; board.control = 'ended'; f.viewer.endTask(f.opened.viewerId)
    const original = board.snapshot()
    expect((await f.post(f.opened.url, { action: 'new_task' }, 'invalid')).status).toBe(403)
    const response = await f.action({ action: 'new_task' })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBeTruthy()
    expect(board.snapshot()).toEqual(original)
  })
  it('updates an editable host task before starting and discards its stale criterion and pending plan', async () => {
    const f = await fixture('Old task')
    f.viewer.writeTodos(f.opened.viewerId, 'guide-host', [{ content: 'Old pending step', status: 'pending' }])
    expect((await f.action({ ...f.start, modelId: 'host', request: '@opengui Open Settings' })).status).toBe(200)
    expect(await f.status()).toMatchObject({ workbenchManaged: false, startRequired: false, todos: [], board: { objective: 'Open Settings', request: 'Open Settings', successCriteria: '' } })
    expect((await f.action({ ...f.start, request: 'Change a running task' })).status).toBe(400)
    expect(f.viewer.board(f.opened.viewerId).objective).toBe('Open Settings')
  })

  it('wakes the waiting host after Start and the first visible frame without running another model', async () => {
    const f = await fixture(), execute = vi.spyOn(f.service, 'executeConfigured')
    let settled = false
    const waiting = f.viewer.status(f.opened.viewerId, 'guide-host', 5000).then(status => { settled = true; return status })
    const responses = await Promise.all([f.action(f.start), f.action(f.start)])
    expect(responses.map(r => r.status).sort()).toEqual([200, 400])
    expect(settled).toBe(false)
    const page = await connect(f.opened.url, 'phone-a')
    f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    expect(await waiting).toMatchObject({ startRequired: false, firstDisplayEstablished: true, board: { objective: f.start.request } })
    const session = await f.service.openSession(['phone-a'], AbortSignal.timeout(5000), 'control', { viewerId: f.opened.viewerId, owner: 'guide-host' })
    expect(session.executor).toMatchObject({ mode: 'workbuddy' })
    expect(execute).not.toHaveBeenCalled()
    expect((await f.action({ action: 'disconnect' })).status).toBe(200)
    expect(await f.status()).toMatchObject({ taskState: 'ended', board: { result: { outcome: 'cancelled' } } })
  })
  it('recomputes pending limits from the final human request without retaining the original restriction', async () => {
    const f = await fixture('Test the form. Stop before submitting. At most 5 phone operations.')
    expect(await f.status()).toMatchObject({ board: { stopBeforeSubmit: true, executionBudget: { operationLimit: 5 } } })
    const request = 'Test the form and submit. At most 10 phone operations.'
    expect((await f.action({ ...f.start, modelId: 'host', request })).status).toBe(200)
    const board = f.viewer.board(f.opened.viewerId)
    expect(board.objective).toBe(request)
    expect(board.stopBeforeSubmit).toBeUndefined()
    expect(board.operationLimit).toBe(10)
    expect((await f.action({ ...f.start, request: 'At most 20 phone operations.' })).status).toBe(400)
    expect(board.operationLimit).toBe(10)
  })

  it('refuses to replace a pending request when an earlier operation has consumed its budget', async () => {
    const f = await fixture('At most 5 phone operations.'), board = f.viewer.board(f.opened.viewerId)
    board.reserveOperation('phone-a', 1)
    expect((await f.action({ ...f.start, modelId: 'host', request: 'At most 10 phone operations.' })).status).toBe(400)
    expect(board.objective).toBe('At most 5 phone operations.')
    expect(board.operationLimit).toBe(5)
    expect(board.operationCount('phone-a')).toBe(1)
    expect(await f.status()).toMatchObject({ startRequired: true })
  })

  it('validates comment limits before connecting and enforces the confirmed deadline after the first frame', async () => {
    const f = await fixture(), board = f.viewer.board(f.opened.viewerId)
    const start = { ...f.start, request: 'Review and reply to the selected comments', commentTask: true }
    for (const commentBudget of [undefined, {}, { targetCount: 0 }, { targetCount: 101 }, { targetCount: 1.5 }, { maxDurationSeconds: 86401 }, { targetCount: 2, unexpected: true }]) {
      expect((await f.action({ ...start, commentBudget })).status).toBe(400)
    }
    expect(f.prepare).not.toHaveBeenCalled()
    expect((await f.action({ ...start, commentBudget: { targetCount: 2, maxDurationSeconds: 1 } })).status).toBe(200)
    expect(board.commentBudget).toBeUndefined()
    const page = await connect(f.opened.url, 'phone-a')
    f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    await f.service.openSession(['phone-a'], AbortSignal.timeout(5000), 'control', { viewerId: f.opened.viewerId, owner: 'guide-host' })
    await vi.waitFor(() => expect(board.commentBudget).toMatchObject({ targetCount: 2, maxDurationSeconds: 1 }))
    expect(board.scenario).toBe('comments')
    await vi.waitFor(() => expect(board.result).toMatchObject({ outcome: 'stopped' }), { timeout: 3000 })
    expect(board.commentBudget?.stopReason).toBe('time_limit')
  })

  it('does not start a template with unfilled placeholders', async () => {
    const f = await fixture()
    expect((await f.action({ ...f.start, request: '打开【应用／页面】' })).status).toBe(400)
    expect(f.prepare).not.toHaveBeenCalled()
    expect(await f.status()).toMatchObject({ startRequired: true })
  })

  it('preserves the human-confirmed comment limits when the host proposes wider limits', async () => {
    const f = await fixture('Review comments'), board = f.viewer.board(f.opened.viewerId)
    expect((await f.action({ ...f.start, modelId: 'host', commentTask: true, commentBudget: { targetCount: 2, maxDurationSeconds: 60 } })).status).toBe(200)
    const page = await connect(f.opened.url, 'phone-a')
    f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    await f.service.openSession(['phone-a'], AbortSignal.timeout(5000), 'control', { viewerId: f.opened.viewerId, owner: 'guide-host', scenario: 'comments', commentBudget: { targetCount: 10 } })
    expect(board.commentBudget).toMatchObject({ targetCount: 2, maxDurationSeconds: 60 })
    expect(Date.parse(board.commentBudget!.deadlineAt!) - Date.parse(board.commentBudget!.startedAt)).toBe(60_000)
  })

  it('preserves an unchanged testing task when the comment option is off', async () => {
    const f = await fixture(), task = { ...createControlTask(), scenario: 'testing' as const, objective: 'Check the screen' }
    const opened = await f.service.openGuide(AbortSignal.timeout(5000), { task, owner: 'testing-host' })
    const token = new URL(opened.workbenchUrl).hash.slice(7)
    expect((await f.post(opened.url, { ...f.start, modelId: 'host', request: 'Check the screen', commentTask: false }, token)).status).toBe(200)
    expect(task.scenario).toBe('testing')
  })

  it('can cancel while waiting for the first frame without opening a control session', async () => {
    const f = await fixture(), open = vi.spyOn(f.service, 'openSession')
    expect((await f.action(f.start)).status).toBe(200)
    expect((await f.action({ action: 'disconnect' })).status).toBe(200)
    expect(open).not.toHaveBeenCalled()
    f.advance(31_000)
    expect(await f.status()).toMatchObject({ taskState: 'ended', board: { result: { outcome: 'cancelled' } } })
  })

  it('keeps a first-frame timeout blocked instead of starting an unseen phone', async () => {
    const f = await fixture(), open = vi.spyOn(f.service, 'openSession')
    expect((await f.action(f.start)).status).toBe(200)
    f.advance(31_000)
    expect(await f.status()).toMatchObject({ state: 'error' })
    expect(open).not.toHaveBeenCalled()
    await expect(f.service.openSession(['phone-a'], AbortSignal.timeout(5000), 'control', { viewerId: f.opened.viewerId, owner: 'guide-host' })).rejects.toThrow('display_timeout')
  })
})
