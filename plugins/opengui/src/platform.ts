export type DevicePlatform = 'android' | 'harmonyos'

export function devicePlatform(): DevicePlatform {
  const value = process.env.OPENGUI_PLATFORM?.trim() || 'android'
  if (value !== 'android' && value !== 'harmonyos') {
    throw new Error('opengui: OPENGUI_PLATFORM must be android or harmonyos')
  }
  return value
}
