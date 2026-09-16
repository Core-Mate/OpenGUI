import { describe, expect, it, vi } from 'vitest'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

describe('video authorization at the phone boundary', () => {
  it('sends zero phone observations or actions before a real page receipt', async () => {
    const { viewer, sinks } = setup(), host = new FakeHost()
    const observe = vi.spyOn(host, 'observe'), act = vi.spyOn(host, 'act')
    const service = new WorkBuddyOpenGuiService({ host, viewers: viewer })
    const signal = AbortSignal.timeout(5000)
    try {
      await expect(service.openSession(['phone-a'], signal)).rejects.toThrow('display_required')
      const opened = await service.openViewer(['phone-a'], signal)
      const session = await service.openSession(['phone-a'], signal, 'control', { viewerId: opened.viewerId })
      await expect(service.observe(session.sessionId, undefined, signal)).rejects.toThrow('waiting_for_frame')
      expect(observe).not.toHaveBeenCalled(); expect(act).not.toHaveBeenCalled()
      const page = await connect(opened.url, 'phone-a')
      sinks.get('phone-a')!.sendBinary(Buffer.from([2]))
      expect((await page.receipt({ visible: false })).status).toBe(409)
      await expect(service.observe(session.sessionId, undefined, signal)).rejects.toThrow('waiting_for_frame')
      expect(observe).not.toHaveBeenCalled(); expect(act).not.toHaveBeenCalled()
      await page.receipt()
      const frame = await service.observe(session.sessionId, undefined, signal)
      viewer.closeViewer(opened.viewerId, 'local')
      await service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId, externalSideEffect: 'none' }, signal)
      expect(act).toHaveBeenCalledTimes(1)
      await service.cancel(session.sessionId)
      await expect(service.observe(session.sessionId, undefined, signal)).rejects.toThrow('cancelled')
    } finally { await service.dispose() }
  })
})
