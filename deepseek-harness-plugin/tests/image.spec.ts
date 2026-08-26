import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  PHONE_SCREENSHOT_JPEG_QUALITY,
  PHONE_SCREENSHOT_MAX_LONG_EDGE,
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

  it('bounds Nubia M153 portrait and landscape screenshots without enlarging smaller frames', async () => {
    expect(PHONE_SCREENSHOT_MAX_LONG_EDGE).toBe(2_048)
    for (const [width, height, expectedWidth, expectedHeight] of [
      [1_264, 2_800, 925, 2_048],
      [2_800, 1_264, 2_048, 925],
      [1_080, 2_400, 922, 2_048],
      [321, 654, 321, 654],
    ] as const) {
      const png = await sharp({
        create: { width, height, channels: 3, background: { r: 16, g: 32, b: 48 } },
      }).png().toBuffer()

      const metadata = await sharp(await encodePhoneScreenshot(png)).metadata()
      expect(metadata).toMatchObject({ format: 'jpeg', width: expectedWidth, height: expectedHeight })
    }
  })
})
