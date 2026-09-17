import { execFile } from 'node:child_process'
import { access, chmod, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export * from '../../packages/device-runtime/src/actions.ts'

/**
 * Resolve the ADB executable installed inside this plugin.
 * @param override Optional development-only executable path.
 * @returns An absolute path to the selected ADB executable.
 */
export function managedAdbPath(override?: string): string {
  if (override !== undefined && override.trim().length > 0) return override
  const root = dirname(fileURLToPath(import.meta.url))
  if (process.platform === 'darwin' && (process.arch === 'arm64' || process.arch === 'x64')) {
    return join(root, '..', 'assets', 'platform-tools', 'darwin', 'adb')
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return join(root, '..', 'assets', 'platform-tools', 'linux-x64', 'adb')
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return join(root, '..', 'assets', 'platform-tools', 'win32-x64', 'adb.exe')
  }
  throw new Error(`opengui: no bundled ADB runtime for ${process.platform}/${process.arch}`)
}

/**
 * Fail before device discovery if the packaged runtime is missing or unusable.
 * @param path Absolute ADB executable path.
 */
export async function assertAdbReady(path: string, options: { readonly repairPermissions?: boolean } = {}): Promise<void> {
  const info = await stat(path).catch(() => undefined)
  if (info?.isFile() !== true) throw new Error(`opengui: bundled ADB runtime is missing at ${path}; reinstall the plugin`)
  if (process.platform === 'win32') {
    await access(path, constants.F_OK)
    return
  }
  try {
    await access(path, constants.X_OK)
  } catch (error) {
    if (options.repairPermissions === true) {
      try {
        await chmod(path, info.mode | 0o111)
        await access(path, constants.X_OK)
        return
      } catch (repairError) {
        throw new Error('opengui: bundled ADB is not executable and automatic permission repair failed; reinstall the plugin', { cause: repairError })
      }
    }
    throw new Error('opengui: configured ADB executable is not executable; check adbPath or OPENGUI_ADB_PATH and its file permissions', { cause: error })
  }
}

/** Process limits applied to every ADB invocation. */
export interface AdbRunOptions {
  signal?: AbortSignal
  timeoutMs: number
  maxBuffer?: number
  encoding?: BufferEncoding | 'buffer'
}

/**
 * Execute ADB directly (never through a shell) with cancellation and bounded output.
 * @param path Absolute ADB executable path.
 * @param args Fixed allowlisted argument array.
 * @param options Cancellation, timeout, output, and encoding limits.
 * @returns Captured standard output in the requested representation.
 */
export function runAdb(path: string, args: readonly string[], options: AdbRunOptions): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    execFile(path, [...args], {
      shell: false,
      windowsHide: true,
      timeout: options.timeoutMs,
      signal: options.signal,
      maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      encoding: options.encoding === 'buffer' ? 'buffer' : options.encoding ?? 'utf8',
    }, (error, stdout, stderr) => {
      if (error !== null) {
        const diagnostic = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : stderr
        reject(new Error(`opengui: ADB command failed: ${(diagnostic || error.message).trim().slice(0, 2_000)}`, { cause: error }))
        return
      }
      resolve(stdout)
    })
  })
}
