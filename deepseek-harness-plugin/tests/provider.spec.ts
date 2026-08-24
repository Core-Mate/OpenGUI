/** Standalone route construction through dependencies published by the official Harness. */

import { describe, expect, it } from 'vitest'
import { resolveMobileProfile } from '../src/provider.ts'

const config = {
  provider: 'coremate-mobile',
  displayName: 'Mobile model',
  baseURL: 'https://gateway.example/v1',
  api: 'openai-responses' as const,
  model: 'vision-model',
  apiKeyEnv: 'COREMATE_MOBILE_API_KEY',
  contextWindow: 131_072,
  maxTokens: 16_384,
  streamIdleTimeoutMs: 60_000,
}

describe('standalone mobile provider', () => {
  it('materializes the fixed image-capable route for PiAiAdapter', () => {
    const profile = resolveMobileProfile(config)

    expect(profile.provider).toBe('coremate-mobile')
    expect(profile.apiKeyEnv).toBe('COREMATE_MOBILE_API_KEY')
    expect(profile.streamIdleTimeoutMs).toBe(60_000)
    expect(profile.piProvider.getModels()).toEqual([
      expect.objectContaining({
        id: 'vision-model',
        provider: 'coremate-mobile',
        api: 'openai-responses',
        baseUrl: 'https://gateway.example/v1',
        input: ['text', 'image'],
        contextWindow: 131_072,
        maxTokens: 16_384,
      }),
    ])
  })

  it('refuses an invalid credential reference before registering the route', () => {
    expect(() => resolveMobileProfile({ ...config, apiKeyEnv: 'not a ref' })).toThrow(/credential ref/)
  })
})
