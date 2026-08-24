/** Proxy the receiving DSH model while preserving OpenGUI's screenshot bounds. */

import {
  LlmAdapter,
  type GenerateOptions,
  type LlmCallConfig,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type LlmRuntime,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import { latestPhoneScreenshotMessages } from './runtime.ts'

export const INHERITED_PROVIDER = 'coremate-inherited'

interface UpstreamRoute {
  readonly provider: string
  readonly model: string
}

function assertRoute(value: unknown): asserts value is UpstreamRoute {
  if (
    typeof value !== 'object'
    || value === null
    || typeof (value as Partial<UpstreamRoute>).provider !== 'string'
    || typeof (value as Partial<UpstreamRoute>).model !== 'string'
    || (value as UpstreamRoute).provider.length === 0
    || (value as UpstreamRoute).model.length === 0
    || (value as UpstreamRoute).provider === INHERITED_PROVIDER
  ) {
    throw new Error('coremate-mobile: invalid inherited model route')
  }
}

export function encodeInheritedModel(route: UpstreamRoute): string {
  assertRoute(route)
  return Buffer.from(JSON.stringify(route), 'utf8').toString('base64url')
}

export function decodeInheritedModel(model: string): UpstreamRoute {
  try {
    const value: unknown = JSON.parse(Buffer.from(model, 'base64url').toString('utf8'))
    assertRoute(value)
    return value
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('coremate-mobile:')) throw error
    throw new Error('coremate-mobile: invalid inherited model route', { cause: error })
  }
}

/** Wrap an ordinary agent route once; already wrapped or dedicated routes pass through. */
export function inheritedAgentOptions(options: AgentOptions): AgentOptions {
  const provider = options.provider?.trim()
  const model = options.model?.trim()
  if (!provider || !model) throw new Error('coremate-mobile: the current DSH conversation has no active model')
  if (provider === INHERITED_PROVIDER || provider === 'coremate-mobile') {
    return {
      provider,
      model,
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    }
  }
  return {
    provider: INHERITED_PROVIDER,
    model: encodeInheritedModel({ provider, model }),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
  }
}

function callConfig(options: GenerateOptions, route: UpstreamRoute): LlmCallConfig {
  return {
    provider: route.provider,
    model: route.model,
    ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(options.stop === undefined ? {} : { stop: options.stop }),
  }
}

/** One stable internal provider that delegates to the parent conversation's real adapter. */
export class InheritedModelAdapter extends LlmAdapter {
  constructor(private readonly llm: Pick<LlmRuntime, 'resolveModelInfo' | 'prepareCall'>) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Current DSH model' }
  }

  override async listModels(): Promise<readonly LlmModelInfo[]> {
    return []
  }

  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    if (provider !== INHERITED_PROVIDER) throw new Error(`coremate-mobile: unexpected inherited provider ${provider}`)
    const route = decodeInheritedModel(model)
    const upstream = await this.llm.resolveModelInfo(route.provider, route.model, signal)
    return { ...upstream, provider, id: model, name: `${upstream.name} through OpenGUI` }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const route = decodeInheritedModel(options.model)
    const prepared = await this.llm.prepareCall(callConfig(options, route), options.signal)
    yield* prepared.stream({
      ...options,
      ...prepared.config,
      messages: latestPhoneScreenshotMessages(options.messages),
    })
  }
}
