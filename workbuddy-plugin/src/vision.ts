import sharp from 'sharp'
import type { VisualFrame } from '../../packages/device-runtime/src/frame-comparison.ts'
export * from '../../packages/device-runtime/src/frame-comparison.ts'

/** Small RGB samples compare visual change, not JPEG encoding or semantic success. */
export async function sampleFrame(image: Buffer): Promise<VisualFrame> {
  const result = await sharp(image).removeAlpha().toColourspace('srgb').resize({ width: 256, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true })
  return { pixels: result.data, width: result.info.width, height: result.info.height }
}
