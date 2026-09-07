import { describe, expect, it } from 'vitest'
import { DeviceFleet, DeviceLeaseConflictError, DeviceSelectionLockedError } from '../src/device-fleet.ts'
import type { AdbDevice } from '../src/adb.ts'

describe('multi-phone device fleet', () => {
  it('auto-selects one phone and exposes no serial to the browser snapshot', async () => {
    const fleet = new DeviceFleet(async () => [{ serial: 'usb-secret', state: 'device', model: 'Pixel_8' }], () => 'phone-1')

    const snapshot = await fleet.snapshot(new AbortController().signal)

    expect(snapshot).toEqual({
      devices: [{ id: 'phone-1', label: 'Pixel 8', model: 'Pixel 8', selected: true, occupied: false, occupiedByCurrentSession: false }],
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
      { id: 'opaque-a', label: 'Pixel 8 1', model: 'Pixel 8', selected: false, occupied: false, occupiedByCurrentSession: false },
      { id: 'opaque-z', label: 'Pixel 8 2', model: 'Pixel 8', selected: false, occupied: false, occupiedByCurrentSession: false },
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
      devices: [{ id: 'id-b', label: 'B', model: 'B', selected: true, occupied: false, occupiedByCurrentSession: false }],
      selectedDeviceIds: ['id-b'],
    })
    await expect(fleet.select(['id-a'], signal)).rejects.toThrow('disconnected or unknown')
  })

  it('never resolves a frozen opaque id to a replacement phone', async () => {
    let devices: AdbDevice[] = [{ serial: 'original', state: 'device', model: 'Pixel' }]
    const ids = ['locked-original', 'new-arrival']
    const fleet = new DeviceFleet(async () => devices, () => ids.shift()!)
    const signal = new AbortController().signal
    const locked = await fleet.selectedDevices(signal)
    expect(locked[0]).toMatchObject({ id: 'locked-original', serial: 'original' })

    devices = [{ serial: 'replacement', state: 'device', model: 'Pixel' }]
    await expect(fleet.resolveConnected(['locked-original'], signal)).rejects.toThrow('disconnected or unknown')
    expect((await fleet.snapshot(signal)).devices).toEqual([
      { id: 'new-arrival', label: 'Pixel', model: 'Pixel', selected: true, occupied: false, occupiedByCurrentSession: false },
    ])
  })

  it('keeps preferences per session and acquires every selected phone atomically', async () => {
    const devices: AdbDevice[] = [
      { serial: 'a', state: 'device', model: 'A' },
      { serial: 'b', state: 'device', model: 'B' },
    ]
    const ids = ['id-a', 'id-b']
    const fleet = new DeviceFleet(async () => devices, () => ids.shift()!)
    const signal = new AbortController().signal
    await fleet.selectForSession('session-a', ['id-a', 'id-b'], signal)
    await fleet.selectForSession('session-b', ['id-b'], signal)
    const ownerA = { sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-a' }
    const leaseA = await fleet.acquireSelected(ownerA, signal)

    expect(leaseA.devices.map(device => device.id)).toEqual(['id-a', 'id-b'])
    await expect(fleet.selectForSession('session-b', ['id-b'], signal)).resolves.toMatchObject({ selectedDeviceIds: ['id-b'] })
    await expect(fleet.acquireSelected(
      { sessionId: 'session-b', taskId: 'task-b', attemptId: 'attempt-b' },
      signal,
    )).rejects.toBeInstanceOf(DeviceLeaseConflictError)
    expect(fleet.leaseSnapshot()).toEqual([
      { ...ownerA, deviceId: 'id-a' },
      { ...ownerA, deviceId: 'id-b' },
    ])
    expect((await fleet.snapshotForSession('session-b', signal)).devices).toEqual([
      { id: 'id-a', label: 'A', model: 'A', selected: false, occupied: true, occupiedByCurrentSession: false },
      { id: 'id-b', label: 'B', model: 'B', selected: true, occupied: true, occupiedByCurrentSession: false },
    ])
  })

  it('ignores a stale attempt release after the device has been reassigned', async () => {
    const fleet = new DeviceFleet(
      async () => [{ serial: 'a', state: 'device', model: 'A' }],
      () => 'id-a',
    )
    const signal = new AbortController().signal
    const oldOwner = { sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-old' }
    const oldLease = await fleet.acquireSelected(oldOwner, signal)
    oldLease.release()
    const newOwner = { sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-new' }
    await fleet.acquireSelected(newOwner, signal)

    expect(fleet.release(oldOwner, ['id-a'])).toBe(0)
    expect(fleet.leaseSnapshot()).toEqual([{ ...newOwner, deviceId: 'id-a' }])
  })

  it('leaves no partial lease when one phone in a requested batch is busy', async () => {
    const ids = ['id-a', 'id-b']
    const fleet = new DeviceFleet(async () => [
      { serial: 'a', state: 'device', model: 'A' },
      { serial: 'b', state: 'device', model: 'B' },
    ], () => ids.shift()!)
    const signal = new AbortController().signal
    const ownerA = { sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-a' }
    const ownerB = { sessionId: 'session-b', taskId: 'task-b', attemptId: 'attempt-b' }
    await fleet.selectForSession('session-a', ['id-a', 'id-b'], signal)
    await fleet.selectForSession('session-b', ['id-b'], signal)
    await fleet.acquireSelected(ownerB, signal)

    await expect(fleet.acquireSelected(ownerA, signal)).rejects.toBeInstanceOf(DeviceLeaseConflictError)

    expect(fleet.leaseSnapshot()).toEqual([{ ...ownerB, deviceId: 'id-b' }])
    expect((await fleet.snapshotForSession('session-a', signal)).devices[0]?.occupied).toBe(false)
  })

  it('forgets only a deleted session preference and preserves other sessions', async () => {
    const ids = ['id-a', 'id-b']
    const fleet = new DeviceFleet(async () => [
      { serial: 'a', state: 'device', model: 'A' },
      { serial: 'b', state: 'device', model: 'B' },
    ], () => ids.shift()!)
    const signal = new AbortController().signal
    await fleet.selectForSession('session-a', ['id-a'], signal)
    await fleet.selectForSession('session-b', ['id-b'], signal)

    fleet.forgetSession('session-a')

    expect((await fleet.snapshotForSession('session-a', signal)).selectedDeviceIds).toEqual([])
    expect((await fleet.snapshotForSession('session-b', signal)).selectedDeviceIds).toEqual(['id-b'])
  })

  it('rejects a selection request that finishes discovery after its session acquired a lease', async () => {
    const devices: AdbDevice[] = [
      { serial: 'a', state: 'device', model: 'A' },
      { serial: 'b', state: 'device', model: 'B' },
    ]
    const ids = ['id-a', 'id-b']
    let slowNext = false
    let release!: (devices: readonly AdbDevice[]) => void
    const fleet = new DeviceFleet(async () => {
      if (!slowNext) return devices
      slowNext = false
      return new Promise<readonly AdbDevice[]>(resolve => { release = resolve })
    }, () => ids.shift()!)
    const signal = new AbortController().signal
    await fleet.selectForSession('session-a', ['id-a'], signal)
    slowNext = true
    const delayedSelection = fleet.selectForSession('session-a', ['id-b'], signal)
    const owner = { sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-a' }
    await fleet.acquireSelected(owner, signal)

    release(devices)

    await expect(delayedSelection).rejects.toBeInstanceOf(DeviceSelectionLockedError)
    expect((await fleet.snapshotForSession('session-a', signal)).selectedDeviceIds).toEqual(['id-a'])
    expect(fleet.leaseSnapshot()).toEqual([{ ...owner, deviceId: 'id-a' }])
  })

  it('reserves a leased physical identity across disconnect and reconnect', async () => {
    let devices: AdbDevice[] = [{ serial: 'a', state: 'device', model: 'A' }]
    const ids = ['id-a', 'must-not-be-used']
    const fleet = new DeviceFleet(async () => devices, () => ids.shift()!)
    const signal = new AbortController().signal
    const ownerA = { sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-a' }
    const ownerB = { sessionId: 'session-b', taskId: 'task-b', attemptId: 'attempt-b' }
    const lease = await fleet.acquireSelected(ownerA, signal)

    devices = []
    expect((await fleet.snapshotForSession('session-a', signal)).devices).toEqual([])
    devices = [{ serial: 'a', state: 'device', model: 'A' }]
    expect((await fleet.snapshotForSession('session-b', signal)).devices[0]?.id).toBe('id-a')
    await expect(fleet.acquireSelected(ownerB, signal)).rejects.toBeInstanceOf(DeviceLeaseConflictError)
    lease.release()
    await expect(fleet.acquireSelected(ownerB, signal)).resolves.toMatchObject({ devices: [expect.objectContaining({ id: 'id-a' })] })
  })
})
