import { afterEach, describe, expect, it } from 'vitest'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'

const services: WorkBuddyOpenGuiService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.dispose())) })

function service(host = new FakeHost()): WorkBuddyOpenGuiService {
  let nextSession = 1
  const value = new WorkBuddyOpenGuiService({ host, createSessionId: () => `session-${nextSession++}` })
  services.push(value)
  return value
}

describe('WorkBuddy OpenGUI session service', () => {
  it('preserves the legacy host adapter without capturing images', async () => {
    const opened: string[] = []
    const host = Object.assign(new FakeHost(), {
      openMirror: async (device: { serial: string }) => { opened.push(device.serial) },
    })
    const value = service(host)
    const session = await value.openSession(['phone-a', 'phone-b'], new AbortController().signal)
    expect(opened).toEqual(['serial-a', 'serial-b'])
    expect(session.devices.map(device => device.operationCount)).toEqual([0, 0])
    expect((await value.closeMirror(session.sessionId, 'phone-a')).state).toBe('active')
    await value.closeSession(session.sessionId)
    expect(host.released).toEqual(['serial-a', 'serial-b'])
    await value.openSession(['phone-a'], new AbortController().signal, 'mirror')
    expect(opened).toHaveLength(2)
  })

  it('blocks phone operations when automatic mirroring fails', async () => {
    const host = Object.assign(new FakeHost(), {
      openMirror: async () => { throw new Error('unsupported desktop') },
      inspectMirror: async () => ({ phase: 'error' as const, ready: false }),
    })
    const value = service(host)
    const opened = await value.openSession(['phone-a'], new AbortController().signal)
    expect(opened).toMatchObject({ state: 'active', lastError: expect.stringContaining('unsupported desktop') })
    await expect(value.observe(opened.sessionId, undefined, new AbortController().signal)).rejects.toThrow('waiting_for_display')
  })
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
    }, new AbortController().signal)).rejects.toThrow('observe the current phone')

    await value.observe(opened.sessionId, undefined, new AbortController().signal)
    await expect(value.act(opened.sessionId, undefined, {
      action: 'key', observationId: 'phone-observation-1', key: 'Enter', externalSideEffect: 'send',
    }, new AbortController().signal)).resolves.toMatchObject({ status: 'confirmation_required' })

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
