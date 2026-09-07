import { describe, expect, it } from 'vitest'
import {
  currentModelCapability,
  decideModelRouting,
  inheritedCapabilityFailure,
  migratedLegacyTrust,
} from '../src/model-routing.ts'

const currentFirst = { modelStrategy: 'current-first' as const, trustUnknownCurrentModels: false, trustedCurrentModels: [] }
const route = { provider: 'openai', model: 'gpt-vision' }

describe('OpenGUI current-model routing decisions', () => {
  it('uses a model that explicitly accepts images without asking', () => {
    expect(currentModelCapability(['text', 'image'])).toBe('supported')
    expect(decideModelRouting(currentFirst, route, 'ready')).toEqual({ kind: 'inherit', ...route })
  })

  it('sends explicitly text-only models to the dedicated fallback', () => {
    expect(currentModelCapability(['text'])).toBe('unsupported')
    expect(decideModelRouting(currentFirst, route, 'text-only')).toEqual({
      kind: 'dedicated',
      reason: 'unsupported',
    })
  })

  it('asks for unknown capability and scopes trust to one exact route', () => {
    expect(currentModelCapability(undefined)).toBe('unknown')
    expect(decideModelRouting(currentFirst, route, 'unknown-unpatchable')).toEqual({ kind: 'confirm', ...route })
    expect(decideModelRouting(
      { modelStrategy: 'current-first', trustUnknownCurrentModels: false, trustedCurrentModels: ['["openai","gpt-vision"]'] },
      route,
      'unknown-unpatchable',
    )).toEqual({ kind: 'inherit', ...route })
    expect(decideModelRouting(
      { modelStrategy: 'current-first', trustUnknownCurrentModels: true, trustedCurrentModels: ['["openai","gpt-vision"]'] },
      { provider: 'another', model: 'new-model' },
      'unknown-unpatchable',
    )).toEqual({ kind: 'confirm', provider: 'another', model: 'new-model' })
  })

  it('honors an explicit dedicated strategy and missing parent route', () => {
    expect(decideModelRouting(
      { modelStrategy: 'dedicated', trustUnknownCurrentModels: true, trustedCurrentModels: [] },
      route,
      'ready',
    )).toEqual({ kind: 'dedicated', reason: 'selected' })
    expect(decideModelRouting(currentFirst, {}, 'unknown-unpatchable')).toEqual({
      kind: 'dedicated',
      reason: 'missing-current',
    })
  })

  it('migrates legacy global trust only to the active unknown route', () => {
    const legacy = { modelStrategy: 'current-first' as const, trustUnknownCurrentModels: true, trustedCurrentModels: [] }
    expect(migratedLegacyTrust(legacy, route, 'unknown-patchable')).toEqual(['["openai","gpt-vision"]'])
    expect(migratedLegacyTrust(legacy, { provider: 'another', model: 'new-model' }, 'ready')).toBeUndefined()
    expect(migratedLegacyTrust({ ...legacy, trustUnknownCurrentModels: false }, route, 'unknown-unpatchable')).toBeUndefined()
  })

  it('recognizes provider image and tool capability errors without matching ordinary failures', () => {
    expect(inheritedCapabilityFailure(new Error('This model does not support image input'))).toBe(true)
    expect(inheritedCapabilityFailure(new Error('tool calling is unsupported for this endpoint'))).toBe(true)
    expect(inheritedCapabilityFailure(new Error('provider request failed', {
      cause: new Error('vision input is not supported'),
    }))).toBe(true)
    expect(inheritedCapabilityFailure(new Error('device unavailable'))).toBe(false)
  })
})
