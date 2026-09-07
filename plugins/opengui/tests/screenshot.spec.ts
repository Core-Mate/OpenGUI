import { describe, expect, it } from 'vitest'
import { encodeCodexPhoneScreenshot, jpegDimensions } from '../src/codex/screenshot.ts'
import { deflateSync } from 'node:zlib'

function png(width: number, height: number): Buffer {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data])
    let crc = 0xffffffff
    for (const byte of body) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    const result = Buffer.alloc(data.length + 12)
    result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4)
    return result
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))])
}

describe('bounded screenshot encoding', () => {
  it('rejects non-JPEG and truncated headers', () => {
    expect(() => jpegDimensions(Buffer.from('not an image'))).toThrow('JPEG')
    expect(() => jpegDimensions(Buffer.from('ffd8ffc000', 'hex'))).toThrow('dimensions')
  })
  it.runIf(process.platform === 'darwin')('encodes a real PNG with the native macOS encoder', async () => {
    const encoded = await encodeCodexPhoneScreenshot(png(100, 200))
    expect(encoded).toMatchObject({ width: 100, height: 200 })
    expect(encoded.data.length).toBeGreaterThan(20)
    expect(jpegDimensions(encoded.data)).toEqual({ width: 100, height: 200 })
  })
  it.runIf(process.platform === 'darwin')('downscales a large landscape frame without stretching it', async () => {
    const encoded = await encodeCodexPhoneScreenshot(png(2400, 1200))
    expect(encoded).toMatchObject({ width: 2048, height: 1024 })
  })
})
