import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mirror = vi.hoisted(() => ({
  open: vi.fn(), inspect: vi.fn(), stop: vi.fn(), active: vi.fn(), dispose: vi.fn(), status: vi.fn(),
}))
vi.mock('../src/mirror.ts', () => ({ NativeMirror: class { constructor() { return mirror } } }))
import { LocalAdbPhoneHost, type ResolvedWorkBuddyDevice } from '../src/service.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.clearAllMocks() })
const device = (id: string, authorized = true): ResolvedWorkBuddyDevice => ({ id, serial: `serial-${id}`, name: id, state: authorized ? 'device' : 'unauthorized', connected: true, authorized })
async function fixture() {
  const stateDir = await mkdtemp(join(tmpdir(), 'opengui-reconcile-test-'))
  cleanup.push(() => rm(stateDir, { recursive: true, force: true }))
  const host = new LocalAdbPhoneHost({ stateDir })
  cleanup.push(() => host.dispose())
  let devices = [device('a')]
  mirror.inspect.mockResolvedValue({ phase: 'running', ready: true })
  mirror.open.mockResolvedValue(undefined)
  mirror.stop.mockResolvedValue(undefined)
  mirror.dispose.mockResolvedValue(undefined)
  vi.spyOn(host, 'listDevices').mockImplementation(async () => devices)
  vi.spyOn(host, 'resolveDevices').mockImplementation(async ids => devices.filter(d => ids?.includes(d.id)))
  return { host, set: (next: ResolvedWorkBuddyDevice[]) => { devices = next } }
}

describe('real host display reconciliation', () => {
  it('displays more than four authorized devices while skipping unauthorized devices', async () => {
    const f = await fixture()
    f.set(['a', 'b', 'c', 'd', 'e'].map(id => device(id)).concat(device('locked', false)))
    await f.host.activateMirrors(AbortSignal.timeout(5000))
    expect(mirror.open.mock.calls.map(args => args[0])).toEqual(['serial-a', 'serial-b', 'serial-c', 'serial-d', 'serial-e'])
  })
  it('discovers hot-plugged devices and reconnects by stable serial', async () => {
    const f = await fixture()
    await f.host.activateMirrors(AbortSignal.timeout(5000))
    f.set([device('a'), device('b')])
    await vi.waitFor(() => expect(mirror.open).toHaveBeenCalledWith('serial-b', 'b', expect.any(AbortSignal)), { timeout: 2500 })
    f.set([device('b')])
    await vi.waitFor(() => expect(mirror.stop).toHaveBeenCalledWith('serial-a'), { timeout: 2500 })
    const before = mirror.open.mock.calls.length
    f.set([device('b'), { ...device('a'), id: 'new-discovery-id' }])
    await vi.waitFor(() => expect(mirror.open.mock.calls.length).toBe(before + 1), { timeout: 2500 })
    expect(mirror.open.mock.calls.at(-1)![0]).toBe('serial-a')
  })
  it.each(['idle', 'error'])('does not reopen a continuously connected %s window without explicit activation', async phase => {
    const f = await fixture()
    const unavailable = vi.fn()
    f.host.onDeviceUnavailable = unavailable
    await f.host.activateMirrors(AbortSignal.timeout(5000))
    mirror.inspect.mockResolvedValue({ phase, ready: false })
    const inspections = mirror.inspect.mock.calls.length
    await vi.waitFor(() => expect(mirror.inspect.mock.calls.length).toBeGreaterThan(inspections), { timeout: 2500 })
    expect(unavailable).not.toHaveBeenCalled()
    expect(mirror.open).toHaveBeenCalledTimes(1)
    await f.host.activateMirrors(AbortSignal.timeout(5000))
    expect(mirror.open).toHaveBeenCalledTimes(2)
    f.set([])
    await vi.waitFor(() => expect(unavailable).toHaveBeenCalledWith('serial-a'), { timeout: 2500 })
  })
})
