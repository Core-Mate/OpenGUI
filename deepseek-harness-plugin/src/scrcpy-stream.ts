import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { connect, createServer } from 'node:net'
import type { Socket } from 'node:net'
import type { FleetDevice } from './device-fleet.ts'
import { OwnedForwardRegistry } from './forward-registry.ts'
import type { OwnedForward } from './forward-registry.ts'
import {
  SCRCPY_VERSION,
  type ScrcpyAsset,
  ScrcpyInstaller,
  resolveScrcpyAsset,
} from './scrcpy.ts'

const SCRCPY_REMOTE_SERVER = '/data/local/tmp/coremate-mobile-scrcpy-server.jar'
const SESSION_PACKET_FLAG = 0x8000000000000000n
const CONFIG_PACKET_FLAG = 0x4000000000000000n
const KEY_PACKET_FLAG = 0x2000000000000000n
const PTS_MASK = 0x1fffffffffffffffn

export type ScrcpyVideoEvent = {
  readonly type: 'codec'
  readonly codec: 'h264'
} | {
  readonly type: 'session'
  readonly width: number
  readonly height: number
  readonly clientResized: boolean
} | {
  readonly type: 'packet'
  readonly config: boolean
  readonly key: boolean
  readonly pts: bigint
  readonly data: Buffer
}

/** Incremental parser for scrcpy 4.1 stream metadata and H.264 media packets. */
export class ScrcpyVideoPacketParser {
  private buffer = Buffer.alloc(0)
  private codecRead = false

  push(chunk: Buffer): ScrcpyVideoEvent[] {
    if (chunk.length > 0) this.buffer = Buffer.concat([this.buffer, chunk])
    const events: ScrcpyVideoEvent[] = []
    if (!this.codecRead) {
      if (this.buffer.length < 4) return events
      const codec = this.buffer.subarray(0, 4).toString('ascii')
      if (codec !== 'h264') throw new Error(`coremate-mobile: unsupported scrcpy video codec ${codec}`)
      this.codecRead = true
      this.buffer = this.buffer.subarray(4)
      events.push({ type: 'codec', codec: 'h264' })
    }
    while (this.buffer.length >= 12) {
      const flagsAndPts = this.buffer.readBigUInt64BE(0)
      if ((flagsAndPts & SESSION_PACKET_FLAG) !== 0n) {
        const flags = this.buffer.readUInt32BE(0)
        const width = this.buffer.readUInt32BE(4)
        const height = this.buffer.readUInt32BE(8)
        if (width < 1 || height < 1 || width > 16_384 || height > 16_384) {
          throw new Error(`coremate-mobile: invalid scrcpy video size ${width}x${height}`)
        }
        this.buffer = this.buffer.subarray(12)
        events.push({ type: 'session', width, height, clientResized: (flags & 1) === 1 })
        continue
      }
      const size = this.buffer.readUInt32BE(8)
      if (size > 16 * 1024 * 1024) throw new Error('coremate-mobile: scrcpy video packet exceeds 16 MiB')
      if (this.buffer.length < 12 + size) break
      const data = Buffer.from(this.buffer.subarray(12, 12 + size))
      this.buffer = this.buffer.subarray(12 + size)
      events.push({
        type: 'packet',
        config: (flagsAndPts & CONFIG_PACKET_FLAG) !== 0n,
        key: (flagsAndPts & KEY_PACKET_FLAG) !== 0n,
        pts: flagsAndPts & PTS_MASK,
        data,
      })
    }
    return events
  }
}

/** Fixed read-only server options for the embedded low-latency stream. */
export function buildScrcpyVideoServerArgs(scid: string, serverPath = SCRCPY_REMOTE_SERVER): string[] {
  return [
    `CLASSPATH=${serverPath}`,
    'app_process', '/', 'com.genymobile.scrcpy.Server', SCRCPY_VERSION,
    `scid=${scid}`,
    'tunnel_forward=true',
    'video=true',
    'audio=false',
    'control=false',
    'cleanup=false',
    'video_codec=h264',
    'max_size=960',
    'max_fps=30',
    'video_bit_rate=2000000',
    'send_dummy_byte=false',
    'send_device_meta=false',
    'send_stream_meta=true',
    'send_frame_meta=true',
  ]
}

export interface ScrcpyStreamSink {
  sendText(text: string): void
  sendBinary(data: Buffer): void
  bufferedBytes(): number
  close(code?: number, reason?: string): void
  onClose(listener: () => void): void
}

export interface ScrcpyStreamStatus {
  supported: boolean
  cached: boolean
  approved: boolean
  phase: 'idle' | 'downloading' | 'extracting' | 'ready' | 'error'
  version: string
  totalBytes?: number
  downloadedBytes?: number
  activeSources: number
  maxSources: number
  message?: string
}

type AdbRunner = (args: readonly string[], signal: AbortSignal) => Promise<unknown>

interface StreamEntry {
  readonly device: FleetDevice
  readonly subscribers: Set<ScrcpyStreamSink>
  readonly controller: AbortController
  operation: Promise<void>
  socket?: Socket
  process?: ChildProcess
  port?: number
  forward?: OwnedForward
  idleTimer: ReturnType<typeof setTimeout> | undefined
  lastCodec?: string
  lastSession?: string
  replay: Buffer[]
  replayBytes: number
  closeCode: number
  closeReason: string
  closed: boolean
  closing?: Promise<void>
}

export interface ScrcpyVideoStreamsOptions {
  adbPath: () => string
  runAdb: AdbRunner
  installer?: ScrcpyInstaller
  asset?: ScrcpyAsset
  spawn?: typeof spawn
  connect?: typeof connect
  freePort?: () => Promise<number>
  idleGraceMs?: number
  maxSources?: number
  onError?: (error: unknown) => void
  forwardRegistry?: OwnedForwardRegistry
}

/** Shares one scrcpy encoder per device across same-origin browser subscribers. */
export class ScrcpyVideoStreams {
  private readonly installer: ScrcpyInstaller
  private readonly asset: ScrcpyAsset | undefined
  private readonly spawnImpl: typeof spawn
  private readonly connectImpl: typeof connect
  private readonly freePort: () => Promise<number>
  private readonly idleGraceMs: number
  private readonly maxSources: number
  private readonly onError: (error: unknown) => void
  private readonly forwardRegistry: OwnedForwardRegistry
  private readonly entries = new Map<string, StreamEntry>()
  private readonly lifetime = new AbortController()
  private approved = false
  private phase: ScrcpyStreamStatus['phase'] = 'idle'
  private downloadedBytes: number | undefined
  private message: string | undefined

  constructor(private readonly options: ScrcpyVideoStreamsOptions) {
    this.installer = options.installer ?? new ScrcpyInstaller()
    this.asset = options.asset ?? resolveScrcpyAsset()
    this.spawnImpl = options.spawn ?? spawn
    this.connectImpl = options.connect ?? connect
    this.freePort = options.freePort ?? availableTcpPort
    this.idleGraceMs = options.idleGraceMs ?? 5_000
    this.maxSources = options.maxSources ?? 4
    this.onError = options.onError ?? (() => {})
    this.forwardRegistry = options.forwardRegistry ?? new OwnedForwardRegistry()
  }

  approve(): boolean {
    if (this.asset === undefined) return false
    this.approved = true
    return true
  }

  async status(): Promise<ScrcpyStreamStatus> {
    const cached = this.asset !== undefined && await this.installer.isInstalled(this.asset)
    if (cached && this.phase === 'idle') this.phase = 'ready'
    return {
      supported: this.asset !== undefined,
      cached,
      approved: cached || this.approved,
      phase: cached && this.phase === 'idle' ? 'ready' : this.phase,
      version: SCRCPY_VERSION,
      ...(this.asset === undefined ? {} : { totalBytes: this.asset.bytes }),
      ...(this.downloadedBytes === undefined ? {} : { downloadedBytes: this.downloadedBytes }),
      activeSources: this.entries.size,
      maxSources: this.maxSources,
      ...(this.message === undefined ? {} : { message: this.message }),
    }
  }

  async subscribe(device: FleetDevice, sink: ScrcpyStreamSink): Promise<() => void> {
    if (this.lifetime.signal.aborted) throw new Error('stream_disposed')
    const asset = this.asset
    if (asset === undefined) throw new Error('stream_unsupported')
    const installed = await this.installer.isInstalled(asset)
    if (!installed && !this.approved) throw new Error('stream_download_not_approved')

    let entry = this.entries.get(device.id)
    if (entry?.closed === true) {
      if (this.entries.get(device.id) === entry) this.entries.delete(device.id)
      entry = undefined
    }
    if (entry === undefined) {
      if (this.entries.size >= this.maxSources) throw new Error('stream_capacity_wait')
      const controller = new AbortController()
      entry = {
        device,
        subscribers: new Set(),
        controller,
        operation: Promise.resolve(),
        idleTimer: undefined,
        replay: [],
        replayBytes: 0,
        closeCode: 1000,
        closeReason: 'stream stopped',
        closed: false,
      }
      this.entries.set(device.id, entry)
      entry.operation = this.start(entry, asset).catch(error => {
        if (!entry!.controller.signal.aborted) {
          this.phase = 'error'
          this.message = error instanceof Error ? error.message : String(error)
          this.onError(error)
          this.broadcastText(entry!, { type: 'error', message: this.publicError(error) })
          entry!.closeCode = 1011
          entry!.closeReason = 'stream failed'
        }
      }).finally(() => {
        void this.closeEntry(entry!)
      })
    }
    if (entry.idleTimer !== undefined) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = undefined
    }
    entry.subscribers.add(sink)
    if (entry.lastCodec !== undefined) sink.sendText(entry.lastCodec)
    if (entry.lastSession !== undefined) sink.sendText(entry.lastSession)
    for (const frame of entry.replay) sink.sendBinary(frame)
    return () => this.unsubscribe(entry!, sink)
  }

  async dispose(): Promise<void> {
    if (!this.lifetime.signal.aborted) this.lifetime.abort(new Error('coremate-mobile: stream manager disposed'))
    await Promise.allSettled([...this.entries.values()].map(entry => this.closeEntry(entry)))
  }

  private unsubscribe(entry: StreamEntry, sink: ScrcpyStreamSink): void {
    entry.subscribers.delete(sink)
    if (entry.subscribers.size > 0 || entry.closed || entry.idleTimer !== undefined) return
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined
      if (entry.subscribers.size === 0) void this.closeEntry(entry)
    }, this.idleGraceMs)
  }

  private async start(entry: StreamEntry, asset: ScrcpyAsset): Promise<void> {
    const signal = AbortSignal.any([entry.controller.signal, this.lifetime.signal])
    this.phase = 'downloading'
    this.message = undefined
    const installed = await this.installer.ensure(asset, signal, progress => {
      this.phase = progress.phase
      this.downloadedBytes = progress.downloadedBytes
      this.broadcastText(entry, { type: 'install', phase: progress.phase, downloadedBytes: progress.downloadedBytes, totalBytes: progress.totalBytes })
    })
    this.phase = 'ready'
    this.downloadedBytes = undefined
    signal.throwIfAborted()

    const port = await this.freePort()
    entry.port = port
    const scid = (randomBytes(4).readUInt32BE(0) & 0x7fffffff).toString(16).padStart(8, '0')
    const forward: OwnedForward = { serial: entry.device.serial, port, scid, kind: 'video-stream' }
    await this.options.runAdb(['-s', entry.device.serial, 'push', installed.server, SCRCPY_REMOTE_SERVER], signal)
    try {
      await this.forwardRegistry.track(forward)
      entry.forward = forward
      await this.options.runAdb([
        '-s', entry.device.serial, 'forward', '--no-rebind', `tcp:${port}`, `localabstract:scrcpy_${scid}`,
      ], signal)
    } catch (error) {
      await this.forwardRegistry.release(forward, this.options.runAdb).catch(() => false)
      throw error
    }

    const child = this.spawnImpl(this.options.adbPath(), [
      '-s', entry.device.serial, 'shell', ...buildScrcpyVideoServerArgs(scid),
    ], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    entry.process = child
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr = `${stderr}${String(chunk)}`.slice(-2_000) })
    await waitForSpawn(child, signal)
    const socket = await connectVideo(this.connectImpl, port, signal)
    entry.socket = socket
    const parser = new ScrcpyVideoPacketParser()
    socket.on('data', chunk => {
      try {
        for (const event of parser.push(Buffer.from(chunk))) this.broadcastEvent(entry, event)
      } catch (error) {
        this.broadcastText(entry, { type: 'error', message: this.publicError(error) })
        void this.closeEntry(entry)
      }
    })
    const settled = new Promise<void>((resolve, reject) => {
      let socketCloseTimer: ReturnType<typeof setTimeout> | undefined
      const rejectSocketClose = (): void => {
        socketCloseTimer = setTimeout(() => {
          reject(new Error(`scrcpy video socket closed unexpectedly${stderr.trim() ? `: ${stderr.trim()}` : ''}`))
        }, 150)
      }
      socket.once('error', reject)
      socket.once('close', () => signal.aborted ? resolve() : rejectSocketClose())
      child.once('exit', (code, exitSignal) => {
        if (socketCloseTimer !== undefined) clearTimeout(socketCloseTimer)
        if (entry.controller.signal.aborted) resolve()
        else reject(new Error(`scrcpy video server exited (code=${String(code)}, signal=${String(exitSignal)})${stderr.trim() ? `: ${stderr.trim()}` : ''}`))
      })
      signal.addEventListener('abort', () => {
        if (socketCloseTimer !== undefined) clearTimeout(socketCloseTimer)
        resolve()
      }, { once: true })
    })
    await settled
  }

  private broadcastEvent(entry: StreamEntry, event: ScrcpyVideoEvent): void {
    if (event.type === 'packet') {
      const frame = this.packetFrame(event)
      if (event.config) {
        entry.replay.push(frame)
        entry.replayBytes += frame.byteLength
      } else if (event.key) {
        entry.replay = [...entry.replay.filter(packet => (packet[0]! & 1) !== 0), frame]
        entry.replayBytes = entry.replay.reduce((total, packet) => total + packet.byteLength, 0)
      } else if (entry.replay.some(packet => (packet[0]! & 2) !== 0)) {
        if (entry.replayBytes + frame.byteLength <= 8 * 1024 * 1024) {
          entry.replay.push(frame)
          entry.replayBytes += frame.byteLength
        } else {
          entry.replay = entry.replay.filter(packet => (packet[0]! & 1) !== 0)
          entry.replayBytes = entry.replay.reduce((total, packet) => total + packet.byteLength, 0)
        }
      }
      for (const sink of entry.subscribers) {
        if (!event.config && !event.key && sink.bufferedBytes() > 1_000_000) continue
        sink.sendBinary(frame)
      }
      return
    }
    const text = JSON.stringify(event)
    if (event.type === 'codec') entry.lastCodec = text
    else {
      entry.lastSession = text
      entry.replay = []
      entry.replayBytes = 0
    }
    for (const sink of entry.subscribers) sink.sendText(text)
  }

  private packetFrame(event: Extract<ScrcpyVideoEvent, { type: 'packet' }>): Buffer {
    const frame = Buffer.allocUnsafe(9 + event.data.length)
    frame[0] = (event.config ? 1 : 0) | (event.key ? 2 : 0)
    frame.writeBigUInt64BE(event.pts, 1)
    event.data.copy(frame, 9)
    return frame
  }

  private broadcastText(entry: StreamEntry, value: unknown): void {
    const text = JSON.stringify(value)
    for (const sink of entry.subscribers) sink.sendText(text)
  }

  private closeEntry(entry: StreamEntry): Promise<void> {
    if (entry.closing !== undefined) return entry.closing
    if (entry.closed) return Promise.resolve()
    entry.closed = true
    const closing = (async (): Promise<void> => {
      if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer)
      entry.controller.abort(new Error('coremate-mobile: embedded stream stopped'))
      entry.socket?.destroy()
      const child = entry.process
      if (child !== undefined && child.exitCode === null) await terminateChild(child)
      if (entry.forward !== undefined) await this.forwardRegistry.release(entry.forward, this.options.runAdb)
      if (this.entries.get(entry.device.id) === entry) this.entries.delete(entry.device.id)
      for (const sink of entry.subscribers) sink.close(entry.closeCode, entry.closeReason)
      entry.subscribers.clear()
    })()
    entry.closing = closing
    return closing
  }

  private publicError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.replaceAll(/(?:[A-Za-z]:\\|\/)[^\s:]+/gu, '<local-path>')
  }
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  if (!child.killed) child.kill('SIGTERM')
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<false>(resolve => setTimeout(() => resolve(false), 2_000)),
  ])
  if (!graceful && child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 500))])
  }
}

async function availableTcpPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(error => error === undefined ? resolvePort(port) : rejectPort(error))
    })
  })
}

async function waitForSpawn(child: ChildProcess, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const done = (error?: Error): void => {
      child.off('spawn', onSpawn)
      child.off('error', onError)
      signal.removeEventListener('abort', onAbort)
      error === undefined ? resolve() : reject(error)
    }
    const onSpawn = (): void => done()
    const onError = (error: Error): void => done(error)
    const onAbort = (): void => done(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)))
    child.once('spawn', onSpawn)
    child.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function connectVideo(connectImpl: typeof connect, port: number, signal: AbortSignal): Promise<Socket> {
  const deadline = Date.now() + 10_000
  while (true) {
    signal.throwIfAborted()
    try {
      const socket = await new Promise<Socket>((resolve, reject) => {
        const socket = connectImpl({ host: '127.0.0.1', port })
        const cleanup = (): void => {
          socket.off('connect', onConnect)
          socket.off('error', onError)
          signal.removeEventListener('abort', onAbort)
        }
        const onConnect = (): void => { cleanup(); resolve(socket) }
        const onError = (error: Error): void => { cleanup(); socket.destroy(); reject(error) }
        const onAbort = (): void => { cleanup(); socket.destroy(); reject(signal.reason) }
        socket.once('connect', onConnect)
        socket.once('error', onError)
        signal.addEventListener('abort', onAbort, { once: true })
      })
      try {
        await waitForVideoData(socket, signal, Math.max(1, deadline - Date.now()))
        return socket
      } catch (error) {
        socket.destroy()
        throw error
      }
    } catch (error) {
      if (signal.aborted || Date.now() >= deadline) throw error
      await new Promise(resolve => setTimeout(resolve, 120))
    }
  }
}

/** ADB forward accepts TCP before the device abstract socket exists, then closes it.
 * Treat a connection as ready only after scrcpy has produced its first bytes. */
async function waitForVideoData(socket: Socket, signal: AbortSignal, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => done(new Error('coremate-mobile: timed out waiting for scrcpy video data')), timeoutMs)
    const done = (error?: Error): void => {
      clearTimeout(timeout)
      socket.off('readable', onReadable)
      socket.off('end', onClose)
      socket.off('close', onClose)
      socket.off('error', onError)
      signal.removeEventListener('abort', onAbort)
      error === undefined ? resolve() : reject(error)
    }
    const onReadable = (): void => {
      if (socket.readableLength > 0) done()
    }
    const onClose = (): void => done(new Error('coremate-mobile: scrcpy video socket not ready'))
    const onError = (error: Error): void => done(error)
    const onAbort = (): void => done(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)))
    socket.once('readable', onReadable)
    socket.once('end', onClose)
    socket.once('close', onClose)
    socket.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
