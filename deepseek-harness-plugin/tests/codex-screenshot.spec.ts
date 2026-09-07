import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { encodeCodexPhoneScreenshot, jpegDimensions } from '../src/codex/screenshot.ts'

describe('Codex screenshot encoder', () => {
  it('reads JPEG dimensions without loading a runtime image dependency', async () => {
    const jpeg = await sharp({
      create: { width: 23, height: 17, channels: 3, background: '#4f46e5' },
    }).jpeg().toBuffer()

    expect(jpegDimensions(jpeg)).toEqual({ width: 23, height: 17 })
  })

  it.runIf(process.platform === 'darwin')('uses the native macOS encoder and caps the long edge at 2048px', async () => {
    const png = await sharp({
      create: { width: 3_000, height: 1_500, channels: 3, background: '#4f46e5' },
    }).png().toBuffer()

    const result = await encodeCodexPhoneScreenshot(png)

    expect(result.data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    expect(result).toMatchObject({ width: 2_048, height: 1_024 })
  })
})
