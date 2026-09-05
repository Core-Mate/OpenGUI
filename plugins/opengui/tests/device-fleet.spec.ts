import { describe, expect, it } from 'vitest'
import { DeviceFleet } from '../src/device-fleet.ts'
import type { AdbDevice } from '../src/adb.ts'

describe('device identity across reconnects', () => {
  it('retains the same serial identity without substituting another phone', async () => {
    let devices: AdbDevice[] = [{ serial: 'a', state: 'device' }]
    const fleet = new DeviceFleet(async () => devices)
    const signal = new AbortController().signal
    const id = (await fleet.inspect(signal))[0]!.id
    devices = [{ serial: 'b', state: 'device' }]
    expect((await fleet.inspect(signal))[0]!.id).not.toBe(id)
    await expect(fleet.resolveConnected([id], signal)).rejects.toThrow('disconnected')
    devices.push({ serial: 'a', state: 'device' })
    expect((await fleet.resolveConnected([id], signal))[0]!.serial).toBe('a')
    expect((await fleet.inspect(signal)).find(device => device.id === id)?.authorized).toBe(true)
  })
})
