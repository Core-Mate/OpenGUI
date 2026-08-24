import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'puppeteer-core'
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_ASSETS, BrowserInstaller, CHROME_VERSION, ManagedBrowser, resolveBrowserAsset,
} from '../src/browser.ts'
import type { BrowserAsset } from '../src/browser.ts'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('managed browser assets', () => {
  it('pins one Chrome for Testing build for every supported Host platform', () => {
    expect(CHROME_VERSION).toBe('152.0.7977.42')
    expect(CHROME_VERSION).toBe(PUPPETEER_REVISIONS.chrome)
    expect(resolveBrowserAsset('darwin', 'arm64')).toBe(BROWSER_ASSETS['darwin-arm64'])
    expect(resolveBrowserAsset('darwin', 'x64')).toBe(BROWSER_ASSETS['darwin-x64'])
    expect(resolveBrowserAsset('linux', 'x64')).toBe(BROWSER_ASSETS['linux-x64'])
    expect(resolveBrowserAsset('win32', 'x64')).toBe(BROWSER_ASSETS['win32-x64'])
    expect(resolveBrowserAsset('linux', 'arm64')).toBeUndefined()
    for (const asset of Object.values(BROWSER_ASSETS)) {
      expect(asset.url).toMatch(/^https:\/\/storage\.googleapis\.com\/chrome-for-testing-public\/152\.0\.7977\.42\//u)
      expect(asset.bytes).toBeGreaterThan(150_000_000)
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u)
    }
  })

  it('rejects a browser archive that does not match its pinned checksum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coremate-browser-checksum-'))
    temporary.push(root)
    const body = new TextEncoder().encode('tampered browser')
    const asset: BrowserAsset = {
      key: 'test', archiveRoot: 'chrome-test', executable: 'chrome',
      url: 'https://example.invalid/chrome.zip', bytes: body.byteLength,
      sha256: createHash('sha256').update('different').digest('hex'),
    }
    const installer = new BrowserInstaller({
      cacheDir: root,
      fetch: (async () => new Response(body)) as typeof fetch,
    })

    await expect(installer.ensure(asset, new AbortController().signal, () => {}))
      .rejects.toThrow('browser download checksum mismatch')
    expect(await installer.isInstalled(asset)).toBe(false)
  })
})

class FakeInstaller extends BrowserInstaller {
  installed = false
  ensureCalls = 0

  constructor(private readonly root: string) { super({ cacheDir: root }) }

  override paths() {
    return { root: this.root, executable: join(this.root, 'chrome'), profile: join(this.root, 'profile') }
  }

  override async isInstalled(): Promise<boolean> { return this.installed }

  override async ensure() {
    this.ensureCalls += 1
    this.installed = true
    return this.paths()
  }
}

describe('first-use browser consent', () => {
  it('waits for explicit approval, installs once, and then launches the managed browser', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coremate-browser-consent-'))
    temporary.push(root)
    const installer = new FakeInstaller(root)
    const page = {} as Page
    const browser = {
      pages: vi.fn(async () => [page]),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => {}),
      once: vi.fn(),
    } as unknown as Browser
    const launch = vi.fn(async () => browser)
    const asset: BrowserAsset = {
      key: 'test', archiveRoot: 'chrome-test', executable: 'chrome',
      url: 'https://example.invalid/chrome.zip', bytes: 200_000_000, sha256: 'a'.repeat(64),
    }
    const managed = new ManagedBrowser({ installer, asset, launch: launch as typeof import('puppeteer-core').default.launch })
    const disablePrompt = managed.enableInstallPrompt()

    const opening = managed.open(new AbortController().signal)
    await vi.waitFor(async () => { expect((await managed.status()).phase).toBe('awaiting-confirmation') })
    expect(installer.ensureCalls).toBe(0)
    expect(managed.approveInstall()).toBe(true)
    await expect(opening).resolves.toBe(page)
    expect(installer.ensureCalls).toBe(1)
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ executablePath: join(root, 'chrome'), headless: false }))
    expect((await managed.status()).phase).toBe('ready')
    await managed.close()
    disablePrompt()
  })

  it('returns to idle when the user declines installation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coremate-browser-decline-'))
    temporary.push(root)
    const installer = new FakeInstaller(root)
    const asset: BrowserAsset = {
      key: 'test', archiveRoot: 'chrome-test', executable: 'chrome',
      url: 'https://example.invalid/chrome.zip', bytes: 200_000_000, sha256: 'a'.repeat(64),
    }
    const managed = new ManagedBrowser({ installer, asset })
    managed.enableInstallPrompt()

    const opening = managed.open(new AbortController().signal)
    await vi.waitFor(async () => { expect((await managed.status()).phase).toBe('awaiting-confirmation') })
    expect(managed.declineInstall()).toBe(true)
    await expect(opening).rejects.toThrow('browser installation was cancelled')
    expect((await managed.status()).phase).toBe('idle')
    expect(installer.ensureCalls).toBe(0)
  })
})
