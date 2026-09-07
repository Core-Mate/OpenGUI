import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, Message, PreparedLlmCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import {
  decodeInheritedModel,
  encodeInheritedModel,
  inheritedAgentOptions,
  INHERITED_PROVIDER,
  InheritedModelAdapter,
} from '../src/inherited-model.ts'

function phoneResult(index: number): Message {
  return {
    id: `message-${index}`,
    role: 'user',
    source: { kind: 'tool', callId: `call-${index}` },
    content: [{
      type: 'tool-result',
      toolCallId: `call-${index}`,
      content: [
        { type: 'text', text: `observation ${index}` },
        {
          type: 'image',
          attachment: {
            attachmentId: `image-${index}`,
            mediaType: 'image/jpeg',
            bytes: index,
            width: 100,
            height: 200,
          },
        },
      ],
    }],
  } as unknown as Message
}

function imageCount(messages: readonly Message[]): number {
  return messages.flatMap(message => message.content).filter(block => block.type === 'tool-result')
    .flatMap(block => block.content).filter(block => block.type === 'image').length
}

describe('OpenGUI inherited model adapter', () => {
  it('round-trips an upstream route and wraps ordinary agent options once', () => {
    const encoded = encodeInheritedModel({ provider: 'openai', model: 'gpt-vision' })
    expect(decodeInheritedModel(encoded)).toEqual({ provider: 'openai', model: 'gpt-vision' })
    const wrapped = inheritedAgentOptions({ provider: 'openai', model: 'gpt-vision', maxTokens: 8192 })
    expect(wrapped).toEqual({ provider: INHERITED_PROVIDER, model: encoded, maxTokens: 8192 })
    expect(inheritedAgentOptions(wrapped)).toEqual(wrapped)
    expect(() => decodeInheritedModel('invalid')).toThrow('invalid inherited model route')
  })

  it('rewrites model metadata to the proxy identity', async () => {
    const resolveModelInfo = vi.fn(async () => ({
      provider: 'openai', id: 'gpt-vision', name: 'Vision', inputModalities: ['text', 'image'] as const,
    }))
    const adapter = new InheritedModelAdapter({
      resolveModelInfo,
      prepareCall: vi.fn(),
    } as never)
    const model = encodeInheritedModel({ provider: 'openai', model: 'gpt-vision' })

    await expect(adapter.resolveModel(INHERITED_PROVIDER, model)).resolves.toMatchObject({
      provider: INHERITED_PROVIDER,
      id: model,
      name: 'Vision through OpenGUI',
      inputModalities: ['text', 'image'],
    })
    expect(resolveModelInfo).toHaveBeenCalledWith('openai', 'gpt-vision', undefined)
  })

  it('forwards the original request through the upstream adapter with only the latest screenshot', async () => {
    let forwarded: GenerateOptions | undefined
    const stream = vi.fn((options: GenerateOptions): AsyncIterable<StreamChunk> => {
      forwarded = options
      return (async function* () {
        yield { type: 'finish', reason: { kind: 'stop' } } as StreamChunk
      })()
    })
    const prepareCall = vi.fn(async config => ({
      config,
      retryPolicy: {},
      adapterDefaults: {},
      stream,
    } as unknown as PreparedLlmCall))
    const adapter = new InheritedModelAdapter({ resolveModelInfo: vi.fn(), prepareCall } as never)
    const model = encodeInheritedModel({ provider: 'openai', model: 'gpt-vision' })
    const signal = new AbortController().signal
    const options = {
      provider: INHERITED_PROVIDER,
      model,
      messages: [phoneResult(1), phoneResult(2)],
      tools: [{ name: 'phone_control', description: 'control', parameters: {} }],
      maxTokens: 4096,
      signal,
    } satisfies GenerateOptions

    await expect(Array.fromAsync(adapter.stream(options))).resolves.toEqual([
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    expect(prepareCall).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-vision', maxTokens: 4096 }, signal)
    expect(forwarded).toMatchObject({
      provider: 'openai',
      model: 'gpt-vision',
      tools: options.tools,
      maxTokens: 4096,
      signal,
    })
    expect(imageCount(forwarded?.messages ?? [])).toBe(1)
    expect(JSON.stringify(forwarded?.messages)).toContain('older OpenGUI screenshot omitted')
  })

  it('passes through dedicated agent options without proxy nesting', () => {
    const dedicated: AgentOptions = { provider: 'coremate-mobile', model: 'vision' }
    expect(inheritedAgentOptions(dedicated)).toEqual(dedicated)
  })
})
