import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeTakeoverInput } from '../src/scrcpy-control.ts'
import { SCRCPY_ASSETS, ScrcpyInstaller, type InstalledScrcpy } from '../src/scrcpy.ts'
import { ScrcpyVideoStreams, buildScrcpyVideoServerArgs } from '../src/scrcpy-stream.ts'
import type { ScrcpyStreamSink } from '../src/scrcpy-stream.ts'
import { ViewerServer } from '../src/viewer.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'
import { connect } from './viewer-fixture.ts'

const frame = { width: 442, height: 960 }
const cleanups: Array<() => unknown> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

describe('takeover input encoding', () => {
  it('encodes a finger touch in the live frame coordinates', () => {
    const down = encodeTakeoverInput({ type: 'touch', action: 'down', x: 221.4, y: 345.6, ...frame }, frame)!
    expect(down).toHaveLength(32)
    expect([down[0], down[1]]).toEqual([2, 0])
    expect(down.readBigInt64BE(2)).toBe(-2n)
    expect([down.readInt32BE(10), down.readInt32BE(14), down.readUInt16BE(18), down.readUInt16BE(20)]).toEqual([221, 346, 442, 960])
    expect([down.readUInt16BE(22), down.readInt32BE(28)]).toEqual([0xffff, 1])
    const up = encodeTakeoverInput({ type: 'touch', action: 'up', x: 9999, y: -5, ...frame }, frame)!
    expect([up[1], up.readInt32BE(10), up.readInt32BE(14), up.readUInt16BE(22), up.readInt32BE(28)]).toEqual([1, 441, 0, 0, 0])
  })

  it('drops input generated for a different frame size instead of mis-tapping after rotation', () => {
    expect(encodeTakeoverInput({ type: 'touch', action: 'down', x: 10, y: 10, width: 960, height: 442 }, frame)).toBeUndefined()
  })

  it('encodes wheel notches, whitelisted keys and text', () => {
    const scroll = encodeTakeoverInput({ type: 'scroll', x: 10, y: 20, ...frame, dx: 0, dy: -1 }, frame)!
    expect([scroll[0], scroll.length, scroll.readInt16BE(15)]).toEqual([3, 21, -0x800])
    const back = encodeTakeoverInput({ type: 'key', key: 'Back' }, frame)!
    expect([back[0], back[1], back.readInt32BE(2), back[15], back.readInt32BE(16)]).toEqual([0, 0, 4, 1, 4])
    const selectAll = encodeTakeoverInput({ type: 'key', key: 'a', ctrl: true }, frame)!
    expect([selectAll.readInt32BE(2), selectAll.readInt32BE(10)]).toEqual([29, 0x1000])
    const ascii = encodeTakeoverInput({ type: 'text', text: 'Hello 1' }, frame)!
    expect([ascii[0], ascii.readUInt32BE(1), ascii.subarray(5).toString()]).toEqual([1, 7, 'Hello 1'])
    // Chinese and emoji are pasted through the clipboard message, which scrcpy can type.
    expect(encodeTakeoverInput({ type: 'text', text: '你好👋' }, frame)![0]).toBe(9)
    expect(() => encodeTakeoverInput({ type: 'key', key: 'Power' }, frame)).toThrow('unsupported_key')
    expect(() => encodeTakeoverInput({ type: 'shell', command: 'rm' }, frame)).toThrow('invalid_input_event')
    expect(() => encodeTakeoverInput({ type: 'text', text: 'x'.repeat(301) }, frame)).toThrow('invalid_input_event')
  })
})

class ReadyInstaller extends ScrcpyInstaller {
  override async isInstalled(): Promise<boolean> { return true }
  override async ensure(): Promise<InstalledScrcpy> { return { root: '/cache', executable: '/cache/scrcpy', server: '/cache/scrcpy-server' } }
}
class FakeProcess extends EventEmitter {
  exitCode: number | null = null
  killed = false
  stderr = new PassThrough()
  kill(): boolean { this.killed = true; this.exitCode = 0; this.emit('exit', 0, 'SIGTERM'); return true }
}
const sink = (): ScrcpyStreamSink => ({ sendText: vi.fn(), sendBinary: vi.fn(), bufferedBytes: () => 0, close: vi.fn(), onClose: () => {} })

describe('takeover control socket on the live stream', () => {
  it('starts the server with control, reads the dummy byte, then opens the control socket', async () => {
    expect(buildScrcpyVideoServerArgs('00abc123', undefined, true)).toEqual(expect.arrayContaining(['control=true', 'clipboard_autosync=false', 'send_dummy_byte=true']))
    const sockets: PassThrough[] = [], device = { id: 'opaque', serial: 'private' }
    const streams = new ScrcpyVideoStreams({
      asset: SCRCPY_ASSETS['darwin-arm64']!, installer: new ReadyInstaller({ cacheDir: '/test-cache' }), adbPath: () => '/adb', runAdb: vi.fn(async () => ''),
      freePort: async () => 40500, idleGraceMs: 5, control: true, forwardRegistry: { track: vi.fn(async () => undefined), release: vi.fn(async () => true) } as never,
      spawn: vi.fn(() => { const child = new FakeProcess(); queueMicrotask(() => child.emit('spawn')); return child as never }) as never,
      connect: vi.fn(() => { const socket = new PassThrough(); sockets.push(socket); queueMicrotask(() => socket.emit('connect')); return socket as never }) as never,
    })
    cleanups.push(() => streams.dispose())
    const target = sink()
    await streams.subscribe(device, target)
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    expect(streams.inject(device, Buffer.from([1]))).toBe(false)
    sockets[0]!.write(Buffer.from([0]))
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    const session = Buffer.alloc(12); session.writeUInt32BE(0x80000000, 0); session.writeUInt32BE(442, 4); session.writeUInt32BE(960, 8)
    sockets[0]!.write(Buffer.concat([Buffer.from('h264'), session]))
    await vi.waitFor(() => expect(streams.frameSize(device)).toEqual(frame))
    // The dummy byte never reaches the video parser.
    expect(target.sendText).toHaveBeenCalledWith(expect.stringContaining('"width":442'))
    const write = vi.spyOn(sockets[1]!, 'write')
    expect(streams.inject(device, Buffer.from([7, 8]))).toBe(true)
    expect(write).toHaveBeenCalledWith(Buffer.from([7, 8]))
  })
})

async function takeoverFixture() {
  const sinks = new Map<string, ScrcpyStreamSink>(), inject = vi.fn(() => true)
  let size: { width: number; height: number } | undefined = frame
  const viewer = new ViewerServer({ prepare: vi.fn(async () => {}), async subscribe(device, target) { sinks.set(device.id, target); return () => {} }, inject, frameSize: () => size, async dispose() {} })
  const host = new FakeHost(), signal = AbortSignal.timeout(10_000)
  const service = new WorkBuddyOpenGuiService({ host, viewers: viewer })
  cleanups.push(() => service.dispose(), () => viewer.dispose())
  const opened = await service.openViewer(['phone-a'], signal, { objective: 'Fill the form' })
  const page = await connect(opened.url, 'phone-a')
  sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  await service.openSession(['phone-a'], signal, 'control', { viewerId: opened.viewerId })
  const token = new URL(opened.workbenchUrl).hash.slice(7), origin = new URL(opened.url).origin
  const post = (route: string, body: unknown, board = token) => fetch(`${opened.url}${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': board }, body: JSON.stringify(body) })
  const tap = { type: 'touch', action: 'down', x: 100, y: 200, ...frame }
  return { post, inject, tap, resize: (next: typeof size) => { size = next } }
}

describe('takeover input route', () => {
  it('delivers input only while the person has taken over the bound phone', async () => {
    const f = await takeoverFixture()
    expect((await f.post('input', { deviceId: 'phone-a', events: [f.tap] })).status).toBe(409)
    expect(f.inject).not.toHaveBeenCalled()
    expect((await f.post('board', { action: 'takeover' })).status).toBe(200)
    expect((await f.post('input', { deviceId: 'phone-a', events: [f.tap] }, 'wrong')).status).toBe(403)
    expect((await f.post('input', { deviceId: 'phone-b', events: [f.tap] })).status).toBe(400)
    const accepted = await f.post('input', { deviceId: 'phone-a', events: [f.tap, { type: 'key', key: 'Back' }] })
    expect(await accepted.json()).toEqual({ delivered: 2, stale: false })
    expect(f.inject).toHaveBeenCalledTimes(2)
    expect((f.inject.mock.calls[0] as unknown as [unknown, Buffer])[1].readInt32BE(10)).toBe(100)
    // A frame resize between the page's event and delivery is dropped, not mis-tapped.
    f.resize({ width: 960, height: 442 })
    expect(await (await f.post('input', { deviceId: 'phone-a', events: [f.tap] })).json()).toEqual({ delivered: 0, stale: true })
    f.resize(undefined)
    expect((await f.post('input', { deviceId: 'phone-a', events: [f.tap] })).status).toBe(503)
    f.resize(frame)
    expect((await f.post('board', { action: 'resume' })).status).toBe(200)
    const after = await f.post('input', { deviceId: 'phone-a', events: [f.tap] })
    expect(after.status).toBe(409)
    expect((await after.json()).error).toContain('不在接管状态')
    expect(f.inject).toHaveBeenCalledTimes(2)
  })
})
