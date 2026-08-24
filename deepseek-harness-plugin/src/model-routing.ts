/** Pure decisions for choosing the current DSH model or the dedicated fallback. */

import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ModelModality } from '@deepseek-ai/dsh-llm'

export type CoremateModelStrategy = 'current-first' | 'dedicated'

export interface CoremateRoutingConfiguration {
  readonly modelStrategy: CoremateModelStrategy
  readonly trustUnknownCurrentModels: boolean
}

export type CurrentModelCapability = 'supported' | 'unsupported' | 'unknown'

export type CoremateRoutingDecision =
  | { readonly kind: 'inherit', readonly provider: string, readonly model: string }
  | { readonly kind: 'dedicated', readonly reason: 'selected' | 'missing-current' | 'unsupported' }
  | { readonly kind: 'confirm', readonly provider: string, readonly model: string }

export function currentModelCapability(modalities: readonly ModelModality[] | undefined): CurrentModelCapability {
  if (modalities === undefined) return 'unknown'
  return modalities.includes('image') ? 'supported' : 'unsupported'
}

export function decideModelRouting(
  config: CoremateRoutingConfiguration,
  options: AgentOptions,
  capability: CurrentModelCapability,
): CoremateRoutingDecision {
  if (config.modelStrategy === 'dedicated') return { kind: 'dedicated', reason: 'selected' }
  const provider = options.provider?.trim()
  const model = options.model?.trim()
  if (!provider || !model) return { kind: 'dedicated', reason: 'missing-current' }
  if (capability === 'unsupported') return { kind: 'dedicated', reason: 'unsupported' }
  if (capability === 'unknown' && !config.trustUnknownCurrentModels) {
    return { kind: 'confirm', provider, model }
  }
  return { kind: 'inherit', provider, model }
}

export function inheritedCapabilityFailure(error: unknown): boolean {
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current)
    parts.push(current instanceof Error ? current.message : String(current))
    current = current instanceof Error ? current.cause : undefined
  }
  const message = parts.join(' ')
  return /(?:image|vision|modality|tool(?:[ -]?call(?:ing)?)?).{0,80}(?:unsupported|not supported|does not support|invalid)/iu.test(message)
    || /(?:unsupported|not supported|does not support|invalid).{0,80}(?:image|vision|modality|tool(?:[ -]?call(?:ing)?)?)/iu.test(message)
}
