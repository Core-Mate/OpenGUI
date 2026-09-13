import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { SCRCPY_ASSETS, ScrcpyInstaller } from '../src/scrcpy.ts'
import type { InstalledScrcpy } from '../src/scrcpy.ts'
import { ScrcpyVideoStreams } from '../src/scrcpy-stream.ts'
import type { ScrcpyStreamSink } from '../src/scrcpy-stream.ts'

class ReadyInstaller extends ScrcpyInstaller {
  override async isInstalled(): Promise<boolean> { return true }
  override async ensure(): Promise<InstalledScrcpy> {
    return { root: '/cache', executable: '/cache/scrcpy', server: '/cache/scrcpy-server' }
  }
}

class MissingInstaller extends ReadyInstaller {
  override async isInstalled(): Promise<boolean> { return false }
}

class FailingInstaller extends ReadyInstaller {
  override async ensure(): Promise<InstalledScrcpy> {
    throw new Error('scrcpy failed at /private/tmp/secret')
  }
}

class FakeProcess extends EventEmitter {
  exitCode: number | null = null
  killed = false
  stderr = new PassThrough()
  kill(): boolean {
    this.killed = true
    this.exitCode = 0
    this.emit('exit', 0, 'SIGTERM')
    return true
  }
}

function sink() {
  const listeners: Array<() => void> = []
  return {
    sendText: vi.fn(),
    sendBinary: vi.fn(),
    bufferedBytes: () => 0,
    close: vi.fn(),
    onClose: (listener: () => void) => { listeners.push(listener) },
    disconnect: () => { for (const listener of listeners) listener() },
  } satisfies ScrcpyStreamSink & { disconnect(): void }
}

function setup(maxSources = 4, forwardRegistry: { track: (...args: unknown[]) => Promise<unknown>; release: (...args: unknown[]) => Promise<unknown> } = {
  track: vi.fn(async () => undefined),
  release: vi.fn(async () => true),
}) {
  const children: FakeProcess[] = []
  const sockets: PassThrough[] = []
  const runAdb = vi.fn(async () => '')
  const streams = new ScrcpyVideoStreams({
    asset: SCRCPY_ASSETS['darwin-arm64']!,
    installer: new ReadyInstaller({ cacheDir: '/test-cache' }),
    adbPath: () => '/adb',
    runAdb,
    freePort: async () => 40123 + sockets.length,
    maxSources,
    idleGraceMs: 5,
    forwardRegistry: forwardRegistry as never,
    spawn: vi.fn(() => {
      const child = new FakeProcess()
      children.push(child)
      queueMicrotask(() => child.emit('spawn'))
      return child as never
    }) as never,
    connect: vi.fn(() => {
      const socket = new PassThrough()
      sockets.push(socket)
      queueMicrotask(() => socket.emit('connect'))
      return socket as never
    }) as never,
  })
  return { streams, children, sockets, runAdb }
}

describe('shared embedded scrcpy sources', () => {
  it('keeps asynchronous stream failures private while retaining full diagnostic logs', async () => {
    const diagnostic = vi.fn()
    const target = sink()
    const streams = new ScrcpyVideoStreams({
      asset: SCRCPY_ASSETS['darwin-arm64']!, installer: new FailingInstaller({ cacheDir: '/test-cache' }), adbPath: () => '/adb',
      runAdb: async () => '', forwardRegistry: { track: async () => {}, release: async () => true } as never, onError: diagnostic,
    })
    await streams.subscribe({ id: 'one', serial: 'private' }, target)
    await vi.waitFor(() => expect(target.sendText).toHaveBeenCalledWith(JSON.stringify({
      type: 'error', message: 'video_failed: encoder or device connection failed; reconnect the selected phone and retry video',
    })))
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ message: 'scrcpy failed at /private/tmp/secret' }))
    await streams.dispose()
  })

  it('automatically prepares first-use video without an approval gate', async () => {
    const streams = new ScrcpyVideoStreams({
      asset: SCRCPY_ASSETS['darwin-arm64']!, installer: new MissingInstaller({ cacheDir: '/test-cache' }), adbPath: () => '/adb', runAdb: async () => '', forwardRegistry: { track: async () => {}, release: async () => true } as never,
    })
    await expect(streams.subscribe({ id: 'one', serial: 'private' }, sink())).resolves.toEqual(expect.any(Function))
    await expect(streams.status()).resolves.toMatchObject({ supported: true, approved: true })
    expect(streams.approve()).toBe(true)
    await streams.dispose()
  })

  it('shares one device encoder, forwards metadata and packets, and removes its ADB forward', async () => {
    const { streams, children, sockets, runAdb } = setup()
    const first = sink()
    const second = sink()
    const device = { id: 'opaque-one', serial: 'private-one' }
    const unsubscribeFirst = await streams.subscribe(device, first)
    const unsubscribeSecond = await streams.subscribe(device, second)

    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    const session = Buffer.alloc(12)
    session.writeUInt32BE(0x80000000, 0)
    session.writeUInt32BE(432, 4)
    session.writeUInt32BE(960, 8)
    const body = Buffer.from([0, 0, 0, 1, 0x65, 1])
    const packet = Buffer.alloc(12 + body.length)
    packet.writeBigUInt64BE(0x2000000000000001n, 0)
    packet.writeUInt32BE(body.length, 8)
    body.copy(packet, 12)
    sockets[0]!.write(Buffer.concat([Buffer.from('h264'), session, packet]))

    await vi.waitFor(() => expect(first.sendText).toHaveBeenCalledWith(expect.stringContaining('"width":432')))
    expect(second.sendBinary).toHaveBeenCalledTimes(1)
    expect(children).toHaveLength(1)

    const late = sink()
    const unsubscribeLate = await streams.subscribe(device, late)
    expect(late.sendText).toHaveBeenCalledWith(expect.stringContaining('"width":432'))
    expect(late.sendBinary).toHaveBeenCalledTimes(1)
    unsubscribeFirst()
    unsubscribeSecond()
    unsubscribeLate()
    await new Promise(resolve => setTimeout(resolve, 10))
    await vi.waitFor(() => expect(runAdb).toHaveBeenCalledWith(
      ['-s', 'private-one', 'forward', '--no-rebind', 'tcp:40123', expect.stringMatching(/^localabstract:scrcpy_/u)],
      expect.any(AbortSignal),
    ))
    await streams.dispose()
  })

  it('discards broken reference chains until the next key frame', async () => {
    const { streams, sockets } = setup()
    const slow = sink()
    let queued = 1_500_000
    slow.bufferedBytes = () => queued
    await streams.subscribe({ id: 'opaque', serial: 'private' }, slow)
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    const session = Buffer.alloc(12)
    session.writeUInt32BE(0x80000000, 0)
    session.writeUInt32BE(432, 4)
    session.writeUInt32BE(960, 8)
    const packet = (flags: bigint): Buffer => {
      const value = Buffer.alloc(13)
      value.writeBigUInt64BE(flags, 0)
      value.writeUInt32BE(1, 8)
      value[12] = 1
      return value
    }
    sockets[0]!.write(Buffer.concat([Buffer.from('h264'), session, packet(0x2000000000000001n), packet(2n)]))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(slow.sendBinary).not.toHaveBeenCalled()
    queued = 0
    sockets[0]!.write(packet(3n))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(slow.sendBinary).not.toHaveBeenCalled()
    sockets[0]!.write(packet(0x2000000000000004n))
    await vi.waitFor(() => expect(slow.sendBinary).toHaveBeenCalledTimes(1))
    expect(slow.sendText).toHaveBeenCalledWith(JSON.stringify({ type: 'reset' }))
    await streams.dispose()
  })

  it('caps active device encoders without exposing serials to subscribers', async () => {
    const { streams } = setup(1)
    await streams.subscribe({ id: 'opaque-one', serial: 'private-one' }, sink())
    await expect(streams.subscribe({ id: 'opaque-two', serial: 'private-two' }, sink()))
      .rejects.toThrow('stream_capacity_wait')
    await expect(streams.status()).resolves.toMatchObject({ activeSources: 1, maxSources: 1 })
    await streams.dispose()
  })

  it('waits for closing sources before allocating a replacement encoder', async () => {
    let releaseCleanup!: () => void
    const cleanupGate = new Promise<void>(resolve => { releaseCleanup = resolve })
    const forwardRegistry = {
      track: vi.fn(async () => undefined),
      release: vi.fn()
        .mockImplementationOnce(async () => cleanupGate)
        .mockResolvedValue(true),
    }
    const { streams, sockets } = setup(4, forwardRegistry)
    const device = { id: 'opaque', serial: 'private' }
    const unsubscribe = await streams.subscribe(device, sink())
    await vi.waitFor(() => expect(sockets).toHaveLength(1))

    unsubscribe()
    await vi.waitFor(() => expect(forwardRegistry.release).toHaveBeenCalledTimes(1))
    const replacement = streams.subscribe(device, sink())
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(sockets).toHaveLength(1)
    releaseCleanup()
    await replacement
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    await streams.dispose()
  })

  it('waits for an already-running entry cleanup during disposal', async () => {
    let releaseCleanup!: () => void
    const cleanupGate = new Promise<void>(resolve => { releaseCleanup = resolve })
    const forwardRegistry = {
      track: vi.fn(async () => undefined),
      release: vi.fn(async () => cleanupGate),
    }
    const { streams, sockets } = setup(4, forwardRegistry)
    const unsubscribe = await streams.subscribe({ id: 'opaque', serial: 'private' }, sink())
    await vi.waitFor(() => expect(sockets).toHaveLength(1))

    unsubscribe()
    await vi.waitFor(() => expect(forwardRegistry.release).toHaveBeenCalledTimes(1))
    let disposed = false
    const disposal = streams.dispose().then(() => { disposed = true })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(disposed).toBe(false)

    releaseCleanup()
    await disposal
    expect(disposed).toBe(true)
  })
})
