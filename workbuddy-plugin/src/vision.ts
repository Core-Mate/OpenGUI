import sharp from 'sharp'

export interface VisualFrame { readonly pixels: Buffer; readonly width: number; readonly height: number }
export interface ImageRegion { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/** Small RGB samples compare visual change, not JPEG encoding or semantic success. */
export async function sampleFrame(image: Buffer): Promise<VisualFrame> {
  const result = await sharp(image).removeAlpha().toColourspace('srgb').resize({ width: 256, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true })
  return { pixels: result.data, width: result.info.width, height: result.info.height }
}

/** Ignore isolated clock/cursor/compression noise, but never mask a target region. */
export function frameChanged(before: VisualFrame, after: VisualFrame, region?: ImageRegion): boolean {
  if (before.width !== after.width || before.height !== after.height) return true
  const left = Math.max(0, Math.floor((region?.left ?? 0) * before.width))
  const right = Math.min(before.width, Math.ceil((region?.right ?? 1) * before.width))
  const top = Math.max(0, Math.floor((region?.top ?? 0) * before.height))
  const bottom = Math.min(before.height, Math.ceil((region?.bottom ?? 1) * before.height))
  const total = (right - left) * (bottom - top)
  if (total <= 0) return true
  let changed = 0
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const offset = (y * before.width + x) * 3
    if ([0, 1, 2].some(channel => Math.abs(before.pixels[offset + channel]! - after.pixels[offset + channel]!) > 20)) changed++
  }
  return changed / total > (region ? 0.01 : 0.02)
}
