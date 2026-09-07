/** Model capability inspection and narrowly scoped llm-pi-ai declarations. */

import type { ModelModality, LlmConfigurableProvider } from '@deepseek-ai/dsh-llm'
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsDescriptor, SettingsPathOp } from '@deepseek-ai/dsh-settings'

const PI_AI_NS = settingsNamespace('llm-pi-ai')

export interface ModelRoute {
  readonly provider: string
  readonly model: string
}

export type ModelCapability = 'ready' | 'text-only' | 'unknown-patchable' | 'unknown-unpatchable'

export interface ModelCapabilityInput extends ModelRoute {
  readonly resolvedModalities?: readonly ModelModality[]
  readonly configurableProviders: readonly LlmConfigurableProvider[]
  readonly piAiUser: unknown
}

export interface VisionDeclaration {
  readonly routeKey: string
  readonly after: string
}

export interface PiAiSettingsServices {
  readonly describe: () => readonly SettingsDescriptor[]
  readonly mutate: (ns: typeof PI_AI_NS, ops: readonly SettingsPathOp[], expectedRevision?: number) => Promise<void>
  readonly currentRoute: () => ModelRoute | undefined
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined
}

function rawProvider(user: unknown, provider: string): Record<string, unknown> | undefined {
  return object(object(object(user)?.providers)?.[provider])
}

function rawModel(profile: Record<string, unknown> | undefined, model: string): Record<string, unknown> | undefined {
  const models = profile?.models
  if (!Array.isArray(models)) return undefined
  return models.map(object).find(entry => entry?.id === model)
}

function configurableRoute(input: ModelCapabilityInput): LlmConfigurableProvider | undefined {
  return input.configurableProviders.find(entry => entry.provider === input.provider)
}

/** Preserve the distinction that llm-pi-ai's resolved default `[text]` erases. */
export function classifyModelCapability(input: ModelCapabilityInput): ModelCapability {
  const directory = configurableRoute(input)
  const writable = directory?.declared === true
    && directory.settingsNs === PI_AI_NS
    && directory.settingsPath.join('/') === `providers/${input.provider}`
  const profile = rawProvider(input.piAiUser, input.provider)
  const model = rawModel(profile, input.model)
  const declaredInput = stringArray(model?.input)
  const defaultInput = stringArray(profile?.defaultInput)

  if (declaredInput?.includes('image') || defaultInput?.includes('image')) return 'ready'
  if (declaredInput !== undefined && declaredInput.length > 0) return 'text-only'
  if (defaultInput !== undefined && defaultInput.length > 0) return 'text-only'
  if (writable && model !== undefined) return 'unknown-patchable'
  if (input.resolvedModalities?.includes('image')) return 'ready'
  if (input.resolvedModalities !== undefined) return 'text-only'
  return 'unknown-unpatchable'
}

export function modelRouteKey(route: ModelRoute): string {
  return JSON.stringify([route.provider, route.model])
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const record = object(value)
  if (record !== undefined) {
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function descriptor(services: PiAiSettingsServices): SettingsDescriptor {
  const found = services.describe().find(item => item.ns === PI_AI_NS)
  if (found === undefined) throw new Error('coremate-mobile: llm-pi-ai settings are unavailable')
  return found
}

function assertCurrent(services: PiAiSettingsServices, route: ModelRoute): void {
  const current = services.currentRoute()
  if (current?.provider !== route.provider || current.model !== route.model) {
    throw new Error('coremate-mobile: DSH 已切换模型，未修改原模型配置；请重新提交任务')
  }
}

function modelsAt(snapshot: SettingsDescriptor, route: ModelRoute): Record<string, unknown>[] {
  const models = (rawProvider(snapshot.user, route.provider)
    ?? rawProvider(snapshot.base, route.provider)
    ?? rawProvider(snapshot.value, route.provider))?.models
  if (!Array.isArray(models)) throw new Error('coremate-mobile: 当前模型不由可写的 llm-pi-ai 配置管理')
  const entries = models.map(object)
  if (entries.some(entry => entry === undefined)) throw new Error('coremate-mobile: llm-pi-ai 模型配置格式无效')
  return entries as Record<string, unknown>[]
}

/** Add only the image declaration to the exact active custom model, with one CAS retry. */
export async function declareCurrentModelVision(
  services: PiAiSettingsServices,
  route: ModelRoute,
): Promise<VisionDeclaration | undefined> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assertCurrent(services, route)
    const snapshot = descriptor(services)
    const models = modelsAt(snapshot, route)
    const index = models.findIndex(entry => entry.id === route.model)
    if (index < 0) throw new Error('coremate-mobile: 当前模型条目已不存在，请重新提交任务')
    const input = stringArray(models[index]?.input)
    if (input?.includes('image')) return undefined
    if (input !== undefined && input.length > 0) {
      throw new Error('coremate-mobile: 当前模型已明确声明为仅文字，未自动修改')
    }
    const nextEntry = { ...models[index], input: ['text', 'image'] }
    const nextModels = models.map((entry, candidate) => candidate === index ? nextEntry : entry)
    try {
      await services.mutate(PI_AI_NS, [{
        op: 'set', path: ['providers', route.provider, 'models'], value: nextModels,
      }], snapshot.revision)
      assertCurrent(services, route)
      return { routeKey: modelRouteKey(route), after: canonical(nextEntry) }
    } catch (error) {
      if (!(error instanceof SettingsConflictError) || attempt > 0) throw error
    }
  }
  return undefined
}

/** Remove our declaration only while the exact model entry still matches our write. */
export async function withdrawVisionDeclaration(
  services: PiAiSettingsServices,
  route: ModelRoute,
  declaration: VisionDeclaration,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = descriptor(services)
    const models = modelsAt(snapshot, route)
    const index = models.findIndex(entry => entry.id === route.model)
    if (index < 0 || canonical(models[index]) !== declaration.after) return false
    const { input: _input, ...previousEntry } = models[index]!
    const nextModels = models.map((entry, candidate) => candidate === index ? previousEntry : entry)
    try {
      await services.mutate(PI_AI_NS, [{
        op: 'set', path: ['providers', route.provider, 'models'], value: nextModels,
      }], snapshot.revision)
      return true
    } catch (error) {
      if (!(error instanceof SettingsConflictError) || attempt > 0) throw error
    }
  }
  return false
}
