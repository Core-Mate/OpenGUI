import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { connectionDiagnostic, inspectUsbInterfaces, macUsbInterfaces, windowsUsbInterfaces } from '../src/connection-diagnostics.ts'
import { ViewerServer } from '../src/viewer.ts'
import { CombinedPhoneHost } from '../src/phone-host.ts'
import { FakeHost } from './fake-host.ts'

const signal = () => AbortSignal.timeout(5000)
const root = (c = 255, s = 66, p = 1) => `+-o PrivatePhone <class IOUSBHostInterface, id 0x1, registered, matched, active>\n  {\n    "USB Serial Number" = "private-serial"\n    "bInterfaceProtocol" = ${p}\n    "bInterfaceClass" = ${c}\n    "bInterfaceSubClass" = ${s}\n  }\n`
const usb = { status: 'checked' as const, adbInterfaces: 1, mediaInterfaces: 0 }

describe('read-only computer connection diagnosis', () => {
  it('counts interface descriptors without exposing names or treating fastboot and keyboards as ADB', () => {
    const result = macUsbInterfaces(root() + root(6, 1, 1) + root(255, 66, 3) + root(3, 1, 1))
    expect(result).toEqual({ status: 'checked', adbInterfaces: 1, mediaInterfaces: 1 })
    expect(JSON.stringify(result)).not.toContain('private-serial')
    expect(macUsbInterfaces('')).toEqual({ status: 'checked', adbInterfaces: 0, mediaInterfaces: 0 })
  })
  it('rejects missing, repeated, malformed, excessive or out-of-range interface records', () => {
    for (const raw of ['unrecognized format', root(256), root().replace('    "bInterfaceClass" = 255\n', ''), root().replace('  }', '    "bInterfaceClass" = 255\n  }'), root().repeat(513), 'x'.repeat(2 * 1024 * 1024 + 1)]) expect(() => macUsbInterfaces(raw)).toThrow()
  })
  it('recognizes only complete Windows compatible class identifiers', () => {
    expect(windowsUsbInterfaces('\uFEFF' + JSON.stringify(['USB\\Class_ff&SubClass_42&Prot_01', 'USB\\Class_06&SubClass_01&Prot_01', 'USB\\Class_ff&SubClass_42&Prot_03', 'USB\\VID_1234\\private-serial']))).toEqual({ status: 'checked', adbInterfaces: 1, mediaInterfaces: 1 })
    expect(windowsUsbInterfaces('[]').adbInterfaces).toBe(0)
    for (const raw of ['null', '{}', '[42]', 'invalid', JSON.stringify(Array(513).fill('x')), JSON.stringify(['x'.repeat(201)])]) expect(() => windowsUsbInterfaces(raw)).toThrow()
  })
  it('uses a bounded depth-one native Mac query and sanitizes failures instead of declaring no devices', async () => {
    const run = vi.fn(async () => root())
    expect(await inspectUsbInterfaces(signal(), { platform: 'darwin', run })).toEqual(usb)
    expect(run.mock.calls[0]?.slice(0, 2)).toEqual(['/usr/sbin/ioreg', ['-r', '-c', 'IOUSBHostInterface', '-l', '-d', '1', '-w', '0']])
    expect(await inspectUsbInterfaces(signal(), { platform: 'darwin', run: async () => { throw new Error('/private/serial') } })).toEqual({ status: 'unknown' })
  })
  it('uses only present Windows PnP compatible properties without executing a driver change', async () => {
    const run = vi.fn(async () => '["USB\\\\Class_ff&SubClass_42&Prot_01"]')
    expect(await inspectUsbInterfaces(signal(), { platform: 'win32', run })).toEqual(usb)
    const [file, args] = run.mock.calls[0] as unknown as [string, string[]]
    expect(file).toMatch(/WindowsPowerShell\\v1\.0\\powershell\.exe$/u)
    expect(args).toContain('-NoProfile'); expect(args.at(-1)).toContain('Get-PnpDevice -PresentOnly')
    expect(args.at(-1)).toContain('DEVPKEY_Device_CompatibleIds')
    expect(args.at(-1)).not.toMatch(/Enable-PnpDevice|Disable-PnpDevice|pnputil|Set-/iu)
  })
  it('reads Linux interface class attributes without reading product names, serials or USB device roots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opengui-usb-sysfs-'))
    try {
      for (const [name, values] of [['1-2:1.0', ['ff', '42', '01']], ['1-2:1.1', ['06', '01', '01']], ['1-4:1.0', ['03', '01', '01']]] as const) {
        await mkdir(join(directory, name))
        for (const [i, field] of ['Class', 'SubClass', 'Protocol'].entries()) await writeFile(join(directory, name, 'bInterface' + field), values[i]! + '\n')
      }
      await mkdir(join(directory, '1-2')); await writeFile(join(directory, '1-2', 'serial'), 'private-serial')
      await writeFile(join(directory, 'unrelated'), 'private unrelated data')
      const run = vi.fn()
      expect(await inspectUsbInterfaces(signal(), { platform: 'linux', linuxDirectory: directory, run })).toEqual({ status: 'checked', adbInterfaces: 1, mediaInterfaces: 1 })
      expect(run).not.toHaveBeenCalled()
      await writeFile(join(directory, '1-2:1.0', 'bInterfaceClass'), 'unknown')
      expect(await inspectUsbInterfaces(signal(), { platform: 'linux', linuxDirectory: directory })).toEqual({ status: 'unknown' })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('preserves cancellation before and during native inspection without a successful empty result', async () => {
    const controller = new AbortController(), run = vi.fn(async (_file: string, _args: readonly string[], request: AbortSignal) => { controller.abort(); request.throwIfAborted(); return root() })
    await expect(inspectUsbInterfaces(controller.signal, { platform: 'darwin', run })).rejects.toThrow()
    run.mockClear()
    await expect(inspectUsbInterfaces(controller.signal, { platform: 'darwin', run })).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })
  it('keeps unsupported hosts and failed native reads unknown without running another platform adapter', async () => {
    const run = vi.fn()
    expect(await inspectUsbInterfaces(signal(), { platform: 'freebsd', run })).toEqual({ status: 'unknown' }); expect(run).not.toHaveBeenCalled()
    expect(await inspectUsbInterfaces(signal(), { platform: 'linux', linuxDirectory: '/missing-usb-qa-directory' })).toEqual({ status: 'unknown' })
  })
  it('keeps network devices and simulators outside USB counts and never claims a specific missing phone is found', () => {
    const devices = [
      { connection: 'usb' as const, state: 'device', connected: true, authorized: true, serial: 'private-serial' },
      { connection: 'usb' as const, state: 'unauthorized', connected: true, authorized: false },
      { connection: 'usb' as const, state: 'offline', connected: false, authorized: false },
      { connection: 'network' as const, state: 'device', connected: true, authorized: true },
      { connection: 'local_simulator' as const, state: 'device', connected: true, authorized: true },
    ]
    const result = connectionDiagnostic(devices, usb)
    expect(result.adb).toEqual({ status: 'checked', authorizedUsb: 1, unauthorizedUsb: 1, unavailableUsb: 1 })
    expect(result.guidance.join(' ')).toContain('不代表所有已插入手机')
    expect(JSON.stringify(result)).not.toContain('private-serial')
    expect(connectionDiagnostic([], usb).guidance.join(' ')).toContain('ADB 尚未确认')
    expect(connectionDiagnostic(undefined, usb).adb.status).toBe('unknown')
    expect(connectionDiagnostic([], { status: 'checked', adbInterfaces: 0, mediaInterfaces: 1 }).guidance.join(' ')).toContain('尚未确认目标 Android')
    expect(connectionDiagnostic([], { status: 'checked', adbInterfaces: 0, mediaInterfaces: 0 }).guidance.join(' ')).toContain('不能确定是否为仅充电')
  })
  it('exposes diagnosis only under the local viewer capability without binding or changing a task', async () => {
    const viewer = new ViewerServer({ async prepare() {}, async subscribe() { throw new Error('no stream') }, async dispose() {} })
    const handler = vi.fn(async () => connectionDiagnostic([], usb))
    viewer.setConnectionDiagnosticHandler(handler)
    try {
      const opened = await viewer.open('diagnostic-owner', [], signal())
      const before = viewer.board(opened.viewerId).snapshot()
      expect((await fetch(new URL('/wrong-capability/connection-diagnostic', opened.url))).status).toBe(404)
      expect(handler).not.toHaveBeenCalled()
      const response = await fetch(opened.url + 'connection-diagnostic')
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toMatchObject({ adb: { authorizedUsb: 0 }, usb })
      expect(viewer.selectedDeviceIds(opened.viewerId)).toEqual([])
      expect(viewer.board(opened.viewerId).snapshot()).toEqual(before)
    } finally { await viewer.dispose() }
  })
  it('routes computer diagnostics through Android even when an iOS simulator is present', async () => {
    const android = new FakeHost(), ios = new FakeHost(), diagnose = vi.fn(async () => connectionDiagnostic([], usb))
    Object.assign(android, { diagnoseConnection: diagnose })
    const host = new CombinedPhoneHost(android, ios)
    try { expect(await host.diagnoseConnection(signal())).toMatchObject({ usb }); expect(diagnose).toHaveBeenCalledOnce() }
    finally { await host.dispose() }
  })
})
