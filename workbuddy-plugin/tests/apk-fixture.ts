import { readFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'

// Compiled by Android build tools 36.0.0 from the adjacent public QA manifest.
export const compiledManifest = Buffer.from(readFileSync(new URL('./fixtures/apk/manifest.b64', import.meta.url), 'utf8').trim(), 'base64')
export async function apkFile(directory: string, options: { name?: string; manifest?: Buffer; duplicate?: boolean; symlink?: boolean } = {}): Promise<string> {
  const path = join(directory, options.name ?? 'user-requested.apk'), zip = new yazl.ZipFile()
  zip.addBuffer(options.manifest ?? compiledManifest, 'AndroidManifest.xml', { mode: options.symlink ? 0o120777 : 0o100644 })
  if (options.duplicate) zip.addBuffer(compiledManifest, 'AndroidManifest.xml')
  zip.addBuffer(Buffer.from('QA fixture only; not an installable business app.'), 'assets/qa.txt')
  zip.end(); await pipeline(zip.outputStream, createWriteStream(path))
  return path
}
