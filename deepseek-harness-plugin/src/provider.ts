/**
 * OpenGUI's fixed OpenAI-compatible pi-ai route construction.
 *
 * The external plugin uses only the public `PiAiAdapter` extension point from
 * the installed Harness. Route validation and provider construction stay here
 * so installing this package never requires a matching Harness source patch.
 * @module dsh-coremate-mobile/provider
 */

import {
  createProvider,
  type Api,
  type ApiKeyAuth,
  type Model,
  type ProviderStreams,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'

/** OpenAI-compatible protocols supported by the phone-model route. */
export type MobileApi = 'openai-responses' | 'openai-completions'

/** Inputs required to materialize the phone-model route. */
export interface MobileProfileConfig {
  /** Stable Harness provider route. */
  provider: string
  /** Label shown by provider directories. */
  displayName: string
  /** OpenAI-compatible endpoint. */
  baseURL: string
  /** OpenAI-compatible wire protocol. */
  api: MobileApi
  /** Image- and tool-capable model id. */
  model: string
  /** Credential reference resolved by the Harness. */
  apiKeyEnv: string
  /** Declared model context capacity. */
  contextWindow: number
  /** Declared maximum model output. */
  maxTokens: number
  /** Maximum time without a provider stream event. */
  streamIdleTimeoutMs: number
}

const PROTOCOLS: Readonly<Record<MobileApi, () => ProviderStreams>> = {
  'openai-responses': openAIResponsesApi,
  'openai-completions': openAICompletionsApi,
}

function harnessApiKeyAuth(displayName: string): ApiKeyAuth {
  return {
    name: displayName,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: displayName,
    }),
  }
}

/**
 * Materialize the one route consumed by `PiAiAdapter`.
 * @param config - validated phone-model configuration.
 * @returns A detached resolved profile for one adapter registration.
 */
export function resolveMobileProfile(config: MobileProfileConfig): ResolvedPiAiProviderProfile {
  const model: Model<Api> = {
    id: config.model,
    name: config.model,
    api: config.api,
    provider: config.provider,
    baseUrl: config.baseURL,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
  }
  return {
    provider: config.provider,
    displayName: config.displayName,
    api: config.api,
    baseURL: config.baseURL,
    apiKeyEnv: credentialRef(config.apiKeyEnv),
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(undefined, 'coremate-mobile retryPolicy'),
    configuredMaxTokens: new Map(),
    piProvider: createProvider({
      id: config.provider,
      name: config.displayName,
      baseUrl: config.baseURL,
      auth: { apiKey: harnessApiKeyAuth(config.displayName) },
      models: [model],
      api: PROTOCOLS[config.api](),
    }),
  }
}
