import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { c as createTar } from 'tar'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildScrcpyControlServerArgs,
  buildSetClipboardControlMessage,
  parseScrcpyDeviceMessages,
  resolveScrcpyAsset, SCRCPY_ASSETS, SCRCPY_VERSION, ScrcpyInstaller, ScrcpyMirror,
} from '../src/scrcpy.ts'
import type { InstalledScrcpy, ScrcpyAsset } from '../src/scrcpy.ts'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('official scrcpy release selection', () => {
  it('pins reviewed v4.1 assets for every Host platform already supported by the plugin', () => {
    expect(SCRCPY_VERSION).toBe('4.1')
    expect(resolveScrcpyAsset('darwin', 'arm64')).toBe(SCRCPY_ASSETS['darwin-arm64'])
    expect(resolveScrcpyAsset('darwin', 'x64')).toBe(SCRCPY_ASSETS['darwin-x64'])
    expect(resolveScrcpyAsset('linux', 'x64')).toBe(SCRCPY_ASSETS['linux-x64'])
    expect(resolveScrcpyAsset('win32', 'x64')).toBe(SCRCPY_ASSETS['win32-x64'])
    expect(resolveScrcpyAsset('linux', 'arm64')).toBeUndefined()
    for (const asset of Object.values(SCRCPY_ASSETS)) {
      expect(asset.url).toMatch(/^https:\/\/github\.com\/Genymobile\/scrcpy\/releases\/download\/v4\.1\//u)
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(asset.bytes).toBeGreaterThan(10_000_000)
    }
  })
})

describe('acknowledged Unicode text input', () => {
  it('starts a vendor-neutral control-only scrcpy server', () => {
    expect(buildScrcpyControlServerArgs('00abc123', '/data/local/tmp/coremate-mobile-scrcpy-server.jar'))
      .toEqual([
        'CLASSPATH=/data/local/tmp/coremate-mobile-scrcpy-server.jar',
        'app_process', '/', 'com.genymobile.scrcpy.Server', '4.1',
        'scid=00abc123', 'tunnel_forward=true', 'video=false', 'audio=false',
        'control=true', 'cleanup=false', 'send_dummy_byte=true', 'send_device_meta=false',
      ])
  })

  it('encodes UTF-8 clipboard paste and recognizes a fragmented device ACK', () => {
    const message = buildSetClipboardControlMessage('你好', true, 42n)
    expect(message[0]).toBe(9)
    expect(message.readBigUInt64BE(1)).toBe(42n)
    expect(message[9]).toBe(1)
    expect(message.readUInt32BE(10)).toBe(6)
    expect(message.subarray(14).toString('utf8')).toBe('你好')

    const first = parseScrcpyDeviceMessages(Buffer.from([1, 0, 0]))
    expect(first).toEqual({ acknowledgements: [], remaining: Buffer.from([1, 0, 0]) })
    const second = parseScrcpyDeviceMessages(Buffer.concat([
      first.remaining,
      Buffer.from([0, 0, 0, 0, 0, 42]),
    ]))
    expect(second.acknowledgements).toEqual([42n])
    expect(second.remaining).toHaveLength(0)
  })
})

describe('verified scrcpy installation', () => {
  it('downloads, verifies, extracts, marks, and reuses an official-shaped archive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coremate-scrcpy-install-'))
    temporary.push(root)
    const source = join(root, 'source')
    const archiveRoot = 'scrcpy-test-v4.1'
    await mkdir(join(source, archiveRoot), { recursive: true })
    await Promise.all([
      writeFile(join(source, archiveRoot, 'scrcpy'), 'native-client'),
      writeFile(join(source, archiveRoot, 'scrcpy-server'), 'android-server'),
    ])
    const archive = join(root, 'fixture.tar.gz')
    await createTar({ cwd: source, file: archive, gzip: true }, [archiveRoot])
    const bytes = await readFile(archive)
    const asset: ScrcpyAsset = {
      key: 'test-x64', archive: 'tar.gz', archiveRoot, executable: 'scrcpy',
      url: 'https://example.invalid/scrcpy.tar.gz', bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
    const fetchMock = vi.fn(async () => new Response(bytes))
    const installer = new ScrcpyInstaller({ cacheDir: join(root, 'cache'), fetch: fetchMock as typeof fetch })
    const progress = vi.fn()

    const installed = await installer.ensure(asset, new AbortController().signal, progress)

    await expect(readFile(installed.executable, 'utf8')).resolves.toBe('native-client')
    await expect(readFile(installed.server, 'utf8')).resolves.toBe('android-server')
    expect(await installer.isInstalled(asset)).toBe(true)
    await installer.ensure(asset, new AbortController().signal, progress)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(progress).toHaveBeenCalledWith({
      phase: 'downloading', downloadedBytes: bytes.byteLength, totalBytes: bytes.byteLength,
    })
    expect(progress).toHaveBeenCalledWith({ phase: 'extracting' })
  })

  it('rejects content that does not match the pinned checksum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coremate-scrcpy-checksum-'))
    temporary.push(root)
    const body = new TextEncoder().encode('tampered')
    const asset: ScrcpyAsset = {
      key: 'test', archive: 'zip', archiveRoot: 'unused', executable: 'scrcpy.exe',
      url: 'https://example.invalid/scrcpy.zip', bytes: body.byteLength, sha256: '0'.repeat(64),
    }
    const installer = new ScrcpyInstaller({
      cacheDir: join(root, 'cache'),
      fetch: (async () => new Response(body)) as typeof fetch,
    })

    await expect(installer.ensure(asset, new AbortController().signal, () => {}))
      .rejects.toThrow('scrcpy download checksum mismatch')
    expect(await installer.isInstalled(asset)).toBe(false)
  })
})

class FakeInstaller extends ScrcpyInstaller {
  constructor(private readonly installed: InstalledScrcpy) { super({ cacheDir: '/unused' }) }
  override async isInstalled(): Promise<boolean> { return true }
  override async ensure(): Promise<InstalledScrcpy> { return this.installed }
}

class WaitingInstaller extends ScrcpyInstaller {
  signal: AbortSignal | undefined

  override async isInstalled(): Promise<boolean> { return false }
  override ensure(_asset: ScrcpyAsset, signal: AbortSignal): Promise<InstalledScrcpy> {
    this.signal = signal
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    })
  }
}

class FakeProcess extends EventEmitter {
  exitCode: number | null = null
  killed = false
  readonly stderr = new PassThrough()

  override once(event: string, listener: (...args: never[]) => void): this {
    return super.once(event, listener)
  }

  kill(): boolean {
    this.killed = true
    this.exitCode = 0
    this.emit('exit', 0, 'SIGTERM')
    return true
  }
}

class StubbornProcess extends FakeProcess {
  readonly signals: NodeJS.Signals[] = []

  override kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed = true
    this.signals.push(signal)
    if (signal === 'SIGKILL') {
      this.exitCode = 0
      this.emit('exit', 0, signal)
    }
    return true
  }
}

describe('always-available native mirror', () => {
  it('launches and stops independent read-only clients with the managed ADB', async () => {
    const children = [new FakeProcess(), new FakeProcess()]
    const spawnMock = vi.fn(() => {
      const child = children[spawnMock.mock.calls.length - 1]!
      queueMicrotask(() => { child.emit('spawn') })
      return child
    })
    const asset = SCRCPY_ASSETS['darwin-arm64']!
    const mirror = new ScrcpyMirror({
      asset,
      installer: new FakeInstaller({ root: '/cache/scrcpy', executable: '/cache/scrcpy/scrcpy', server: '/cache/scrcpy/scrcpy-server' }),
      adbPath: () => '/plugin/adb',
      spawn: spawnMock,
    })
    const devices = [
      { id: 'device-1', serial: 'phone-1', label: 'Pixel 8' },
      { id: 'device-2', serial: 'phone-2', label: 'Pixel 9' },
    ]

    mirror.requestStart(devices[0]!)
    mirror.requestStart(devices[1]!)
    await vi.waitFor(() => {
      expect(mirror.status([
        { id: 'device-1', label: 'Pixel 8', selected: true },
        { id: 'device-2', label: 'Pixel 9', selected: true },
      ]).devices.map(device => device.phase)).toEqual(['running', 'running'])
    })

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      '--serial', 'phone-1', '--no-control', '--no-audio', '--max-size=1280', '--max-fps=30',
    ]))
    expect(spawnMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([
      '--serial', 'phone-2', '--window-title=OpenGUI · Pixel 9',
    ]))
    expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({
      shell: false,
      env: { ADB: '/plugin/adb', SCRCPY_SERVER_PATH: '/cache/scrcpy/scrcpy-server' },
    })

    await mirror.stop('device-1')
    expect(children[0]?.killed).toBe(true)
    expect(children[1]?.killed).toBe(false)
    await mirror.dispose()
    expect(children[1]?.killed).toBe(true)
  })

  it('does not launch duplicate clients for the same device', async () => {
    const child = new FakeProcess()
    const spawnMock = vi.fn(() => {
      queueMicrotask(() => { child.emit('spawn') })
      return child
    })
    const mirror = new ScrcpyMirror({
      asset: SCRCPY_ASSETS['linux-x64']!,
      installer: new FakeInstaller({ root: '/cache', executable: '/cache/scrcpy', server: '/cache/server' }),
      adbPath: () => '/adb',
      spawn: spawnMock,
    })
    const device = { id: 'device', serial: 'serial', label: 'Pixel' }

    mirror.requestStart(device)
    mirror.requestStart(device)
    await vi.waitFor(() => { expect(mirror.status([{ id: 'device', label: 'Pixel', selected: false }]).devices[0]?.phase).toBe('running') })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(mirror.status().taskActive).toBe(false)
    await mirror.dispose()
  })

  it('waits for process exit and escalates a mirror that ignores SIGTERM', async () => {
    const child = new StubbornProcess()
    const mirror = new ScrcpyMirror({
      asset: SCRCPY_ASSETS['darwin-arm64']!,
      installer: new FakeInstaller({ root: '/cache', executable: '/cache/scrcpy', server: '/cache/server' }),
      adbPath: () => '/adb',
      spawn: () => {
        queueMicrotask(() => { child.emit('spawn') })
        return child
      },
      stopGraceMs: 5,
    })
    const device = { id: 'phone', serial: 'serial', label: 'Pixel' }

    mirror.requestStart(device)
    await vi.waitFor(() => {
      expect(mirror.status([{ id: device.id, label: device.label, selected: true }]).devices[0]?.phase).toBe('running')
    })
    await mirror.stop(device.id)

    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(mirror.status([{ id: device.id, label: device.label, selected: true }]).devices[0]?.phase).toBe('idle')
  })

  it('cancels a first-use download when its eye is toggled off and allows a fresh later attempt', async () => {
    const installer = new WaitingInstaller()
    const mirror = new ScrcpyMirror({
      asset: SCRCPY_ASSETS['linux-x64']!,
      installer,
      adbPath: () => '/adb',
    })
    const device = { id: 'phone', serial: 'serial', label: 'Pixel' }

    mirror.requestStart(device)
    await vi.waitFor(() => { expect(installer.signal).toBeDefined() })
    await mirror.stop(device.id)
    await vi.waitFor(() => { expect(installer.signal?.aborted).toBe(true) })

    mirror.requestStart(device)
    await vi.waitFor(() => { expect(installer.signal?.aborted).toBe(false) })
    await mirror.stop(device.id)
    await mirror.dispose()
  })

  it('launches a connected phone without requiring an active OpenGUI task', async () => {
    const child = new FakeProcess()
    const spawnMock = vi.fn(() => {
      queueMicrotask(() => { child.emit('spawn') })
      return child
    })
    const mirror = new ScrcpyMirror({
      asset: SCRCPY_ASSETS['darwin-arm64']!,
      installer: new FakeInstaller({ root: '/cache', executable: '/cache/scrcpy', server: '/cache/server' }),
      adbPath: () => '/adb',
      spawn: spawnMock,
    })
    const device = { id: 'phone', serial: 'serial-1', label: 'Pixel 8' }

    mirror.requestStart(device)
    await vi.waitFor(() => {
      expect(mirror.status([{ id: device.id, label: device.label, selected: false }]).devices[0]?.phase).toBe('running')
    })

    expect(spawnMock.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--serial', 'serial-1']))
    await mirror.dispose()
  })
})
