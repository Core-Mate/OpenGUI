/** ZIP extraction with an explicit no-link, no-traversal policy. */

import { createWriteStream } from 'node:fs'
import { chmod, mkdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import type { Entry, ZipFile } from 'yauzl'

const FILE_TYPE_MASK = 0o170000
const REGULAR_FILE = 0o100000
const DIRECTORY = 0o040000
const SYMBOLIC_LINK = 0o120000

function unixMode(entry: Entry): number {
  return (entry.externalFileAttributes >>> 16) & 0xffff
}

function safeTarget(root: string, entry: Entry): { path: string, directory: boolean, mode: number } {
  const name = entry.fileName
  const directory = name.endsWith('/')
  const segments = name.split('/').filter(segment => segment.length > 0)
  if (
    name.length === 0
    || name.startsWith('/')
    || /^[A-Za-z]:/u.test(name)
    || segments.some(segment => segment === '.' || segment === '..')
  ) {
    throw new Error(`unsafe ZIP entry path: ${name}`)
  }

  const mode = unixMode(entry)
  const type = mode & FILE_TYPE_MASK
  if (type === SYMBOLIC_LINK) throw new Error(`unsafe ZIP symbolic link: ${name}`)
  if (directory ? type !== 0 && type !== DIRECTORY : type !== 0 && type !== REGULAR_FILE) {
    throw new Error(`unsafe ZIP special file: ${name}`)
  }

  const path = resolve(root, ...segments)
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`unsafe ZIP entry path: ${name}`)
  return {
    path,
    directory,
    mode: mode & 0o777,
  }
}

function openArchive(path: string): Promise<ZipFile> {
  return new Promise((resolveOpen, rejectOpen) => {
    yauzl.open(path, {
      lazyEntries: true,
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true,
    }, (error, zip) => {
      if (error !== null) rejectOpen(error)
      else if (zip === undefined) rejectOpen(new Error('ZIP archive could not be opened'))
      else resolveOpen(zip)
    })
  })
}

function openEntry(zip: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolveStream, rejectStream) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error !== null) rejectStream(error)
      else if (stream === undefined) rejectStream(new Error(`ZIP entry could not be read: ${entry.fileName}`))
      else resolveStream(stream)
    })
  })
}

/** Extract regular files and directories only, preserving safe Unix permission bits. */
export async function extractSafeZip(archivePath: string, destination: string): Promise<void> {
  const root = resolve(destination)
  await mkdir(root, { recursive: true })
  const zip = await openArchive(archivePath)

  await new Promise<void>((resolveExtraction, rejectExtraction) => {
    let settled = false
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      zip.close()
      rejectExtraction(error)
    }

    zip.once('error', fail)
    zip.once('end', () => {
      if (settled) return
      settled = true
      resolveExtraction()
    })
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        const target = safeTarget(root, entry)
        if (target.directory) {
          await mkdir(target.path, { recursive: true, mode: target.mode || 0o755 })
          if (target.mode !== 0) await chmod(target.path, target.mode)
        } else {
          await mkdir(dirname(target.path), { recursive: true })
          const stream = await openEntry(zip, entry)
          await pipeline(stream, createWriteStream(target.path, {
            flags: 'wx',
            mode: target.mode || 0o644,
          }))
          if (target.mode !== 0) await chmod(target.path, target.mode)
        }
        zip.readEntry()
      })().catch(fail)
    })
    zip.readEntry()
  })
}
