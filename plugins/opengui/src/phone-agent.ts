import { Agent, type AgentTool } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'
import { streamSimple as completions } from '@earendil-works/pi-ai/api/openai-completions'
import { streamSimple as responses } from '@earendil-works/pi-ai/api/openai-responses'
import { phoneExecutor, type AgentFactory } from '../../../packages/phone-agent/src/executor.ts'

/** The only Pi dependency seam; host packages pin both dependencies to 0.85.1. */
const create: AgentFactory = options => {
  let turns = 0
  const model: Model<'openai-completions' | 'openai-responses'> = {
    id: options.profile.model, name: options.profile.model, api: options.profile.protocol,
    provider: 'opengui-byok', baseUrl: options.profile.baseUrl, reasoning: false,
    input: ['text', 'image'], contextWindow: 32000, maxTokens: 4096,
    // Pi requires numeric rates. They are never exposed as prices or recorded as usage.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
  const agent = new Agent({
    initialState: { model, thinkingLevel: 'off', systemPrompt: options.system,
      tools: options.tools.map(tool => ({ name: tool.name, label: tool.name,
        description: tool.description, parameters: tool.parameters as AgentTool['parameters'],
        replay: 'never', executionMode: 'sequential',
        execute: async (_id, args) => ({ content: await tool.execute(args as Record<string, unknown>), details: {} }),
      })),
    },
    streamFn: (_model, context, streamOptions) => {
      const request = { ...streamOptions, apiKey: options.key, signal: options.signal, maxTokens: 4096 }
      return model.api === 'openai-completions'
        ? completions(model as Model<'openai-completions'>, context, request)
        : responses(model as Model<'openai-responses'>, context, request)
    },
    toolExecution: 'sequential',
    beforeToolCall: async () => options.stopped() || options.signal.aborted ? { block: true, terminate: true, reason: 'Task stopped' } : undefined,
    shouldStopAfterTurn: () => options.stopped() || ++turns >= 120,
    // Retain transcript structure but remove older image payloads; disk evidence is immutable.
    transformContext: async messages => {
      const keepFrom = Math.max(0, messages.length - 6)
      return messages.map((message, index) => {
        if (index >= keepFrom || (message.role !== 'user' && message.role !== 'toolResult') || !Array.isArray(message.content)) return message
        return { ...message, content: message.content.map(block => block.type === 'image' ? { type: 'text' as const, text: '[Earlier screenshot retained in local evidence]' } : block) }
      })
    },
  })
  agent.subscribe(event => {
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const usage = event.message.usage
      if (usage.input > 0 || usage.output > 0) options.usage(usage.input, usage.output)
    }
  })
  const abort = () => agent.abort()
  options.signal.addEventListener('abort', abort, { once: true })
  return {
    prompt: async (text, images) => {
      options.signal.throwIfAborted()
      await agent.prompt(text, images?.filter((item): item is Extract<typeof item, { type: 'image' }> => item.type === 'image'))
      if (agent.state.errorMessage) throw new Error('Model request failed; check configured endpoint and model')
    },
    steer: text => agent.steer({ role: 'user', content: text, timestamp: Date.now() }),
    abort: () => { agent.abort(); options.signal.removeEventListener('abort', abort) },
  }
}
export const executor = phoneExecutor(create)
