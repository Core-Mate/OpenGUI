import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ScrcpyInstaller, resolveScrcpyAsset } from './scrcpy.ts'
import { probeWindow, type WindowEvidence } from './window-probe.ts'
import { retryRead } from './errors.ts'

export interface MirrorStatus {
  phase: 'idle' | 'downloading' | 'extracting' | 'launching' | 'running' | 'error'
  downloadedBytes?: number
  totalBytes?: number
  message?: string
  visible?: boolean
  rendererReady?: boolean
  ready?: boolean
}
interface Entry {
  status: MirrorStatus
  controller: AbortController
  job: Promise<void>
  child?: ChildProcess | undefined
  stopping?: Promise<void>
  executable?: string
  identity?: string
  didRequestShow?: boolean
  slot?: number
  showing?: Promise<void>
  placed?: boolean
  windowPid?: number
  launcher?: boolean
}

/** Own only children launched by this WorkBuddy broker. Never discover or kill foreign processes. */
export class NativeMirror {
  private readonly entries = new Map<string, Entry>()
  constructor(private readonly options: {
    adbPath: string
    installer: ScrcpyInstaller
    spawn?: typeof spawn
    onEnded: (serial: string) => void
    probe?: typeof probeWindow
  }) {}

  status(serial: string): MirrorStatus { return { ...(this.entries.get(serial)?.status ?? { phase: 'idle' }) } }

  active(): boolean { return [...this.entries.values()].some(e => !!e.child || !['idle', 'error'].includes(e.status.phase)) }

  async inspect(serial: string, show = false): Promise<MirrorStatus> {
    const entry = this.entries.get(serial)
    if (!entry?.child?.pid || !entry.executable) return this.status(serial)
    const pid = entry.launcher ? entry.windowPid : entry.child.pid
    if (!pid) return this.status(serial)
    const evidence: WindowEvidence = await (this.options.probe ?? probeWindow)(pid, entry.executable, entry.identity, show, show && !entry.placed ? entry.slot : -1, entry.launcher ? entry.child.pid : process.pid)
    if (this.entries.get(serial) !== entry || !entry.child) return this.status(serial)
    if (evidence.identity) entry.identity ??= evidence.identity
    if (show && evidence.visible) entry.placed = true
    entry.status.visible = evidence.visible
    entry.status.ready = entry.status.phase === 'running' && entry.status.rendererReady === true && evidence.visible
    if (evidence.message) entry.status.message = evidence.message
    else if (entry.status.ready) delete entry.status.message
    return this.status(serial)
  }

  private async showInitial(serial: string, entry: Entry): Promise<void> {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && this.entries.get(serial) === entry && entry.child && !entry.controller.signal.aborted) {
      const state = await this.inspect(serial, true)
      if (state.visible || /permission|identity mismatch|unavailable/i.test(state.message ?? '')) return
      await new Promise<void>(resolve => {
        const done = (): void => { clearTimeout(timer); entry.controller.signal.removeEventListener('abort', done); resolve() }
        const timer = setTimeout(done, 100)
        entry.controller.signal.addEventListener('abort', done, { once: true })
      })
    }
  }

  async open(serial: string, label: string, signal: AbortSignal): Promise<void> {
    const previous = this.entries.get(serial)
    if (previous?.stopping) await previous.stopping
    signal.throwIfAborted()
    const current = this.entries.get(serial)
    if (current?.child || (current && !['idle', 'error'].includes(current.status.phase))) { await this.inspect(serial, true); return }
    const controller = new AbortController()
    const entry: Entry = { status: { phase: 'downloading' }, controller, job: Promise.resolve(), slot: previous?.slot ?? this.entries.size }
    this.entries.set(serial, entry)
    entry.job = this.launch(serial, label, entry, AbortSignal.any([signal, controller.signal])).catch(error => {
      if (!controller.signal.aborted) entry.status = { phase: 'error', message: String(error instanceof Error ? error.message : error) }
    }).finally(() => {
      if (!entry.child && !entry.stopping) this.options.onEnded(serial)
    })
  }

  private async launch(serial: string, label: string, entry: Entry, signal: AbortSignal): Promise<void> {
    const asset = resolveScrcpyAsset()
    if (!asset) throw new Error('opengui: native mirroring is unsupported on this platform')
    const installed = await retryRead(() => this.options.installer.ensure(asset, signal, progress => { entry.status = { ...progress } }), signal)
    signal.throwIfAborted()
    entry.status = { phase: 'launching' }
    entry.executable = installed.executable
    entry.launcher = process.platform === 'darwin'
    const executable = entry.launcher ? fileURLToPath(new URL(`./native/mirror-launcher-${process.arch}`, import.meta.url)) : installed.executable
    const child = (this.options.spawn ?? spawn)(executable, [
      ...(entry.launcher ? [installed.executable] : []),
      '--serial', serial, '--no-control', '--no-audio', '--max-size=1280', '--max-fps=30', '--video-bit-rate=4M',
      `--window-title=OpenGUI · WorkBuddy · ${label}`,
    ], { cwd: installed.root, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ADB: this.options.adbPath, SCRCPY_SERVER_PATH: installed.server } })
    entry.child = child
    let detail = ''
    const readLog = (chunk: unknown): void => {
      detail = (detail + String(chunk)).slice(-4000)
      const identity = /^OPENGUI_CHILD_PID=(\d+)\r?$/mu.exec(detail)
      if (entry.launcher && !entry.windowPid && identity) entry.windowPid = Number(identity[1])
      if (!entry.didRequestShow && /Texture:\s*\d+x\d+/u.test(detail)) {
        entry.status.rendererReady = true
        entry.didRequestShow = true
        entry.showing = this.showInitial(serial, entry).catch(error => { entry.status.message = String(error) })
      }
    }
    child.stdout?.on('data', readLog)
    child.stderr?.on('data', readLog)
    child.on('error', error => {
      // An error (for example failed signaling) does not prove a spawned process exited.
      if (!child.pid) entry.child = undefined
      entry.status = { phase: 'error', ready: false, message: error.message }
    })
    child.once('exit', (code, exitSignal) => {
      entry.child = undefined
      entry.status = code === 0 || exitSignal === 'SIGTERM' || entry.controller.signal.aborted
        ? { phase: 'idle' } : { phase: 'error', message: `scrcpy exited (${String(code)}): ${detail}` }
      if (!entry.stopping && this.entries.get(serial) === entry) this.options.onEnded(serial)
    })
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
    signal.throwIfAborted()
    if (entry.child && entry.status.phase !== 'error') entry.status = { ...entry.status, phase: 'running', ready: false }
  }

  async stop(serial: string): Promise<void> {
    const entry = this.entries.get(serial)
    if (!entry) return
    entry.stopping ??= (async () => {
      entry.controller.abort()
      await entry.job
      await entry.showing
      const child = entry.child
      if (child && child.exitCode === null) {
        const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
        child.kill('SIGTERM')
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([exited, new Promise<void>(resolve => { timer = setTimeout(resolve, 3000) })])
        clearTimeout(timer)
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
          let forcedTimer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([exited, new Promise<never>((_resolve, reject) => { forcedTimer = setTimeout(() => reject(new Error('opengui: owned mirror did not exit; cleanup incomplete')), 3000) })])
          } finally { clearTimeout(forcedTimer) }
        }
      }
      entry.child = undefined
      if (entry.status.phase !== 'error') entry.status = { phase: 'idle' }
    })()
    await entry.stopping
  }

  async dispose(): Promise<void> { await Promise.all([...this.entries.keys()].map(serial => this.stop(serial))) }
}
