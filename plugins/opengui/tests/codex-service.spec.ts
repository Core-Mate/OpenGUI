import { afterEach, describe, expect, it } from 'vitest'
import { ObservationId } from '../src/adb.ts'
import { CodexOpenGuiService } from '../src/codex/service.ts'
import type { CodexDeviceInfo, CodexPhoneHost, ResolvedCodexDevice } from '../src/codex/service.ts'
import type { RawPhoneObservation } from '../src/phone-controller.ts'

class FakeHost implements CodexPhoneHost {
  readonly devices: ResolvedCodexDevice[] = [
    { id: 'phone-a', name: 'Pixel', model: 'Pixel', serial: 'serial-a', state: 'device', connected: true, authorized: true },
    { id: 'phone-b', name: 'Nubia', model: 'Nubia', serial: 'serial-b', state: 'device', connected: true, authorized: true },
    { id: 'locked', name: 'Locked', serial: 'serial-locked', state: 'unauthorized', connected: true, authorized: false },
  ]
  readonly actors = new WeakMap<object, { serial: string; operations: number; sequence: number }>()
  readonly released: string[] = []

  async listDevices(): Promise<readonly CodexDeviceInfo[]> {
    return this.devices.map(({ serial: _serial, ...device }) => device)
  }

  async resolveDevices(deviceIds: readonly string[] | undefined): Promise<readonly ResolvedCodexDevice[]> {
    const ids = deviceIds ?? ['phone-a']
    return ids.map((id) => {
      const value = this.devices.find(device => device.id === id)
      if (value === undefined || !value.authorized) throw new Error('fake unauthorized device')
      return value
    })
  }

  assignTarget(actor: object, serial: string): void {
    this.actors.set(actor, { serial, operations: 0, sequence: 0 })
  }

  observe(actor: object): Promise<RawPhoneObservation> {
    return Promise.resolve(this.frame(actor))
  }

  act(actor: object): Promise<RawPhoneObservation> {
    return Promise.resolve(this.frame(actor))
  }

  status(actor: object): { operations: number; observationId?: string } {
    const state = this.actors.get(actor)!
    return { operations: state.operations, ...(state.sequence === 0 ? {} : { observationId: `phone-observation-${state.sequence}` }) }
  }

  async preview(): Promise<Buffer> { return Buffer.from('jpeg') }
  async releaseDevice(serial: string): Promise<void> { this.released.push(serial) }
  async dispose(): Promise<void> {}

  private frame(actor: object): RawPhoneObservation {
    const state = this.actors.get(actor)!
    state.operations += 1
    state.sequence += 1
    return {
      observationId: ObservationId(`phone-observation-${state.sequence}`),
      serial: state.serial,
      width: 100,
      height: 200,
      foregroundPackage: 'com.example',
      image: { data: Buffer.from('jpeg'), mediaType: 'image/jpeg', bytes: 4, width: 100, height: 200, name: 'phone.jpg' },
    }
  }
}

const services: CodexOpenGuiService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.dispose())) })

function service(host = new FakeHost()): CodexOpenGuiService {
  let nextSession = 1
  const value = new CodexOpenGuiService({ host, createSessionId: () => `session-${nextSession++}` })
  services.push(value)
  return value
}

describe('Codex OpenGUI session service', () => {
  it('lists authorization state and freezes a one-phone session', async () => {
    const value = service()
    expect(await value.listDevices(new AbortController().signal)).toContainEqual(expect.objectContaining({ id: 'locked', authorized: false }))

    const opened = await value.openSession(['phone-a'], new AbortController().signal)
    expect(opened).toMatchObject({ sessionId: 'session-1', state: 'active', devices: [{ id: 'phone-a', operationCount: 0 }] })
    expect(opened.deviceWallUrl).toMatch(/^http:\/\/127\.0\.0\.1:/u)
    const observed = await value.observe(opened.sessionId, undefined, new AbortController().signal)
    expect(observed).toMatchObject({ deviceId: 'phone-a', observationId: 'phone-observation-1', screenshot: { data: 'anBlZw==' } })
  })

  it('requires device ids for multi-phone actions and prevents overlapping locks', async () => {
    const value = service()
    const opened = await value.openSession(['phone-a', 'phone-b'], new AbortController().signal)
    await expect(value.observe(opened.sessionId, undefined, new AbortController().signal)).rejects.toThrow('deviceId is required')
    await expect(value.openSession(['phone-a'], new AbortController().signal)).rejects.toThrow('already locked')
    await expect(value.observe(opened.sessionId, 'phone-b', new AbortController().signal)).resolves.toMatchObject({ deviceId: 'phone-b' })
  })

  it('requires immediate confirmation for consequential actions', async () => {
    const value = service()
    const opened = await value.openSession(['phone-a'], new AbortController().signal)
    await expect(value.act(opened.sessionId, undefined, {
      action: 'key', observationId: 'phone-observation-1', key: 'Enter', externalSideEffect: 'send',
    }, new AbortController().signal)).rejects.toThrow('explicit user confirmation')

    await expect(value.act(opened.sessionId, undefined, {
      action: 'key', observationId: 'phone-observation-1', key: 'Enter', externalSideEffect: 'send', confirmedExternalSideEffect: true,
    }, new AbortController().signal)).resolves.toMatchObject({ deviceId: 'phone-a' })
  })

  it('cancels active work, releases locks, and keeps final status readable', async () => {
    const host = new FakeHost()
    const value = service(host)
    const opened = await value.openSession(['phone-a'], new AbortController().signal)
    expect((await value.cancel(opened.sessionId)).state).toBe('cancelled')
    expect(host.released).toEqual(['serial-a'])
    await expect(value.observe(opened.sessionId, undefined, new AbortController().signal)).rejects.toThrow('session is cancelled')
    await expect(value.openSession(['phone-a'], new AbortController().signal)).resolves.toMatchObject({ state: 'active' })
  })

  it('refreshes frozen-device connection and authorization state in status', async () => {
    const host = new FakeHost()
    const value = service(host)
    const opened = await value.openSession(['phone-a'], new AbortController().signal)
    host.devices[0] = { ...host.devices[0]!, connected: false, authorized: false, state: 'offline' }

    await expect(value.status(opened.sessionId, new AbortController().signal)).resolves.toMatchObject({
      devices: [{ id: 'phone-a', connected: false, authorized: false }],
    })
  })

  it('rejects zero or more than four frozen devices even when a Host misbehaves', async () => {
    const host = new FakeHost()
    host.resolveDevices = async () => []
    await expect(service(host).openSession(undefined, new AbortController().signal)).rejects.toThrow('one to 4 phones')

    host.resolveDevices = async () => Array.from({ length: 5 }, (_, index) => ({
      id: `p-${index}`, name: `P ${index}`, serial: `s-${index}`, state: 'device', connected: true, authorized: true,
    }))
    await expect(service(host).openSession(undefined, new AbortController().signal)).rejects.toThrow('one to 4 phones')
  })
})
