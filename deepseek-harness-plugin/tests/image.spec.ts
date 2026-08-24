import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  PHONE_SCREENSHOT_JPEG_QUALITY,
  encodePhoneScreenshot,
} from '../src/image.ts'

describe('coremate-mobile screenshot encoding', () => {
  it('returns a quality-60-to-70 JPEG at the source pixel dimensions', async () => {
    const png = await sharp({
      create: {
        width: 321,
        height: 654,
        channels: 3,
        background: { r: 32, g: 96, b: 160 },
      },
    }).png().toBuffer()

    const jpeg = await encodePhoneScreenshot(png)
    const metadata = await sharp(jpeg).metadata()

    expect(PHONE_SCREENSHOT_JPEG_QUALITY).toBeGreaterThanOrEqual(60)
    expect(PHONE_SCREENSHOT_JPEG_QUALITY).toBeLessThanOrEqual(70)
    expect([...jpeg.subarray(0, 3)]).toEqual([0xFF, 0xD8, 0xFF])
    expect(metadata).toMatchObject({ format: 'jpeg', width: 321, height: 654 })
  })
})
