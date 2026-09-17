import assert from 'node:assert/strict'
import { SessionRuntime, type RuntimeSession } from '../src/session-runtime.ts'

type Test = (name: string, body: () => Promise<void>) => unknown
const session = (id: string, serial = 'serial-a'): RuntimeSession => ({
  id, state: 'active', controller: new AbortController(), pending: new Set(),
  devices: [{ device: { id: 'phone-a', serial } }],
})

export function sessionContract(it: Test): void {
  it('keeps device ownership until in-flight work and cleanup have drained', async () => {
    const runtime = new SessionRuntime()
    const a = session('a'); runtime.register(a, true)
    let finish!: () => void
    let entered!: () => void
    const enteredPromise = new Promise<void>(resolve => { entered = resolve })
    const task = runtime.track(a, async () => { entered(); await new Promise<void>(resolve => { finish = resolve }) })
    await enteredPromise
    a.state = 'closed'; a.controller.abort()
    let releases = 0
    const cleanup = runtime.drain(a, async () => { releases++ })
    assert.equal(runtime.drain(a, async () => { releases++ }), cleanup)
    assert.throws(() => runtime.register(session('b'), true), /locked/)
    finish(); await task; await cleanup
    assert.equal(releases, 1)
    runtime.register(session('b'), true)
    runtime.release(a)
    assert.equal(runtime.locks.get('serial-a'), 'b')
  })

  it('does not release a new owner when a session id is reused', async () => {
    const runtime = new SessionRuntime()
    const old = session('same'); runtime.register(old, true)
    runtime.release(old); runtime.sessions.delete(old.id)
    const current = session('same'); runtime.register(current, true)
    runtime.release(old)
    assert.equal(runtime.locks.get('serial-a'), 'same')
    runtime.release(current)
    assert.equal(runtime.locks.size, 0)
  })

  it('rejects conflicting multi-device admission without claiming any device', async () => {
    const runtime = new SessionRuntime()
    runtime.register(session('a'), true)
    const b = session('b', 'serial-b')
    const multi = { ...b, devices: [...b.devices, ...session('other').devices] }
    assert.throws(() => runtime.register(multi, true), /locked/)
    assert.equal(runtime.sessions.has('b'), false)
    assert.equal(runtime.locks.has('serial-b'), false)
    assert.throws(() => runtime.register({ ...b, devices: [...b.devices, ...b.devices] }, true), /same phone/)
  })

  it('keeps independent runtime instances and prevents admission after cancellation', async () => {
    const first = new SessionRuntime(), second = new SessionRuntime()
    const a = session('a'), b = session('b')
    first.register(a, true); second.register(b, true)
    a.state = 'cancelled'; a.controller.abort(new Error('cancelled'))
    let dispatched = false
    await assert.rejects(first.track(a, async () => { dispatched = true }), /cancelled/)
    await first.drain(a, async () => {})
    assert.equal(dispatched, false)
    assert.equal(second.locks.get('serial-a'), 'b')
  })
}
