import { afterEach, describe, expect, it, vi } from 'vitest'
import { daemonEndpoint } from '../src/state.ts'
import { devicePlatform } from '../src/platform.ts'

afterEach(() => vi.unstubAllEnvs())

describe('platform-specific runtime selection', () => {
  it('keeps Android as the default and rejects unsupported platform values', () => {
    vi.stubEnv('OPENGUI_PLATFORM', '')
    expect(devicePlatform()).toBe('android')
    vi.stubEnv('OPENGUI_PLATFORM', 'ios')
    expect(() => devicePlatform()).toThrow()
  })

  it('isolates HarmonyOS daemon identities without changing the Android identity', () => {
    vi.stubEnv('OPENGUI_PLATFORM', 'android')
    const android = daemonEndpoint('/private/opengui-runtime-test')
    vi.stubEnv('OPENGUI_PLATFORM', 'harmonyos')
    expect(daemonEndpoint('/private/opengui-runtime-test')).not.toBe(android)
    vi.stubEnv('OPENGUI_PLATFORM', 'android')
    expect(daemonEndpoint('/private/opengui-runtime-test')).toBe(android)
  })
})
