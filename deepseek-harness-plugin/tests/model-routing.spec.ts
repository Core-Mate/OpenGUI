import { describe, expect, it } from 'vitest'
import {
  currentModelCapability,
  decideModelRouting,
  inheritedCapabilityFailure,
} from '../src/model-routing.ts'

const currentFirst = { modelStrategy: 'current-first' as const, trustUnknownCurrentModels: false }
const route = { provider: 'openai', model: 'gpt-vision' }

describe('OpenGUI current-model routing decisions', () => {
  it('uses a model that explicitly accepts images without asking', () => {
    expect(currentModelCapability(['text', 'image'])).toBe('supported')
    expect(decideModelRouting(currentFirst, route, 'supported')).toEqual({ kind: 'inherit', ...route })
  })

  it('sends explicitly text-only models to the dedicated fallback', () => {
    expect(currentModelCapability(['text'])).toBe('unsupported')
    expect(decideModelRouting(currentFirst, route, 'unsupported')).toEqual({
      kind: 'dedicated',
      reason: 'unsupported',
    })
  })

  it('asks once for unknown capability and trusts later model changes globally', () => {
    expect(currentModelCapability(undefined)).toBe('unknown')
    expect(decideModelRouting(currentFirst, route, 'unknown')).toEqual({ kind: 'confirm', ...route })
    expect(decideModelRouting(
      { modelStrategy: 'current-first', trustUnknownCurrentModels: true },
      { provider: 'another', model: 'new-model' },
      'unknown',
    )).toEqual({ kind: 'inherit', provider: 'another', model: 'new-model' })
  })

  it('honors an explicit dedicated strategy and missing parent route', () => {
    expect(decideModelRouting(
      { modelStrategy: 'dedicated', trustUnknownCurrentModels: true },
      route,
      'supported',
    )).toEqual({ kind: 'dedicated', reason: 'selected' })
    expect(decideModelRouting(currentFirst, {}, 'unknown')).toEqual({
      kind: 'dedicated',
      reason: 'missing-current',
    })
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
