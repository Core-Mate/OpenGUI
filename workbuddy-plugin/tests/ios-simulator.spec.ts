import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IosSimulatorHost, iosActionArgs, iosApplicationPid, parseIosSimulators, simulatorUdid } from '../src/ios-simulator.ts'
import { CombinedPhoneHost } from '../src/phone-host.ts'
import { ObservationId } from '../src/adb.ts'
import { FakeHost } from './fake-host.ts'
import { environmentReady, environmentSetupAllowed } from '../src/environment.ts'

const UDID = '12345678-1234-1234-1234-123456789ABC', serial = `ios-simulator:${UDID}`
const screen = { width: 100, height: 200, screenshotWidth: 300, screenshotHeight: 600 }
const raw = (state = 'Booted') => JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-3': [{ udid: UDID, name: 'iPhone test', state, isAvailable: true }] } })
const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'opengui-ios-unit-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  let png = await sharp({ create: { width: 300, height: 600, channels: 3, background: '#cbd5e1' } }).png().toBuffer(), list = raw(), clipboard = 'Private original clipboard'
  let processPath = '/fixture/App.app/Fixture', container = '/fixture/App.app', bundleId = 'org.opengui.fixture', executableName = 'Fixture', pid = 42
  let metadata: string | undefined, pids: number[] = [], failedMetadata = false
  const writes: Array<{ args: readonly string[]; input?: string }> = []
  const run = vi.fn(async (file: string, args: readonly string[], signal: AbortSignal, input?: string): Promise<Buffer> => {
    signal.throwIfAborted()
    if (file === '/fixture/axe') {
      if (args[0] === 'describe-ui') {
        if (failedMetadata) throw new Error('private diagnostic must not escape')
        pid = pids.shift() ?? pid
        return Buffer.from(metadata ?? JSON.stringify([{ type: 'Application', role: 'AXApplication', pid, AXLabel: 'Private label', children: [] }]))
      }
      writes.push({ args, ...(input ? { input } : {}) }); return Buffer.alloc(0)
    }
    if (file === '/bin/ps') return Buffer.from(processPath)
    if (file === '/usr/bin/plutil') return args.includes('-extract') ? Buffer.from(args[1] === 'CFBundleIdentifier' ? bundleId : args[1] === 'CFBundleExecutable' ? executableName : '1.0') : Buffer.from(JSON.stringify({ 'org.opengui.fixture': { CFBundleIdentifier: 'org.opengui.fixture' } }))
    if (args.includes('get_app_container')) return Buffer.from(container)
    if (args.includes('list')) return Buffer.from(list)
    if (args.includes('screenshot')) return png
    if (args.includes('getenv')) return Buffer.from('3.000000')
    if (args.includes('pbpaste')) return Buffer.from(clipboard)
    if (args.includes('pbcopy')) { clipboard = input ?? ''; return Buffer.alloc(0) }
    if (args.includes('listapps')) return Buffer.from('fixture plist')
    if (args.includes('launch')) { writes.push({ args }); return Buffer.from('fixture: 1') }
    throw new Error('unexpected command')
  })
  const host = new IosSimulatorHost({ platform: 'darwin', stateDir: dir, run, driver: { ensure: async () => '/fixture/axe' } })
  cleanup.push(() => host.dispose())
  const actor = {}; host.assignTarget(actor, serial)
  return { host, actor, run, writes, signal: AbortSignal.timeout(10_000), setList: (next: string) => { list = next }, setPng: (next: Buffer) => { png = next }, clipboard: () => clipboard,
    setMetadata: (value: string) => { metadata = value }, failMetadata: () => { failedMetadata = true }, setPids: (values: number[]) => { pids = values },
    setProcess: (path: string, id = bundleId, name = executableName, installed = container) => { processPath = path; bundleId = id; executableName = name; container = installed } }
}

describe('iOS simulator discovery and bounded GUI execution', () => {
  it('projects only available iOS simulators and preserves booted versus shutdown state', () => {
    const devices = JSON.parse(raw())
    devices.devices['com.apple.CoreSimulator.SimRuntime.tvOS-26-3'] = [{ udid: 'TV', isAvailable: true, state: 'Booted', name: 'TV' }]
    devices.devices['com.apple.CoreSimulator.SimRuntime.iOS-26-3'].push({ udid: 'unsafe; command', isAvailable: true, state: 'Booted', name: 'Unsafe' }, { udid: UDID.toLowerCase(), isAvailable: true, state: 'Booted', name: 'Duplicate' })
    expect(parseIosSimulators(JSON.stringify(devices))).toEqual([{ serial, name: 'iPhone test', osVersion: '26.3', connected: true }])
    expect(parseIosSimulators(raw('Shutdown'))[0]?.connected).toBe(false)
    expect(() => simulatorUdid('booted')).toThrow('explicitly discovered')
    expect(() => parseIosSimulators('{}')).toThrow('discovery_invalid')
  })
  it('does not expose an iOS device or run Xcode commands on unsupported desktop platforms', async () => {
    const run = vi.fn(), host = new IosSimulatorHost({ platform: 'win32', run })
    cleanup.push(() => host.dispose())
    expect(await host.listDevices(AbortSignal.timeout(1000))).toEqual([]); expect(run).not.toHaveBeenCalled()
  })
  it('converts screenshot pixels to simulator points and rejects bounds, unsupported keys and multiline inputs', () => {
    const observationId = ObservationId('current')
    expect(iosActionArgs({ action: 'tap', observationId, targetBBox: { left: 60, top: 90, right: 90, bottom: 120 } }, screen)).toEqual(['tap', '-x', '25', '-y', '35', '--tap-style', 'physical'])
    expect(iosActionArgs({ action: 'swipe', observationId, x1: 30, y1: 300, x2: 240, y2: 60, durationMs: 400 }, screen)).toContain('0.4')
    expect(() => iosActionArgs({ action: 'tap', observationId, targetBBox: { left: 299, top: 0, right: 310, bottom: 40 } }, screen)).toThrow('fit')
    expect(() => iosActionArgs({ action: 'key', observationId, key: 'Back' }, screen)).toThrow('unavailable')
    expect(() => iosActionArgs({ action: 'text', observationId, text: 'line\nnext' }, screen)).toThrow('single-line')
  })
  it('uses stable private identities without returning raw simulator UUIDs in discovery', async () => {
    const f = await fixture(), devices = await f.host.listDevices(f.signal)
    expect(devices[0]).toMatchObject({ os: 'ios', osVersion: '26.3', connection: 'local_simulator', serialSuffix: '9ABC' })
    expect(JSON.stringify(devices)).not.toContain(UDID)
    expect((await f.host.resolveArchivedDevices([{ id: 'old-random', serial }], f.signal))[0]?.id).toBe(devices[0]?.id)
    await expect(f.host.resolveArchivedDevices([{ id: 'old', serial: 'ios-simulator:AAAAAAAA-1234-1234-1234-123456789ABC' }], f.signal)).rejects.toMatchObject({ code: 'device_offline' })
  })
  it('requires the latest image, freezes the original simulator and preserves logical input dimensions', async () => {
    const f = await fixture(), first = await f.host.observe(f.actor, f.signal)
    expect(first).toMatchObject({ width: 100, height: 200, foregroundPackage: 'org.opengui.fixture' })
    await expect(f.host.act(f.actor, { action: 'tap', observationId: 'old', targetBBox: { left: 0, top: 0, right: 20, bottom: 20 } }, f.signal)).rejects.toThrow('stale')
    expect(f.writes).toEqual([])
    const next = await f.host.observe(f.actor, f.signal)
    await f.host.act(f.actor, { action: 'tap', observationId: next.observationId, targetBBox: { left: 60, top: 90, right: 90, bottom: 120 } }, f.signal)
    expect(f.writes[0]?.args).toEqual(['tap', '-x', '25', '-y', '35', '--tap-style', 'physical', '--udid', UDID])
    expect(() => f.host.assignTarget(f.actor, 'ios-simulator:AAAAAAAA-1234-1234-1234-123456789ABC')).toThrow('another device')
  })
  it('rejects changed screens and unsupported actions before any HID dispatch', async () => {
    const f = await fixture(), first = await f.host.observe(f.actor, f.signal)
    f.setPng(await sharp({ create: { width: 300, height: 600, channels: 3, background: '#09090b' } }).png().toBuffer())
    await expect(f.host.act(f.actor, { action: 'tap', observationId: first.observationId, targetBBox: { left: 0, top: 0, right: 20, bottom: 20 } }, f.signal)).rejects.toMatchObject({ code: 'screen_changed', executionState: 'not_executed' })
    const next = await f.host.observe(f.actor, f.signal)
    await expect(f.host.act(f.actor, { action: 'key', key: 'Back', observationId: next.observationId }, f.signal)).rejects.toMatchObject({ code: 'ios_action_unsupported', executionState: 'not_executed' })
    expect(f.writes).toEqual([])
  })
  it('stops after three unchanged repetitions even though observation credentials change', async () => {
    const f = await fixture(); let current = await f.host.observe(f.actor, f.signal)
    for (let index = 0; index < 3; index++) current = await f.host.act(f.actor, { action: 'tap', observationId: current.observationId, targetBBox: { left: 0, top: 0, right: 20, bottom: 20 } }, f.signal)
    await expect(f.host.act(f.actor, { action: 'tap', observationId: current.observationId, targetBBox: { left: 0, top: 0, right: 20, bottom: 20 } }, f.signal)).rejects.toThrow('no screen progress')
    expect(f.writes).toHaveLength(3)
  })
  it('pastes exact Unicode through the simulator clipboard and restores the original text', async () => {
    const f = await fixture(), current = await f.host.observe(f.actor, f.signal), text = '中文 😀 café'
    await f.host.act(f.actor, { action: 'text', observationId: current.observationId, text }, f.signal)
    expect(f.writes).toEqual([{ args: ['key-combo', '--modifiers', '227', '--key', '25', '--udid', UDID] }])
    expect(f.run.mock.calls.some(call => call[1].includes('pbcopy') && call[3] === text)).toBe(true)
    expect(f.clipboard()).toBe('Private original clipboard')
  })
  it('revokes old observations when the original simulator shuts down', async () => {
    const f = await fixture(), current = await f.host.observe(f.actor, f.signal), unavailable = vi.fn(); f.host.onDeviceUnavailable = unavailable
    f.setList(raw('Shutdown'))
    await expect(f.host.act(f.actor, { action: 'key', key: 'Home', observationId: current.observationId }, f.signal)).rejects.toMatchObject({ code: 'device_offline' })
    expect(unavailable).toHaveBeenCalledWith(serial); expect(f.writes).toEqual([])
    expect(f.host.status(f.actor).observationId).toBeUndefined()
  })
  it('checks installed app and version without treating simulator status as a test account or permission', async () => {
    const f = await fixture(), [device] = await f.host.resolveDevices(undefined, f.signal)
    const spec = { packageName: 'org.opengui.fixture', expectedVersion: '2.0', requiredPermissions: ['ios.permission.camera'], requireAccount: true, requireService: false }
    const env = await f.host.checkEnvironment(device!, spec, f.signal)
    expect(env.checks.find(check => check.id === 'app')).toMatchObject({ status: 'passed', source: 'simctl' })
    expect(env.checks.find(check => check.id === 'version')?.status).toBe('failed')
    expect(env.checks.find(check => check.id === 'account')?.status).toBe('unknown')
    expect(environmentReady(env)).toBe(false)
    expect(environmentSetupAllowed(env, { action: 'launch', packageName: spec.packageName })).toBe(false)
  })
  it('combines both device families without selecting the first row or changing a bound actor platform', async () => {
    const f = await fixture(), android = new FakeHost(), host = new CombinedPhoneHost(android, f.host)
    cleanup.push(() => host.dispose())
    const devices = await host.listDevices(f.signal)
    expect(devices.some(device => device.os === 'ios')).toBe(true)
    await expect(host.resolveDevices(undefined, f.signal)).rejects.toMatchObject({ code: 'device_selection_required' })
    const [device] = await host.resolveDevices([devices.find(device => device.os === 'ios')!.id], f.signal)
    expect(device?.serial).toBe(serial)
    const actor = {}; host.assignTarget(actor, serial)
    expect(() => host.assignTarget(actor, 'serial-a')).toThrow('device_frozen')
    const state = await host.observe(actor, f.signal); expect(state.width).toBe(100)
  })
  it('accepts only one bounded native application-process envelope without reading child controls', () => {
    const application = { type: 'Application', role: 'AXApplication', pid: 42 }
    expect(iosApplicationPid(JSON.stringify(application))).toBe(42)
    expect(iosApplicationPid(JSON.stringify([application]))).toBe(42)
    for (const value of [null, {}, [], [application, application], { ...application, pid: '42' }, { ...application, pid: 0 }, { ...application, pid: 2_147_483_648 }, { ...application, role: 'AXWindow' }, { children: [application] }]) expect(iosApplicationPid(JSON.stringify(value))).toBeUndefined()
    expect(iosApplicationPid('not JSON')).toBeUndefined()
    expect(iosApplicationPid(JSON.stringify({ ...application, AXLabel: 'x'.repeat(2 * 1024 * 1024) }))).toBeUndefined()
  })
  it('binds native process identity to the original simulator container and exposes no raw metadata', async () => {
    const f = await fixture(), observed = await f.host.observe(f.actor, f.signal)
    expect(observed.foregroundPackage).toBe('org.opengui.fixture')
    expect(f.run.mock.calls.some(call => call[1].join(' ') === `simctl get_app_container ${UDID} org.opengui.fixture app`)).toBe(true)
    expect(JSON.stringify(observed)).not.toContain('Private label')
    expect(JSON.stringify(observed)).not.toContain('/fixture/App.app')
    expect(f.writes).toEqual([])
  })
  it('keeps the application unknown when the process cannot be bound to this simulator', async () => {
    const f = await fixture()
    f.setProcess('/fixture/App.app/Fixture', 'org.opengui.fixture', 'Fixture', '/other-simulator/App.app')
    expect((await f.host.observe(f.actor, f.signal)).foregroundPackage).toBe('')
    expect(f.writes).toEqual([])
  })
  it('rejects unsafe, non-application or mismatching executable metadata without dispatch', async () => {
    const f = await fixture()
    for (const path of ['/usr/bin/helper', '/fixture/App.app/../Fixture', '/fixture/App.app/Fixture\nOther', 'relative/App.app/Fixture']) {
      f.setProcess(path)
      expect((await f.host.observe(f.actor, f.signal)).foregroundPackage).toBe('')
    }
    f.setProcess('/fixture/App.app/Fixture', 'org.opengui.fixture', 'Other')
    expect((await f.host.observe(f.actor, f.signal)).foregroundPackage).toBe('')
    f.setProcess('/fixture/App.app/Fixture', 'invalid; bundle', 'Fixture')
    expect((await f.host.observe(f.actor, f.signal)).foregroundPackage).toBe('')
    expect(f.writes).toEqual([])
  })
  it('does not label a frame when the native application process changes across capture', async () => {
    const f = await fixture(); f.setPids([42, 43])
    expect((await f.host.observe(f.actor, f.signal)).foregroundPackage).toBe('')
    expect(f.writes).toEqual([])
  })
  it('preserves unknown identity for ambiguous metadata or failed native reads', async () => {
    const f = await fixture()
    f.setMetadata(JSON.stringify([{ type: 'Application', role: 'AXApplication', pid: 42 }, { type: 'Application', role: 'AXApplication', pid: 43 }]))
    expect((await f.host.observe(f.actor, f.signal)).foregroundPackage).toBe('')
    f.failMetadata()
    const observed = await f.host.observe(f.actor, f.signal)
    expect(observed.foregroundPackage).toBe('')
    expect(JSON.stringify(observed)).not.toContain('private diagnostic')
    expect(f.writes).toEqual([])
  })
  it('does not use process metadata for display-only previews', async () => {
    const f = await fixture(), [device] = await f.host.resolveDevices(undefined, f.signal)
    expect((await f.host.preview(device!, f.signal)).length).toBeGreaterThan(0)
    expect(f.run.mock.calls.some(call => call[1][0] === 'describe-ui' || call[0] === '/bin/ps')).toBe(false)
  })
  it('rejects a changed application before input even if screenshot pixels are unchanged', async () => {
    const f = await fixture(), observation = await f.host.observe(f.actor, f.signal)
    f.setProcess('/fixture/Other.app/Other', 'org.opengui.other', 'Other', '/fixture/Other.app')
    await expect(f.host.act(f.actor, { action: 'tap', observationId: observation.observationId, targetBBox: { left: 0, top: 0, right: 20, bottom: 20 } }, f.signal)).rejects.toMatchObject({ code: 'screen_changed', executionState: 'not_executed' })
    expect(f.writes).toEqual([])
  })
})
