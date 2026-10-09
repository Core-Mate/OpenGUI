import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, rm, chmod, lstat, writeFile } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { x as extract } from 'tar'

export const AXE_VERSION = '1.8.0'
const URL = `https://github.com/cameroncooke/AXe/releases/download/v${AXE_VERSION}/AXe-macOS-v${AXE_VERSION}-universal.tar.gz`
const SHA256 = '7b76340b72e90d0f211bc7c4636f15009076eff07acef2f2b632b175debd8834'

/** Bounded child invocation; input and process diagnostics never enter public errors. */
export function runSimulatorCommand(file: string, args: readonly string[], signal: AbortSignal, input?: string, buffer = false): Promise<Buffer> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = execFile(file, [...args], { signal, timeout: 15_000, maxBuffer: 20 * 1024 * 1024, encoding: 'buffer', windowsHide: true }, (error, stdout) => {
      if (error) reject(new Error('ios_simulator_command_failed'))
      else resolve(buffer ? stdout : Buffer.from(stdout.toString('utf8')))
    })
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  })
}

/** Pin the upstream release and keep its frameworks beside the executable. */
export class IosDriver {
  private installed: Promise<string> | undefined
  constructor(private readonly directory: string, private readonly configuredPath = process.env.OPENGUI_AXE_PATH?.trim()) {}
  async ensure(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    this.installed ??= this.install(signal).catch(error => { this.installed = undefined; throw error })
    const path = await this.installed
    signal.throwIfAborted(); return path
  }
  private async install(signal: AbortSignal): Promise<string> {
    if (process.platform !== 'darwin') throw new Error('ios_simulator_requires_macos')
    if (this.configuredPath) {
      if (!isAbsolute(this.configuredPath)) throw new Error('ios_driver_path_must_be_absolute')
      const version = String(await runSimulatorCommand(this.configuredPath, ['--version'], signal)).trim()
      if (version !== AXE_VERSION) throw new Error('ios_driver_version_conflict')
      return this.configuredPath
    }
    const root = join(this.directory, `axe-${AXE_VERSION}`), executable = join(root, 'axe')
    try {
      if ((await lstat(root)).isSymbolicLink() || !(await lstat(executable)).isFile() || (await lstat(executable)).isSymbolicLink()) throw new Error('ios_driver_cache_invalid')
      if (String(await readFile(join(root, '.archive-sha256'), 'utf8')).trim() !== SHA256) throw new Error('ios_driver_cache_invalid')
      if (String(await runSimulatorCommand(executable, ['--version'], signal)).trim() !== AXE_VERSION) throw new Error('ios_driver_version_conflict')
      return executable
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const staging = await mkdtemp(join(this.directory, '.axe-'))
    try {
      const response = await fetch(URL, { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) })
      if (!response.ok || !response.body) throw new Error('ios_driver_download_failed')
      const chunks: Uint8Array[] = []; let bytes = 0
      const reader = response.body.getReader()
      try { while (true) { const { value: chunk, done } = await reader.read(); if (done) break; signal.throwIfAborted(); bytes += chunk.byteLength; if (bytes > 12 * 1024 * 1024) throw new Error('ios_driver_download_too_large'); chunks.push(chunk) } }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      const data = Buffer.concat(chunks)
      if (createHash('sha256').update(data).digest('hex') !== SHA256) throw new Error('ios_driver_checksum_mismatch')
      const archive = join(staging, `${randomUUID()}.tar.gz`), output = join(staging, 'driver')
      await writeFile(archive, data, { mode: 0o600 }); await mkdir(output, { mode: 0o700 })
      await extract({ file: archive, cwd: output, strict: true, preservePaths: false, filter: (path, entry) => {
        const link = 'linkpath' in entry ? entry.linkpath : undefined
        return !isAbsolute(path) && !path.split('/').includes('..') && (!link || !isAbsolute(link) && !link.split('/').includes('..'))
      } })
      signal.throwIfAborted()
      const candidate = join(output, 'axe')
      if (!(await lstat(candidate)).isFile() || (await lstat(candidate)).isSymbolicLink()) throw new Error('ios_driver_archive_invalid')
      await chmod(candidate, 0o700)
      await writeFile(join(output, '.archive-sha256'), SHA256, { mode: 0o600 })
      if (String(await runSimulatorCommand(candidate, ['--version'], signal)).trim() !== AXE_VERSION) throw new Error('ios_driver_version_conflict')
      try { await rename(output, root) } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        if (String(await readFile(join(root, '.archive-sha256'), 'utf8')).trim() !== SHA256) throw new Error('ios_driver_cache_invalid')
      }
      return executable
    } finally { await rm(staging, { recursive: true, force: true }) }
  }
}
