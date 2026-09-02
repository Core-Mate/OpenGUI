import { describe, expect, it } from 'vitest'
import { Config, configuredModel } from '../src/index.ts'

describe('OpenGUI model editor configuration', () => {
  it('keeps the legacy single-model fields working', () => {
    expect(configuredModel({
      model: ' legacy-vision ',
      contextWindow: 131_072,
      maxTokens: 16_384,
    })).toEqual({
      id: 'legacy-vision',
      contextWindow: 131_072,
      maxTokens: 16_384,
    })
  })

  it('uses the first model saved by the existing DSH model editor', () => {
    const parsed = Config({
      contextWindow: 131_072,
      maxTokens: 16_384,
      models: [{
        id: ' edited-vision ',
        name: 'Edited Vision',
        contextWindow: 262_144,
        maxTokens: 32_768,
        input: ['text', 'image'],
      }],
    })

    expect(configuredModel(parsed)).toEqual({
      id: 'edited-vision',
      contextWindow: 262_144,
      maxTokens: 32_768,
    })
  })

  it('falls back per capacity when the editor leaves a value blank', () => {
    expect(configuredModel({
      model: 'legacy-vision',
      contextWindow: 131_072,
      maxTokens: 16_384,
      models: [{ id: 'edited-vision' }],
    })).toEqual({
      id: 'edited-vision', contextWindow: 131_072, maxTokens: 16_384,
    })
  })
})
