import assert from 'node:assert/strict'
import type { PhoneController, PhoneControllerOptions } from '../src/phone-controller.ts'
import { jpeg } from './image-fixture.ts'

type Test = (name: string, body: () => Promise<void>) => unknown

/** Run the same fault-injection contract against both production host adapters. */
export function controllerContract(it: Test, create: (options: PhoneControllerOptions) => PhoneController): void {
  function fixture() {
    const png = Buffer.alloc(24)
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(png)
    png.writeUInt32BE(2, 16); png.writeUInt32BE(2, 20)
    let failCapture = false
    let failAfterDispatch = false
    let dispatched = 0
    const controller = create({
      runAdb: async args => {
        if (args.includes('screencap')) {
          if (failCapture) throw new Error('injected capture failure')
          return png
        }
        if (args.includes('wm')) return 'Physical size: 2x2'
        if (args.includes('dumpsys')) return 'mCurrentFocus=Window{ u0 com.example/.Main }'
        if (args.includes('keyevent')) { dispatched++; if (failAfterDispatch) failCapture = true }
        return ''
      },
      discoverTarget: async () => 'test-device', pasteUnicode: async () => {},
      encodeScreenshot: async () => ({ data: jpeg, width: 2, height: 2 }),
      maxOperations: () => 100, settleIntervalMs: 1, settleTimeoutMs: 3,
    })
    const actor = {}
    const signal = AbortSignal.timeout(5000)
    return { controller, actor, signal, dispatched: () => dispatched,
      failCapture: () => { failCapture = true },
      failAfterDispatch: () => { failAfterDispatch = true },
    }
  }

  it('rejects out-of-budget waits before waiting or dispatching', async () => {
    for (const waitMs of [0, 10_001]) {
      const f = fixture()
      const before = await f.controller.observe(f.actor, f.signal)
      await assert.rejects(f.controller.execute(f.actor, {
        action: 'wait', observationId: before.observationId, waitMs,
      }, f.signal), /waitMs/)
      assert.equal(f.dispatched(), 0)
    }
  })

  it('revokes an observation when a later read fails before any action', async () => {
    const f = fixture()
    const before = await f.controller.observe(f.actor, f.signal)
    f.failCapture()
    await assert.rejects(f.controller.observe(f.actor, f.signal), /capture failure/)
    await assert.rejects(f.controller.execute(f.actor, { action: 'key', key: 'Home', observationId: before.observationId }, f.signal), /observe the phone/)
    assert.equal(f.dispatched(), 0)
  })

  it('classifies dispatched capture failure as unknown and refuses replay', async () => {
    const f = fixture()
    const before = await f.controller.observe(f.actor, f.signal)
    f.failAfterDispatch()
    const action = { action: 'key', key: 'Home', observationId: before.observationId }
    await assert.rejects(f.controller.execute(f.actor, action, f.signal), { executionState: 'outcome_unknown' })
    await assert.rejects(f.controller.execute(f.actor, action, f.signal), { executionState: 'not_executed' })
    assert.equal(f.dispatched(), 1)
  })

  it('serializes racing actions and consumes their shared observation once', async () => {
    const f = fixture()
    const before = await f.controller.observe(f.actor, f.signal)
    const action = { action: 'key', key: 'Home', observationId: before.observationId }
    const results = await Promise.allSettled([
      f.controller.execute(f.actor, action, f.signal),
      f.controller.execute(f.actor, action, f.signal),
    ])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(f.dispatched(), 1)
  })

  it('never dispatches a request cancelled before it acquires execution', async () => {
    const f = fixture()
    const before = await f.controller.observe(f.actor, f.signal)
    const abort = new AbortController(); abort.abort(new Error('test cancelled'))
    await assert.rejects(f.controller.execute(f.actor, { action: 'key', key: 'Home', observationId: before.observationId }, abort.signal), /cancelled/)
    assert.equal(f.dispatched(), 0)
  })
}
