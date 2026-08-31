/** Verified public OpenGUI Release discovery and in-place DSH profile updates. */

import { createHash, randomUUID } from 'node:crypto'
import { constants, readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import type { PluginUpdateStatus } from './mirror-contract.ts'

const PACKAGE_NAME = 'dsh-coremate-mobile'
const RELEASE_TAG_PREFIX = `${PACKAGE_NAME}-v`
const GITHUB_REPOSITORY = 'Core-Mate/OpenGUI'
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=100`
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000
const MAX_METADATA_BYTES = 4 * 1_048_576
const MAX_CHECKSUM_BYTES = 16_384
const MAX_ARCHIVE_BYTES = 50 * 1_048_576

interface ReleaseAsset {
  readonly name: string
  readonly size: number
  readonly url: string
  readonly digest?: string
}

interface AvailableRelease {
  readonly version: string
  readonly url: string
  readonly archive: ReleaseAsset
  readonly checksum: ReleaseAsset
}

interface PluginUpdateManagerOptions {
  currentVersion?: string
  cacheDir?: string
  dshHome?: string
  packageRoot?: string
  profile?: string
  githubToken?: string
  fetch?: typeof globalThis.fetch
  now?: () => number
  install?: (profile: string, archive: string, signal: AbortSignal) => Promise<void>
}

interface GitHubReleaseResponse {
  tag_name?: unknown
  html_url?: unknown
  draft?: unknown
  prerelease?: unknown
  assets?: unknown
}

interface GitHubReleaseAssetResponse {
  name?: unknown
  size?: unknown
  browser_download_url?: unknown
  digest?: unknown
  state?: unknown
}

function dshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  return configured ? resolve(configured) : join(homedir(), '.dsh')
}

function packageRoot(): string {
  return dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
}

function packageVersion(): string {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error('opengui: package version is missing')
  return manifest.version
}

interface ParsedVersion {
  readonly core: readonly [number, number, number]
  readonly prerelease: readonly string[]
}

function parseVersion(value: string): ParsedVersion | undefined {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(value.trim())
  if (match === null) return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  }
}

/** Compare semver-compatible release versions without accepting ranges or loose tags. */
export function comparePluginVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) throw new Error('opengui: invalid plugin release version')
  for (let index = 0; index < 3; index += 1) {
    const difference = a.core[index]! - b.core[index]!
    if (difference !== 0) return Math.sign(difference)
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1
  }
  const count = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < count; index += 1) {
    const one = a.prerelease[index]
    const two = b.prerelease[index]
    if (one === undefined || two === undefined) return one === two ? 0 : one === undefined ? -1 : 1
    if (one === two) continue
    const oneNumeric = /^\d+$/u.test(one)
    const twoNumeric = /^\d+$/u.test(two)
    if (oneNumeric && twoNumeric) return Number(one) < Number(two) ? -1 : 1
    if (oneNumeric !== twoNumeric) return oneNumeric ? -1 : 1
    return one < two ? -1 : 1
  }
  return 0
}

function validatedHttpsUrl(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`opengui: release ${field} is missing`)
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') throw new Error(`opengui: release ${field} must use HTTPS`)
  return parsed.href
}

function parseAsset(value: unknown): ReleaseAsset | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const asset = value as GitHubReleaseAssetResponse
  if (typeof asset.name !== 'string' || typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size <= 0) return undefined
  if (asset.state !== undefined && asset.state !== 'uploaded') return undefined
  return {
    name: asset.name,
    size: asset.size,
    url: validatedHttpsUrl(asset.browser_download_url, `asset ${asset.name}`),
    ...(typeof asset.digest === 'string' ? { digest: asset.digest } : {}),
  }
}

function pluginReleaseVersion(value: GitHubReleaseResponse): string | undefined {
  if (value.draft === true || value.prerelease === true || typeof value.tag_name !== 'string') return undefined
  if (!value.tag_name.startsWith(RELEASE_TAG_PREFIX)) return undefined
  const version = value.tag_name.slice(RELEASE_TAG_PREFIX.length)
  const parsed = parseVersion(version)
  return parsed !== undefined && parsed.prerelease.length === 0 ? version : undefined
}

/** Select the highest stable plugin release while ignoring OpenGUI Android releases. */
export function parseLatestRelease(value: unknown): AvailableRelease {
  if (!Array.isArray(value)) throw new Error('opengui: GitHub returned invalid release metadata')
  const releases = value
    .filter((entry): entry is GitHubReleaseResponse => typeof entry === 'object' && entry !== null)
    .map(release => ({ release, version: pluginReleaseVersion(release) }))
    .filter((entry): entry is { release: GitHubReleaseResponse, version: string } => entry.version !== undefined)
    .sort((left, right) => comparePluginVersions(right.version, left.version))
  const selected = releases[0]
  if (selected === undefined) throw new Error('opengui: no stable plugin release was found')
  const { release, version } = selected
  const archiveName = `${PACKAGE_NAME}-${version}.tgz`
  const checksumName = `${archiveName}.sha256`
  const assets = Array.isArray(release.assets) ? release.assets.map(parseAsset).filter(asset => asset !== undefined) : []
  const archive = assets.find(asset => asset.name === archiveName)
  const checksum = assets.find(asset => asset.name === checksumName)
  if (archive === undefined || checksum === undefined) {
    throw new Error(`opengui: release ${RELEASE_TAG_PREFIX}${version} is missing its verified installer assets`)
  }
  if (archive.size > MAX_ARCHIVE_BYTES || checksum.size > MAX_CHECKSUM_BYTES) {
    throw new Error(`opengui: release ${RELEASE_TAG_PREFIX}${version} assets exceed the safety limit`)
  }
  return {
    version,
    url: validatedHttpsUrl(release.html_url, 'page URL'),
    archive,
    checksum,
  }
}

async function fetchFollowingHttps(
  fetchImpl: typeof globalThis.fetch,
  initialUrl: string,
  signal: AbortSignal,
  headers?: HeadersInit,
): Promise<Response> {
  let url = validatedHttpsUrl(initialUrl, 'download URL')
  let requestHeaders = headers
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetchImpl(url, {
      signal,
      redirect: 'manual',
      ...(requestHeaders === undefined ? {} : { headers: requestHeaders }),
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (location === null || redirects === 5) throw new Error('opengui: release download redirected too many times')
    const next = new URL(location, url)
    if (next.protocol !== 'https:') throw new Error('opengui: release download redirected away from HTTPS')
    if (next.origin !== new URL(url).origin) requestHeaders = undefined
    url = next.href
  }
  throw new Error('opengui: unreachable release redirect state')
}

async function readBoundedResponse(response: Response, maximum: number): Promise<Buffer> {
  if (!response.ok || response.body === null) throw new Error(`opengui: release request failed with HTTP ${response.status}`)
  const header = response.headers.get('content-length')
  const declared = header === null ? undefined : Number(header)
  if (declared !== undefined && Number.isFinite(declared) && declared > maximum) throw new Error('opengui: release response exceeds the safety limit')
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  while (true) {
    const next = await reader.read()
    if (next.done) break
    total += next.value.byteLength
    if (total > maximum) throw new Error('opengui: release response exceeds the safety limit')
    chunks.push(next.value)
  }
  return Buffer.concat(chunks)
}

function checksumFromFile(contents: string, archiveName: string): string {
  const escaped = archiveName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = new RegExp(`^([0-9a-fA-F]{64})[\\t ]+\\*?${escaped}\\r?\\n?$`, 'u').exec(contents)
  if (match === null) throw new Error('opengui: release checksum file has an unexpected format')
  return match[1]!.toLowerCase()
}

async function downloadArchive(
  fetchImpl: typeof globalThis.fetch,
  release: AvailableRelease,
  output: string,
  expectedSha256: string,
  signal: AbortSignal,
  progress: (downloaded: number) => void,
): Promise<void> {
  const response = await fetchFollowingHttps(fetchImpl, release.archive.url, signal)
  if (!response.ok || response.body === null) throw new Error(`opengui: release archive failed with HTTP ${response.status}`)
  const header = response.headers.get('content-length')
  const declared = header === null ? undefined : Number(header)
  if (declared !== undefined && Number.isFinite(declared) && declared !== release.archive.size) {
    throw new Error('opengui: release archive size differs from GitHub metadata')
  }
  const file = await open(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  const digest = createHash('sha256')
  let downloaded = 0
  try {
    const reader = response.body.getReader()
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      downloaded += next.value.byteLength
      if (downloaded > release.archive.size || downloaded > MAX_ARCHIVE_BYTES) {
        throw new Error('opengui: release archive exceeded the declared size')
      }
      digest.update(next.value)
      let offset = 0
      while (offset < next.value.byteLength) {
        const { bytesWritten } = await file.write(next.value, offset, next.value.byteLength - offset, null)
        if (bytesWritten === 0) throw new Error('opengui: release archive write made no progress')
        offset += bytesWritten
      }
      progress(downloaded)
    }
  } finally {
    await file.close()
  }
  if (downloaded !== release.archive.size) throw new Error('opengui: release archive size mismatch')
  const actual = digest.digest('hex')
  if (actual !== expectedSha256) throw new Error('opengui: release archive checksum mismatch')
  if (release.archive.digest !== undefined && release.archive.digest !== `sha256:${actual}`) {
    throw new Error('opengui: release archive digest differs from GitHub metadata')
  }
}

async function matchingProfiles(home: string, currentPackageRoot: string): Promise<{ exact: string[], candidates: string[] }> {
  const profilesRoot = join(home, 'profiles')
  const exact: string[] = []
  const candidates: string[] = []
  let entries: Dirent[]
  try {
    entries = await readdir(profilesRoot, { withFileTypes: true })
  } catch {
    return { exact, candidates }
  }
  const resolvedCurrent = await realpath(currentPackageRoot).catch(() => resolve(currentPackageRoot))
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const profileDir = join(profilesRoot, entry.name)
    try {
      const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, unknown>
        dsh?: { profile?: { bundles?: unknown } }
      }
      if (typeof manifest.dependencies?.[PACKAGE_NAME] !== 'string') continue
      if (!Array.isArray(manifest.dsh?.profile?.bundles) || !manifest.dsh.profile.bundles.includes(PACKAGE_NAME)) continue
      candidates.push(entry.name)
      const installedRoot = await realpath(join(profileDir, 'node_modules', PACKAGE_NAME))
      if (installedRoot === resolvedCurrent) exact.push(entry.name)
    } catch {
      // A partially installed or unrelated profile is not a safe update target.
    }
  }
  return { exact, candidates }
}

async function verifyInstalledRelease(home: string, profile: string, version: string): Promise<void> {
  const profileDir = join(home, 'profiles', profile)
  const [profileRaw, installedRaw] = await Promise.all([
    readFile(join(profileDir, 'package.json'), 'utf8'),
    readFile(join(profileDir, 'node_modules', PACKAGE_NAME, 'package.json'), 'utf8'),
  ])
  const manifest = JSON.parse(profileRaw) as {
    dependencies?: Record<string, unknown>
    dsh?: { profile?: { bundles?: unknown } }
  }
  const installed = JSON.parse(installedRaw) as { version?: unknown }
  if (typeof manifest.dependencies?.[PACKAGE_NAME] !== 'string'
    || !Array.isArray(manifest.dsh?.profile?.bundles)
    || !manifest.dsh.profile.bundles.includes(PACKAGE_NAME)
    || installed.version !== version) {
    throw new Error('opengui: DSH reported success but the installed plugin version could not be verified')
  }
}

export async function resolveCurrentProfile(home: string, currentPackageRoot: string, configured?: string): Promise<string> {
  const requested = configured?.trim() || process.env.COREMATE_MOBILE_PROFILE?.trim()
  const matches = await matchingProfiles(home, currentPackageRoot)
  if (requested !== undefined && requested !== '') {
    if (!matches.candidates.includes(requested)) throw new Error(`opengui: configured update profile ${requested} does not contain this plugin`)
    return requested
  }
  if (matches.exact.length === 1) return matches.exact[0]!
  if (matches.exact.length > 1) throw new Error('opengui: this plugin is linked into multiple DSH profiles; set COREMATE_MOBILE_PROFILE before updating')
  if (matches.candidates.length === 1) return matches.candidates[0]!
  if (matches.candidates.length === 0) throw new Error('opengui: could not find the DSH profile that owns this plugin')
  throw new Error('opengui: multiple DSH profiles contain this plugin; set COREMATE_MOBILE_PROFILE before updating')
}

function defaultInstall(profile: string, archive: string, signal: AbortSignal): Promise<void> {
  const launcher = process.argv[1]
  const nodeRuntime = /^node(?:\.exe)?$/iu.test(basename(process.execPath))
  if (nodeRuntime && launcher === undefined) return Promise.reject(new Error('opengui: could not locate the current DSH launcher'))
  const invocation = ['plugin', '--profile', profile, 'add', '--save-exact', archive]
  const args = nodeRuntime ? [launcher!, ...invocation] : invocation
  return new Promise((resolveInstall, rejectInstall) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
      shell: false,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (chunk: Buffer): void => { output = `${output}${chunk.toString('utf8')}`.slice(-16_384) }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.once('error', rejectInstall)
    child.once('close', code => {
      if (code === 0) resolveInstall()
      else rejectInstall(new Error(`opengui: DSH plugin update failed${output.trim() ? `: ${output.trim()}` : ` with exit code ${String(code)}`}`))
    })
  })
}

/** Owns rate-limited update checks and one user-approved verified installation. */
export class PluginUpdateManager {
  private readonly currentVersion: string
  private readonly cacheDir: string
  private readonly home: string
  private readonly currentPackageRoot: string
  private readonly configuredProfile: string | undefined
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly githubToken: string | undefined
  private readonly now: () => number
  private readonly installImpl: (profile: string, archive: string, signal: AbortSignal) => Promise<void>
  private readonly lifetime = new AbortController()
  private phase: PluginUpdateStatus['phase'] = 'idle'
  private release: AvailableRelease | undefined
  private message: string | undefined
  private downloadedBytes: number | undefined
  private lastCheckedAt: number | undefined
  private checking: Promise<void> | undefined
  private updating: Promise<void> | undefined

  constructor(options: PluginUpdateManagerOptions = {}) {
    this.currentVersion = options.currentVersion ?? packageVersion()
    this.home = options.dshHome ?? dshHome()
    this.cacheDir = options.cacheDir ?? join(this.home, 'cache', 'coremate-mobile', 'releases')
    this.currentPackageRoot = options.packageRoot ?? packageRoot()
    this.configuredProfile = options.profile
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.githubToken = options.githubToken?.trim() || process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
    this.now = options.now ?? Date.now
    this.installImpl = options.install ?? defaultInstall
  }

  start(): void {
    void this.check().catch(() => {})
  }

  status(): PluginUpdateStatus {
    if (!['downloading', 'verifying', 'installing', 'restart-required'].includes(this.phase)) {
      void this.check().catch(() => {})
    }
    return {
      phase: this.phase,
      currentVersion: this.currentVersion,
      ...(this.release === undefined ? {} : {
        latestVersion: this.release.version,
        releaseUrl: this.release.url,
        totalBytes: this.release.archive.size,
      }),
      ...(this.downloadedBytes === undefined ? {} : { downloadedBytes: this.downloadedBytes }),
      ...(this.lastCheckedAt === undefined ? {} : { checkedAt: new Date(this.lastCheckedAt).toISOString() }),
      ...(this.message === undefined ? {} : { message: this.message }),
    }
  }

  check(force = false): Promise<void> {
    if (this.checking !== undefined) return this.checking
    if (this.updating !== undefined) return Promise.resolve()
    if (!force && this.lastCheckedAt !== undefined && this.now() - this.lastCheckedAt < CHECK_INTERVAL_MS) return Promise.resolve()
    const operation = this.performCheck()
    this.checking = operation
    void operation.finally(() => { if (this.checking === operation) this.checking = undefined }).catch(() => {})
    return operation
  }

  requestUpdate(): boolean {
    if (this.phase !== 'available' || this.release === undefined || this.updating !== undefined) return false
    const operation = this.performUpdate(this.release)
    this.updating = operation
    void operation.finally(() => { if (this.updating === operation) this.updating = undefined }).catch(() => {})
    return true
  }

  dispose(): void {
    this.lifetime.abort(new Error('opengui: plugin update manager disposed'))
  }

  private async performCheck(): Promise<void> {
    this.phase = 'checking'
    this.message = undefined
    try {
      const response = await fetchFollowingHttps(this.fetchImpl, RELEASES_API, this.lifetime.signal, this.githubHeaders())
      const metadata = await readBoundedResponse(response, MAX_METADATA_BYTES)
      const release = parseLatestRelease(JSON.parse(metadata.toString('utf8')))
      this.release = release
      this.lastCheckedAt = this.now()
      this.phase = comparePluginVersions(release.version, this.currentVersion) > 0 ? 'available' : 'up-to-date'
    } catch (error) {
      if (this.lifetime.signal.aborted) return
      this.lastCheckedAt = this.now()
      this.phase = 'error'
      this.message = error instanceof Error ? error.message : String(error)
    }
  }

  private async performUpdate(release: AvailableRelease): Promise<void> {
    const releaseDir = join(this.cacheDir, `v${release.version}`)
    const archivePath = join(releaseDir, release.archive.name)
    const temporary = join(releaseDir, `.download-${randomUUID()}.tgz`)
    this.phase = 'downloading'
    this.downloadedBytes = 0
    this.message = undefined
    try {
      await mkdir(releaseDir, { recursive: true })
      const checksumResponse = await fetchFollowingHttps(this.fetchImpl, release.checksum.url, this.lifetime.signal)
      const checksumBytes = await readBoundedResponse(checksumResponse, MAX_CHECKSUM_BYTES)
      if (checksumBytes.byteLength !== release.checksum.size) throw new Error('opengui: release checksum size mismatch')
      const expected = checksumFromFile(checksumBytes.toString('utf8'), release.archive.name)
      await downloadArchive(
        this.fetchImpl,
        release,
        temporary,
        expected,
        this.lifetime.signal,
        downloaded => { this.downloadedBytes = downloaded },
      )
      this.phase = 'verifying'
      await rm(archivePath, { force: true })
      await rename(temporary, archivePath)
      const profile = await resolveCurrentProfile(this.home, this.currentPackageRoot, this.configuredProfile)
      this.phase = 'installing'
      await this.installImpl(profile, archivePath, this.lifetime.signal)
      await verifyInstalledRelease(this.home, profile, release.version)
      this.phase = 'restart-required'
      this.message = `OpenGUI v${release.version} 已安装到 ${profile} profile；重启 Harness 后生效。`
    } catch (error) {
      if (this.lifetime.signal.aborted) return
      this.phase = 'error'
      this.message = error instanceof Error ? error.message : String(error)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }

  private githubHeaders(): HeadersInit {
    return {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${PACKAGE_NAME}/${this.currentVersion}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(this.githubToken === undefined ? {} : { Authorization: `Bearer ${this.githubToken}` }),
    }
  }
}
