import { afterEach, describe, expect, it, vi } from 'vitest'
import { environmentSpec, initialEnvironment, inspectAndroidEnvironment, environmentReady } from '../src/environment.ts'
import { Workbench } from '../src/workbench.ts'
import { WorkBuddyOpenGuiService, createControlTask } from '../src/service.ts'
import { callOpenGuiTool, validateToolArguments } from '../src/tools.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

const device = { id: 'phone-a', name: 'Pixel', connection: 'usb' as const, sdk: 35, state: 'device', connected: true, authorized: true }
const camera = 'android.permission.CAMERA'
const spec = environmentSpec({ packageName: 'com.example', expectedVersion: '2.0', requiredPermissions: [camera] })
const dump = (granted = true, installed = true, version = '2.0') => `Packages:\n  Package [com.example] (abc):\n    versionName=${version}\n    install permissions:\n      android.permission.INTERNET: granted=true\n    User 0: installed=${installed} hidden=false\n      runtime permissions:\n        ${camera}: granted=${granted}, flags=[]\n    User 10: installed=true\n      runtime permissions:\n        ${camera}: granted=true, flags=[]\n  Package [other.example] (abc):\n    versionName=2.0\n    User 0: installed=true\n      runtime permissions:\n        ${camera}: granted=true, flags=[]\nsecret-raw-android-dump`
function runner(overrides: Record<string, string | Error> = {}) {
  return vi.fn(async (args: string[]) => {
    const key = args.join(' ')
    const values: Record<string, string | Error> = { 'shell getprop ro.build.version.sdk': '35', 'shell am get-current-user': '0', 'shell getprop sys.usb.state': 'mtp,adb', 'shell pm path --user 0 com.example': 'package:/data/app/private.apk', 'shell dumpsys package com.example': dump(), ...overrides }
    const value = values[key]
    if (value === undefined) throw new Error('unexpected command: ' + key)
    if (value instanceof Error) throw value
    return value
  })
}
const resources: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })

async function fixture(input: unknown = { packageName: 'com.example', requireAccount: true, requireService: true }) {
  const host = new FakeHost(), { viewer, sinks } = setup(), check = vi.fn(async (_device: unknown, target: typeof spec, signal: AbortSignal) => inspectAndroidEnvironment(device, target, runner(), signal))
  const act = vi.spyOn(host, 'act')
  const service = new WorkBuddyOpenGuiService({ viewers: viewer, host: Object.assign(host, { checkEnvironment: check }) })
  resources.push(() => service.dispose())
  const signal = AbortSignal.timeout(10000), options = { owner: 'environment-test', task: createControlTask() }
  const display = await service.openViewer(['phone-a'], signal, options), page = await connect(display.url, 'phone-a')
  sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  const session = await service.openSession(['phone-a'], signal, 'control', { ...options, viewerId: display.viewerId, ...(input ? { environment: input } : {}) })
  const call = (command: string, extra = {}) => callOpenGuiTool(service, 'opengui_environment', { sessionId: session.sessionId, command, ...extra }, signal, options) as Promise<{ ready: boolean; environment: ReturnType<typeof initialEnvironment> }>
  const observe = () => service.observe(session.sessionId, undefined, signal)
  const action = (id: string, fields: Record<string, unknown> = { action: 'key', key: 'Home' }) => service.act(session.sessionId, undefined, { observationId: id, ...fields }, signal)
  const verify = (id: string, check: 'account' | 'service', detail = 'Visible configured QA state') => call('verify', { verification: { check, status: 'passed', detail, evidenceObservationId: id } })
  const boardAction = (action: string) => fetch(`${display.url}board`, { method: 'POST', headers: { Origin: new URL(display.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(display.workbenchUrl).hash.slice(7) }, body: JSON.stringify({ action }) })
  return { service, host, act, viewer, check, display, session, signal, options, call, observe, action, verify, boardAction }
}

describe('read-only Android task environment', () => {
  it('projects current-user install/version/grant facts with a strict command whitelist', async () => {
    const run = runner(), state = await inspectAndroidEnvironment(device, spec, run, AbortSignal.timeout(1000))
    expect(environmentReady(state)).toBe(true)
    expect(state.checks.find(item => item.id === 'version')).toMatchObject({ status: 'passed', detail: '实际 2.0；要求 2.0' })
    expect(state.checks.find(item => item.id === 'usb')?.status).toBe('passed')
    expect(JSON.stringify(state)).not.toContain('secret-raw'); expect(JSON.stringify(state)).not.toContain('/data/app/')
    expect(run.mock.calls.map(([args]) => args.join(' '))).toEqual(['shell getprop ro.build.version.sdk', 'shell am get-current-user', 'shell getprop sys.usb.state', 'shell pm path --user 0 com.example', 'shell dumpsys package com.example'])
  })

  it('rejects wrong versions and denied grants even if another Android user or package is granted', async () => {
    const state = await inspectAndroidEnvironment(device, spec, runner({ 'shell dumpsys package com.example': dump(false, true, '1.0') }), AbortSignal.timeout(1000))
    expect(environmentReady(state)).toBe(false)
    expect(state.checks.find(item => item.id === 'version')?.status).toBe('failed')
    expect(state.checks.find(item => item.id === `permission:${camera}`)?.status).toBe('failed')
    const missing = await inspectAndroidEnvironment(device, spec, runner({ 'shell pm path --user 0 com.example': '', 'shell dumpsys package com.example': dump(true, false) }), AbortSignal.timeout(1000))
    expect(missing.checks.find(item => item.id === 'app')?.status).toBe('failed')
  })

  it('keeps command errors, unknown SDK, missing grant lines and unknown users explicit', async () => {
    const state = await inspectAndroidEnvironment(device, spec, runner({ 'shell getprop ro.build.version.sdk': 'not-known', 'shell pm path --user 0 com.example': new Error('permission denied'), 'shell dumpsys package com.example': dump().replaceAll(camera, 'android.permission.OTHER') }), AbortSignal.timeout(1000))
    expect(state.checks.filter(item => item.required).map(item => item.status)).toEqual(['unknown', 'unknown', 'passed', 'unknown'])
    const run = runner({ 'shell am get-current-user': 'bad;injected' }), unknown = await inspectAndroidEnvironment(device, spec, run, AbortSignal.timeout(1000))
    expect(run).toHaveBeenCalledTimes(3); expect(unknown.checks.find(item => item.id === 'app')?.status).toBe('unknown')
  })

  it('does not block working ADB solely for unconfirmed MTP and records undeclared version as a hint', async () => {
    const state = await inspectAndroidEnvironment(device, environmentSpec({ packageName: 'com.example' }), runner({ 'shell getprop sys.usb.state': 'adb' }), AbortSignal.timeout(1000))
    expect(environmentReady(state)).toBe(true)
    expect(state.checks.find(item => item.id === 'usb')).toMatchObject({ status: 'unknown', required: false })
    expect(state.checks.find(item => item.id === 'version')).toMatchObject({ status: 'passed', required: false })
  })

  it('validates identifiers, freezes prerequisites and revokes readiness across restore or disk failure', () => {
    for (const input of [{ packageName: 'bad;name' }, { packageName: 'com.example', requiredPermissions: [camera, camera] }, { packageName: 'com.example', expectedVersion: 'bad\nversion' }, { packageName: 'com.example', unexpected: true }]) expect(() => environmentSpec(input)).toThrow('environment_')
    let fail = false
    const board = new Workbench(undefined, { save() { if (fail) throw new Error('disk full') }, capture() {}, previousComment: () => undefined })
    board.configureEnvironment(spec, device.id)
    const state = initialEnvironment(spec, device.id); state.stale = false; state.checks.forEach(item => item.status = 'passed'); board.saveEnvironment(state)
    expect(environmentReady(board.environment)).toBe(true)
    expect(() => board.configureEnvironment(environmentSpec({ packageName: 'com.other' }), device.id)).toThrow('environment_frozen')
    const restored = new Workbench(board.snapshot()); expect(environmentReady(restored.environment)).toBe(false); expect(restored.environment?.spec).toEqual(spec)
    fail = true; expect(() => board.invalidateEnvironment()).toThrow('disk full'); expect(environmentReady(board.environment)).toBe(false)
    expect(board.markdown([])).toContain('旧结果不能授权执行')
  })

  it('blocks actions, test beginnings and completed outcomes until declared visual prerequisites have fresh app evidence', async () => {
    const f = await fixture(), board = f.viewer.board(f.display.viewerId)
    expect(f.check).toHaveBeenCalledTimes(1); expect(f.session.environment?.checks.find(item => item.id === 'account')?.status).toBe('unknown')
    let image = await f.observe()
    await expect(f.action(image.observationId)).rejects.toMatchObject({ code: 'environment_blocked' }); expect(f.act).not.toHaveBeenCalled()
    await expect(f.service.closeSession(f.session.sessionId, { outcome: 'completed', evidenceObservationIds: [image.observationId] })).rejects.toThrow('environment_blocked')
    await expect(f.verify('stale-id', 'account')).rejects.toThrow('environment_evidence_required')
    image = await f.action(image.observationId, { action: 'launch', packageName: 'com.example' })
    await expect(f.action(image.observationId, { action: 'launch', packageName: 'com.other' })).rejects.toMatchObject({ code: 'environment_blocked' })
    const account = await f.verify(image.observationId, 'account'); expect(account.ready).toBe(false)
    expect((await f.verify(image.observationId, 'service')).ready).toBe(true)
    image = await f.action(image.observationId)
    expect(f.act).toHaveBeenCalledTimes(2)
    expect(board.markdown([])).toContain('model_observation')
    await f.service.closeSession(f.session.sessionId, { outcome: 'completed', evidenceObservationIds: [image.observationId] })
  })

  it('blocks declared cases before beginning when setup is unresolved', async () => {
    const f = await fixture(), board = f.viewer.board(f.display.viewerId)
    const test = board.defineTest({ title: 'Check visible app', kind: 'flow', context: { app: 'QA App', version: '2', environment: 'test', account: 'qa', startPage: 'Home' }, prerequisites: [], testData: { source: 'none', description: 'No input' }, steps: ['Inspect visible home'], expected: 'Home shown', expectedSource: { kind: 'user', reference: 'Requested check' }, stoppingCondition: 'Before submit', dependencies: [] })
    expect(() => f.service.testCase(f.session.sessionId, { command: 'begin', caseId: test.id })).toThrow('environment_blocked')
    const image = await f.observe()
    await f.action(image.observationId, { action: 'launch', packageName: 'com.example' })
    expect(board.activeTestCaseId).toBeUndefined()
  })

  it('requires latest target-app evidence and never lets visual claims satisfy Android checks', async () => {
    const f = await fixture(), image = await f.observe()
    const original = f.host.observe.bind(f.host)
    vi.spyOn(f.host, 'observe').mockImplementation(async actor => ({ ...await original(actor), foregroundPackage: 'com.other' }))
    await f.observe(); await expect(f.verify(image.observationId, 'account')).rejects.toThrow('evidence_required')
    const wrong = await f.observe(); await expect(f.verify(wrong.observationId, 'account')).rejects.toThrow('evidence_required')
    expect(() => validateToolArguments('opengui_environment', { sessionId: f.session.sessionId, command: 'verify', verification: { check: 'android', status: 'passed', detail: 'fake', evidenceObservationId: wrong.observationId } })).toThrow('invalid arguments')
    await expect(f.call('check', { spec: { packageName: 'com.other' } })).rejects.toThrow('environment_frozen')
    expect(f.act).not.toHaveBeenCalled()
  })

  it('rechecks after human handback and physical reconnection instead of restoring saved visual authority', async () => {
    const f = await fixture(), image = await f.observe()
    await f.verify(image.observationId, 'account'); await f.verify(image.observationId, 'service')
    expect((await f.call('read')).ready).toBe(true)
    await f.service.requestHandoff(f.session.sessionId, 'login', 'Confirm required test login on the phone', 0, f.signal)
    expect((await f.call('read')).ready).toBe(false)
    expect((await f.boardAction('recheck')).status).toBe(200)
    expect(f.service.snapshotSession(f.session.sessionId).controlMode).toBe('manual')
    expect((await f.boardAction('resume')).status).toBe(200)
    const fresh = await f.observe(); expect((await f.call('read')).ready).toBe(false)
    await f.call('check'); expect((await f.call('read')).environment.checks.find(item => item.id === 'account')?.status).toBe('unknown')
    await f.verify(fresh.observationId, 'account'); await f.verify(fresh.observationId, 'service')
    f.host.onDeviceUnavailable?.('serial-a')
    expect((await f.call('read')).ready).toBe(false)
    await f.service.status(f.session.sessionId, f.signal)
    await expect(f.observe()).rejects.toMatchObject({ code: 'task_paused' })
    expect((await f.boardAction('recheck')).status).toBe(200)
    await f.observe(); await f.call('check'); expect((await f.call('read')).ready).toBe(false)
  })

  it('permits optional declaration only before actions and fails closed when no host checker exists', async () => {
    const f = await fixture(null), image = await f.observe()
    expect(await f.call('read')).toEqual({ ready: false })
    await f.action(image.observationId)
    await expect(f.call('check', { spec: { packageName: 'com.example' } })).rejects.toThrow('environment_started')
    const fresh = await fixture(null)
    delete (fresh.host as FakeHost & { checkEnvironment?: unknown }).checkEnvironment
    expect((await fresh.call('check', { spec: { packageName: 'com.example' } })).ready).toBe(false)
    const observation = await fresh.observe()
    await expect(fresh.action(observation.observationId)).rejects.toMatchObject({ code: 'environment_blocked' })
  })

  it('keeps readiness revoked when a read is interrupted by manual control', async () => {
    const f = await fixture({ packageName: 'com.example' })
    let started!: () => void
    const waiting = new Promise<void>(resolve => { started = resolve })
    f.check.mockImplementation((_device, _spec, signal) => new Promise((_resolve, reject) => { started(); signal.addEventListener('abort', () => reject(signal.reason), { once: true }) }))
    const checking = f.call('check'); const rejected = expect(checking).rejects.toThrow('paused')
    await waiting; await f.service.requestHandoff(f.session.sessionId, 'security', 'User handles required phone setting', 0, f.signal)
    await rejected; expect((await f.call('read')).ready).toBe(false); expect(f.act).not.toHaveBeenCalled()
  })
})
