import { describe, expect, it } from 'vitest'
import { DeviceFleet } from '../src/device-fleet.ts'
import type { AdbDevice } from '../src/adb.ts'

describe('broker-lifetime device identity', () => {
  it('preserves opaque identity across disconnect while refusing disconnected resolution', async () => {
    let rows: AdbDevice[] = [{ serial: 'test-phone', state: 'device', model: 'Test' }]
    let sequence = 0
    const fleet = new DeviceFleet(async () => rows, () => `opaque-${++sequence}`)
    const signal = AbortSignal.timeout(5000)
    const [first] = await fleet.inspect(signal)
    rows = []
    expect(await fleet.inspect(signal)).toEqual([])
    await expect(fleet.resolveConnected([first!.id], signal)).rejects.toThrow('disconnected')
    rows = [{ serial: 'test-phone', state: 'unauthorized', model: 'Test' }]
    expect((await fleet.inspect(signal))[0]!.id).toBe(first!.id)
    await expect(fleet.resolveConnected([first!.id], signal)).rejects.toThrow('disconnected')
    rows = [{ serial: 'test-phone', state: 'device', model: 'Test' }]
    expect((await fleet.inspect(signal))[0]!.id).toBe(first!.id)
    expect(await fleet.resolveConnected([first!.id], signal)).toMatchObject([{ serial: 'test-phone', id: first!.id }])
  })
})
