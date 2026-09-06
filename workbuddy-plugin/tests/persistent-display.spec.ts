import { describe, expect, it, vi } from 'vitest'
import { FakeHost } from './fake-host.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { startBroker } from '../src/broker.ts'
import { BrokerClient } from '../src/broker-client.ts'
import type { MirrorStatus } from '../src/mirror.ts'

class DisplayHost extends FakeHost {
  readonly mirrors = new Map<string, MirrorStatus>()
  onDeviceUnavailable?: (serial: string) => void
  invalidate = vi.fn()
  async activateMirrors(): Promise<void> {
    for (const device of this.devices) if (device.connected && device.authorized) this.mirrors.set(device.serial, { phase: 'running', rendererReady: true, visible: true, ready: true })
  }
  mirrorStatus(serial: string): MirrorStatus { return this.mirrors.get(serial) ?? { phase: 'idle' } }
  async inspectMirror(serial: string): Promise<MirrorStatus> { return this.mirrorStatus(serial) }
  hasMirrors(): boolean { return [...this.mirrors.values()].some(m => m.phase === 'running') }
  async closeMirror(serial: string): Promise<void> { this.mirrors.set(serial, { phase: 'idle', ready: false }); this.onMirrorEnded?.(serial) }
  onMirrorEnded?: (serial: string) => void
}
const signal = (): AbortSignal => AbortSignal.timeout(5000)

describe('persistent device displays', () => {
  it('starts every authorized display without locks or screenshots and reuses it across tasks', async () => {
    const host = new DisplayHost(), service = new WorkBuddyOpenGuiService({ host })
    try {
      await service.listDevices(signal())
      expect(host.mirrors.size).toBe(0)
      const started = await service.start(signal())
      expect(started.devices.filter(d => d.mirror?.ready).map(d => d.id)).toEqual(['phone-a', 'phone-b'])
      const first = await service.openSession(['phone-a'], signal())
      expect(first.devices[0]!.operationCount).toBe(0)
      await service.closeSession(first.sessionId)
      expect(host.hasMirrors()).toBe(true)
      const second = await service.openSession(['phone-a'], signal())
      await service.cancel(second.sessionId)
      expect(host.mirrorStatus('serial-a').ready).toBe(true)
    } finally { await service.dispose() }
  })

  it.each([
    { phase: 'running' as const, visible: false, rendererReady: true, ready: false },
    { phase: 'running' as const, visible: true, rendererReady: false, ready: false },
    { phase: 'error' as const, ready: false, message: 'Permission missing' },
  ])('blocks operations when display evidence is incomplete: %j', async status => {
    const host = new DisplayHost(), service = new WorkBuddyOpenGuiService({ host })
    try {
      host.activateMirrors = async () => { host.mirrors.set('serial-a', status) }
      const session = await service.openSession(['phone-a'], signal())
      host.mirrors.set('serial-a', status)
      await expect(service.observe(session.sessionId, undefined, signal())).rejects.toThrow('waiting_for_display')
      expect((await service.status(session.sessionId, signal())).devices[0]!.operationCount).toBe(0)
    } finally { await service.dispose() }
  })

  it('keeps an established session running after an explicit close but still honors cancellation', async () => {
    const host = new DisplayHost(), service = new WorkBuddyOpenGuiService({ host })
    try {
      const session = await service.openSession(['phone-a'], signal())
      const frame = await service.observe(session.sessionId, undefined, signal())
      await service.deviceMirror('phone-a', true, signal(), new Set([session.sessionId]))
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal())).resolves.toHaveProperty('screenshot')
      expect(host.mirrorStatus('serial-a').phase).toBe('idle')
      await service.cancel(session.sessionId)
      await expect(service.observe(session.sessionId, undefined, signal())).rejects.toThrow('cancelled')
    } finally { await service.dispose() }
  })

  it('invalidates observations on device disconnection, not on window closure', async () => {
    const host = new DisplayHost(), service = new WorkBuddyOpenGuiService({ host })
    try {
      const session = await service.openSession(['phone-a'], signal())
      const frame = await service.observe(session.sessionId, undefined, signal())
      host.onDeviceUnavailable?.('serial-a')
      expect((await service.status(session.sessionId, signal())).activity).toBe('paused')
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal())).rejects.toThrow('observe again')
      expect(host.invalidate).toHaveBeenCalled()
      await service.observe(session.sessionId, undefined, signal())
      expect((await service.status(session.sessionId, signal())).activity).toBe('ready')
    } finally { await service.dispose() }
  })

  it.each([
    { phase: 'running' as const, rendererReady: true, visible: false, ready: false },
    { phase: 'idle' as const, ready: false },
    { phase: 'error' as const, ready: false, message: 'Renderer exited' },
  ])('continues screenshot-driven control after an established display changes: %j', async status => {
    const host = new DisplayHost(), service = new WorkBuddyOpenGuiService({ host })
    try {
      const session = await service.openSession(['phone-a'], signal())
      const frame = await service.observe(session.sessionId, undefined, signal())
      host.mirrors.set('serial-a', status)
      if (status.phase !== 'running') host.onMirrorEnded?.('serial-a')
      expect((await service.status(session.sessionId, signal())).activity).toBe('ready')
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal())).resolves.toHaveProperty('screenshot')
      expect(host.invalidate).not.toHaveBeenCalled()
      expect(host.mirrorStatus('serial-a')).toEqual(status)
      expect((await service.status(session.sessionId, signal())).activity).toBe('ready')
    } finally { await service.dispose() }
  })

  it('does not grant a viewing session control or permit it to close a foreign task display', async () => {
    const host = new DisplayHost(), service = new WorkBuddyOpenGuiService({ host })
    try {
      const viewing = await service.openSession(['phone-a'], signal(), 'mirror')
      const control = await service.openSession(['phone-a'], signal())
      await expect(service.closeMirror(viewing.sessionId, undefined)).rejects.toThrow('another task')
      await service.closeSession(viewing.sessionId)
      expect(host.released).toEqual([])
      await expect(service.observe(control.sessionId, undefined, signal())).resolves.toHaveProperty('observationId')
    } finally { await service.dispose() }
  })

  it('releases disconnected control ownership while retaining displays beyond broker idle', async () => {
    const host = new DisplayHost(), service = new WorkBuddyOpenGuiService({ host })
    const idle = vi.fn(), broker = await startBroker({ token: 'test', port: 0, service, idleMs: 20, onIdle: idle })
    const a = await BrokerClient.connect(broker.port, 'test')
    try {
      await a.call('opengui_open_session', { deviceIds: ['phone-a'] }, signal())
      a.close()
      await vi.waitFor(() => expect(host.released).toEqual(['serial-a']))
      expect(host.hasMirrors()).toBe(true)
      expect(idle).not.toHaveBeenCalled()
      const b = await BrokerClient.connect(broker.port, 'test')
      try { await expect(b.call('opengui_open_session', { deviceIds: ['phone-a'] }, signal())).resolves.toHaveProperty('sessionId') } finally { b.close() }
    } finally { a.close(); await broker.close() }
  })
})
