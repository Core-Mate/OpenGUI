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

function setup(maxSources = 4) {
  const children: FakeProcess[] = []
  const sockets: PassThrough[] = []
  const runAdb = vi.fn(async () => '')
  const streams = new ScrcpyVideoStreams({
    asset: SCRCPY_ASSETS['darwin-arm64']!,
    installer: new ReadyInstaller(),
    adbPath: () => '/adb',
    runAdb,
    freePort: async () => 40123 + sockets.length,
    maxSources,
    idleGraceMs: 5,
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
  it('requires first-use approval when the verified asset is not cached', async () => {
    const streams = new ScrcpyVideoStreams({
      asset: SCRCPY_ASSETS['darwin-arm64']!, installer: new MissingInstaller(), adbPath: () => '/adb', runAdb: async () => '',
    })
    await expect(streams.subscribe({ id: 'one', serial: 'private', label: 'Pixel' }, sink())).rejects.toThrow('stream_download_not_approved')
    expect(streams.approve()).toBe(true)
    await streams.dispose()
  })

  it('shares one device encoder, forwards metadata and packets, and removes its ADB forward', async () => {
    const { streams, children, sockets, runAdb } = setup()
    const first = sink()
    const second = sink()
    const device = { id: 'opaque-one', serial: 'private-one', label: 'Pixel' }
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
      ['-s', 'private-one', 'forward', '--remove', 'tcp:40123'], expect.any(AbortSignal),
    ))
    await streams.dispose()
  })

  it('drops backpressured delta packets but preserves key frames', async () => {
    const { streams, sockets } = setup()
    const slow = sink()
    slow.bufferedBytes = () => 2_000_000
    await streams.subscribe({ id: 'opaque', serial: 'private', label: 'Pixel' }, slow)
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
    await vi.waitFor(() => expect(slow.sendBinary).toHaveBeenCalledTimes(1))
    await streams.dispose()
  })

  it('caps active device encoders without exposing serials to subscribers', async () => {
    const { streams } = setup(1)
    await streams.subscribe({ id: 'opaque-one', serial: 'private-one', label: 'One' }, sink())
    await expect(streams.subscribe({ id: 'opaque-two', serial: 'private-two', label: 'Two' }, sink()))
      .rejects.toThrow('stream_capacity_wait')
    await expect(streams.status()).resolves.toMatchObject({ activeSources: 1, maxSources: 1 })
    await streams.dispose()
  })
})
