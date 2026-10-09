import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoreMateClient } from '../src/coremate-client.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
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
  const start = { action: 'start', modelId: '63', deviceId: 'phone-a', request: 'Return to the home screen' }
  return { ...f, host, account, service, opened, post, action, status, start }
}

describe('workbench task home', () => {
  it('opens an empty task composer and keeps it available after the originating chat ends', async () => {
    const f = await fixture()
    expect(f.opened).toMatchObject({ startRequired: true, workbenchManaged: true, devices: [], board: { objective: '' } })
    f.service.endViewerTask('guide-host')
    expect(await f.status()).toMatchObject({ startRequired: true, taskState: 'preparing' })
    expect(f.prepare).not.toHaveBeenCalled()
    expect((await f.action({ ...f.start, modelId: 'host' })).status).toBe(400)
    for (const request of ['', '  ', '@opengui', 'x'.repeat(4001)]) expect((await f.action({ ...f.start, request })).status).toBe(400)
    expect(await f.status()).toMatchObject({ startRequired: true, devices: [] })
  })

  it('creates one clean home from an ended report without copying results or approvals', async () => {
    const f = await fixture('Old task'), board = f.viewer.board(f.opened.viewerId)
    board.result = { outcome: 'completed', summary: 'Old report' }; board.control = 'ended'; f.viewer.endTask(f.opened.viewerId)
    const original = board.snapshot()
    expect((await f.post(f.opened.url, { action: 'new_task' }, 'invalid')).status).toBe(403)
    const responses = await Promise.all([f.action({ action: 'new_task' }), f.action({ action: 'new_task' })])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    const [first, second] = await Promise.all(responses.map(r => r.json()))
    expect(first.workbenchUrl).toBe(second.workbenchUrl)
    const next = new URL(first.workbenchUrl); next.hash = ''
    const status = await (await fetch(`${next}status`)).json()
    expect(status).toMatchObject({ workbenchManaged: true, startRequired: true, devices: [], todos: [], board: { objective: '', reviews: [], traces: [] } })
    expect(status.viewerId).not.toBe(f.opened.viewerId)
    expect(status.board.result).toBeUndefined()
    expect(board.snapshot()).toEqual(original)
    f.viewer.endTask(status.viewerId)
    const another = await (await f.action({ action: 'new_task' })).json()
    expect(another.viewerId).not.toBe(status.viewerId)
  })

  it('updates an editable host task before starting and discards its stale criterion and pending plan', async () => {
    const f = await fixture('Old task')
    f.viewer.writeTodos(f.opened.viewerId, 'guide-host', [{ content: 'Old pending step', status: 'pending' }])
    expect((await f.action({ ...f.start, modelId: 'host', request: '@opengui Open Settings' })).status).toBe(200)
    expect(await f.status()).toMatchObject({ workbenchManaged: false, startRequired: false, todos: [], board: { objective: 'Open Settings', request: 'Open Settings', successCriteria: '' } })
    expect((await f.action({ ...f.start, request: 'Change a running task' })).status).toBe(400)
    expect(f.viewer.board(f.opened.viewerId).objective).toBe('Open Settings')
  })

  it('starts the selected executor only after the confirmed device delivers its first visible frame', async () => {
    const f = await fixture()
    const execute = vi.spyOn(f.service, 'executeConfigured').mockImplementation((id, _wait, signal) => f.service.status(id, signal))
    const responses = await Promise.all([f.action(f.start), f.action(f.start)])
    expect(responses.map(r => r.status).sort()).toEqual([200, 400])
    expect(execute).not.toHaveBeenCalled()
    f.service.endViewerTask('guide-host')
    const page = await connect(f.opened.url, 'phone-a')
    f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    const session = f.service.findSession(execute.mock.calls[0]![0])!
    expect(session).toMatchObject({ state: 'active', objective: f.start.request, executor: { mode: 'configured' } })
    expect((await f.action({ action: 'disconnect' })).status).toBe(200)
    expect(await f.status()).toMatchObject({ taskState: 'ended', board: { result: { outcome: 'cancelled' } } })
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
    await vi.waitFor(async () => expect(await f.status()).toMatchObject({ taskState: 'ended', board: { result: { outcome: 'blocked' } } }))
    expect(open).not.toHaveBeenCalled()
  })
})
