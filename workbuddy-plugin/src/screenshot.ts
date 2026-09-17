import sharp from 'sharp'

import type { EncodedPhoneScreenshot } from '../../packages/device-runtime/src/image.ts'
export type { EncodedPhoneScreenshot } from '../../packages/device-runtime/src/image.ts'

/** Bound model-visible images without requiring a host-specific image helper. */
export async function encodeWorkBuddyPhoneScreenshot(source: Buffer): Promise<EncodedPhoneScreenshot> {
  const input = sharp(source, { limitInputPixels: 40_000_000 })
  const metadata = await input.metadata()
  if (!metadata.width || !metadata.height) throw new Error('opengui: invalid phone screenshot')
  for (const size of [1280, 1024, 800, 640]) {
    const { data, info } = await input.clone().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true }).toBuffer({ resolveWithObject: true })
    if (data.length <= 400_000) {
      return { data, width: info.width, height: info.height, sourceWidth: metadata.width, sourceHeight: metadata.height }
    }
  }
  throw new Error('opengui: screenshot exceeds the model image budget')
}
