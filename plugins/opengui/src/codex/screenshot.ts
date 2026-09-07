import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EncodedPhoneScreenshot } from '../image.ts'
import { pngDimensions } from '../image.ts'

const MAX_LONG_EDGE = 2_048
const JPEG_QUALITY = 65

function runSips(args: readonly string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    execFile('/usr/bin/sips', [...args], {
      shell: false,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1_048_576,
      encoding: 'utf8',
    }, (error, _stdout, stderr) => {
      if (error === null) resolveRun()
      else rejectRun(new Error(`opengui: sips screenshot encoding failed: ${(stderr || error.message).trim().slice(0, 1_000)}`, { cause: error }))
    })
  })
}

/** Parse the first JPEG start-of-frame segment without loading an image library. */
export function jpegDimensions(data: Buffer): { width: number; height: number } {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) throw new Error('opengui: screenshot encoder did not return JPEG data')
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  while (offset + 4 <= data.length) {
    while (offset < data.length && data[offset] === 0xff) offset += 1
    const marker = data[offset++]
    if (marker === undefined) break
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > data.length) break
    const length = data.readUInt16BE(offset)
    if (length < 2 || offset + length > data.length) break
    if (startOfFrame.has(marker)) {
      if (length < 7) break
      const height = data.readUInt16BE(offset + 3)
      const width = data.readUInt16BE(offset + 5)
      if (width > 0 && height > 0) return { width, height }
      break
    }
    offset += length
  }
  throw new Error('opengui: JPEG dimensions are missing from the encoded screenshot')
}

/** macOS-native bounded JPEG encoder used by dependency-free Codex bundles. */
export async function encodeCodexPhoneScreenshot(source: Buffer): Promise<EncodedPhoneScreenshot> {
  if (process.platform !== 'darwin') {
    throw new Error(`opengui: Codex local screenshot encoding currently supports macOS only, not ${process.platform}`)
  }
  const original = pngDimensions(source)
  const resize = Math.max(original.width, original.height) > MAX_LONG_EDGE ? ['-Z', String(MAX_LONG_EDGE)] : []
  const directory = await mkdtemp(join(tmpdir(), 'opengui-screenshot-'))
  await chmod(directory, 0o700)
  const input = join(directory, 'input.png')
  const output = join(directory, 'output.jpg')
  try {
    await writeFile(input, source, { mode: 0o600 })
    await runSips([
      ...resize,
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(JPEG_QUALITY),
      input, '--out', output,
    ])
    const data = await readFile(output)
    const dimensions = jpegDimensions(data)
    if (Math.max(dimensions.width, dimensions.height) > MAX_LONG_EDGE) {
      throw new Error(`opengui: encoded screenshot exceeds ${MAX_LONG_EDGE}px`)
    }
    return { data, ...dimensions }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
