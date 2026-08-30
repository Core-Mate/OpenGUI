import sharp from 'sharp'

/** JPEG quality used for every phone screenshot; intentionally within 60–70. */
export const PHONE_SCREENSHOT_JPEG_QUALITY = 65

/** Conservative provider-compatible bound for the longest model-facing image edge. */
export const PHONE_SCREENSHOT_MAX_LONG_EDGE = 2_048

/** Encoded screenshot plus the exact pixel space exposed to an agent. */
export interface EncodedPhoneScreenshot {
  readonly data: Buffer
  readonly width: number
  readonly height: number
}

/**
 * Encode an ADB screenshot and retain the final JPEG dimensions.
 * @param source Encoded source screenshot returned by ADB.
 * @returns Bounded JPEG bytes and their exact pixel dimensions.
 */
export async function encodePhoneScreenshotFrame(source: Buffer): Promise<EncodedPhoneScreenshot> {
  const output = await sharp(source, { failOn: 'error', limitInputPixels: false })
    .resize({
      width: PHONE_SCREENSHOT_MAX_LONG_EDGE,
      height: PHONE_SCREENSHOT_MAX_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: PHONE_SCREENSHOT_JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true })
  return {
    data: output.data,
    width: output.info.width,
    height: output.info.height,
  }
}

/**
 * Encode an ADB screenshot as a bounded JPEG for model input.
 * @param source Encoded source screenshot returned by ADB.
 * @returns JPEG bytes whose aspect ratio is preserved and longest edge is at most 2048px.
 */
export async function encodePhoneScreenshot(source: Buffer): Promise<Buffer> {
  return (await encodePhoneScreenshotFrame(source)).data
}
