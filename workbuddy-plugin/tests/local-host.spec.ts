import { prepareApk } from '../src/apk.ts'
import { apkFile } from './apk-fixture.ts'
import { setup, connect } from './viewer-fixture.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({ adb: vi.fn(), mirror: { open: vi.fn(), inspect: vi.fn(), status: vi.fn(), stop: vi.fn(), dispose: vi.fn(), active: vi.fn() } }))
vi.mock('../src/adb.ts', async importOriginal => ({ ...await importOriginal<object>(), assertAdbReady: async () => {}, runAdb: io.adb }))
vi.mock('../src/mirror.ts', () => ({ NativeMirror: class { constructor() { return io.mirror } } }))
import { LocalAdbPhoneHost, WorkBuddyOpenGuiService } from '../src/service.ts'

describe('local host visual control independent of window visibility', () => {
  it('diagnoses USB from fresh ADB rows without reading app data, shell properties or changing device selection', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'opengui-local-usb-'))
    io.adb.mockImplementation(async (_path: string, args: string[]) => {
      expect(args).toEqual(['devices', '-l'])
      return 'List of devices attached\nprivate-phone device\nprivate-locked unauthorized\nprivate-offline offline\n192.0.2.1:5555 device\nemulator-5554 device\n'
    })
    const inspectUsb = vi.fn(async () => ({ status: 'checked' as const, adbInterfaces: 2, mediaInterfaces: 1 }))
    const host = new LocalAdbPhoneHost({ stateDir, inspectUsb })
    try {
      const result = await host.diagnoseConnection(AbortSignal.timeout(5000))
      expect(result.adb).toEqual({ status: 'checked', authorizedUsb: 1, unauthorizedUsb: 1, unavailableUsb: 1 })
      expect(JSON.stringify(result)).not.toContain('private-'); expect(JSON.stringify(result)).not.toContain('192.0.2.1')
      expect(inspectUsb).toHaveBeenCalledOnce(); expect(io.adb).toHaveBeenCalledOnce()
    } finally { await host.dispose(); await rm(stateDir, { recursive: true, force: true }); vi.clearAllMocks() }
  })
  it('keeps failed ADB and USB inspection unknown without restarting the shared server', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'opengui-local-usb-failure-'))
    io.adb.mockImplementation(async () => { throw new Error('private discovery failure') })
    const host = new LocalAdbPhoneHost({ stateDir, inspectUsb: async () => { throw new Error('private usb metadata') } })
    try {
      const result = await host.diagnoseConnection(AbortSignal.timeout(5000))
      expect(result).toMatchObject({ adb: { status: 'unknown' }, usb: { status: 'unknown' } })
      expect(JSON.stringify(result)).not.toContain('private')
      expect(io.adb.mock.calls.every(([, args]) => JSON.stringify(args) === '["devices","-l"]')).toBe(true)
    } finally { await host.dispose(); await rm(stateDir, { recursive: true, force: true }); vi.clearAllMocks() }
  })
  it('reads bounded device metadata, caches it and keeps unavailable versions explicit', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'opengui-device-info-test-'))
    io.adb.mockImplementation(async (_path: string, args: string[]) => {
      if (args[0] === 'devices') return 'List of devices attached\nprivate-1234 device model:Same_Phone\nprivate-old device model:Old_Phone\nprivate-locked unauthorized\nemulator-5554 offline\n'
      if (args.includes('getprop')) {
        const old = args[1] === 'private-old'
        if (args.at(-1) === 'ro.product.manufacturer') return ' Example\n'
        if (args.at(-1) === 'ro.build.version.release') { if (!old) throw new Error('metadata unavailable'); return '4.4' }
        if (args.at(-1) === 'ro.build.version.sdk') return old ? '19' : 'invalid'
        throw new Error('unexpected property')
      }
      return ''
    })
    const host = new LocalAdbPhoneHost({ stateDir }), signal = AbortSignal.timeout(5000)
    try {
      const devices = await host.listDevices(signal)
      expect(devices.find(d => d.serialSuffix === '1234')).toMatchObject({ manufacturer: 'Example', os: 'android', connection: 'usb' })
      expect(devices.find(d => d.serialSuffix === '1234')?.osVersion).toBeUndefined()
      expect(devices.find(d => d.serialSuffix === '1234')?.sdk).toBeUndefined()
      expect(devices.find(d => d.connection === 'local_simulator')).toMatchObject({ connected: false, authorized: false })
      expect(JSON.stringify(devices)).not.toContain('private-')
      const properties = () => io.adb.mock.calls.filter(([, args]) => args.includes('getprop'))
      expect(properties()).toHaveLength(6)
      await host.listDevices(signal); expect(properties()).toHaveLength(6)
      await host.listDevices(signal, true); expect(properties()).toHaveLength(12)
      const old = devices.find(d => d.sdk === 19)!
      await expect(host.resolveDevices([old.id], signal)).rejects.toMatchObject({ code: 'device_version_conflict' })
      const authorized = devices.find(d => d.serialSuffix === '1234')!
      expect(await host.resolveDevices([authorized.id], signal)).toMatchObject([{ id: authorized.id }])
    } finally { await host.dispose(); await rm(stateDir, { recursive: true, force: true }); vi.clearAllMocks() }
  })

  it('runs the environment checker through local ADB without issuing any mutation', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'opengui-local-environment-'))
    io.adb.mockImplementation(async (_path: string, args: string[]) => {
      if (args[0] === 'devices') return 'List of devices attached\nprivate-1234 device model:Test\n'
      if (args.at(-1) === 'ro.product.manufacturer') return 'Example'
      if (args.at(-1) === 'ro.build.version.release') return '15'
      if (args.at(-1) === 'ro.build.version.sdk') return '35'
      if (args.at(-1) === 'sys.usb.state') return 'adb'
      if (args.at(-1) === 'get-current-user') return '0'
      if (args.includes('path')) return 'package:/data/app/example.apk'
      if (args.includes('package')) return '  Package [com.example] (abc):\n    versionName=1.2\n    User 0: installed=true hidden=false\n'
      throw new Error('unexpected environment command')
    })
    const host = new LocalAdbPhoneHost({ stateDir }), signal = AbortSignal.timeout(5000)
    try {
      const [device] = await host.resolveDevices(undefined, signal)
      const result = await host.checkEnvironment(device!, { packageName: 'com.example', expectedVersion: '1.2', requiredPermissions: [], requireAccount: false, requireService: false }, signal)
      expect(result.stale).toBe(false)
      expect(result.checks.find(item => item.id === 'app')?.status).toBe('passed')
      expect(result.checks.find(item => item.id === 'version')?.status).toBe('passed')
      expect(result.checks.find(item => item.id === 'usb')).toMatchObject({ status: 'unknown', required: false })
      expect(io.adb.mock.calls.some(([, args]) => args.includes('install') || args.includes('grant') || args.includes('input'))).toBe(false)
      expect(JSON.stringify(result)).not.toContain('private-1234')
    } finally { await host.dispose(); await rm(stateDir, { recursive: true, force: true }); vi.clearAllMocks() }
  })

  it('installs only on the original current user with bounded data-preserving flags and sanitizes failures', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'opengui-local-apk-'))
    let sdk = '35', reply: string | Error = 'Performing Streamed Install\nSuccess\n'
    io.adb.mockImplementation(async (_path: string, args: string[]) => {
      if (args[0] === 'devices') return 'List of devices attached\nprivate-1234 device model:QA\n'
      if (args.at(-1) === 'ro.product.manufacturer') return 'Example'
      if (args.at(-1) === 'ro.build.version.release') return '15'
      if (args.at(-1) === 'ro.build.version.sdk') return sdk
      if (args.at(-1) === 'get-current-user') return '10'
      if (args.includes('install')) { if (reply instanceof Error) throw reply; return reply }
      throw new Error('unexpected command')
    })
    const host = new LocalAdbPhoneHost({ stateDir }), signal = AbortSignal.timeout(5000)
    const apk = await prepareApk(await apkFile(stateDir), 'temporary', true, signal)
    try {
      const [device] = await host.resolveDevices(undefined, signal)
      await host.installApk(device!, apk, signal)
      const calls = () => io.adb.mock.calls.filter(([, args]) => args.includes('install'))
      expect(calls()[0]![1]).toEqual(['-s', 'private-1234', 'install', '--user', '10', '-r', '-t', apk.path])
      expect(calls()[0]![2]).toMatchObject({ timeoutMs: 60000, encoding: 'utf8' })
      reply = new Error('adb: failed to install /private/user/file.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: private device text]')
      await expect(host.installApk(device!, apk, signal)).rejects.toMatchObject({ code: 'INSTALL_FAILED_UPDATE_INCOMPATIBLE', executionState: 'not_executed' })
      try { await host.installApk(device!, apk, signal) } catch (error) { expect(String(error)).not.toContain('/private/user/'); expect(String(error)).not.toContain('private device text') }
      reply = 'Performing Streamed Install'; await expect(host.installApk(device!, apk, signal)).rejects.toMatchObject({ executionState: 'outcome_unknown' })
      const count = calls().length; sdk = '22'; await expect(host.installApk(device!, apk, signal)).rejects.toMatchObject({ code: 'apk_sdk_incompatible' }); expect(calls()).toHaveLength(count)
      sdk = 'unknown'; await expect(host.installApk(device!, apk, signal)).rejects.toMatchObject({ code: 'apk_sdk_incompatible' }); expect(calls()).toHaveLength(count)
    } finally { await apk.dispose(); await host.dispose(); await rm(stateDir, { recursive: true, force: true }); vi.clearAllMocks() }
  })

  it('executes with a hidden established window and requires fresh observation after physical reconnect', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'opengui-local-host-test-'))
    const image = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#334155' } }).png().toBuffer()
    let online = true
    let ready = true
    let captureFails = false
    const writes: string[][] = []
    io.adb.mockImplementation(async (_path: string, args: string[]) => {
      if (args[0] === 'devices') return online ? 'List of devices attached\nsynthetic-device device model:Test\n' : 'List of devices attached\n'
      if (args.includes('screencap')) { if (captureFails) throw new Error('capture failed'); return image }
      if (args.includes('wm')) return 'Physical size: 100x200\n'
      if (args.includes('dumpsys')) return 'mCurrentFocus=Window{ u0 com.example/.Main }\n'
      if (args.includes('keyevent')) writes.push(args)
      return ''
    })
    io.mirror.status.mockImplementation(() => ({ phase: 'running', rendererReady: true, visible: ready, ready }))
    io.mirror.inspect.mockImplementation(async () => io.mirror.status())
    const host = new LocalAdbPhoneHost({ stateDir })
    const f = setup(), service = new WorkBuddyOpenGuiService({ viewers: f.viewer, host })
    const signal = AbortSignal.timeout(10000)
    try {
      const opened = await service.openViewer(undefined, signal)
      const page = await connect(opened.url, opened.devices[0]!.id)
      f.sinks.get(opened.devices[0]!.id)!.sendBinary(Buffer.from([2])); await page.receipt()
      const session = await service.openSession(undefined, signal, 'control', { viewerId: opened.viewerId })
      let frame = await service.observe(session.sessionId, undefined, signal)
      ready = false
      frame = await service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal) as typeof frame
      expect(writes).toHaveLength(1)
      expect(frame.screenshot.mimeType).toBe('image/jpeg')
      online = false
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)).rejects.toThrow('disconnected')
      expect(writes).toHaveLength(1)
      await service.status(session.sessionId, signal)
      online = true
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)).rejects.toMatchObject({ code: 'task_paused' })
      await expect(service.observe(session.sessionId, undefined, signal)).rejects.toMatchObject({ code: 'task_paused' })
      const recheck = await fetch(`${opened.url}board`, { method: 'POST', headers: { Origin: new URL(opened.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(opened.workbenchUrl).hash.slice(7) }, body: JSON.stringify({ action: 'recheck' }) })
      expect(recheck.status).toBe(200)
      frame = await service.observe(session.sessionId, undefined, signal)
      expect((await service.status(session.sessionId, signal)).devices[0]).toMatchObject({ id: session.devices[0]!.id, connected: true, authorized: true })
      expect(service.snapshotSession(session.sessionId).connectionRecovery).toMatchObject({ status: 'resolved', evidenceObservationId: frame.observationId })
      await service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)
      expect(writes).toHaveLength(2)
      captureFails = true
      await expect(service.observe(session.sessionId, undefined, signal)).rejects.toThrow('capture failed')
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)).rejects.toMatchObject({ code: 'observation_required', executionState: 'not_executed' })
      expect(writes).toHaveLength(2)
    } finally {
      await service.dispose()
      await rm(stateDir, { recursive: true, force: true })
      vi.clearAllMocks()
    }
  })
})
