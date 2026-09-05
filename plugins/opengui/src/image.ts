/** Encoded screenshot shape; the macOS encoder has no native npm dependency. */
export interface EncodedPhoneScreenshot {
  readonly data: Buffer
  readonly width: number
  readonly height: number
}
/** Read screencap's current orientation and pixel size, not wm's natural size. */
export function pngDimensions(data: Buffer): { width: number; height: number } {
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || data.readUInt32BE(8) !== 13 || data.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('opengui: screenshot is not a PNG with an IHDR header')
  }
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  if (width < 1 || height < 1 || width > 65_535 || height > 65_535) {
    throw new Error('opengui: invalid screenshot dimensions')
  }
  return { width, height }
}
