import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'
import { PhoneExecutionState } from '../src/phone-execution.ts'

const services: WorkBuddyOpenGuiService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.dispose())) })
const signal = () => AbortSignal.timeout(5000)
function setup(host = new FakeHost()) {
  const service = new WorkBuddyOpenGuiService({ host })
  services.push(service)
  return { service, host }
}

describe('session lifecycle race boundaries', () => {
  it('keeps the lease during asynchronous cleanup and never re-cleans a closed session', async () => {
    const { service, host } = setup()
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    host.releaseDevice = vi.fn(async () => barrier)
    const old = await service.openSession(['phone-a'], signal())
    const cancelled = service.cancel(old.sessionId)
    await vi.waitFor(() => expect(host.releaseDevice).toHaveBeenCalledOnce())
    await expect(service.openSession(['phone-a'], signal())).rejects.toThrow('already locked')
    release()
    await cancelled
    await service.openSession(['phone-a'], signal())
    await service.closeSession(old.sessionId)
    expect(host.releaseDevice).toHaveBeenCalledOnce()
  })

  it('rechecks cancellation after device discovery before publishing a lease', async () => {
    const { service, host } = setup()
    const controller = new AbortController()
    const original = host.resolveDevices.bind(host)
    host.resolveDevices = async ids => { const found = await original(ids); controller.abort(new Error('cancel open')); return found }
    await expect(service.openSession(['phone-a'], controller.signal)).rejects.toThrow('cancel open')
    host.resolveDevices = original
    await expect(service.openSession(['phone-a'], signal())).resolves.toHaveProperty('sessionId')
  })

  it('aborts an in-flight operation before releasing its lease', async () => {
    const { service, host } = setup()
    const started = vi.fn()
    host.observe = async (_actor, abort) => new Promise((_resolve, reject) => {
      started()
      abort!.addEventListener('abort', () => reject(abort!.reason), { once: true })
    })
    const opened = await service.openSession(['phone-a'], signal())
    const operation = service.observe(opened.sessionId, undefined, signal())
    const rejected = expect(operation).rejects.toThrow('session cancelled')
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
    await service.cancel(opened.sessionId)
    await rejected
    await expect(service.openSession(['phone-a'], signal())).resolves.toHaveProperty('sessionId')
  })

  it('will not accept new work after disposal', async () => {
    const { service } = setup()
    await service.dispose()
    await expect(service.openSession(['phone-a'], signal())).rejects.toThrow('shutting down')
  })

  it('keeps observation identities unique across actors and consumes failed action frames', () => {
    const execution = new PhoneExecutionState()
    const a = {}, b = {}
    const id = execution.nextObservationId(a)
    expect(execution.nextObservationId(b)).not.toBe(id)
    execution.recordObservation(a, { observationId: id, screenshotFingerprint: 'first' })
    execution.consumeObservation(a)
    expect(() => execution.current(a, id)).toThrow('observe the phone')
  })
})
