import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { workbuddyStateDir } from './state.ts'
import { connect, createServer } from 'node:net'
import type { Socket } from 'node:net'
import { basename, join, sep } from 'node:path'
import { x as extractTar } from 'tar'
import { OwnedForwardRegistry } from './forward-registry.ts'
import type { OwnedForward } from './forward-registry.ts'
import { extractSafeZip } from './secure-zip.ts'

export const SCRCPY_VERSION = '4.1'

export interface ScrcpyAsset {
  key: string
  archive: 'tar.gz' | 'zip'
  archiveRoot: string
  executable: string
  url: string
  bytes: number
  sha256: string
}

const RELEASE_BASE = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}`

/** Reviewed official v4.1 assets and checksums, pinned with the plugin release. */
export const SCRCPY_ASSETS: Readonly<Record<string, ScrcpyAsset>> = Object.freeze({
  'darwin-arm64': {
    key: 'darwin-arm64', archive: 'tar.gz', archiveRoot: `scrcpy-macos-aarch64-v${SCRCPY_VERSION}`,
    executable: 'scrcpy', bytes: 12_981_888,
    sha256: '20fd47c9014dd5e0fa77091f3cb7adbda8445a360c4584aeaa0150b5b3988ff3',
    url: `${RELEASE_BASE}/scrcpy-macos-aarch64-v${SCRCPY_VERSION}.tar.gz`,
  },
  'darwin-x64': {
    key: 'darwin-x64', archive: 'tar.gz', archiveRoot: `scrcpy-macos-x86_64-v${SCRCPY_VERSION}`,
    executable: 'scrcpy', bytes: 13_904_869,
    sha256: 'ee2a7223bc8dbdc4f482db1134bcf441178dafb833492b71ca4c22090c58ce72',
    url: `${RELEASE_BASE}/scrcpy-macos-x86_64-v${SCRCPY_VERSION}.tar.gz`,
  },
  'linux-x64': {
    key: 'linux-x64', archive: 'tar.gz', archiveRoot: `scrcpy-linux-x86_64-v${SCRCPY_VERSION}`,
    executable: 'scrcpy', bytes: 17_762_813,
    sha256: 'ad56ae8bfeedf41e824945c11dbf55fcb092b3e615b9b486f48a50e30d389635',
    url: `${RELEASE_BASE}/scrcpy-linux-x86_64-v${SCRCPY_VERSION}.tar.gz`,
  },
  'win32-x64': {
    key: 'win32-x64', archive: 'zip', archiveRoot: `scrcpy-win64-v${SCRCPY_VERSION}`,
    executable: 'scrcpy.exe', bytes: 11_305_298,
    sha256: '5b12172b3264b2889f4583ee64752ce832e29bc8b1089dca81093459697165db',
    url: `${RELEASE_BASE}/scrcpy-win64-v${SCRCPY_VERSION}.zip`,
  },
})

export function resolveScrcpyAsset(platform = process.platform, arch = process.arch): ScrcpyAsset | undefined {
  return SCRCPY_ASSETS[`${platform}-${arch}`]
}

export function defaultScrcpyCacheDir(): string {
  return join(workbuddyStateDir(), 'scrcpy')
}

export interface InstalledScrcpy {
  root: string
  executable: string
  server: string
}

interface InstallProgress {
  phase: 'downloading' | 'extracting'
  downloadedBytes?: number
  totalBytes?: number
}

interface ScrcpyInstallJob {
  readonly controller: AbortController
  promise: Promise<InstalledScrcpy>
  readonly waiters: Map<symbol, (progress: InstallProgress) => void>
  latest: InstallProgress | undefined
}

export interface ScrcpyInstallerOptions {
  cacheDir?: string
  fallbackCacheDirs?: readonly string[]
  fetch?: typeof globalThis.fetch
}

/** Atomic, verified first-use installation of one official scrcpy archive. */
export class ScrcpyInstaller {
  private readonly cacheDir: string
  private readonly fallbackCacheDirs: readonly string[]
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly active = new Map<string, ScrcpyInstallJob>()

  constructor(options: ScrcpyInstallerOptions = {}) {
    this.cacheDir = options.cacheDir ?? defaultScrcpyCacheDir()
    this.fallbackCacheDirs = options.fallbackCacheDirs
      ?? []
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  paths(asset: ScrcpyAsset, cacheDir = this.cacheDir): InstalledScrcpy {
    const root = join(cacheDir, `v${SCRCPY_VERSION}`, asset.key, asset.archiveRoot)
    return {
      root,
      executable: join(root, asset.executable),
      server: join(root, 'scrcpy-server'),
    }
  }

  async isInstalled(asset: ScrcpyAsset): Promise<boolean> {
    return await this.findInstalled(asset) !== undefined
  }

  private async findInstalled(asset: ScrcpyAsset): Promise<InstalledScrcpy | undefined> {
    for (const cacheDir of [this.cacheDir, ...this.fallbackCacheDirs]) {
      const paths = this.paths(asset, cacheDir)
      if (await this.isInstalledAt(asset, paths)) return paths
    }
    return undefined
  }

  private async isInstalledAt(asset: ScrcpyAsset, paths: InstalledScrcpy): Promise<boolean> {
    const marker = join(paths.root, '.opengui-workbuddy-install.json')
    try {
      const [executable, server, raw] = await Promise.all([
        lstat(paths.executable), lstat(paths.server), readFile(marker, 'utf8'),
      ])
      if (!executable.isFile() || executable.isSymbolicLink() || !server.isFile() || server.isSymbolicLink()) return false
      const parsed = JSON.parse(raw) as { version?: unknown; sha256?: unknown }
      return parsed.version === SCRCPY_VERSION && parsed.sha256 === asset.sha256
    } catch {
      return false
    }
  }

  ensure(
    asset: ScrcpyAsset,
    signal: AbortSignal,
    progress: (progress: InstallProgress) => void,
  ): Promise<InstalledScrcpy> {
    signal.throwIfAborted()
    let job = this.active.get(asset.key)
    if (job === undefined || job.controller.signal.aborted) {
      const controller = new AbortController()
      const waiters = new Map<symbol, (value: InstallProgress) => void>()
      const created: ScrcpyInstallJob = {
        controller,
        waiters,
        latest: undefined,
        promise: Promise.resolve(undefined as never),
      }
      created.promise = this.install(asset, controller.signal, value => {
        created.latest = value
        for (const notify of created.waiters.values()) notify(value)
      })
      this.active.set(asset.key, created)
      void created.promise.finally(() => {
        if (this.active.get(asset.key) === created) this.active.delete(asset.key)
      }).catch(() => {})
      job = created
    }
    return this.waitFor(job, signal, progress)
  }

  private async waitFor(
    job: ScrcpyInstallJob,
    signal: AbortSignal,
    progress: (progress: InstallProgress) => void,
  ): Promise<InstalledScrcpy> {
    const id = Symbol('scrcpy-installer-waiter')
    job.waiters.set(id, progress)
    if (job.latest !== undefined) progress(job.latest)
    try {
      return await new Promise<InstalledScrcpy>((resolveJob, rejectJob) => {
        const onAbort = (): void => rejectJob(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        void job.promise.then(resolveJob, rejectJob).finally(() => signal.removeEventListener('abort', onAbort))
      })
    } finally {
      job.waiters.delete(id)
      if (job.waiters.size === 0 && !job.controller.signal.aborted) {
        job.controller.abort(new Error('opengui: scrcpy installation has no remaining waiters'))
      }
    }
  }

  private async install(
    asset: ScrcpyAsset,
    signal: AbortSignal,
    progress: (progress: InstallProgress) => void,
  ): Promise<InstalledScrcpy> {
    const existing = await this.findInstalled(asset)
    if (existing !== undefined) return existing
    signal.throwIfAborted()

    const assetDir = join(this.cacheDir, `v${SCRCPY_VERSION}`, asset.key)
    await mkdir(assetDir, { recursive: true })
    const suffix = asset.archive === 'zip' ? '.zip' : '.tar.gz'
    const archivePath = join(assetDir, `.download-${randomUUID()}${suffix}`)
    const staging = await mkdtemp(join(assetDir, '.extract-'))
    const releaseLock = await this.acquireInstallLock(join(assetDir, '.install.lock'), signal).catch(async error => {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      throw error
    })
    try {
      const installed = await this.findInstalled(asset)
      if (installed !== undefined) return installed
      await this.download(asset, archivePath, signal, progress)
      signal.throwIfAborted()
      progress({ phase: 'extracting' })
      if (asset.archive === 'zip') {
        await extractSafeZip(archivePath, staging)
      } else {
        await extractTar({
          file: archivePath,
          cwd: staging,
          strict: true,
          preservePaths: false,
          filter: path => !path.split('/').includes('..'),
        })
      }
      signal.throwIfAborted()

      const extractedRoot = join(staging, asset.archiveRoot)
      const executable = join(extractedRoot, asset.executable)
      const server = join(extractedRoot, 'scrcpy-server')
      await this.assertRegularInside(staging, executable)
      await this.assertRegularInside(staging, server)
      if (process.platform !== 'win32') await chmod(executable, 0o755)
      await writeFile(join(extractedRoot, '.opengui-workbuddy-install.json'), JSON.stringify({
        version: SCRCPY_VERSION,
        asset: asset.key,
        sha256: asset.sha256,
      }), { encoding: 'utf8', mode: 0o600 })

      const destination = this.paths(asset).root
      const quarantine = join(assetDir, `.quarantine-${randomUUID()}`)
      let quarantined = false
      try {
        try {
          await lstat(destination)
          await rename(destination, quarantine)
          quarantined = true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        await rename(extractedRoot, destination)
        if (quarantined) await rm(quarantine, { recursive: true, force: true })
      } catch (error) {
        if (quarantined) {
          await rm(destination, { recursive: true, force: true }).catch(() => undefined)
          await rename(quarantine, destination).catch(() => undefined)
        }
        if (!(await this.isInstalledAt(asset, this.paths(asset)))) throw error
      }
      return this.paths(asset)
    } finally {
      await Promise.allSettled([
        rm(archivePath, { force: true }),
        rm(staging, { recursive: true, force: true }),
      ])
      await releaseLock()
    }
  }

  private async acquireInstallLock(path: string, signal: AbortSignal): Promise<() => Promise<void>> {
    while (true) {
      signal.throwIfAborted()
      try {
        const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
        await handle.writeFile(`${process.pid}\n${Date.now()}\n`)
        return async () => {
          await handle.close().catch(() => undefined)
          await rm(path, { force: true }).catch(() => undefined)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const age = await stat(path).then(value => Date.now() - value.mtimeMs).catch(() => 0)
        if (age > 120_000) {
          await rm(path, { force: true }).catch(() => undefined)
          continue
        }
        await new Promise<void>((resolveWait, rejectWait) => {
          const timer = setTimeout(() => { cleanup(); resolveWait() }, 50)
          const onAbort = (): void => { cleanup(); rejectWait(signal.reason) }
          const cleanup = (): void => {
            clearTimeout(timer)
            signal.removeEventListener('abort', onAbort)
          }
          signal.addEventListener('abort', onAbort, { once: true })
        })
      }
    }
  }

  private async download(
    asset: ScrcpyAsset,
    archivePath: string,
    signal: AbortSignal,
    progress: (progress: InstallProgress) => void,
  ): Promise<void> {
    progress({ phase: 'downloading', downloadedBytes: 0, totalBytes: asset.bytes })
    const response = await this.fetchImpl(asset.url, { signal, redirect: 'follow' })
    if (!response.ok || response.body === null) {
      throw new Error(`scrcpy download failed with HTTP ${response.status}`)
    }
    const file = await open(archivePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    const digest = createHash('sha256')
    let downloaded = 0
    try {
      const reader = response.body.getReader()
      while (true) {
        signal.throwIfAborted()
        const next = await reader.read()
        if (next.done) break
        downloaded += next.value.byteLength
        if (downloaded > asset.bytes) throw new Error('scrcpy download exceeded the pinned asset size')
        digest.update(next.value)
        let offset = 0
        while (offset < next.value.byteLength) {
          const { bytesWritten } = await file.write(
            next.value,
            offset,
            next.value.byteLength - offset,
            null,
          )
          if (bytesWritten === 0) throw new Error('scrcpy download write made no progress')
          offset += bytesWritten
        }
        progress({ phase: 'downloading', downloadedBytes: downloaded, totalBytes: asset.bytes })
      }
    } finally {
      await file.close()
    }
    if (downloaded !== asset.bytes) {
      throw new Error(`scrcpy download size mismatch: expected ${asset.bytes}, received ${downloaded}`)
    }
    if (digest.digest('hex') !== asset.sha256) throw new Error('scrcpy download checksum mismatch')
  }

  private async assertRegularInside(root: string, path: string): Promise<void> {
    const [resolvedRoot, resolvedPath, info] = await Promise.all([realpath(root), realpath(path), lstat(path)])
    if (!resolvedPath.startsWith(`${resolvedRoot}${sep}`) || !info.isFile() || info.isSymbolicLink()) {
      throw new Error(`scrcpy archive contained an unsafe ${basename(path)} entry`)
    }
  }
}

const SCRCPY_REMOTE_SERVER = '/data/local/tmp/opengui-workbuddy-scrcpy-server.jar'
const SCRCPY_CLIPBOARD_ACK_TIMEOUT_MS = 5_000

/** Build the standard scrcpy server command for a control-only connection. */
export function buildScrcpyControlServerArgs(scid: string, serverPath = SCRCPY_REMOTE_SERVER): string[] {
  return [
    `CLASSPATH=${serverPath}`,
    'app_process', '/', 'com.genymobile.scrcpy.Server', SCRCPY_VERSION,
    `scid=${scid}`,
    'tunnel_forward=true',
    'video=false',
    'audio=false',
    'control=true',
    'cleanup=false',
    'send_dummy_byte=true',
    'send_device_meta=false',
  ]
}

/** Encode scrcpy control message type 9 (SET_CLIPBOARD). */
export function buildSetClipboardControlMessage(
  text: string,
  paste = true,
  sequence = BigInt(Date.now()),
): Buffer {
  const content = Buffer.from(text, 'utf8')
  const maxLength = (1 << 18) - 14
  if (content.length > maxLength) {
    throw new Error(`opengui: scrcpy clipboard text exceeds ${maxLength} UTF-8 bytes`)
  }
  const message = Buffer.alloc(14 + content.length)
  message[0] = 9
  message.writeBigUInt64BE(sequence, 1)
  message[9] = paste ? 1 : 0
  message.writeUInt32BE(content.length, 10)
  content.copy(message, 14)
  return message
}

export interface ParsedScrcpyDeviceMessages {
  acknowledgements: bigint[]
  remaining: Buffer
}

/** Parse complete scrcpy device messages while retaining a fragmented suffix. */
export function parseScrcpyDeviceMessages(input: Buffer): ParsedScrcpyDeviceMessages {
  const acknowledgements: bigint[] = []
  let offset = 0
  while (offset < input.length) {
    const type = input[offset]
    if (type === 0) {
      if (input.length - offset < 5) break
      const length = input.readUInt32BE(offset + 1)
      if (input.length - offset < 5 + length) break
      offset += 5 + length
      continue
    }
    if (type === 1) {
      if (input.length - offset < 9) break
      acknowledgements.push(input.readBigUInt64BE(offset + 1))
      offset += 9
      continue
    }
    if (type === 2) {
      if (input.length - offset < 5) break
      const length = input.readUInt16BE(offset + 3)
      if (input.length - offset < 5 + length) break
      offset += 5 + length
      continue
    }
    throw new Error(`opengui: unknown scrcpy device message type ${String(type)}`)
  }
  return { acknowledgements, remaining: input.subarray(offset) }
}

type ScrcpyAdbRunner = (args: readonly string[], signal: AbortSignal) => Promise<unknown>

interface ScrcpyTextConnection {
  readonly serial: string
  readonly port: number
  readonly process: ChildProcess
  readonly socket: Socket
  sequence: bigint
  readBuffer: Buffer
  closed: boolean
  closing: Promise<void> | undefined
  readonly forward: OwnedForward
  readonly waiters: Map<string, {
    resolve: () => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>
}

export interface ScrcpyTextInputOptions {
  adbPath: () => string
  runAdb: ScrcpyAdbRunner
  installer?: ScrcpyInstaller
  asset?: ScrcpyAsset
  spawn?: typeof spawn
  connect?: typeof connect
  freePort?: () => Promise<number>
  forwardRegistry?: OwnedForwardRegistry
}

/** Persistent, vendor-neutral UTF-8 text input over scrcpy's acknowledged control protocol. */
export class ScrcpyTextInput {
  private readonly installer: ScrcpyInstaller
  private readonly asset: ScrcpyAsset | undefined
  private readonly spawnImpl: typeof spawn
  private readonly connectImpl: typeof connect
  private readonly freePort: () => Promise<number>
  private readonly forwardRegistry: OwnedForwardRegistry
  private readonly active = new Map<string, ScrcpyTextConnection>()
  private readonly starting = new Map<string, Promise<ScrcpyTextConnection>>()
  private readonly lifetime = new AbortController()

  constructor(private readonly options: ScrcpyTextInputOptions) {
    this.installer = options.installer ?? new ScrcpyInstaller()
    this.asset = options.asset ?? resolveScrcpyAsset()
    this.spawnImpl = options.spawn ?? spawn
    this.connectImpl = options.connect ?? connect
    this.freePort = options.freePort ?? availableTcpPort
    this.forwardRegistry = options.forwardRegistry ?? new OwnedForwardRegistry()
  }

  async paste(serial: string, text: string, signal: AbortSignal): Promise<void> {
    if (text.length < 1 || [...text].length > 500 || text.includes('\0')) {
      throw new Error('opengui: text must contain 1-500 Unicode characters without NUL')
    }
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    combined.throwIfAborted()
    const connection = await this.connection(serial, combined)
    combined.throwIfAborted()

    const sequence = connection.sequence
    connection.sequence += 1n
    const payload = buildSetClipboardControlMessage(text, true, sequence)
    try {
      await new Promise<void>((resolve, reject) => {
        const key = sequence.toString()
        const cleanupAbort = (): void => combined.removeEventListener('abort', onAbort)
        const timer = setTimeout(() => {
          connection.waiters.delete(key)
          cleanupAbort()
          reject(new Error(`opengui: scrcpy clipboard acknowledgement timed out (sequence=${key})`))
        }, SCRCPY_CLIPBOARD_ACK_TIMEOUT_MS)
        const onAbort = (): void => {
          const waiter = connection.waiters.get(key)
          if (waiter === undefined) return
          connection.waiters.delete(key)
          clearTimeout(timer)
          reject(combined.reason instanceof Error ? combined.reason : new Error(String(combined.reason)))
        }
        connection.waiters.set(key, {
          resolve: () => { cleanupAbort(); resolve() },
          reject: (error) => { cleanupAbort(); reject(error) },
          timer,
        })
        combined.addEventListener('abort', onAbort, { once: true })
        connection.socket.write(payload, (error) => {
          if (error === null || error === undefined || !connection.waiters.has(key)) return
          const waiter = connection.waiters.get(key)!
          connection.waiters.delete(key)
          clearTimeout(waiter.timer)
          waiter.reject(error)
        })
      })
    } catch (error) {
      await this.close(connection, error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  async dispose(): Promise<void> {
    if (!this.lifetime.signal.aborted) this.lifetime.abort(new Error('opengui: scrcpy text input disposed'))
    await Promise.allSettled(this.starting.values())
    await Promise.allSettled([...this.active.values()].map(connection => (
      this.close(connection, new Error('opengui: scrcpy text input disposed'))
    )))
  }

  /** Close one device's reusable text channel and release its owned ADB forward. */
  async release(serial: string): Promise<void> {
    const pending = this.starting.get(serial)
    if (pending !== undefined) await pending.catch(() => undefined)
    const connection = this.active.get(serial)
    if (connection !== undefined) {
      await this.close(connection, new Error('opengui: scrcpy text input session released'))
    }
  }

  private async connection(serial: string, signal: AbortSignal): Promise<ScrcpyTextConnection> {
    const current = this.active.get(serial)
    if (current !== undefined && !current.closed) return current
    const pending = this.starting.get(serial)
    if (pending !== undefined) return pending
    const operation = this.start(serial, signal)
    this.starting.set(serial, operation)
    try {
      const created = await operation
      this.active.set(serial, created)
      return created
    } finally {
      if (this.starting.get(serial) === operation) this.starting.delete(serial)
    }
  }

  private async start(serial: string, signal: AbortSignal): Promise<ScrcpyTextConnection> {
    const asset = this.asset
    if (asset === undefined) throw new Error(`opengui: scrcpy text input is unsupported on ${process.platform}/${process.arch}`)
    const installed = await this.installer.ensure(asset, signal, () => {})
    signal.throwIfAborted()
    const port = await this.freePort()
    const scid = (randomBytes(4).readUInt32BE(0) & 0x7fffffff).toString(16).padStart(8, '0')
    const forward: OwnedForward = { serial, port, scid, kind: 'text-input' }
    await this.options.runAdb(['-s', serial, 'push', installed.server, SCRCPY_REMOTE_SERVER], signal)
    try {
      await this.forwardRegistry.track(forward)
      await this.options.runAdb([
        '-s', serial, 'forward', '--no-rebind', `tcp:${port}`, `localabstract:scrcpy_${scid}`,
      ], signal)
    } catch (error) {
      await this.forwardRegistry.release(forward, this.options.runAdb).catch(() => false)
      throw error
    }

    const child = this.spawnImpl(this.options.adbPath(), [
      '-s', serial, 'shell', ...buildScrcpyControlServerArgs(scid),
    ], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr = `${stderr}${String(chunk)}`.slice(-2_000) })
    try {
      await waitForChildSpawn(child, signal)
      const socket = await connectScrcpyControl(this.connectImpl, port, signal)
      const connection: ScrcpyTextConnection = {
        serial,
        port,
        process: child,
        socket,
        sequence: BigInt(Date.now()),
        readBuffer: Buffer.alloc(0),
        closed: false,
        closing: undefined,
        forward,
        waiters: new Map(),
      }
      socket.on('data', chunk => this.onData(connection, Buffer.from(chunk)))
      const serverDetail = (): string => stderr.trim() ? `: ${stderr.trim()}` : ''
      socket.once('error', error => { void this.close(connection, new Error(`${error.message}${serverDetail()}`, { cause: error })) })
      socket.once('close', () => { void this.close(connection, new Error(`opengui: scrcpy control socket closed${serverDetail()}`)) })
      child.once('exit', (code, exitSignal) => { void this.close(connection, new Error(
        `opengui: scrcpy control server exited (code=${String(code)}, signal=${String(exitSignal)})${serverDetail()}`,
      )) })
      return connection
    } catch (error) {
      await terminateChildProcess(child)
      await this.forwardRegistry.release(forward, this.options.runAdb)
      const detail = stderr.trim()
      throw new Error(`opengui: failed to start acknowledged scrcpy text input${detail ? `: ${detail}` : ''}`, { cause: error })
    }
  }

  private onData(connection: ScrcpyTextConnection, chunk: Buffer): void {
    try {
      const parsed = parseScrcpyDeviceMessages(Buffer.concat([connection.readBuffer, chunk]))
      connection.readBuffer = parsed.remaining
      for (const sequence of parsed.acknowledgements) {
        const key = sequence.toString()
        const waiter = connection.waiters.get(key)
        if (waiter === undefined) continue
        connection.waiters.delete(key)
        clearTimeout(waiter.timer)
        waiter.resolve()
      }
    } catch (error) {
      void this.close(connection, error instanceof Error ? error : new Error(String(error)))
    }
  }

  private close(connection: ScrcpyTextConnection, error: Error): Promise<void> {
    if (connection.closing !== undefined) return connection.closing
    if (connection.closed) return Promise.resolve()
    connection.closed = true
    if (this.active.get(connection.serial) === connection) this.active.delete(connection.serial)
    for (const waiter of connection.waiters.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    connection.waiters.clear()
    connection.socket.destroy()
    connection.closing = (async () => {
      await terminateChildProcess(connection.process)
      await this.forwardRegistry.release(connection.forward, this.options.runAdb)
    })()
    return connection.closing
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

async function waitForChildSpawn(child: ChildProcess, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    const onSpawn = (): void => { cleanup(); resolveSpawn() }
    const onError = (error: Error): void => { cleanup(); rejectSpawn(error) }
    const onAbort = (): void => { cleanup(); rejectSpawn(signal.reason) }
    const cleanup = (): void => {
      child.off('spawn', onSpawn)
      child.off('error', onError)
      signal.removeEventListener('abort', onAbort)
    }
    child.once('spawn', onSpawn)
    child.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function terminateChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolveExit => child.once('exit', () => resolveExit()))
  if (!child.killed) child.kill('SIGTERM')
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<false>(resolveGrace => setTimeout(() => resolveGrace(false), 2_000)),
  ])
  if (!graceful && child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, new Promise(resolveKill => setTimeout(resolveKill, 500))])
  }
}

async function connectScrcpyControl(
  connectImpl: typeof connect,
  port: number,
  signal: AbortSignal,
): Promise<Socket> {
  const deadline = Date.now() + 10_000
  while (true) {
    signal.throwIfAborted()
    try {
      return await new Promise<Socket>((resolveSocket, rejectSocket) => {
        const socket = connectImpl({ host: '127.0.0.1', port })
        const onData = (chunk: Buffer): void => {
          if (chunk.length < 1 || chunk[0] !== 0) {
            cleanup()
            socket.destroy()
            rejectSocket(new Error('opengui: invalid scrcpy forward handshake'))
            return
          }
          cleanup()
          resolveSocket(socket)
        }
        const onError = (error: Error): void => { cleanup(); socket.destroy(); rejectSocket(error) }
        const onClose = (): void => {
          cleanup()
          rejectSocket(new Error('opengui: scrcpy forward closed before handshake'))
        }
        const onAbort = (): void => { cleanup(); socket.destroy(); rejectSocket(signal.reason) }
        const cleanup = (): void => {
          socket.off('data', onData)
          socket.off('error', onError)
          socket.off('close', onClose)
          signal.removeEventListener('abort', onAbort)
        }
        socket.once('data', onData)
        socket.once('error', onError)
        socket.once('close', onClose)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    } catch (error) {
      if (signal.aborted) throw error
      if (Date.now() >= deadline) throw error
      await new Promise(resolveDelay => setTimeout(resolveDelay, 120))
    }
  }
}
