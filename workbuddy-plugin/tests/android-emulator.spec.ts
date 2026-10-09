import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AndroidEmulatorManager, OPENGUI_AVD, avdConfig, hostTarget, pinnedArchives, type AndroidArchive } from '../src/android-emulator.ts'
import { ViewerServer } from '../src/viewer.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'

const cleanups: Array<() => unknown> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const temp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'opengui-emulator-')); cleanups.push(() => rmSync(dir, { recursive: true, force: true })); return dir }
const fixture = (content: string, url: string): AndroidArchive & { content: string } => ({ url, size: Buffer.byteLength(content), sha1: createHash('sha1').update(content).digest('hex'), licenses: [], content })

describe('android emulator targets and pins', () => {
  it('picks the system image ABI that runs natively on each supported computer', () => {
    expect(hostTarget('darwin', 'arm64')).toEqual({ os: 'macosx', arch: 'aarch64', abi: 'arm64-v8a' })
    expect(hostTarget('darwin', 'x64')).toEqual({ os: 'macosx', arch: 'x64', abi: 'x86_64' })
    expect(hostTarget('win32', 'x64')).toEqual({ os: 'windows', arch: 'x64', abi: 'x86_64' })
    for (const [platform, arch] of [['win32', 'arm64'], ['linux', 'x64']]) expect(hostTarget(platform, arch)).toBeUndefined()
    for (const target of [hostTarget('darwin', 'arm64')!, hostTarget('darwin', 'x64')!, hostTarget('win32', 'x64')!]) {
      const pins = pinnedArchives(target)!
      expect(pins.emulator.url).toMatch(/^emulator-(darwin|windows)_(aarch64|x64)-\d+\.zip$/u)
      expect(pins.image.url).toBe(`sys-img/google_apis/${target.abi}-34_r14.zip`)
      expect(pins.emulator.sha1).toMatch(/^[0-9a-f]{40}$/u)
    }
  })

  it('writes a phone-sized private AVD pointing at the Google APIs image', () => {
    const config = avdConfig(hostTarget('darwin', 'arm64')!)
    expect(config).toContain('image.sysdir.1=system-images/android-34/google_apis/arm64-v8a/')
    expect(config).toContain('hw.cpu.arch=arm64')
    expect(config).toContain('hw.keyboard=yes')
  })
})

describe('android emulator install and boot', () => {
  async function setup(options: { tencentFaster?: boolean; corruptFirst?: boolean; crash?: string } = {}) {
    const state = temp(), emulatorZip = fixture('emulator-bytes', 'emulator-darwin_aarch64-1.zip'), imageZip = fixture('image-bytes', 'sys-img/google_apis/arm64-v8a-34_r14.zip')
    const downloads: string[] = [], launched: Array<{ args: readonly string[]; env: NodeJS.ProcessEnv }> = []
    let booted = false
    const run = vi.fn(async (command: string, args: readonly string[]) => {
      if (command === 'curl' && args.includes('-r')) return { code: 0, stdout: args.at(-1)!.includes('tencent') === Boolean(options.tencentFaster) ? '900000' : '12000', stderr: '' }
      if (command === 'curl') {
        const url = args.at(-1)!, output = args[args.indexOf('-o') + 1]!
        downloads.push(url)
        const archive = url.endsWith(emulatorZip.url) ? emulatorZip : imageZip
        await writeFile(output, options.corruptFirst && downloads.length === 1 ? 'tampered!!!!!' : archive.content)
        return { code: 0, stdout: '', stderr: '' }
      }
      if (command === 'tar') {
        const into = args[args.indexOf('-C') + 1]!
        if ((await readFile(args[1]!, 'utf8')) === 'emulator-bytes') { await mkdir(join(into, 'emulator'), { recursive: true }); await writeFile(join(into, 'emulator', 'emulator'), '') }
        else { await mkdir(join(into, 'arm64-v8a'), { recursive: true }); await writeFile(join(into, 'arm64-v8a', 'system.img'), '') }
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: 'hvf is installed and usable', stderr: '' } // emulator -accel-check
    })
    let port = ''
    const runAdb = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'devices') return booted ? `List of devices attached\nemulator-${port}\tdevice\n` : 'List of devices attached\n'
      if (args.includes('emu')) return `${OPENGUI_AVD}\r\nOK\r\n`
      if (args.includes('sys.boot_completed')) return booted ? '1\n' : ''
      return ''
    })
    const manager = new AndroidEmulatorManager({
      stateDir: state, runAdb, run, platform: 'darwin', arch: 'arm64', sdkRoots: [], avdHomes: [], bootTimeoutMs: 20_000,
      sources: ['https://dl.google.test/repo/', 'https://mirrors.tencent.test/AndroidSDK/'],
      archives: () => ({ emulator: emulatorZip, image: imageZip }),
      launch: (_emulator, args, env, log) => {
        launched.push({ args, env }); port = args[args.indexOf('-port') + 1]!
        if (options.crash) { writeFileSync(log, `INFO | starting\nFATAL        | ${options.crash}\n`); return { exitCode: 1 } }
        booted = true; return { exitCode: null }
      },
    })
    const settle = async () => { await vi.waitFor(() => expect(manager.busy).toBe(false), { timeout: 15_000 }); return manager.status() }
    return { state, manager, run, downloads, launched, settle }
  }

  it('downloads from the faster source, verifies, extracts privately and boots headless', async () => {
    const f = await setup({ tencentFaster: true })
    expect((await f.manager.status()).avds).toEqual([])
    f.manager.begin('install')
    const status = await f.settle()
    expect(status.job).toMatchObject({ phase: 'ready' })
    expect(f.downloads.every(url => url.startsWith('https://mirrors.tencent.test/'))).toBe(true)
    expect(existsSync(join(f.state, 'android', 'sdk', 'emulator', 'emulator'))).toBe(true)
    expect(await readFile(join(f.state, 'android', 'avd', `${OPENGUI_AVD}.avd`, 'config.ini'), 'utf8')).toContain('image.sysdir.1=system-images/android-34/google_apis/arm64-v8a/')
    expect(f.launched[0]!.args).toEqual(expect.arrayContaining(['-avd', OPENGUI_AVD, '-no-window', '-no-snapshot-save']))
    // Only the private SDK and AVD home are used; the person's Android Studio setup is untouched.
    expect(f.launched[0]!.env).toMatchObject({ ANDROID_SDK_ROOT: join(f.state, 'android', 'sdk'), ANDROID_AVD_HOME: join(f.state, 'android', 'avd') })
    expect(status.avds).toEqual([{ name: OPENGUI_AVD, origin: 'opengui', running: true }])
  })

  it('rejects bytes that do not match the pinned checksum and uses the next source', async () => {
    const f = await setup({ corruptFirst: true })
    f.manager.begin('install')
    expect((await f.settle()).job).toMatchObject({ phase: 'ready' })
    expect(f.downloads[0]).toContain('dl.google.test')
    expect(f.downloads[1]).toContain('mirrors.tencent.test')
  })

  it('fails fast with the emulator reason when it exits before booting', async () => {
    const f = await setup({ crash: 'Broken AVD system path. Check your ANDROID_SDK_ROOT value' })
    f.manager.begin('install')
    const status = await f.settle()
    expect(status.job).toMatchObject({ phase: 'error' })
    expect(status.job!.error).toContain('Broken AVD system path')
    expect(existsSync(join(f.state, 'android', 'sdk', 'platform-tools'))).toBe(true)
  })

  it('reports an unsupported computer instead of offering an install', async () => {
    const manager = new AndroidEmulatorManager({ stateDir: temp(), runAdb: async () => '', platform: 'linux', arch: 'x64' })
    expect(await manager.status()).toMatchObject({ supported: false, avds: [] })
    expect(() => manager.begin('install')).toThrow('emulator_unsupported')
  })
})

describe('emulator route', () => {
  it('requires the board capability and explicit license acceptance before installing', async () => {
    const begin = vi.fn()
    const emulators = { status: async () => ({ supported: true, avds: [] }), begin, cancel: vi.fn(), busy: false } as unknown as AndroidEmulatorManager
    const viewer = new ViewerServer({ prepare: async () => {}, subscribe: async () => () => {}, async dispose() {} })
    const service = new WorkBuddyOpenGuiService({ host: new FakeHost(), viewers: viewer, emulators })
    cleanups.push(() => service.dispose(), () => viewer.dispose())
    const opened = await service.openViewer(['phone-a'], AbortSignal.timeout(5000), { objective: 'Check the login page' })
    const token = new URL(opened.workbenchUrl).hash.slice(7), origin = new URL(opened.url).origin
    const post = (body: unknown, board = token) => fetch(`${opened.url}emulator`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': board }, body: JSON.stringify(body) })
    expect(await (await fetch(`${opened.url}emulator`)).json()).toEqual({ supported: true, avds: [] })
    expect((await post({ action: 'install', acceptLicense: true }, 'wrong')).status).toBe(403)
    const refused = await post({ action: 'install' })
    expect(refused.status).toBe(400)
    expect((await refused.json()).error).toContain('许可协议')
    expect(begin).not.toHaveBeenCalled()
    expect((await post({ action: 'install', acceptLicense: true })).status).toBe(200)
    expect((await post({ action: 'start', name: '../../etc' })).status).toBe(200)
    expect(begin.mock.calls).toEqual([['install'], ['start', undefined]])
  })
})
