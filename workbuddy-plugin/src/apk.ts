import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import yauzl, { type Entry } from 'yauzl'

export interface ApkMetadata {
  packageName: string
  versionName?: string
  versionCode?: string
  minSdk: number
  testOnly: boolean
}
export interface ApkRecord extends ApkMetadata {
  id: string
  deviceId: string
  fileName: string
  bytes: number
  sha256: string
  allowTestApk: boolean
  preparedAt: string
  status: 'prepared' | 'installing' | 'installed' | 'failed' | 'unknown'
  existingApp?: { version?: string }
  updateApprovedAt?: string
  startedAt?: string
  finishedAt?: string
  code?: string
}
export interface PreparedApk {
  record: ApkRecord
  path: string
  dispose(): Promise<void>
}
const MAX_APK = 512 * 1024 * 1024
const MAX_MANIFEST = 2 * 1024 * 1024
const ANDROID = 'http://schemas.android.com/apk/res/android'

/** Read the Android binary XML chunk format without executing archive content. */
export function apkManifest(data: Buffer): ApkMetadata {
  const fail = (): never => { throw new Error('apk_manifest_invalid_or_unsupported') }
  const range = (offset: number, size: number, end = data.length) => { if (offset < 0 || size < 0 || offset + size > end) fail() }
  const u16 = (offset: number) => { range(offset, 2); return data.readUInt16LE(offset) }
  const u32 = (offset: number) => { range(offset, 4); return data.readUInt32LE(offset) }
  if (data.length < 8 || data.length > MAX_MANIFEST || u16(0) !== 3 || u16(2) !== 8 || u32(4) !== data.length) fail()
  let strings: string[] | undefined, manifest: Map<string, string | number> | undefined, minSdk = 1, testOnly = false, sdkSeen = false, appSeen = false
  const stack: string[] = []
  let rootEnded = false
  const string = (index: number): string => { if (index === 0xffffffff) return ''; if (!strings || index >= strings.length) return fail(); return strings[index]! }
  for (let offset = 8; offset < data.length;) {
    range(offset, 8)
    const type = u16(offset), header = u16(offset + 2), size = u32(offset + 4), end = offset + size
    if (header < 8 || size < header) fail(); range(offset, size)
    if (type === 1) {
      if (strings || manifest || header < 28) fail()
      const count = u32(offset + 8), styles = u32(offset + 12), utf8 = Boolean(u32(offset + 16) & 0x100), start = u32(offset + 20), styleStart = u32(offset + 24)
      if (count > 50000 || styles > 50000 || start < header + 4 * (count + styles) || start >= size || styleStart && (styleStart < start || styleStart > size)) fail()
      range(offset + header, count * 4, end)
      const stringEnd = styleStart ? offset + styleStart : end
      strings = []
      for (let index = 0; index < count; index++) {
        let cursor = offset + start + u32(offset + header + index * 4)
        const length = (): number => {
          if (utf8) { range(cursor, 1, stringEnd); const first = data[cursor++]!; if (!(first & 0x80)) return first; range(cursor, 1, stringEnd); return ((first & 0x7f) << 8) | data[cursor++]! }
          range(cursor, 2, stringEnd); const first = u16(cursor); cursor += 2; if (!(first & 0x8000)) return first; range(cursor, 2, stringEnd); const second = u16(cursor); cursor += 2; return (first & 0x7fff) * 65536 + second
        }
        const characters = length(), bytes = utf8 ? length() : characters * 2
        if (characters > 65536 || bytes > 131072) fail()
        range(cursor, bytes + (utf8 ? 1 : 2), stringEnd)
        if (utf8 ? data[cursor + bytes] !== 0 : u16(cursor + bytes) !== 0) fail()
        const value = new TextDecoder(utf8 ? 'utf-8' : 'utf-16le', { fatal: true }).decode(data.subarray(cursor, cursor + bytes))
        if (value.length !== characters) fail()
        strings.push(value)
      }
    } else if (type === 0x102) {
      if (!strings || rootEnded || header < 16) fail()
      const ext = offset + header; range(ext, 20, end)
      const tag = string(u32(ext + 4)), count = u16(ext + 12), attributeStart = u16(ext + 8), attributeSize = u16(ext + 10)
      if (attributeStart < 20 || attributeSize < 20 || count > 1000 || stack.length > 100) fail()
      range(ext + attributeStart, attributeSize * count, end)
      const attrs = new Map<string, string | number>()
      for (let index = 0; index < count; index++) {
        const at = ext + attributeStart + index * attributeSize, ns = string(u32(at)), name = string(u32(at + 4)), raw = u32(at + 8), kind = data[at + 15]!, value = u32(at + 16)
        if (u16(at + 12) !== 8) fail()
        const key = ns === ANDROID ? `android:${name}` : ns ? `${ns}:${name}` : name
        if (attrs.has(key)) fail()
        if (kind === 3) { const typed = string(value); if (raw !== 0xffffffff && string(raw) !== typed) fail(); attrs.set(key, typed) }
        else if ([0x10, 0x11, 0x12].includes(kind)) attrs.set(key, value)
        // Resource references are unresolved; never infer a literal version or SDK from them.
      }
      if (!stack.length) { if (tag !== 'manifest' || manifest) fail(); manifest = attrs }
      else if (stack.length === 1 && tag === 'uses-sdk') {
        if (sdkSeen) fail(); sdkSeen = true
        const value = attrs.get('android:minSdkVersion')
        if (value !== undefined) { if (!/^\d{1,3}$/u.test(String(value)) || Number(value) < 1) fail(); minSdk = Number(value) }
        else if (count) {
          // A resource/codename minSdk must not silently become the absent-value default.
          for (let index = 0; index < count; index++) { const at = ext + attributeStart + index * attributeSize; if (string(u32(at + 4)) === 'minSdkVersion') fail() }
        }
      } else if (stack.length === 1 && tag === 'application') { if (appSeen) fail(); appSeen = true; const value = attrs.get('android:testOnly'); testOnly = value === 'true' || typeof value === 'number' && value !== 0 }
      stack.push(tag)
    } else if (type === 0x103) {
      if (header < 16) fail(); const ext = offset + header; range(ext, 8, end)
      if (!stack.length || stack.pop() !== string(u32(ext + 4))) fail()
      if (!stack.length) rootEnded = true
    } else if (![0x100, 0x101, 0x104, 0x180].includes(type)) fail()
    offset = end
  }
  if (!manifest || stack.length || !rootEnded || !appSeen) fail()
  const packageName = manifest!.get('package'), versionName = manifest!.get('android:versionName'), versionCode = manifest!.get('android:versionCode'), major = manifest!.get('android:versionCodeMajor') ?? 0
  if (typeof packageName !== 'string' || packageName.length > 200 || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/u.test(packageName)) fail()
  if (manifest!.get('split') || manifest!.get('android:isFeatureSplit')) throw new Error('apk_split_not_supported: provide a standalone APK')
  if (versionName !== undefined && (typeof versionName !== 'string' || versionName.length > 100 || !versionName || /[\u0000-\u001f]/u.test(versionName))) fail()
  if (versionCode !== undefined && (!/^\d{1,10}$/u.test(String(versionCode)) || !/^\d{1,10}$/u.test(String(major)) || BigInt(versionCode) > 0xffffffffn || BigInt(major) > 0xffffffffn)) fail()
  return { packageName: packageName as string, ...(versionName ? { versionName: versionName as string } : {}), ...(versionCode !== undefined ? { versionCode: ((BigInt(major) << 32n) | BigInt(versionCode)).toString() } : {}), minSdk, testOnly }
}

async function manifestEntry(path: string, signal: AbortSignal): Promise<Buffer> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(path, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false }, (error, value) => error || !value ? reject(error ?? new Error('apk_zip_invalid')) : resolve(value)))
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      let count = 0, found: Buffer | undefined, finished = false, stream: NodeJS.ReadableStream | undefined
      const end = (error?: unknown) => { if (finished) return; finished = true; signal.removeEventListener('abort', abort); if (error) { (stream as { destroy?: () => void } | undefined)?.destroy?.(); reject(error) } else if (!found) reject(new Error('apk_manifest_missing')); else resolve(found) }
      const abort = () => end(signal.reason)
      signal.addEventListener('abort', abort, { once: true }); zip.once('error', end); zip.once('end', () => end())
      zip.on('entry', (entry: Entry) => { void (async () => {
        signal.throwIfAborted(); if (++count > 100000) throw new Error('apk_zip_entry_limit')
        if (entry.fileName === 'AndroidManifest.xml') {
          if (found || entry.uncompressedSize > MAX_MANIFEST || entry.uncompressedSize < 8 || entry.generalPurposeBitFlag & 1 || ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) throw new Error('apk_manifest_unsafe')
          stream = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => zip.openReadStream(entry, (error, value) => error || !value ? rejectStream(error ?? new Error('apk_manifest_unreadable')) : resolveStream(value)))
          const chunks: Buffer[] = []; let bytes = 0
          for await (const chunk of stream) { signal.throwIfAborted(); const data = Buffer.from(chunk as Uint8Array); bytes += data.length; if (bytes > MAX_MANIFEST) throw new Error('apk_manifest_size_limit'); chunks.push(data) }
          found = Buffer.concat(chunks)
        }
        if (!finished) zip.readEntry()
      })().catch(end) })
      if (signal.aborted) abort(); else zip.readEntry()
    })
  } finally { zip.close() }
}

/** Stage exactly the bytes inspected; the caller never installs the mutable original path. */
export async function prepareApk(sourcePath: string, deviceId: string, allowTestApk: boolean, signal: AbortSignal): Promise<PreparedApk> {
  if (!isAbsolute(sourcePath) || sourcePath.length > 4096 || !/\.apk$/iu.test(sourcePath) || /[\u0000-\u001f]/u.test(sourcePath)) throw new Error('apk_path_invalid: use the user-provided absolute local .apk path')
  const info = await lstat(sourcePath)
  if (!info.isFile() || info.isSymbolicLink() || info.size < 8 || info.size > MAX_APK) throw new Error('apk_file_invalid: require a regular APK no larger than 512 MiB')
  const directory = await mkdtemp(join(tmpdir(), 'opengui-apk-')), path = join(directory, 'source.apk')
  const dispose = () => rm(directory, { recursive: true, force: true })
  try {
    const source = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const current = await source.stat()
      if (!current.isFile() || current.dev !== info.dev || current.ino !== info.ino || current.size !== info.size) throw new Error('apk_source_changed')
      const target = await open(path, 'wx', 0o600), hash = createHash('sha256'), buffer = Buffer.alloc(256 * 1024)
      let bytes = 0
      try {
        for (;;) { signal.throwIfAborted(); const { bytesRead } = await source.read(buffer, 0, buffer.length, null); if (!bytesRead) break; bytes += bytesRead; if (bytes > MAX_APK) throw new Error('apk_size_limit'); const chunk = buffer.subarray(0, bytesRead); hash.update(chunk); let written = 0; while (written < bytesRead) written += (await target.write(chunk, written, bytesRead - written, null)).bytesWritten }
        await target.sync()
      } finally { await target.close() }
      const after = await source.stat()
      if (bytes !== current.size || after.mtimeMs !== current.mtimeMs || after.ctimeMs !== current.ctimeMs) throw new Error('apk_source_changed')
      const metadata = apkManifest(await manifestEntry(path, signal))
      signal.throwIfAborted()
      return { path, dispose, record: { ...metadata, id: randomUUID(), fileName: basename(sourcePath).slice(0, 200), deviceId, bytes, sha256: hash.digest('hex'), allowTestApk, preparedAt: new Date().toISOString(), status: 'prepared' } }
    } finally { await source.close() }
  } catch (error) { await dispose(); throw error }
}

/** Verify the private staged file before persisting an installation intent. */
export async function validatePreparedApk(apk: PreparedApk, signal: AbortSignal): Promise<void> {
  const info = await lstat(apk.path)
  if (!info.isFile() || info.isSymbolicLink() || info.size !== apk.record.bytes || process.platform !== 'win32' && (info.uid !== process.getuid?.() || info.mode & 0o077)) throw new Error('apk_stage_unsafe')
  const source = await open(apk.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const hash = createHash('sha256'), buffer = Buffer.alloc(256 * 1024)
    let bytes = 0
    for (;;) { signal.throwIfAborted(); const { bytesRead } = await source.read(buffer, 0, buffer.length, null); if (!bytesRead) break; bytes += bytesRead; if (bytes > MAX_APK) throw new Error('apk_stage_changed'); hash.update(buffer.subarray(0, bytesRead)) }
    if (bytes !== apk.record.bytes || hash.digest('hex') !== apk.record.sha256) throw new Error('apk_stage_changed')
  } finally { await source.close() }
}
