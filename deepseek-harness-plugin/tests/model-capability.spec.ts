import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsDescriptor, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyModelCapability,
  declareCurrentModelVision,
  withdrawVisionDeclaration,
  type ModelRoute,
  type PiAiSettingsServices,
} from '../src/model-capability.ts'

const ns = settingsNamespace('llm-pi-ai')
const route: ModelRoute = { provider: 'gateway', model: 'vision-model' }
const directory = [{
  provider: 'gateway', displayName: 'Gateway', settingsNs: String(ns),
  settingsPath: ['providers', 'gateway'], declared: true,
}]

function user(model: Record<string, unknown>, provider: Record<string, unknown> = {}): Record<string, unknown> {
  return { providers: { gateway: { api: 'openai-completions', baseURL: 'https://example.test/v1', ...provider, models: [model] } } }
}

describe('OpenGUI model capability classification', () => {
  it('distinguishes explicit image, explicit text, missing input, and provider defaults', () => {
    const base = { ...route, configurableProviders: directory }
    expect(classifyModelCapability({ ...base, piAiUser: user({ id: route.model, input: ['text', 'image'] }), resolvedModalities: ['text', 'image'] })).toBe('ready')
    expect(classifyModelCapability({ ...base, piAiUser: user({ id: route.model, input: ['text'] }), resolvedModalities: ['text'] })).toBe('text-only')
    expect(classifyModelCapability({ ...base, piAiUser: user({ id: route.model }), resolvedModalities: ['text'] })).toBe('unknown-patchable')
    expect(classifyModelCapability({ ...base, piAiUser: user({ id: route.model }, { defaultInput: ['text', 'image'] }), resolvedModalities: ['text', 'image'] })).toBe('ready')
    expect(classifyModelCapability({ ...base, piAiUser: user({ id: route.model }, { defaultInput: ['text'] }), resolvedModalities: ['text'] })).toBe('text-only')
  })

  it('keeps unknown non-writable routes separate from explicit text metadata', () => {
    const base = { ...route, configurableProviders: [], piAiUser: undefined }
    expect(classifyModelCapability(base)).toBe('unknown-unpatchable')
    expect(classifyModelCapability({ ...base, resolvedModalities: ['text'] })).toBe('text-only')
    expect(classifyModelCapability({ ...base, resolvedModalities: ['text', 'image'] })).toBe('ready')
  })
})

function mutableServices(initialUser: Record<string, unknown>, conflicts = 0) {
  let revision = 3
  let raw = structuredClone(initialUser)
  let remainingConflicts = conflicts
  let active: ModelRoute = route
  const mutate = vi.fn(async (_ns: typeof ns, ops: readonly SettingsPathOp[], expected?: number) => {
    if (remainingConflicts > 0) {
      remainingConflicts -= 1
      revision += 1
      throw new SettingsConflictError(ns, expected ?? -1, revision)
    }
    const operation = ops[0]
    if (operation?.op !== 'set') throw new Error('expected a set operation')
    const providers = raw.providers as Record<string, Record<string, unknown>>
    providers.gateway!.models = structuredClone(operation.value)
    revision += 1
  })
  const services: PiAiSettingsServices = {
    describe: () => [{ ns, schema: {}, value: raw, user: raw, revision, applies: 'live' }] satisfies SettingsDescriptor[],
    mutate,
    currentRoute: () => active,
  }
  return {
    services,
    mutate,
    raw: () => raw,
    switchTo(next: ModelRoute) { active = next },
  }
}

describe('OpenGUI llm-pi-ai capability declaration', () => {
  it('patches only the active model entry and preserves every other provider field', async () => {
    const initial = user({ id: route.model, name: 'Vision' })
    const providers = initial.providers as Record<string, Record<string, unknown>>
    providers.other = { api: 'openai-responses', models: [{ id: 'other-model' }] }
    const fixture = mutableServices(initial)

    const declaration = await declareCurrentModelVision(fixture.services, route)

    expect(declaration?.routeKey).toBe('["gateway","vision-model"]')
    expect(fixture.raw()).toEqual({ providers: {
      gateway: {
        api: 'openai-completions', baseURL: 'https://example.test/v1',
        models: [{ id: 'vision-model', name: 'Vision', input: ['text', 'image'] }],
      },
      other: { api: 'openai-responses', models: [{ id: 'other-model' }] },
    } })
  })

  it('re-reads once after a revision conflict and refuses a concurrent model switch', async () => {
    const retry = mutableServices(user({ id: route.model }), 1)
    await expect(declareCurrentModelVision(retry.services, route)).resolves.toBeDefined()
    expect(retry.mutate).toHaveBeenCalledTimes(2)

    const switched = mutableServices(user({ id: route.model }), 1)
    switched.mutate.mockImplementationOnce(async () => {
      switched.switchTo({ provider: 'gateway', model: 'another-model' })
      throw new SettingsConflictError(ns, 3, 4)
    })
    await expect(declareCurrentModelVision(switched.services, route)).rejects.toThrow('DSH 已切换模型')
  })

  it('withdraws only an unchanged plugin-owned declaration', async () => {
    const fixture = mutableServices(user({ id: route.model, name: 'Vision' }))
    const declaration = await declareCurrentModelVision(fixture.services, route)
    expect(declaration).toBeDefined()
    await expect(withdrawVisionDeclaration(fixture.services, route, declaration!)).resolves.toBe(true)
    expect(((fixture.raw().providers as Record<string, Record<string, unknown>>).gateway!.models as unknown[])[0])
      .toEqual({ id: route.model, name: 'Vision' })

    const edited = mutableServices(user({ id: route.model, name: 'Vision' }))
    const owned = await declareCurrentModelVision(edited.services, route)
    const entry = ((edited.raw().providers as Record<string, Record<string, unknown>>).gateway!.models as Record<string, unknown>[])[0]!
    entry.name = 'User edited'
    await expect(withdrawVisionDeclaration(edited.services, route, owned!)).resolves.toBe(false)
    expect(entry.input).toEqual(['text', 'image'])
  })
})
