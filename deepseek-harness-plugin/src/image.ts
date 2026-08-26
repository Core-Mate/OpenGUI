import sharp from 'sharp'

/** JPEG quality used for every phone screenshot; intentionally within 60–70. */
export const PHONE_SCREENSHOT_JPEG_QUALITY = 65

/** Conservative provider-compatible bound for the longest model-facing image edge. */
export const PHONE_SCREENSHOT_MAX_LONG_EDGE = 2_048

/**
 * Encode an ADB screenshot as a bounded JPEG for model input.
 * @param source Encoded source screenshot returned by ADB.
 * @returns JPEG bytes whose aspect ratio is preserved and longest edge is at most 2048px.
 */
export async function encodePhoneScreenshot(source: Buffer): Promise<Buffer> {
  return sharp(source, { failOn: 'error', limitInputPixels: false })
    .resize({
      width: PHONE_SCREENSHOT_MAX_LONG_EDGE,
      height: PHONE_SCREENSHOT_MAX_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: PHONE_SCREENSHOT_JPEG_QUALITY })
    .toBuffer()
}
