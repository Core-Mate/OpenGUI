import { OpenGuiError } from '../../../packages/device-runtime/src/errors.ts'
import { HostExecutor } from '../../../packages/phone-agent/src/host-executor.ts'
import { GoalRuntime } from '../../../packages/phone-agent/src/goals.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PhoneRuntime } from '../../../packages/phone-agent/src/runtime.ts'
import type { Executor, Hardware, ModelProfile } from '../../../packages/phone-agent/src/contracts.ts'
import { ObservationId } from '../../../packages/device-runtime/src/actions.ts'
import { ViewerServer } from '../../../packages/device-runtime/src/viewer.ts'
import { acquireDeviceLease } from '../../../packages/device-runtime/src/device-lease.ts'
import { TaskHost } from '../../../packages/phone-agent/src/host.ts'
import { startDaemon, request, sendRequest } from '../src/daemon.ts'
import { CodexOpenGuiService } from '../src/codex/service.ts'
import { createConnection } from 'node:net'
import { ReadyViewer } from './ready-viewer.ts'
import { FakeHost } from './fixtures.ts'
import { workbenchPage } from '../../../packages/workbench/src/page.ts'
import { Workbench } from '../../../packages/phone-agent/src/workbench.ts'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
const signal = () => AbortSignal.timeout(3000)
const profile: ModelProfile = { id: 'model', protocol: 'openai-completions', baseUrl: 'http://127.0.0.1:1234/v1', model: 'vision', credentialRef: 'ref' }
async function setup(executor: Executor, gate?: Promise<unknown>, root?: string) {
  root ??= await mkdtemp(join(tmpdir(), 'opengui-agent-test-'))
  cleanups.push(() => rm(root!, { recursive: true, force: true }))
  let captures = 0
  const observation = () => ({ observationId: ObservationId('frame-' + ++captures), serial: 'serial', width: 10, height: 10, foregroundPackage: 'settings', image: { data: Buffer.from('jpeg'), mediaType: 'image/jpeg' as const, bytes: 4, width: 10, height: 10, name: 'phone.jpg' } })
  const device = (id: string) => ({ id, serial: id, name: id, authorized: true, connected: true, state: 'device' })
  const hardware: Hardware = { listDevices: async () => [device('a'), device('b')], resolveDevices: async ids => (ids ?? ['a']).map(device), assignTarget: vi.fn(), observe: vi.fn(async () => observation()), act: vi.fn(async () => observation()), releaseDevice: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }
  const viewers = { open: vi.fn(async () => ({ viewerId: 'v', url: 'http://127.0.0.1:123/v/' })), status: vi.fn(async (_id, _owner, _wait, s: AbortSignal) => {
    if (gate) await Promise.race([gate, new Promise((_, reject) => s.addEventListener('abort', () => reject(s.reason), { once: true }))])
    return { firstDisplayEstablished: true }
  }), assertReady: vi.fn(), endTask: vi.fn(), dispose: vi.fn(async () => {}), allowEmbedding: vi.fn() } as unknown as ViewerServer
  const runtime = new PhoneRuntime({ root, host: 'codex', hardware, credentials: { get: async () => 'test-secret', set: async () => {} }, executor, viewers, leaseRoot: join(root, 'leases') })
  await runtime.initialize(); runtime.profiles.set(profile.id, profile)
  cleanups.push(() => runtime.close())
  return { runtime, hardware, viewers, root }
}
const requestData = (id: string, deviceId = 'a') => ({ requestId: id, goal: 'Open settings', successCriteria: 'Settings visible', deviceId })
const settled = async (runtime: PhoneRuntime, id: string) => { await vi.waitFor(() => expect(['completed', 'blocked', 'unknown', 'cancelled']).toContain(runtime.get(id).phase)); return runtime.get(id) }
const complete: Executor = { plan: async p => ({ kind: 'branches', branches: [{ goal: p.goal, successCriteria: p.goal, eligibleDeviceIds: p.devices.filter(d=>d.authorized&&d.connected).map(d=>d.id) }] }), probe: async () => {}, run: async e => { const obs = await e.observe(); await e.finish('Settings visible', [{ criterion: e.task.successCriteria, status: 'passed', evidenceId: obs.observationId }], 'completed') } }

describe('durable autonomous phone tasks', () => {
  it('blocks late workbench submissions after entering maintenance', async () => {
    const { runtime } = await setup(complete)
    const web = new Workbench(runtime); cleanups.push(() => web.close())
    const url = await web.open('owner')
    expect(web.prepareMaintenance()).toBe(true)
    const response = await fetch(url + 'run', { method: 'POST', headers: { origin: new URL(url).origin, 'content-type': 'application/json' }, body: JSON.stringify(requestData('late-install-race')) })
    expect(response.status).toBe(503)
    expect(runtime.goals.list()).toHaveLength(0)
  })

  it('refuses maintenance while a workbench is in use without disabling that page', async () => {
    const { runtime } = await setup(complete)
    const web = new Workbench(runtime); cleanups.push(() => web.close())
    const url = await web.open('owner')
    expect((await fetch(url + 'state')).status).toBe(200)
    expect(web.prepareMaintenance()).toBe(false)
    expect((await fetch(url + 'state')).status).toBe(200)
  })
  it('keeps accepted tasks alive after transport loss and rejects replacement while running', async () => {
    const gate = deferred()
    const { runtime, root } = await setup(complete, gate.promise)
    const tasks = new TaskHost(() => runtime)
    const server = await startDaemon({ root: join(root, 'daemon'), taskHost: tasks, service: new CodexOpenGuiService({ host: new FakeHost(), viewers: new ReadyViewer() }), idleMs: 1, sweepMs: 100 })
    cleanups.push(server.close)
    const socket = createConnection(server.endpoint)
    await new Promise<void>(resolve => socket.once('connect', resolve))
    socket.write(JSON.stringify(request('opengui_run_task', requestData('detached'), 'owner')) + '\n')
    await vi.waitFor(() => expect(runtime.list()).toHaveLength(1))
    socket.destroy()
    const task = runtime.list()[0]!
    await vi.waitFor(() => expect(runtime.get(task.id).phase).toBe('preparing'))
    expect((await sendRequest(server.endpoint, request('__shutdown__', {}, 'owner'))).ok).toBe(false)
    expect(runtime.activeCount).toBe(1)
    gate.resolve(); expect((await settled(runtime, task.id)).phase).toBe('completed')
  })
  it('limits concurrent devices to four and freezes the submitted model', async () => {
    const gate = deferred(), models: string[] = []
    const { runtime } = await setup({ ...complete, run: async e => { models.push(e.task.modelProfile.model); await complete.run(e) } }, gate.promise)
    const tasks = await Promise.all(['a','b','c','d','e'].map(id => runtime.submit(requestData(id, id), 'owner')))
    await vi.waitFor(() => expect(runtime.list().filter(t => t.phase === 'preparing')).toHaveLength(4))
    expect(runtime.get(tasks[4]!.id).phase).toBe('queued')
    runtime.profiles.set(profile.id, { ...profile, model: 'replacement' })
    gate.resolve(); await Promise.all(tasks.map(t => settled(runtime, t.id)))
    expect(models).toEqual(['vision','vision','vision','vision','vision'])
  })
  it('applies pending instructions at the first decision boundary', async () => {
    const gate = deferred(), steering = vi.fn()
    const { runtime } = await setup({ ...complete, run: async e => { e.bindSteer(steering); await complete.run(e) } }, gate.promise)
    const task = await runtime.submit(requestData('steer'), 'owner')
    await runtime.manage(task.id, 'steer', '只查看 Android 版本')
    expect(steering).not.toHaveBeenCalled()
    gate.resolve(); await settled(runtime, task.id)
    expect(steering).toHaveBeenCalledExactlyOnceWith('只查看 Android 版本')
  })
  it('requires one explicit consequential-action confirmation and cannot retry a denial', async () => {
    const { runtime, hardware } = await setup({ ...complete, run: async e => {
      const frame = await e.observe()
      for (let i = 0; i < 2; i++) await expect(e.act({ action: 'key', key: 'Enter', observationId: frame.observationId, externalSideEffect: 'send' })).rejects.toThrow('user_declined')
      await e.finish('Not authorized', [{ criterion: e.task.successCriteria, status: 'unknown', evidenceId: frame.observationId }], 'blocked')
    } })
    const confirm = vi.fn(async () => false); runtime.options.confirmAction = confirm
    const task = await runtime.submit(requestData('confirm'), 'owner'); await settled(runtime, task.id)
    expect(confirm).toHaveBeenCalledTimes(1); expect(hardware.act).not.toHaveBeenCalled()
  })
  it('opens the workbench at the root and carries host context for host submissions', async () => {
    const executor = new HostExecutor()
    const { runtime, hardware } = await setup(executor)
    const host = new TaskHost(() => runtime)
    cleanups.push(() => host.close())
    const first = await host.call('opengui_open_workbench', {}, 'host-a') as { url: string }
    const second = await host.call('opengui_open_workbench', {}, 'host-b') as { url: string }
    expect(first.url).not.toBe(second.url)
    expect(new URL(first.url).pathname).toBe('/')
    expect((await fetch(new URL(first.url).origin + '/')).status).toBe(200)
    expect(await host.call('opengui_open_workbench', {}, 'host-a')).toEqual(first)
    const post = async (url: string, requestId: string) => fetch(new URL('run' + new URL(url).search, url), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, goal: 'Inspect settings', owner: 'host-b' }),
    })
    const response = await post(first.url, 'bound-web-a')
    expect(response.status).toBe(200)
    const task = await response.json() as { id: string; owner: string }
    expect(task.owner).toBe('host-a')
    await vi.waitFor(() => expect(executor.next('host-a', task.id)?.kind).toBe('plan'))
    expect(executor.next('host-b', task.id)).toBeUndefined()
    expect(executor.next('host-b')).toBeUndefined()
    const repeated = await post(first.url, 'bound-web-a')
    expect((await repeated.json() as { id: string }).id).toBe(task.id)
    expect((await post(new URL(first.url).origin + '/', 'web-root')).status).toBe(200)
    expect(hardware.act).not.toHaveBeenCalled()
    await runtime.goals.manage(task.id, 'stop')
  })
  it.each([['workbuddy', '1'], ['codex', 'codex']] as const)('serves %s native and browser entrypoints at the root', async (hostName, flag) => {
    const { runtime, hardware } = await setup(new HostExecutor())
    runtime.options.host = hostName
    const host = new TaskHost(() => runtime)
    cleanups.push(() => host.close())
    const { url } = await host.call('opengui_open_workbench', {}, 'host-a') as { url: string }
    const headers = { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'document' }
    const entry = new URL(url); entry.searchParams.set('mcpApp', flag)
    expect((await fetch(entry, { headers })).status).toBe(200)
    expect((await fetch(url, { headers })).status).toBe(200)
    expect((await fetch(new URL('state' + entry.search, entry), { headers })).status).toBe(200)
    const frameEntry = new URL(entry); frameEntry.searchParams.set('hostOrigin', 'http://127.0.0.1:5678')
    const nativeFrame = await fetch(frameEntry, { headers: { ...headers, 'sec-fetch-dest': 'iframe' } })
    expect(nativeFrame.status).toBe(200)
    expect(nativeFrame.headers.get('content-security-policy')).toContain('frame-ancestors file: http://127.0.0.1:5678;')
    expect((await fetch(url)).headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    for (const parent of ['https://example.com', 'http://127.0.0.1:5678/path', 'http://user@127.0.0.1:5678']) {
      const invalid = new URL(frameEntry); invalid.searchParams.set('hostOrigin', parent)
      expect((await fetch(invalid, { headers: { ...headers, 'sec-fetch-dest': 'iframe' } })).headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    }
    runtime.options.host = hostName === 'codex' ? 'workbuddy' : 'codex'
    expect((await fetch(entry, { headers })).status).toBe(200)
    expect(hardware.act).not.toHaveBeenCalled()
  })
  it('accepts JSON POSTs without a browser credential', async () => {
    const { runtime, hardware } = await setup(new HostExecutor())
    runtime.options.host = 'workbuddy'
    const host = new TaskHost(() => runtime)
    cleanups.push(() => host.close())
    const { url } = await host.call('opengui_open_workbench', {}, 'host-a') as { url: string }
    const headers = { 'content-type': 'application/json' }
    const post = (target: string, extra: Record<string, string> = {}) => fetch(new URL('draft' + new URL(target).search, target), {
      method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ goal: 'Read-only draft' }),
    })
    expect((await post(url)).status).toBe(200)
    expect((await (await fetch(new URL('state' + new URL(url).search, url))).json()).draft).toBe('Read-only draft')
    expect((await post(url, { 'content-type': 'text/plain' })).status).toBe(405)
    expect(hardware.act).not.toHaveBeenCalled()
  })
  it('serves syntactically valid workbench script without injected task markup', () => {
    expect(() => new Function(workbenchPage.match(/<script>([\s\S]*)<\/script>/)![1]!)).not.toThrow()
    expect(workbenchPage).not.toContain('innerHTML')
  })
  it('keeps task history chronological after journal reload and across parent and legacy tasks', async () => {
    const { runtime, root } = await setup(complete)
    const sample = await runtime.submit(requestData('history-template'), 'owner')
    const template = await settled(runtime, sample.id)
    await runtime.close()
    await rm(join(root, 'tasks-v1', sample.id + '.jsonl'))
    const entries = [
      ['tasks-v1', 'ffffffff-0000-4000-8000-000000000001', '2026-09-01T00:00:00.000Z'],
      ['goals-v1', 'ffffffff-0000-4000-8000-000000000002', '2026-09-02T00:00:00.000Z'],
      ['tasks-v1', '00000000-0000-4000-8000-000000000003', '2026-09-04T00:00:00.000Z'],
      ['goals-v1', '00000000-0000-4000-8000-000000000004', '2026-09-03T00:00:00.000Z'],
    ]
    for (const [directory, id, createdAt] of entries) {
      const task = { ...template, id, requestId: id, createdAt, updatedAt: createdAt }
      await appendFile(join(root, directory!, id + '.jsonl'), JSON.stringify({ version: 1, event: 'settled', task }) + '\n')
    }
    const { runtime: restored } = await setup(complete, undefined, root)
    const ids = (tasks: { id: string }[]) => tasks.map(t => t.id)
    expect(ids(restored.list('owner'))).toEqual([entries[2]![1], entries[0]![1]])
    expect(ids(restored.goals.list('owner'))).toEqual([entries[3]![1], entries[1]![1]])
    const host = new TaskHost(() => restored)
    const result = await host.call('opengui_list_tasks', {}, 'owner') as { tasks: { id: string }[] }
    expect(ids(result.tasks)).toEqual([entries[2]![1], entries[3]![1], entries[1]![1], entries[0]![1]])
    expect((await host.call('opengui_list_tasks', {}, 'other') as { tasks: unknown[] }).tasks).toEqual([])
    const web = new Workbench(restored); cleanups.push(() => web.close())
    const url = await web.open()
    const response = await fetch(url + 'state')
    const state = await response.json() as { tasks: { id: string }[] }
    expect(ids(state.tasks)).toEqual(ids(result.tasks))
  })
  it('deduplicates concurrent submission and refuses changed arguments', async () => {
    const { runtime } = await setup(complete)
    const [one, two] = await Promise.all([runtime.submit(requestData('same'), 'owner'), runtime.submit(requestData('same'), 'owner')])
    expect(one.id).toBe(two.id)
    await expect(runtime.submit({ ...requestData('same'), goal: 'Changed' }, 'owner')).rejects.toThrow('different arguments')
    expect((await settled(runtime, one.id)).phase).toBe('completed')
    expect(runtime.list('different')).toHaveLength(0)
    await expect(runtime.manage(one.id, 'stop', undefined, 'different')).rejects.toThrow('another')
  })
  it('queues same-phone work, runs different phones, and cancels queued work without actions', async () => {
    const gate = deferred()
    const { runtime, hardware } = await setup(complete, gate.promise)
    const a = await runtime.submit(requestData('a'), 'owner')
    const b = await runtime.submit(requestData('b'), 'owner')
    const c = await runtime.submit(requestData('c', 'b'), 'owner')
    await vi.waitFor(() => expect(runtime.get(c.id).phase).toBe('preparing'))
    expect(runtime.get(b.id).phase).toBe('queued')
    expect((await runtime.manage(b.id, 'stop')).phase).toBe('cancelled')
    expect(hardware.act).not.toHaveBeenCalled()
    gate.resolve(); await settled(runtime, a.id); await settled(runtime, c.id)
    expect(hardware.observe).toHaveBeenCalledTimes(2)
  })
  it('rejects stale actions and completion without a separate final observation', async () => {
    const { runtime, hardware } = await setup({ ...complete, run: async e => {
      const first = await e.observe()
      await expect(e.act({ action: 'key', key: 'Home', observationId: 'stale' })).rejects.toThrow('stale_observation')
      const after = await e.act({ action: 'key', key: 'Home', observationId: first.observationId })
      await expect(e.finish('done', [{ criterion: e.task.successCriteria, status: 'passed', evidenceId: after.observationId }], 'completed')).rejects.toThrow('terminal observation')
      const last = await e.observe()
      await e.finish('done', [{ criterion: e.task.successCriteria, status: 'passed', evidenceId: last.observationId }], 'completed')
    } })
    const task = await runtime.submit(requestData('a'), 'owner')
    expect((await settled(runtime, task.id)).phase).toBe('completed')
    expect(hardware.act).toHaveBeenCalledTimes(1)
  })
  it('does not replay uncertain actions and preserves terminal screenshots and journals', async () => {
    const { runtime, hardware, root } = await setup({ ...complete, run: async e => { const obs = await e.observe(); await e.act({ action: 'key', key: 'Home', observationId: obs.observationId }) } })
    vi.mocked(hardware.act).mockRejectedValue(new Error('socket lost'))
    const task = await runtime.submit(requestData('a'), 'owner')
    const final = await settled(runtime, task.id)
    expect(final.phase).toBe('unknown'); expect(hardware.act).toHaveBeenCalledTimes(1)
    const journal = await readFile(join(root, 'tasks-v1', task.id + '.jsonl'), 'utf8')
    expect(journal).toContain('action_outcome_unknown'); expect(journal).not.toContain('test-secret')
    expect(await readFile(join(root, 'evidence-v1', final.evidence[0]!.file), 'utf8')).toBe('jpeg')
  })
  it('does not report cancelled until cleanup settles', async () => {
    const cleanup = deferred()
    const { runtime, hardware } = await setup({ ...complete, run: async e => { await e.observe(); await new Promise((_, reject) => e.signal.addEventListener('abort', () => reject(e.signal.reason), { once: true })) } })
    vi.mocked(hardware.releaseDevice).mockImplementation(() => cleanup.promise)
    const task = await runtime.submit(requestData('a'), 'owner')
    await vi.waitFor(() => expect(hardware.observe).toHaveBeenCalled())
    const stopping = runtime.manage(task.id, 'stop')
    await vi.waitFor(() => expect(hardware.releaseDevice).toHaveBeenCalled())
    expect(runtime.get(task.id).phase).toBe('stopping')
    cleanup.resolve()
    const final = await stopping
    expect(final.phase).toBe('cancelled')
    expect(final.summary).toBe('任务已停止')
    expect(final.error).toBeUndefined()
  })
  it('retains uncertain action evidence when an in-flight action is stopped', async () => {
    const { runtime, hardware } = await setup({ ...complete, run: async e => {
      const obs = await e.observe()
      await e.act({ action: 'key', key: 'Back', observationId: obs.observationId })
    } })
    vi.mocked(hardware.act).mockImplementation(async (_actor, _input, signal) => {
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      throw new Error('unreachable')
    })
    const task = await runtime.submit(requestData('stop-in-flight'), 'owner')
    await vi.waitFor(() => expect(hardware.act).toHaveBeenCalledTimes(1))
    const final = await runtime.manage(task.id, 'stop')
    expect(final.phase).toBe('cancelled')
    expect(final.lastExecutionState).toBe('unknown')
    expect(final.summary).toBe('任务已停止；最后一次动作结果未知，请检查手机画面。')
    expect(final.error).toBe(final.summary)
  })
  it('does not hide cleanup failure behind a successful stop message', async () => {
    const { runtime, hardware } = await setup({ ...complete, run: async e => {
      await e.observe()
      await new Promise((_, reject) => e.signal.addEventListener('abort', () => reject(e.signal.reason), { once: true }))
    } })
    vi.mocked(hardware.releaseDevice).mockRejectedValue(new Error('cleanup failed'))
    const task = await runtime.submit(requestData('stop-cleanup-failure'), 'owner')
    await vi.waitFor(() => expect(hardware.observe).toHaveBeenCalled())
    const final = await runtime.manage(task.id, 'stop')
    expect(final.phase).toBe('unknown')
    expect(final.error).toBe('资源清理未确认，设备锁保留。')
    expect(final.summary).not.toBe('任务已停止')
  })
  it('preserves an explicit stop while Keychain lookup is in flight', async () => {
    const key = deferred()
    const { runtime, hardware } = await setup(complete)
    const lookup = vi.fn(async () => { await key.promise; return 'fixture' }); runtime.options.credentials.get = lookup
    const task = await runtime.submit(requestData('keychain-stop'), 'owner')
    await vi.waitFor(() => expect(lookup).toHaveBeenCalled())
    const stopped = runtime.manage(task.id, 'stop')
    await vi.waitFor(() => expect(runtime.get(task.id).phase).toBe('stopping'))
    key.resolve(); expect((await stopped).phase).toBe('cancelled')
    expect(hardware.act).not.toHaveBeenCalled()
  })
  it('fails the first-frame gate without calling the model or acting', async () => {
    const run = vi.fn(complete.run)
    const { runtime, viewers, hardware } = await setup({ ...complete, run })
    vi.mocked(viewers.assertReady).mockImplementation(() => { throw new Error('display_timeout: first frame missing') })
    const task = await runtime.submit(requestData('a'), 'owner')
    expect((await settled(runtime, task.id)).phase).toBe('blocked')
    expect(run).not.toHaveBeenCalled(); expect(hardware.act).not.toHaveBeenCalled()
  })
  it('recovers interrupted journals without replay, including a torn final append', async () => {
    const { runtime, root } = await setup(complete)
    const task = await runtime.submit(requestData('a'), 'owner'); await settled(runtime, task.id)
    await runtime.close()
    const path = join(root, 'tasks-v1', task.id + '.jsonl')
    await appendFile(path, JSON.stringify({ version: 1, task: { ...runtime.get(task.id), phase: 'running' } }) + '\n{"torn":')
    const next = await setup(complete, undefined, root)
    expect(next.runtime.get(task.id).phase).toBe('unknown')
    expect(next.hardware.act).not.toHaveBeenCalled()
    expect(await readFile(path + '.incomplete', 'utf8')).toBe('{"torn":')
  })
  it.each([
    ['action_intent', 'not_executed', 'unknown'],
    ['action_rejected', 'not_executed', 'not_executed'],
    ['action_delivered', 'delivered', 'delivered'],
  ] as const)('recovers %s without inventing delivery evidence', async (event, recorded, expected) => {
    const { runtime, root } = await setup(complete)
    const task = await runtime.submit(requestData('crash-action'), 'owner'); await settled(runtime, task.id)
    await runtime.close()
    await appendFile(join(root, 'tasks-v1', task.id + '.jsonl'), JSON.stringify({ version: 1, event,
      task: { ...runtime.get(task.id), phase: 'running', lastAction: { action: 'tap', x: 1, y: 1 }, lastExecutionState: recorded },
    }) + '\n')
    const next = await setup(complete, undefined, root)
    expect(next.runtime.get(task.id)).toMatchObject({ phase: 'unknown', lastExecutionState: expected })
    expect(next.hardware.act).not.toHaveBeenCalled()
    expect(next.hardware.observe).not.toHaveBeenCalled()
  })
  it('refuses a cross-host lease and prevents late cleanup from deleting a new owner', async () => {
    const { root } = await setup(complete)
    const first = await acquireDeviceLease('phone', 'codex', join(root, 'leases'))
    await expect(acquireDeviceLease('phone', 'dsh', join(root, 'leases'))).rejects.toThrow('device_busy')
    await first.release()
    const second = await acquireDeviceLease('phone', 'dsh', join(root, 'leases'))
    await first.release()
    await expect(acquireDeviceLease('phone', 'workbuddy', join(root, 'leases'))).rejects.toThrow('device_busy')
    await second.release()
  })
  it('serves the root and accepts direct JSON task creation', async () => {
    const { runtime } = await setup(complete)
    const web = new Workbench(runtime); cleanups.push(() => web.close())
    const url = await web.open()
    const page = await fetch(url, { signal: signal() }); expect(await page.text()).toContain('手机工作台')
    const invalid = await fetch(url + 'run', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })
    expect(invalid.status).toBe(405); expect(runtime.list()).toHaveLength(0)
    const valid = await fetch(url + 'run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData('valid')) })
    expect(valid.status).toBe(200)
    expect((await (await fetch(url + 'state')).json()).tasks).toHaveLength(1)
  })
})


describe('parent goals and automatic branch assignment', () => {
  const branches = { kind: 'branches' as const, branches: [
    { goal: 'Read system version', successCriteria: 'Version recorded', eligibleDeviceIds: ['a', 'b'] },
    { goal: 'Read device model', successCriteria: 'Model recorded', eligibleDeviceIds: ['a', 'b'] },
  ] }
  it('deduplicates planning, balances queues and aggregates only evidenced success', async () => {
    const gate = deferred(), plan = vi.fn(async () => branches)
    const { runtime } = await setup({ ...complete, plan }, gate.promise)
    const input = { requestId: 'parent', goal: 'Read the version and model' }
    const [first, retry] = await Promise.all([runtime.goals.submit(input, 'owner'), runtime.goals.submit(input, 'owner')])
    expect(retry.id).toBe(first.id)
    await vi.waitFor(() => expect(runtime.tasks.size).toBe(2))
    expect(new Set([...runtime.tasks.values()].map(t => t.deviceId)).size).toBe(2)
    expect(plan).toHaveBeenCalledOnce()
    expect(runtime.goals.get(first.id).phase).not.toBe('completed')
    gate.resolve()
    await vi.waitFor(() => expect(runtime.goals.get(first.id).phase).toBe('completed'))
    expect(runtime.goals.get(first.id).checks).toHaveLength(2)
    expect((await runtime.goals.events(first.id)).map(e => e.event)).toContain('plan_recorded')
    expect([...runtime.tasks.values()].every(t => t.evidence.length > 0)).toBe(true)
    await expect(runtime.goals.submit({ ...input, goal: 'Different' }, 'owner')).rejects.toThrow('Request ID')
  })
  it('stops every branch and waits for device cleanup', async () => {
    const gate = deferred(), cleanup = deferred()
    const { runtime, hardware } = await setup({ ...complete, plan: async () => branches }, gate.promise)
    hardware.releaseDevice = vi.fn(async () => cleanup.promise)
    const task = await runtime.goals.submit({ requestId: 'stop-parent', goal: 'Read versions' }, 'owner')
    await vi.waitFor(() => expect([...runtime.tasks.values()].filter(t => t.viewerId)).toHaveLength(2))
    const stopped = runtime.goals.manage(task.id, 'stop')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('stopping'))
    expect(runtime.goals.get(task.id).phase).not.toBe('cancelled')
    cleanup.resolve(); await stopped
    expect(runtime.goals.get(task.id).phase).toBe('cancelled')
    expect([...runtime.tasks.values()].every(t => t.phase === 'cancelled')).toBe(true)
  })
  it('does not create late branches when stopped during planning', async () => {
    const gate = deferred(), entered = deferred()
    const { runtime } = await setup({ ...complete, plan: async () => { entered.resolve(); await gate.promise; return branches } })
    const task = await runtime.goals.submit({ requestId: 'stop-plan', goal: 'Read versions' }, 'owner')
    await entered.promise
    const stopped = runtime.goals.manage(task.id, 'stop'); gate.resolve(); await stopped
    expect(runtime.tasks.size).toBe(0); expect(runtime.goals.get(task.id).phase).toBe('cancelled')
  })
  it('asks a business clarification and resumes planning from the answer', async () => {
    const plan = vi.fn(async (input: import('../../../packages/phone-agent/src/contracts.ts').Planning) => input.clarification ? branches : { kind: 'clarification' as const, question: 'Which account owns the order?' })
    const { runtime } = await setup({ ...complete, plan })
    const task = await runtime.goals.submit({ requestId: 'account', goal: 'Read my order' }, 'owner')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('blocked'))
    expect(runtime.tasks.size).toBe(0)
    await runtime.goals.manage(task.id, 'steer', 'Use the test account on either phone', 'owner')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('completed'))
    expect(plan.mock.calls[1]![0].clarification).toContain('test account')
    await expect(runtime.goals.manage(task.id, 'status', undefined, 'other')).rejects.toThrow('Unknown')
  })
  it('recovers an interrupted parent as unknown without replanning', async () => {
    const gate = deferred(), plan = vi.fn(async () => branches)
    const { runtime } = await setup({ ...complete, plan }, gate.promise)
    const task = await runtime.goals.submit({ requestId: 'restart', goal: 'Read both values' }, 'owner')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).group!.children).toHaveLength(2))
    const recovered = new GoalRuntime(runtime); await recovered.initialize()
    expect(recovered.get(task.id).phase).toBe('unknown'); expect(plan).toHaveBeenCalledOnce()
    expect(recovered.get(task.id).group!.children).toHaveLength(2)
    await recovered.close()
  })
  it('freezes model configuration before asynchronous planning and child creation', async () => {
    const gate = deferred(), entered = deferred(), models: string[] = []
    const { runtime } = await setup({ ...complete, plan: async () => { entered.resolve(); await gate.promise; return branches }, run: async e => { models.push(e.task.modelProfile.model); await complete.run(e) } })
    const task = await runtime.goals.submit({ requestId: 'freeze', goal: 'Read both values' }, 'owner')
    await entered.promise; runtime.profiles.set(profile.id, { ...profile, model: 'new-model' }); gate.resolve()
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('completed'))
    expect(models).toEqual(['vision', 'vision'])
  })
  it('pauses only the affected branch and requires a fresh observation after help', async () => {
    let originalPhone = '', resumedPhone = ''
    const { runtime } = await setup({ ...complete, plan: async () => branches, run: async e => {
      if (e.task.goal === 'Read device model') return complete.run(e)
      originalPhone = e.task.deviceId
      const before = await e.observe()
      const answer = await e.waitForUser!('请在原手机登录测试账号')
      expect(answer).toContain('已登录'); resumedPhone = e.task.deviceId
      await expect(e.act({ observationId: before.observationId, action: 'key', key: 'Home' })).rejects.toThrow('stale_observation')
      await complete.run(e)
    } })
    const task = await runtime.goals.submit({ requestId: 'login', goal: 'Read both values' }, 'owner')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('waiting'))
    expect(runtime.list().filter(t => t.phase === 'completed')).toHaveLength(1)
    await runtime.goals.manage(task.id, 'steer', '已登录，可以继续', 'owner')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('completed'))
    expect(resumedPhone).toBe(originalPhone)
  })
  it('cancels a branch waiting for user help without continuing phone actions', async () => {
    let resumed = false
    const { runtime } = await setup({ ...complete, plan: async () => ({ kind: 'branches', branches: [branches.branches[0]!] }), run: async e => {
      await e.observe(); await e.waitForUser!('Please log in'); resumed = true
    } })
    const task = await runtime.goals.submit({ requestId: 'cancel-login', goal: 'Read order' }, 'owner')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('waiting'))
    expect((await runtime.goals.manage(task.id, 'stop')).phase).toBe('cancelled')
    expect(resumed).toBe(false)
  })
  it('does not report partial branch success as parent completion', async () => {
    const { runtime } = await setup({ ...complete, plan: async () => branches, run: async e => {
      if (e.task.goal === 'Read device model') throw new Error('fixture failure')
      await complete.run(e)
    } })
    const task = await runtime.goals.submit({ requestId: 'partial', goal: 'Read both values' }, 'owner')
    await vi.waitFor(() => expect(runtime.goals.get(task.id).phase).toBe('blocked'))
    expect([...runtime.tasks.values()].some(t => t.phase === 'completed')).toBe(true)
  })
})


describe('host-owned phone decisions', () => {
  it('plans and completes from host decisions without reading credentials or configuring a model', async () => {
    const executor = new HostExecutor()
    const { runtime, hardware } = await setup(executor)
    runtime.profiles.clear()
    const getKey = vi.spyOn(runtime.options.credentials, 'get')
    await expect(runtime.saveModel({ protocol: 'openai-responses', baseUrl: 'http://localhost/v1', model: 'unused', secret: 'unused' })).rejects.toThrow('disabled')
    const parent = await runtime.goals.submit({ requestId: 'host-task', goal: 'Check settings' }, 'owner')
    await vi.waitFor(() => expect(executor.next('owner')?.kind).toBe('plan'))
    const plan = executor.next('owner')!
    expect(executor.next('foreign')).toBeUndefined()
    executor.respond('owner', plan.id, { kind: 'branches', branches: [{ goal: parent.goal, successCriteria: parent.goal, eligibleDeviceIds: ['a'] }] })
    await vi.waitFor(() => expect(executor.next('owner')?.kind).toBe('step'))
    const first = executor.next('owner')!
    executor.respond('owner', first.id, { operation: 'observe' })
    executor.respond('owner', first.id, { operation: 'observe' })
    expect(() => executor.respond('owner', first.id, { operation: 'act' })).toThrow('consumed')
    await vi.waitFor(() => expect(executor.next('owner')?.context.observationId).toBeDefined())
    const image = executor.next('owner')!
    expect(image.context.image).toMatchObject({ type: 'image', mimeType: 'image/jpeg' })
    executor.respond('owner', image.id, { operation: 'finish', outcome: 'completed', summary: 'Settings verified', checks: [{ criterion: parent.goal, status: 'passed', evidenceId: image.context.observationId }] })
    await vi.waitFor(() => expect(runtime.goals.get(parent.id).phase).toBe('completed'))
    expect(getKey).not.toHaveBeenCalled()
    expect(hardware.observe).toHaveBeenCalledTimes(1)
    expect(hardware.act).not.toHaveBeenCalled()
  })
  it('claims homepage work once and rejects late decisions after stop', async () => {
    const executor = new HostExecutor()
    const { runtime } = await setup(executor)
    const parent = await runtime.goals.submit({ requestId: 'homepage', goal: 'Check settings' }, 'workbench')
    await vi.waitFor(() => expect(executor.next('host-a')).toBeDefined())
    const decision = executor.next('host-a')!
    expect(executor.next('host-b')).toBeUndefined()
    await runtime.goals.manage(parent.id, 'stop')
    expect(() => executor.respond('host-a', decision.id, { kind: 'branches', branches: [] })).toThrow('Unknown')
    expect(runtime.goals.get(parent.id).phase).toBe('cancelled')
  })
})


it('returns rejected host actions for fresh observation without replaying them', async () => {
  const executor = new HostExecutor()
  const { runtime, hardware } = await setup(executor)
  vi.mocked(hardware.act).mockRejectedValue(new OpenGuiError('observation_required', 'stale frame', 'not_executed', 'observe'))
  const originalObserve = hardware.observe
  hardware.observe = async (...args) => ({ ...await originalObserve(...args), width: 20, height: 20 })
  const parent = await runtime.goals.submit({ requestId: 'recover-host', goal: 'Check settings' }, 'owner')
  await vi.waitFor(() => expect(executor.next('owner')?.kind).toBe('plan'))
  executor.respond('owner', executor.next('owner')!.id, { kind: 'branches', branches: [{ goal: parent.goal, successCriteria: parent.goal, eligibleDeviceIds: ['a'] }] })
  await vi.waitFor(() => expect(executor.next('owner')?.kind).toBe('step'))
  executor.respond('owner', executor.next('owner')!.id, { operation: 'observe' })
  await vi.waitFor(() => expect(executor.next('owner')?.context.image).toBeDefined())
  let request = executor.next('owner')!
  expect(request.context).toMatchObject({ width: 10, height: 10 })
  executor.respond('owner', request.id, { operation: 'act', input: { action: 'key', key: 'Home', externalSideEffect: 'none', observationId: request.context.observationId } })
  await vi.waitFor(() => expect(executor.next('owner')?.context.mustObserve).toBe(true))
  expect(executor.next('owner')?.context.error).toContain('[observation_required] stale frame')
  expect(hardware.act).toHaveBeenCalledTimes(1)
  executor.respond('owner', executor.next('owner')!.id, { operation: 'observe' })
  await vi.waitFor(() => expect(executor.next('owner')?.context.image).toBeDefined())
  request = executor.next('owner')!
  executor.respond('owner', request.id, { operation: 'finish', outcome: 'completed', summary: 'Verified after refresh', checks: [{ criterion: parent.goal, status: 'passed', evidenceId: request.context.observationId }] })
  await vi.waitFor(() => expect(runtime.goals.get(parent.id).phase).toBe('completed'))
  expect(hardware.act).toHaveBeenCalledTimes(1)
})


it('lets only the claiming host manage and list a homepage task', async () => {
  const executor = new HostExecutor()
  const { runtime } = await setup(executor)
  const host = new TaskHost(() => runtime)
  cleanups.push(() => host.close())
  await host.call('opengui_open_workbench', {}, 'host-a')
  const parent = await runtime.goals.submit({ requestId: 'homepage-owner', goal: 'Inspect settings' }, 'workbench')
  await vi.waitFor(() => expect(executor.next('host-a')).toBeDefined())
  const decision = executor.next('host-a')!
  const list = await host.call('opengui_list_tasks', {}, 'host-a') as { tasks: { id: string }[] }
  expect(list.tasks.map(t => t.id)).toContain(parent.id)
  expect(await host.call('opengui_list_tasks', {}, 'host-b')).toEqual({ tasks: [] })
  const empty = await host.call('opengui_manage_task', { action: 'next' }, 'host-b') as { tasks: unknown[] }
  expect(empty.tasks).toEqual([])
  await expect(host.call('opengui_manage_task', { action: 'status', taskId: parent.id }, 'host-b')).rejects.toThrow('Unknown')
  await expect(host.call('opengui_manage_task', { action: 'stop', taskId: parent.id }, 'host-b')).rejects.toThrow('Unknown')
  await host.call('opengui_manage_task', { action: 'status', taskId: parent.id }, 'host-a')
  executor.respond('host-a', decision.id, { kind: 'branches', branches: [{ goal: parent.goal, successCriteria: parent.goal, eligibleDeviceIds: ['a'] }] })
  await vi.waitFor(() => expect(executor.next('host-a')?.kind).toBe('step'))
  const step = executor.next('host-a')!
  await host.call('opengui_manage_task', { action: 'status', taskId: step.context.branchId }, 'host-a')
  await expect(host.call('opengui_manage_task', { action: 'status', taskId: step.context.branchId }, 'host-b')).rejects.toThrow('Unknown')
  await host.call('opengui_manage_task', { action: 'steer', taskId: parent.id, text: 'Only inspect the version' }, 'host-a')
  await host.call('opengui_manage_task', { action: 'stop', taskId: parent.id }, 'host-a')
  expect(runtime.goals.get(parent.id).phase).toBe('cancelled')
  expect(() => executor.respond('host-a', step.id, { operation: 'observe' })).toThrow('Unknown')
})


it('claims a requested homepage task without taking another pending task', async () => {
  const executor = new HostExecutor()
  const { runtime } = await setup(executor)
  const first = await runtime.goals.submit({ requestId: 'claim-first', goal: 'First task' }, 'workbench')
  const second = await runtime.goals.submit({ requestId: 'claim-second', goal: 'Second task' }, 'workbench')
  await vi.waitFor(() => expect(executor.next('host-b', second.id)?.taskId).toBe(second.id))
  expect(executor.owns('host-b', first.id)).toBe(false)
  expect(executor.next('host-a', second.id)).toBeUndefined()
  expect(executor.next('host-a', first.id)?.taskId).toBe(first.id)
  expect(executor.owns('host-a', first.id)).toBe(true)
})


it('polls an exact branch without selecting its sibling or bypassing the parent claim', async () => {
  const executor = new HostExecutor()
  const { runtime } = await setup(executor)
  const host = new TaskHost(() => runtime)
  cleanups.push(() => host.close())
  await host.call('opengui_open_workbench', {}, 'host-a')
  const parent = await runtime.goals.submit({ requestId: 'branch-poll', goal: 'Inspect two phones' }, 'workbench')
  await vi.waitFor(() => expect(executor.next('host-a', parent.id)?.kind).toBe('plan'))
  executor.respond('host-a', executor.next('host-a', parent.id)!.id, {
    kind: 'branches', branches: ['a', 'b'].map(id => ({ goal: `Inspect ${id}`, successCriteria: 'Version visible', eligibleDeviceIds: [id] })),
  })
  await vi.waitFor(() => expect(runtime.list().filter(t => t.parentId === parent.id && t.phase === 'running')).toHaveLength(2))
  const branches = runtime.list().filter(t => t.parentId === parent.id)
  for (const branch of branches) {
    const reply = await host.call('opengui_manage_task', { action: 'next', taskId: branch.id }, 'host-a') as { decision: { taskId: string; context: { branchId: string } } | null }
    expect(reply.decision?.context.branchId).toBe(branch.id)
    expect(reply.decision?.taskId).toBe(parent.id)
    expect(executor.next('host-b', branch.id)).toBeUndefined()
  }
  expect(executor.next('host-a', 'missing-branch')).toBeUndefined()
  await host.call('opengui_manage_task', { action: 'stop', taskId: branches[0]!.id }, 'host-a')
  expect(executor.next('host-a', branches[0]!.id)).toBeUndefined()
  expect(executor.next('host-a', branches[1]!.id)?.context.branchId).toBe(branches[1]!.id)
})

it('retains a user-help wait across a host turn but cancels it on explicit interruption', async () => {
  const executor = new HostExecutor()
  const { runtime, hardware } = await setup(executor)
  const host = new TaskHost(() => runtime)
  cleanups.push(() => host.close())
  await host.call('opengui_open_workbench', {}, 'conversation')
  const parent = await runtime.goals.submit({ requestId: 'host-help', goal: 'Read settings' }, 'conversation')
  await vi.waitFor(() => expect(executor.next('conversation')?.kind).toBe('plan'))
  executor.respond('conversation', executor.next('conversation')!.id, { kind: 'branches', branches: [{ goal: parent.goal, successCriteria: parent.goal, eligibleDeviceIds: ['a'] }] })
  await vi.waitFor(() => expect(executor.next('conversation')?.kind).toBe('step'))
  executor.respond('conversation', executor.next('conversation')!.id, { operation: 'help', reason: 'Please unlock the phone' })
  await vi.waitFor(() => expect(runtime.goals.get(parent.id).phase).toBe('waiting'))
  await host.interruptOwner('conversation', true)
  expect(runtime.goals.get(parent.id).phase).toBe('waiting')
  expect(hardware.act).not.toHaveBeenCalled()
  await host.call('opengui_manage_task', { taskId: parent.id, action: 'resume', text: 'Unlocked' }, 'conversation')
  await vi.waitFor(() => expect(executor.next('conversation')?.context.resumed).toBe('Unlocked'))
  executor.respond('conversation', executor.next('conversation')!.id, { operation: 'observe' })
  await vi.waitFor(() => expect(executor.next('conversation')?.context.image).toBeDefined())
  expect(hardware.observe).toHaveBeenCalled()
  expect(hardware.act).not.toHaveBeenCalled()
  executor.respond('conversation', executor.next('conversation')!.id, { operation: 'help', reason: 'Please confirm the account' })
  await vi.waitFor(() => expect(runtime.goals.get(parent.id).phase).toBe('waiting'))
  await host.interruptOwner('conversation')
  expect(runtime.goals.get(parent.id).phase).toBe('cancelled')
  expect(hardware.act).not.toHaveBeenCalled()
})
