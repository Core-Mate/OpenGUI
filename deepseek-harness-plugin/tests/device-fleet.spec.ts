import { describe, expect, it } from 'vitest'
import { DeviceFleet } from '../src/device-fleet.ts'
import type { AdbDevice } from '../src/adb.ts'

describe('multi-phone device fleet', () => {
  it('auto-selects one phone and exposes no serial to the browser snapshot', async () => {
    const fleet = new DeviceFleet(async () => [{ serial: 'usb-secret', state: 'device', model: 'Pixel_8' }], () => 'phone-1')

    const snapshot = await fleet.snapshot(new AbortController().signal)

    expect(snapshot).toEqual({
      devices: [{ id: 'phone-1', label: 'Pixel 8', model: 'Pixel 8', selected: true }],
      selectedDeviceIds: ['phone-1'],
    })
    expect(JSON.stringify(snapshot)).not.toContain('usb-secret')
    await expect(fleet.selectedDevices(new AbortController().signal)).resolves.toEqual([
      { id: 'phone-1', serial: 'usb-secret', label: 'Pixel 8', model: 'Pixel 8' },
    ])
  })

  it('requires an explicit subset for multiple phones and keeps duplicate models distinguishable', async () => {
    const devices: AdbDevice[] = [
      { serial: 'zed', state: 'device', model: 'Pixel_8' },
      { serial: 'alpha', state: 'device', model: 'Pixel_8' },
      { serial: 'locked', state: 'unauthorized', model: 'Other' },
    ]
    const ids = ['opaque-a', 'opaque-z']
    const fleet = new DeviceFleet(async () => devices, () => ids.shift()!)
    const signal = new AbortController().signal

    const initial = await fleet.snapshot(signal)
    expect(initial.devices).toEqual([
      { id: 'opaque-a', label: 'Pixel 8 1', model: 'Pixel 8', selected: false },
      { id: 'opaque-z', label: 'Pixel 8 2', model: 'Pixel 8', selected: false },
    ])
    await expect(fleet.selectedDevices(signal)).rejects.toThrow('select at least one')

    await fleet.select(['opaque-z'], signal)
    await expect(fleet.selectedDevices(signal)).resolves.toEqual([
      { id: 'opaque-z', serial: 'zed', label: 'Pixel 8 2', model: 'Pixel 8' },
    ])
    await expect(fleet.resolveConnected(['opaque-a', 'opaque-z'], signal)).resolves.toEqual([
      { id: 'opaque-a', serial: 'alpha', label: 'Pixel 8 1', model: 'Pixel 8' },
      { id: 'opaque-z', serial: 'zed', label: 'Pixel 8 2', model: 'Pixel 8' },
    ])
  })

  it('drops disconnected selections and rejects stale browser ids', async () => {
    let devices: AdbDevice[] = [
      { serial: 'a', state: 'device', model: 'A' },
      { serial: 'b', state: 'device', model: 'B' },
    ]
    const ids = ['id-a', 'id-b']
    const fleet = new DeviceFleet(async () => devices, () => ids.shift()!)
    const signal = new AbortController().signal
    await fleet.snapshot(signal)
    await fleet.select(['id-a', 'id-b'], signal)

    devices = [{ serial: 'b', state: 'device', model: 'B' }]
    expect(await fleet.snapshot(signal)).toEqual({
      devices: [{ id: 'id-b', label: 'B', model: 'B', selected: true }],
      selectedDeviceIds: ['id-b'],
    })
    await expect(fleet.select(['id-a'], signal)).rejects.toThrow('disconnected or unknown')
  })
})
