import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import puppeteer from 'puppeteer-core'
import type { Browser, Page } from 'puppeteer-core'
import { extractSafeZip } from './secure-zip.ts'

export const CHROME_VERSION = '152.0.7977.42'

export interface BrowserAsset {
  key: string
  archiveRoot: string
  executable: string
  url: string
  bytes: number
  sha256: string
}

const RELEASE_BASE = `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}`

/** Chrome for Testing archives pinned to the Puppeteer version shipped by this plugin. */
export const BROWSER_ASSETS: Readonly<Record<string, BrowserAsset>> = Object.freeze({
  'darwin-arm64': {
    key: 'darwin-arm64', archiveRoot: 'chrome-mac-arm64',
    executable: 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    url: `${RELEASE_BASE}/mac-arm64/chrome-mac-arm64.zip`, bytes: 187_731_120,
    sha256: 'c9a7b6bfb57731944990ffb7cafc17ae2f2a2e25ad1f145f45584d7b799d3ce8',
  },
  'darwin-x64': {
    key: 'darwin-x64', archiveRoot: 'chrome-mac-x64',
    executable: 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    url: `${RELEASE_BASE}/mac-x64/chrome-mac-x64.zip`, bytes: 197_521_808,
    sha256: '3bd9d6b077d67466ffff1b65e4292a255b953587dc6f4b72dfbd88df2cfd99e7',
  },
  'linux-x64': {
    key: 'linux-x64', archiveRoot: 'chrome-linux64', executable: 'chrome',
    url: `${RELEASE_BASE}/linux64/chrome-linux64.zip`, bytes: 193_992_440,
    sha256: 'cb77f4781cad7d5e06fcc78b4476e6a6375616e7278dc313abaa9db22ed4674e',
  },
  'win32-x64': {
    key: 'win32-x64', archiveRoot: 'chrome-win64', executable: 'chrome.exe',
    url: `${RELEASE_BASE}/win64/chrome-win64.zip`, bytes: 202_527_828,
    sha256: '5093f03a401b5579da490d281aba80b687d92fe6fdfec47ee522920918d6e327',
  },
})

export function resolveBrowserAsset(platform = process.platform, arch = process.arch): BrowserAsset | undefined {
  return BROWSER_ASSETS[`${platform}-${arch}`]
}

export function defaultBrowserCacheDir(): string {
  const configured = process.env.DSH_HOME?.trim()
  const dshHome = configured ? resolve(configured) : join(homedir(), '.dsh')
  return join(dshHome, 'cache', 'coremate-mobile', 'browser')
}

export type BrowserInstallPhase =
  | 'idle'
  | 'awaiting-confirmation'
  | 'downloading'
  | 'extracting'
  | 'ready'
  | 'unsupported'
  | 'error'

export interface BrowserInstallStatus {
  phase: BrowserInstallPhase
  version: string
  hostPlatform: string
  totalBytes?: number
  downloadedBytes?: number
  message?: string
}

interface InstalledBrowser {
  root: string
  executable: string
  profile: string
}

interface InstallProgress {
  phase: 'downloading' | 'extracting'
  downloadedBytes?: number
  totalBytes?: number
}

export interface BrowserInstallerOptions {
  cacheDir?: string
  fetch?: typeof globalThis.fetch
}

/** Atomic, verified installation of one pinned Chrome for Testing archive. */
export class BrowserInstaller {
  private readonly cacheDir: string
  private readonly fetchImpl: typeof globalThis.fetch
  private active: Promise<InstalledBrowser> | undefined

  constructor(options: BrowserInstallerOptions = {}) {
    this.cacheDir = options.cacheDir ?? defaultBrowserCacheDir()
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  paths(asset: BrowserAsset): InstalledBrowser {
    const root = join(this.cacheDir, `v${CHROME_VERSION}`, asset.key, asset.archiveRoot)
    return {
      root,
      executable: join(root, asset.executable),
      profile: join(this.cacheDir, 'profile'),
    }
  }

  async isInstalled(asset: BrowserAsset): Promise<boolean> {
    const paths = this.paths(asset)
    try {
      const [executable, raw] = await Promise.all([
        lstat(paths.executable),
        readFile(join(paths.root, '.coremate-install.json'), 'utf8'),
      ])
      if (!executable.isFile() || executable.isSymbolicLink()) return false
      const parsed = JSON.parse(raw) as { version?: unknown; sha256?: unknown }
      return parsed.version === CHROME_VERSION && parsed.sha256 === asset.sha256
    } catch {
      return false
    }
  }

  ensure(
    asset: BrowserAsset,
    signal: AbortSignal,
    progress: (progress: InstallProgress) => void,
  ): Promise<InstalledBrowser> {
    if (this.active !== undefined) return this.active
    const operation = this.install(asset, signal, progress)
    this.active = operation
    void operation.finally(() => {
      if (this.active === operation) this.active = undefined
    }).catch(() => {})
    return operation
  }

  private async install(
    asset: BrowserAsset,
    signal: AbortSignal,
    progress: (progress: InstallProgress) => void,
  ): Promise<InstalledBrowser> {
    if (await this.isInstalled(asset)) return this.paths(asset)
    signal.throwIfAborted()

    const assetDir = join(this.cacheDir, `v${CHROME_VERSION}`, asset.key)
    await mkdir(assetDir, { recursive: true })
    const archivePath = join(assetDir, `.download-${randomUUID()}.zip`)
    const staging = await mkdtemp(join(assetDir, '.extract-'))
    try {
      await this.download(asset, archivePath, signal, progress)
      signal.throwIfAborted()
      progress({ phase: 'extracting' })
      await extractSafeZip(archivePath, staging)
      signal.throwIfAborted()

      const extractedRoot = join(staging, asset.archiveRoot)
      const executable = join(extractedRoot, asset.executable)
      await this.assertRegularInside(staging, executable)
      if (process.platform !== 'win32') await chmod(executable, 0o755)
      await writeFile(join(extractedRoot, '.coremate-install.json'), JSON.stringify({
        version: CHROME_VERSION,
        asset: asset.key,
        sha256: asset.sha256,
      }), { encoding: 'utf8', mode: 0o600 })
      await mkdir(this.paths(asset).profile, { recursive: true })

      const destination = this.paths(asset).root
      if (!(await this.isInstalled(asset))) await rm(destination, { recursive: true, force: true })
      try {
        await rename(extractedRoot, destination)
      } catch (error) {
        if (!(await this.isInstalled(asset))) throw error
      }
      return this.paths(asset)
    } finally {
      await Promise.allSettled([
        rm(archivePath, { force: true }),
        rm(staging, { recursive: true, force: true }),
      ])
    }
  }

  private async download(
    asset: BrowserAsset,
    archivePath: string,
    signal: AbortSignal,
    progress: (progress: InstallProgress) => void,
  ): Promise<void> {
    progress({ phase: 'downloading', downloadedBytes: 0, totalBytes: asset.bytes })
    const response = await this.fetchImpl(asset.url, { signal, redirect: 'follow' })
    if (!response.ok || response.body === null) {
      throw new Error(`browser download failed with HTTP ${response.status}`)
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
        if (downloaded > asset.bytes) throw new Error('browser download exceeded the pinned asset size')
        digest.update(next.value)
        let offset = 0
        while (offset < next.value.byteLength) {
          const { bytesWritten } = await file.write(next.value, offset, next.value.byteLength - offset, null)
          if (bytesWritten === 0) throw new Error('browser download write made no progress')
          offset += bytesWritten
        }
        progress({ phase: 'downloading', downloadedBytes: downloaded, totalBytes: asset.bytes })
      }
    } finally {
      await file.close()
    }
    if (downloaded !== asset.bytes) {
      throw new Error(`browser download size mismatch: expected ${asset.bytes}, received ${downloaded}`)
    }
    if (digest.digest('hex') !== asset.sha256) throw new Error('browser download checksum mismatch')
  }

  private async assertRegularInside(root: string, path: string): Promise<void> {
    const [resolvedRoot, resolvedPath, info] = await Promise.all([realpath(root), realpath(path), lstat(path)])
    if (!resolvedPath.startsWith(`${resolvedRoot}${sep}`) || !info.isFile() || info.isSymbolicLink()) {
      throw new Error(`browser archive contained an unsafe ${basename(path)} entry`)
    }
  }
}

interface Confirmation {
  resolve(): void
  reject(error: Error): void
}

/** Owns first-use consent, verified installation, and one visible browser process. */
export class ManagedBrowser {
  private readonly installer: BrowserInstaller
  private readonly asset: BrowserAsset | undefined
  private phase: BrowserInstallPhase
  private downloadedBytes: number | undefined
  private message: string | undefined
  private confirmation: Confirmation | undefined
  private promptAvailable = false
  private installationChecked = false
  private browser: Browser | undefined
  private readonly launch: typeof puppeteer.launch

  constructor(options: { installer?: BrowserInstaller; asset?: BrowserAsset; launch?: typeof puppeteer.launch } = {}) {
    this.installer = options.installer ?? new BrowserInstaller()
    this.asset = options.asset ?? resolveBrowserAsset()
    this.launch = options.launch ?? puppeteer.launch
    this.phase = this.asset === undefined ? 'unsupported' : 'idle'
  }

  enableInstallPrompt(): () => void {
    this.promptAvailable = true
    return () => {
      this.promptAvailable = false
      const confirmation = this.confirmation
      if (confirmation !== undefined) {
        this.confirmation = undefined
        confirmation.reject(new Error('coremate-mobile: browser installation prompt became unavailable'))
      }
    }
  }

  async status(): Promise<BrowserInstallStatus> {
    if (this.asset !== undefined && !this.installationChecked) {
      this.installationChecked = true
      if (await this.installer.isInstalled(this.asset)) this.phase = 'ready'
    }
    return {
      phase: this.phase,
      version: CHROME_VERSION,
      hostPlatform: `${process.platform}/${process.arch}`,
      ...(this.asset === undefined ? {} : { totalBytes: this.asset.bytes }),
      ...(this.downloadedBytes === undefined ? {} : { downloadedBytes: this.downloadedBytes }),
      ...(this.message === undefined ? {} : { message: this.message }),
    }
  }

  approveInstall(): boolean {
    const confirmation = this.confirmation
    if (confirmation === undefined) return false
    this.confirmation = undefined
    this.phase = 'downloading'
    this.downloadedBytes = 0
    confirmation.resolve()
    return true
  }

  declineInstall(): boolean {
    const confirmation = this.confirmation
    if (confirmation === undefined) return false
    this.confirmation = undefined
    confirmation.reject(new Error('coremate-mobile: browser installation was cancelled'))
    return true
  }

  async open(signal: AbortSignal): Promise<Page> {
    if (this.asset === undefined) throw new Error(`coremate-mobile: browser control is unsupported on ${process.platform}/${process.arch}`)
    const installed = await this.prepare(this.asset, signal)
    signal.throwIfAborted()
    await mkdir(installed.profile, { recursive: true })
    const browser = await this.launch({
      executablePath: installed.executable,
      userDataDir: installed.profile,
      headless: false,
      defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      args: ['--no-first-run', '--no-default-browser-check', '--disable-default-apps'],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      signal,
    })
    this.browser = browser
    const abort = (): void => { void browser.close() }
    signal.addEventListener('abort', abort, { once: true })
    browser.once('disconnected', () => {
      signal.removeEventListener('abort', abort)
      if (this.browser === browser) this.browser = undefined
    })
    const pages = await browser.pages()
    return pages[0] ?? await browser.newPage()
  }

  async close(): Promise<void> {
    const browser = this.browser
    this.browser = undefined
    if (browser !== undefined) await browser.close().catch(() => {})
  }

  private async prepare(asset: BrowserAsset, signal: AbortSignal): Promise<InstalledBrowser> {
    if (await this.installer.isInstalled(asset)) {
      this.phase = 'ready'
      return this.installer.paths(asset)
    }
    if (!this.promptAvailable) {
      throw new Error('coremate-mobile: browser installation requires the Harness web install prompt')
    }
    this.phase = 'awaiting-confirmation'
    this.message = undefined
    try {
      await this.waitForConfirmation(signal)
      const installed = await this.installer.ensure(asset, signal, progress => {
        this.phase = progress.phase
        this.downloadedBytes = progress.downloadedBytes
      })
      this.phase = 'ready'
      this.downloadedBytes = undefined
      return installed
    } catch (error) {
      this.downloadedBytes = undefined
      if (signal.aborted || (error instanceof Error && error.message.endsWith('was cancelled'))) {
        this.phase = 'idle'
        this.message = undefined
      } else {
        this.phase = 'error'
        this.message = error instanceof Error ? error.message : String(error)
      }
      throw error
    } finally {
      this.confirmation = undefined
    }
  }

  private waitForConfirmation(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    return new Promise<void>((resolveConfirmation, rejectConfirmation) => {
      const abort = (): void => {
        this.confirmation = undefined
        rejectConfirmation(signal.reason instanceof Error ? signal.reason : new Error('coremate-mobile: browser installation cancelled'))
      }
      this.confirmation = {
        resolve: () => {
          signal.removeEventListener('abort', abort)
          resolveConfirmation()
        },
        reject: (error) => {
          signal.removeEventListener('abort', abort)
          rejectConfirmation(error)
        },
      }
      signal.addEventListener('abort', abort, { once: true })
    })
  }
}
