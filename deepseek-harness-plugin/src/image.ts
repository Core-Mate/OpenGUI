import sharp from 'sharp'

/** JPEG quality used for every phone screenshot; intentionally within 60–70. */
export const PHONE_SCREENSHOT_JPEG_QUALITY = 65

/**
 * Encode an ADB screenshot as JPEG without changing its pixel dimensions.
 * @param source Encoded source screenshot returned by ADB.
 * @returns JPEG bytes at the source image width and height.
 */
export async function encodePhoneScreenshot(source: Buffer): Promise<Buffer> {
  return sharp(source, { failOn: 'error', limitInputPixels: false })
    .jpeg({ quality: PHONE_SCREENSHOT_JPEG_QUALITY })
    .toBuffer()
}
