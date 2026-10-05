import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireDeviceLease } from '../../../packages/device-runtime/src/device-lease.ts'
import { parseDevices, selectAuthorizedSerial } from '../src/adb.ts'
import { DeviceFleet } from '../src/device-fleet.ts'
import { PhoneController } from '../src/phone-controller.ts'

const EMULATOR_ROW = 'emulator-5554 device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emulator64_arm64 transport_id:1'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function png(width = 100, height = 200): Buffer {
  const header = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(header)
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  return header
}

describe('Android emulator acceptance', () => {
  it('keeps an authorized emulator, classifies tcp separately, and ignores an offline emulator', () => {
    const devices = parseDevices([
      'List of devices attached',
      EMULATOR_ROW,
      '127.0.0.1:5555 device product:p model:Wireless',
      'emulator-5556 offline',
      'R58N device product:p model:Pixel_8',
    ].join('\n'))
    expect(devices.map(device => [device.serial, device.connection, device.state])).toEqual([
      ['emulator-5554', 'emulator', 'device'],
      ['127.0.0.1:5555', 'tcp', 'device'],
      ['emulator-5556', 'emulator', 'offline'],
      ['R58N', 'usb', 'device'],
    ])
    expect(selectAuthorizedSerial(parseDevices(`List of devices attached\n${EMULATOR_ROW}\n`))).toBe('emulator-5554')
    expect(() => selectAuthorizedSerial(parseDevices('List of devices attached\nemulator-5554 offline\n')))
      .toThrow('Android emulator')
  })

  it('auto-selects the emulator, leases its serial, and dispatches adb -s emulator-5554', async () => {
    const discovered = parseDevices(`List of devices attached\n${EMULATOR_ROW}\n`)
    const fleet = new DeviceFleet(async () => discovered, () => 'emu-1')
    const signal = new AbortController().signal
    expect((await fleet.snapshot(signal)).devices[0]).toMatchObject({
      id: 'emu-1',
      label: '模拟器 sdk gphone64 arm64',
      selected: true,
    })
    expect((await fleet.inspect(signal))[0]).toMatchObject({
      connection: 'emulator',
      label: 'Emulator sdk gphone64 arm64',
      authorized: true,
    })
    const selected = await fleet.selectedDevices(signal)
    expect(selected.map(device => device.serial)).toEqual(['emulator-5554'])

    const root = await mkdtemp(join(tmpdir(), 'opengui-emulator-lease-'))
    roots.push(root)
    const held = await acquireDeviceLease('emulator-5554', 'codex:task', root)
    await expect(acquireDeviceLease('emulator-5554', 'workbuddy:task', root)).rejects.toThrow('device_busy')
    await held.release()
    const next = await acquireDeviceLease('emulator-5554', 'dsh:task', root)
    await next.release()

    const calls: string[][] = []
    const image = png()
    const controller = new PhoneController({
      runAdb: async (args, _signal, buffer = false) => {
        calls.push([...args])
        if (args.includes('screencap')) return buffer ? image : image.toString('binary')
        if (args.includes('dumpsys')) return 'mCurrentFocus=Window{ u0 com.android.settings/.Settings }\n'
        return ''
      },
      discoverTarget: async (abort) => (await fleet.selectedDevices(abort))[0]!.serial,
      pasteUnicode: async () => undefined,
      encodeScreenshot: async () => ({ data: Buffer.from('ffd8ffd9', 'hex'), width: 100, height: 200 }),
      maxOperations: () => 100,
    })
    const actor = {}
    controller.assignTarget(actor, 'emulator-5554')
    const frame = await controller.observe(actor, signal)
    await controller.execute(actor, { action: 'key', observationId: frame.observationId, key: 'Home' }, signal)
    expect(calls).toContainEqual(['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'])
    expect(calls).toContainEqual(['-s', 'emulator-5554', 'shell', 'input', 'keyevent', 'KEYCODE_HOME'])
  })
})
