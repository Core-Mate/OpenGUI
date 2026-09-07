import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({ adb: vi.fn(), mirror: { open: vi.fn(), inspect: vi.fn(), status: vi.fn(), stop: vi.fn(), dispose: vi.fn(), active: vi.fn() } }))
vi.mock('../src/adb.ts', async importOriginal => ({ ...await importOriginal<object>(), assertAdbReady: async () => {}, runAdb: io.adb }))
vi.mock('../src/mirror.ts', () => ({ NativeMirror: class { constructor() { return io.mirror } } }))
import { LocalAdbPhoneHost, WorkBuddyOpenGuiService } from '../src/service.ts'

describe('local host visual control independent of window visibility', () => {
  it('executes with a hidden established window and requires fresh observation after physical reconnect', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'opengui-local-host-test-'))
    const image = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#334155' } }).png().toBuffer()
    let online = true
    let ready = true
    let captureFails = false
    const writes: string[][] = []
    io.adb.mockImplementation(async (_path: string, args: string[]) => {
      if (args[0] === 'devices') return online ? 'List of devices attached\nsynthetic-device device model:Test\n' : 'List of devices attached\n'
      if (args.includes('screencap')) { if (captureFails) throw new Error('capture failed'); return image }
      if (args.includes('wm')) return 'Physical size: 100x200\n'
      if (args.includes('dumpsys')) return 'mCurrentFocus=Window{ u0 com.example/.Main }\n'
      if (args.includes('keyevent')) writes.push(args)
      return ''
    })
    io.mirror.status.mockImplementation(() => ({ phase: 'running', rendererReady: true, visible: ready, ready }))
    io.mirror.inspect.mockImplementation(async () => io.mirror.status())
    const host = new LocalAdbPhoneHost({ stateDir })
    const service = new WorkBuddyOpenGuiService({ host })
    const signal = AbortSignal.timeout(10000)
    try {
      const session = await service.openSession(undefined, signal)
      let frame = await service.observe(session.sessionId, undefined, signal)
      ready = false
      frame = await service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal) as typeof frame
      expect(writes).toHaveLength(1)
      expect(frame.screenshot.mimeType).toBe('image/jpeg')
      online = false
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)).rejects.toThrow('disconnected')
      expect(writes).toHaveLength(1)
      await service.status(session.sessionId, signal)
      online = true
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)).rejects.toThrow('observe again')
      frame = await service.observe(session.sessionId, undefined, signal)
      expect((await service.status(session.sessionId, signal)).devices[0]).toMatchObject({ id: session.devices[0]!.id, connected: true, authorized: true })
      await service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)
      expect(writes).toHaveLength(2)
      captureFails = true
      await expect(service.observe(session.sessionId, undefined, signal)).rejects.toThrow('capture failed')
      await expect(service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)).rejects.toMatchObject({ code: 'observation_required', executionState: 'not_executed' })
      expect(writes).toHaveLength(2)
    } finally {
      await service.dispose()
      await rm(stateDir, { recursive: true, force: true })
      vi.clearAllMocks()
    }
  })
})
