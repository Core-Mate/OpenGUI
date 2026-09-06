import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { WorkBuddyOpenGuiService, createControlTask } from '../src/service.ts'
import { OpenGuiError } from '../src/errors.ts'
import { frameChanged, sampleFrame } from '../src/vision.ts'
import { FakeHost } from './fake-host.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => { vi.useRealTimers(); for (const close of cleanup.splice(0)) await close() })
const signal = () => AbortSignal.timeout(5000)
function fixture(leaseMs = 600_000) {
  const host = new FakeHost()
  const service = new WorkBuddyOpenGuiService({ host, leaseMs })
  cleanup.push(() => service.dispose())
  return { host, service }
}

describe('task execution evidence', () => {
  it('invalidates completion evidence after a failed refresh', async () => {
    const { host, service } = fixture()
    const session = await service.openSession(['phone-a'], signal())
    const before = await service.observe(session.sessionId, undefined, signal())
    host.observe = async () => { throw new Error('capture failed') }
    await expect(service.observe(session.sessionId, undefined, signal())).rejects.toThrow('capture failed')
    await expect(service.closeSession(session.sessionId, { outcome: 'completed', evidenceObservationIds: [before.observationId] })).rejects.toMatchObject({ code: 'completion_unverified' })
  })
  it('does not clear one phone unknown result after another phone is observed', async () => {
    const { host, service } = fixture()
    const session = await service.openSession(['phone-a', 'phone-b'], signal())
    const before = await service.observe(session.sessionId, 'phone-a', signal())
    host.act = async () => { throw new OpenGuiError('capture_failed', 'Action sent; result capture failed', 'outcome_unknown', 'observe') }
    await expect(service.act(session.sessionId, 'phone-a', { action: 'key', key: 'Home', observationId: before.observationId }, signal())).rejects.toThrow()
    const second = await service.observe(session.sessionId, 'phone-b', signal())
    expect(service.snapshotSession(session.sessionId).activity).toBe('result_unknown')
    await expect(service.closeSession(session.sessionId, { outcome: 'completed', evidenceObservationIds: [before.observationId, second.observationId] })).rejects.toThrow('latest observed')
    const fresh = await service.observe(session.sessionId, 'phone-a', signal())
    await expect(service.closeSession(session.sessionId, { outcome: 'completed', evidenceObservationIds: [fresh.observationId, second.observationId] })).resolves.toMatchObject({ result: { outcome: 'completed' } })
  })
  it('expires idle control even when status is polled and waits for in-flight cleanup', async () => {
    const { host, service } = fixture(40)
    const session = await service.openSession(['phone-a'], signal())
    await service.status(session.sessionId, signal())
    await vi.waitFor(() => expect(service.snapshotSession(session.sessionId).state).toBe('closed'))
    expect(service.snapshotSession(session.sessionId).result?.outcome).toBe('blocked')
    expect(host.released).toEqual(['serial-a'])
  })
  it('retains the logical execution actor but revokes old observations on recovery', async () => {
    const { host, service } = fixture()
    const task = createControlTask()
    const invalidate = vi.fn()
    Object.assign(host, { invalidate })
    const first = await service.openSession(['phone-a'], signal(), 'control', { task })
    const actor = task.actors.get('serial-a')
    await service.closeSession(first.sessionId)
    const second = await service.openSession(['phone-a'], signal(), 'control', { task, skipActivation: true })
    expect(task.actors.get('serial-a')).toBe(actor)
    expect(invalidate).toHaveBeenCalledWith(actor)
    await expect(service.act(second.sessionId, undefined, { observationId: 'old', action: 'key', key: 'Home' }, signal())).rejects.toMatchObject({ code: 'observation_required' })
  })
})

describe('normalized visual differences', () => {
  it('ignores tiny clock noise globally but detects changes inside the tap region', async () => {
    const base = await sharp({ create: { width: 256, height: 512, channels: 3, background: '#333333' } }).png().toBuffer()
    const patch = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer()
    const changed = await sharp(base).composite([{ input: patch, left: 10, top: 10 }]).png().toBuffer()
    const [a, b] = await Promise.all([sampleFrame(base), sampleFrame(changed)])
    expect(frameChanged(a, b)).toBe(false)
    expect(frameChanged(a, b, { left: 0, top: 0, right: 0.1, bottom: 0.05 })).toBe(true)
  })
})
