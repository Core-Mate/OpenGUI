import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, openSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * One-click Android emulator for people without a phone: download the official emulator and a
 * Google APIs system image into the plugin's private state directory, create a private AVD and
 * boot it headless so it appears in the device list. Existing Android Studio emulators are reused
 * read-only. Archives are pinned to Google's published sizes and SHA-1 checksums, so the public
 * Tencent Cloud mirror can serve the bytes without being trusted.
 */
export const OPENGUI_AVD = 'OpenGUI_Android'
export const IMAGE_API = 34
const IMAGE_TAG = 'google_apis'
/** Google's repository and the public Tencent Cloud mirror of it; a short speed probe picks the order. */
export const ANDROID_SOURCES = ['https://dl.google.com/android/repository/', 'https://mirrors.cloud.tencent.com/AndroidSDK/'] as const
const MIN_FREE_BYTES = 8 * 1024 ** 3
export const ANDROID_LICENSE_URL = 'https://developer.android.com/studio/terms'

export interface HostTarget { readonly os: 'macosx' | 'windows'; readonly arch: 'aarch64' | 'x64'; readonly abi: 'arm64-v8a' | 'x86_64' }
export interface AndroidArchive { readonly url: string; readonly size: number; readonly sha1: string; readonly licenses: readonly string[] }

export function hostTarget(platform: string = process.platform, arch: string = process.arch): HostTarget | undefined {
  if (platform === 'darwin') return arch === 'arm64' ? { os: 'macosx', arch: 'aarch64', abi: 'arm64-v8a' } : arch === 'x64' ? { os: 'macosx', arch: 'x64', abi: 'x86_64' } : undefined
  if (platform === 'win32' && arch === 'x64') return { os: 'windows', arch: 'x64', abi: 'x86_64' }
  return undefined
}

/**
 * Stable emulator 36 (build 16428233) and the Android 14 (API 34) Google APIs image r14, as listed
 * in repository2-3.xml and sys-img/google_apis/sys-img2-3.xml on dl.google.com. Update together.
 */
export const PINNED_ARCHIVES: { readonly emulator: Record<string, AndroidArchive>; readonly image: Record<HostTarget['abi'], AndroidArchive> } = {
  emulator: {
    'macosx-aarch64': { url: 'emulator-darwin_aarch64-16428233.zip', size: 416_112_708, sha1: '3af4fe44ce82b3d88ae5678a53735f27ad729c15', licenses: ['android-sdk-license'] },
    'macosx-x64': { url: 'emulator-darwin_x64-16428233.zip', size: 488_731_099, sha1: '0c08fc22f41f2e63976f5503d593f821ff11e30b', licenses: ['android-sdk-license'] },
    'windows-x64': { url: 'emulator-windows_x64-16428233.zip', size: 455_342_868, sha1: '488ed747e82de7e9bb5247becd1ac043c7e5e85d', licenses: ['android-sdk-license'] },
  },
  image: {
    'arm64-v8a': { url: 'sys-img/google_apis/arm64-v8a-34_r14.zip', size: 1_610_393_229, sha1: '2fe8b46d419a3400e30f31b0152b241b50c8b99f', licenses: ['android-sdk-arm-dbt-license'] },
    'x86_64': { url: 'sys-img/google_apis/x86_64-34_r14.zip', size: 1_563_721_130, sha1: 'e0f6c9a0691aa27bd597d0deb1bcfdc943ac8ca7', licenses: ['android-sdk-license'] },
  },
}

export function pinnedArchives(target: HostTarget): { emulator: AndroidArchive; image: AndroidArchive } | undefined {
  const emulator = PINNED_ARCHIVES.emulator[`${target.os}-${target.arch}`]
  return emulator ? { emulator, image: PINNED_ARCHIVES.image[target.abi] } : undefined
}

/** AVD configuration for a phone-sized device; image.sysdir is relative to the SDK root. */
export function avdConfig(target: HostTarget, api = IMAGE_API): string {
  return [
    `AvdId=${OPENGUI_AVD}`, 'avd.ini.displayname=OpenGUI Android', 'avd.ini.encoding=UTF-8', 'PlayStore.enabled=false',
    `abi.type=${target.abi}`, `hw.cpu.arch=${target.abi === 'arm64-v8a' ? 'arm64' : 'x86_64'}`, 'hw.cpu.ncore=4', 'hw.ramSize=3072', 'vm.heapSize=256',
    'disk.dataPartition.size=6G', 'hw.sdCard=no', 'hw.device.manufacturer=Google', 'hw.device.name=pixel_6',
    'hw.lcd.width=1080', 'hw.lcd.height=2400', 'hw.lcd.density=420', 'hw.initialOrientation=Portrait', 'hw.keyboard=yes', 'hw.mainKeys=no',
    'hw.gpu.enabled=yes', 'hw.gpu.mode=auto', 'hw.audioInput=no', 'hw.camera.back=none', 'hw.camera.front=none', 'hw.gps=yes', 'hw.battery=yes',
    'hw.accelerometer=yes', 'hw.sensors.orientation=yes', 'hw.sensors.proximity=yes', 'hw.dPad=no', 'hw.trackBall=no', 'showDeviceFrame=no',
    'fastboot.forceColdBoot=no', 'runtime.network.latency=none', 'runtime.network.speed=full',
    `image.sysdir.1=system-images/android-${api}/${IMAGE_TAG}/${target.abi}/`, `tag.id=${IMAGE_TAG}`, 'tag.display=Google APIs', '',
  ].join('\n')
}

export type EmulatorPhase = 'idle' | 'checking' | 'downloading' | 'extracting' | 'creating' | 'starting' | 'booting' | 'ready' | 'error'
export interface EmulatorJob { phase: EmulatorPhase; label: string; received?: number; total?: number; source?: string; error?: string }
export interface EmulatorAvd { readonly name: string; readonly origin: 'opengui' | 'android_studio'; readonly running: boolean }
export interface EmulatorStatus {
  readonly supported: boolean
  readonly reason?: string
  readonly avds: readonly EmulatorAvd[]
  readonly job?: EmulatorJob
  /** Total download size for a fresh install, for the confirmation dialog. */
  readonly downloadBytes?: number
}

/** The launched emulator: exitCode stays null while it runs. */
export interface EmulatorProcess { readonly exitCode: number | null }

type Runner = (command: string, args: readonly string[], options: { env?: NodeJS.ProcessEnv; signal: AbortSignal; timeoutMs?: number; onSpawn?: (child: ChildProcess) => void }) => Promise<{ code: number | null; stdout: string; stderr: string }>
type AdbRunner = (args: readonly string[], signal: AbortSignal) => Promise<string>

export interface AndroidEmulatorOptions {
  stateDir: string
  runAdb: AdbRunner
  platform?: string
  arch?: string
  /** Process runner for curl, tar and the emulator tools; injectable for tests. */
  run?: Runner
  /** Detached emulator launcher writing to a log file; injectable for tests. */
  launch?: (emulator: string, args: readonly string[], env: NodeJS.ProcessEnv, log: string) => EmulatorProcess
  sources?: readonly string[]
  /** Existing Android SDK roots to reuse (Android Studio); defaults to the platform's usual locations. */
  sdkRoots?: readonly string[]
  avdHomes?: readonly string[]
  bootTimeoutMs?: number
  /** Archive pins; tests substitute small fixtures. */
  archives?: (target: HostTarget) => { emulator: AndroidArchive; image: AndroidArchive } | undefined
}

export function defaultRun(command: string, args: readonly string[], options: { env?: NodeJS.ProcessEnv; signal: AbortSignal; timeoutMs?: number; onSpawn?: (child: ChildProcess) => void }): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: options.env ?? process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    options.onSpawn?.(child)
    let stdout = '', stderr = ''
    child.stdout?.on('data', chunk => { stdout = (stdout + String(chunk)).slice(-1_000_000) })
    child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-20_000) })
    const abort = (): void => { child.kill() }
    const timer = options.timeoutMs ? setTimeout(abort, options.timeoutMs) : undefined
    options.signal.addEventListener('abort', abort, { once: true })
    child.once('error', error => { if (timer) clearTimeout(timer); options.signal.removeEventListener('abort', abort); reject(error) })
    child.once('close', code => { if (timer) clearTimeout(timer); options.signal.removeEventListener('abort', abort); resolve({ code, stdout, stderr }) })
  })
}

function defaultLaunch(emulator: string, args: readonly string[], env: NodeJS.ProcessEnv, log: string): EmulatorProcess {
  // The emulator outlives the plugin process; its output goes to a private log for diagnosis.
  const fd = openSync(log, 'w', 0o600)
  try {
    const child = spawn(emulator, args, { env, detached: true, stdio: ['ignore', fd, fd], windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return child
  } finally { closeSync(fd) }
}

function defaultSdkRoots(platform: string): string[] {
  const roots = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME].filter((root): root is string => Boolean(root?.trim()))
  if (platform === 'darwin') roots.push(join(homedir(), 'Library', 'Android', 'sdk'))
  if (platform === 'win32' && process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, 'Android', 'Sdk'))
  return [...new Set(roots)]
}

async function sha1(path: string): Promise<string> {
  const hash = createHash('sha1')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

export class AndroidEmulatorManager {
  private readonly target: HostTarget | undefined
  private readonly platform: string
  private readonly run: Runner
  private readonly launch: (emulator: string, args: readonly string[], env: NodeJS.ProcessEnv, log: string) => EmulatorProcess
  private readonly sources: readonly string[]
  private readonly sdkRoots: readonly string[]
  private readonly avdHomes: readonly string[]
  private readonly bootTimeoutMs: number
  private readonly archives: (target: HostTarget) => { emulator: AndroidArchive; image: AndroidArchive } | undefined
  readonly sdk: string
  readonly avdHome: string
  private job: EmulatorJob | undefined
  private controller: AbortController | undefined

  constructor(private readonly options: AndroidEmulatorOptions) {
    this.platform = options.platform ?? process.platform
    this.target = hostTarget(this.platform, options.arch ?? process.arch)
    this.run = options.run ?? defaultRun
    this.launch = options.launch ?? defaultLaunch
    this.sources = options.sources ?? ANDROID_SOURCES
    this.sdkRoots = options.sdkRoots ?? defaultSdkRoots(this.platform)
    this.avdHomes = options.avdHomes ?? [process.env.ANDROID_AVD_HOME, join(homedir(), '.android', 'avd')].filter((home): home is string => Boolean(home?.trim()))
    this.bootTimeoutMs = options.bootTimeoutMs ?? 300_000
    this.archives = options.archives ?? pinnedArchives
    this.sdk = join(options.stateDir, 'android', 'sdk')
    this.avdHome = join(options.stateDir, 'android', 'avd')
  }

  private emulatorBinary(sdk: string): string { return join(sdk, 'emulator', this.platform === 'win32' ? 'emulator.exe' : 'emulator') }

  /** The private AVD when complete, then Android Studio AVDs whose system image exists in a known SDK. */
  private async findAvds(): Promise<Array<{ name: string; origin: EmulatorAvd['origin']; sdk: string; home: string }>> {
    const found: Array<{ name: string; origin: EmulatorAvd['origin']; sdk: string; home: string }> = []
    if (this.target && existsSync(this.emulatorBinary(this.sdk)) && existsSync(join(this.avdHome, `${OPENGUI_AVD}.ini`))
      && existsSync(join(this.sdk, 'system-images', `android-${IMAGE_API}`, IMAGE_TAG, this.target.abi, 'system.img'))) found.push({ name: OPENGUI_AVD, origin: 'opengui', sdk: this.sdk, home: this.avdHome })
    const sdk = this.sdkRoots.find(root => existsSync(this.emulatorBinary(root)))
    if (!sdk) return found
    for (const home of this.avdHomes) {
      const names = await readdir(home).catch(() => [] as string[])
      for (const file of names.filter(name => name.endsWith('.ini')).sort()) {
        const name = file.slice(0, -4)
        if (!/^[A-Za-z0-9._-]{1,64}$/u.test(name) || found.some(avd => avd.name === name)) continue
        const config = await readFile(join(home, `${name}.avd`, 'config.ini'), 'utf8').catch(() => '')
        const sysdir = /^image\.sysdir\.1=(.+)$/mu.exec(config)?.[1]?.trim()
        if (sysdir && existsSync(join(sdk, sysdir, 'system.img'))) found.push({ name, origin: 'android_studio', sdk, home })
      }
    }
    return found
  }

  /** AVD names of emulators currently attached to ADB, keyed by serial. */
  private async running(signal: AbortSignal): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const devices = await this.options.runAdb(['devices'], signal).catch(() => '')
    for (const serial of devices.split(/\r?\n/u).map(line => /^(emulator-\d+)\s+device\b/u.exec(line)?.[1]).filter((value): value is string => Boolean(value))) {
      const name = (await this.options.runAdb(['-s', serial, 'emu', 'avd', 'name'], signal).catch(() => '')).split(/\r?\n/u)[0]?.trim()
      if (name) map.set(name, serial)
    }
    return map
  }

  async status(signal: AbortSignal = AbortSignal.timeout(8000)): Promise<EmulatorStatus> {
    if (!this.target) return { supported: false, reason: '当前电脑暂不支持一键安装模拟器（支持 macOS 与 64 位 Windows）', avds: [] }
    const [avds, running] = await Promise.all([this.findAvds(), this.running(signal)])
    const pinned = this.archives(this.target)
    return {
      supported: true, avds: avds.map(avd => ({ name: avd.name, origin: avd.origin, running: running.has(avd.name) })),
      ...(this.job ? { job: { ...this.job } } : {}), ...(pinned ? { downloadBytes: pinned.emulator.size + pinned.image.size } : {}),
    }
  }

  get busy(): boolean { return Boolean(this.job && !['ready', 'error'].includes(this.job.phase)) }

  cancel(): void { this.controller?.abort(new Error('emulator_cancelled')) }

  /** Install (when needed) and boot; progress is read through status(). Returns once started in the background. */
  begin(action: 'install' | 'start', name?: string): void {
    if (!this.target) throw new Error('emulator_unsupported')
    if (this.busy) throw new Error('emulator_busy')
    const controller = new AbortController()
    this.controller = controller
    this.job = { phase: 'checking', label: '正在检查环境…' }
    void this.execute(action, name, controller.signal).catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      this.job = { phase: 'error', label: controller.signal.aborted ? '已取消' : '没有完成', error: controller.signal.aborted ? 'emulator_cancelled' : message }
    })
  }

  private step(job: EmulatorJob): void { this.job = job }

  private async execute(action: 'install' | 'start', name: string | undefined, signal: AbortSignal): Promise<void> {
    const target = this.target!
    let avd = (await this.findAvds()).find(item => name ? item.name === name : true)
    if (action === 'install' || !avd) {
      avd = (await this.findAvds()).find(item => item.origin === 'opengui')
      if (!avd) { await this.install(target, signal); avd = (await this.findAvds()).find(item => item.origin === 'opengui') }
      if (!avd) throw new Error('emulator_install_incomplete')
    }
    const already = (await this.running(signal)).get(avd.name)
    if (already) { this.step({ phase: 'ready', label: `模拟器已在运行（${already}）` }); return }
    await this.boot(avd, signal)
  }

  private async install(target: HostTarget, signal: AbortSignal): Promise<void> {
    await mkdir(this.sdk, { recursive: true, mode: 0o700 })
    const free = await statfs(this.sdk).then(info => info.bavail * info.bsize).catch(() => Number.POSITIVE_INFINITY)
    if (free < MIN_FREE_BYTES) throw new Error(`emulator_disk_space: 至少需要 8 GB 可用空间（当前约 ${(free / 1024 ** 3).toFixed(1)} GB）`)
    this.step({ phase: 'checking', label: '正在选择下载源…' })
    const pinned = this.archives(target)
    if (!pinned) throw new Error('emulator_unsupported')
    const { emulator, image } = pinned
    const order = await this.rankSources(emulator, signal)
    const downloads = join(this.options.stateDir, 'android', 'downloads')
    await mkdir(downloads, { recursive: true, mode: 0o700 })
    let done = 0
    const total = emulator.size + image.size
    for (const [archive, label] of [[emulator, '下载模拟器'], [image, '下载 Android 14 系统镜像']] as const) {
      const file = await this.download(order, archive, downloads, received => this.step({ phase: 'downloading', label, received: done + received, total, source: new URL(order[0]!).hostname }), signal)
      done += archive.size
      this.step({ phase: 'extracting', label: '正在解压…' })
      const into = archive === emulator ? this.sdk : join(this.sdk, 'system-images', `android-${IMAGE_API}`, IMAGE_TAG)
      await this.extract(file, into, signal)
    }
    // The emulator rejects an SDK root without platform-tools ("Broken AVD system path"); ADB itself
    // stays the plugin's bundled copy, which the emulator reaches over the standard adb server port.
    await mkdir(join(this.sdk, 'platform-tools'), { recursive: true })
    await mkdir(join(this.sdk, 'platforms'), { recursive: true })
    this.step({ phase: 'creating', label: '正在创建虚拟手机…' })
    const avdDir = join(this.avdHome, `${OPENGUI_AVD}.avd`)
    await mkdir(avdDir, { recursive: true, mode: 0o700 })
    await writeFile(join(avdDir, 'config.ini'), avdConfig(target))
    await writeFile(join(this.avdHome, `${OPENGUI_AVD}.ini`), `avd.ini.encoding=UTF-8\npath=${avdDir}\ntarget=android-${IMAGE_API}\n`)
    for (const file of await readdir(downloads).catch(() => [] as string[])) await rm(join(downloads, file), { force: true })
  }

  /** Download the first megabyte from every source at once; the faster one serves the archives. */
  private async rankSources(archive: AndroidArchive, signal: AbortSignal): Promise<string[]> {
    const probes = await Promise.all(this.sources.map(async source => {
      const result = await this.run('curl', ['-fsSL', '-r', '0-1048575', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', '-w', '%{speed_download}', '--connect-timeout', '10', '--max-time', '20', `${source}${archive.url}`], { signal }).catch(() => undefined)
      const speed = Number(result?.stdout.trim())
      return { source, speed: result && [0, 28].includes(result.code ?? -1) && Number.isFinite(speed) ? speed : -1 }
    }))
    signal.throwIfAborted()
    if (probes.every(probe => probe.speed <= 0)) throw new Error('emulator_network: 无法连接 Android 下载源（Google 或腾讯云镜像），请检查网络或代理后重试')
    return probes.sort((a, b) => b.speed - a.speed).map(probe => probe.source)
  }

  /** Resumable curl download with size and SHA-1 verification; other sources are tried in order. */
  private async download(order: readonly string[], archive: AndroidArchive, directory: string, progress: (received: number) => void, signal: AbortSignal): Promise<string> {
    const file = join(directory, archive.url.split('/').pop()!), partial = `${file}.part`
    if (await stat(file).then(info => info.size === archive.size).catch(() => false) && await sha1(file) === archive.sha1) return file
    for (const source of order) {
      let poll: ReturnType<typeof setInterval> | undefined
      try {
        poll = setInterval(() => { void stat(partial).then(info => progress(info.size)).catch(() => {}) }, 500)
        const fetchArchive = (resume: boolean) => this.run('curl', ['-fL', '--retry', '3', '--retry-delay', '2', '--connect-timeout', '20', ...(resume ? ['-C', '-'] : []), '-s', '-o', partial, `${source}${archive.url}`], { signal })
        let result = await fetchArchive(true)
        // 33: the server ignores byte ranges, so the partial file cannot be resumed; start over once.
        if (result.code === 33) { await rm(partial, { force: true }); result = await fetchArchive(false) }
        if (result.code !== 0) throw new Error(`download_failed ${result.code}`)
      } catch (error) {
        if (signal.aborted) throw error
        continue
      } finally { if (poll) clearInterval(poll) }
      const size = await stat(partial).then(info => info.size).catch(() => 0)
      if (size !== archive.size || await sha1(partial) !== archive.sha1) { await rm(partial, { force: true }); continue }
      await rename(partial, file)
      return file
    }
    signal.throwIfAborted()
    throw new Error('emulator_download_failed: 下载没有完成或校验失败，请检查网络后重试（已下载部分会保留以便续传）')
  }

  private async extract(file: string, into: string, signal: AbortSignal): Promise<void> {
    await mkdir(into, { recursive: true })
    // bsdtar on macOS and Windows 10+ (tar.exe) reads zip archives.
    const result = await this.run('tar', ['-xf', file, '-C', into], { signal })
    if (result.code !== 0) throw new Error(`emulator_extract_failed: ${result.stderr.trim().slice(-200)}`)
  }

  private async freePort(signal: AbortSignal): Promise<number> {
    const attached = await this.options.runAdb(['devices'], signal).catch(() => '')
    for (let port = 5554; port <= 5682; port += 2) {
      if (attached.includes(`emulator-${port}`)) continue
      const available = await Promise.all([port, port + 1].map(candidate => new Promise<boolean>(resolve => {
        const server = createServer().once('error', () => resolve(false)).listen(candidate, '127.0.0.1', () => server.close(() => resolve(true)))
      })))
      if (available.every(Boolean)) return port
    }
    throw new Error('emulator_no_port')
  }

  private async boot(avd: { name: string; origin: EmulatorAvd['origin']; sdk: string; home: string }, signal: AbortSignal): Promise<void> {
    const emulator = this.emulatorBinary(avd.sdk), env = { ...process.env, ANDROID_SDK_ROOT: avd.sdk, ANDROID_HOME: avd.sdk, ANDROID_AVD_HOME: avd.home }
    if (avd.origin === 'opengui') await mkdir(join(avd.sdk, 'platform-tools'), { recursive: true })
    this.step({ phase: 'starting', label: '正在启动模拟器…' })
    const accel = await this.run(emulator, ['-accel-check'], { env, signal, timeoutMs: 30_000 }).catch(() => undefined)
    if (accel && accel.code !== 0) {
      throw new Error(this.platform === 'win32'
        ? 'emulator_acceleration: 需要开启硬件虚拟化：在「启用或关闭 Windows 功能」中勾选「Windows 虚拟机监控程序平台」，并在 BIOS 中开启虚拟化后重启电脑'
        : `emulator_acceleration: ${(accel.stdout + accel.stderr).trim().split(/\r?\n/u).at(-1) ?? '硬件虚拟化不可用'}`)
    }
    const port = await this.freePort(signal), serial = `emulator-${port}`
    // Headless: the workbench shows and controls the screen through scrcpy.
    const log = join(this.options.stateDir, 'android', 'emulator.log')
    await mkdir(join(this.options.stateDir, 'android'), { recursive: true, mode: 0o700 })
    const child = this.launch(emulator, ['-avd', avd.name, '-port', String(port), '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot-save', '-gpu', 'swiftshader_indirect'], env, log)
    this.step({ phase: 'booting', label: '正在启动 Android 系统（首次约 1–3 分钟）…' })
    const deadline = Date.now() + this.bootTimeoutMs
    while (Date.now() < deadline) {
      signal.throwIfAborted()
      if (child.exitCode !== null) {
        const output = await readFile(log, 'utf8').catch(() => '')
        const reason = output.split(/\r?\n/u).reverse().find(line => /FATAL|ERROR|PANIC/u.test(line))?.replace(/^\S+\s+\|\s*/u, '').trim().slice(0, 200)
        throw new Error(`emulator_exited: 模拟器启动失败${reason ? `：${reason}` : '，请重试'}`)
      }
      const booted = (await this.options.runAdb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], signal).catch(() => '')).trim()
      if (booted === '1') { this.step({ phase: 'ready', label: `模拟器已就绪（${serial}）` }); return }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    throw new Error('emulator_boot_timeout: 模拟器启动超时，请重试；若多次失败，可在设备连接帮助中查看手动启动方法')
  }
}
