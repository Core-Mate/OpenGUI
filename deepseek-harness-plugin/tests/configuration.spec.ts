import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { describe, expect, it, vi } from 'vitest'
import {
  configurePhoneModel,
  type PhoneConfigurationServices,
  type PhoneModelConfiguration,
} from '../src/configuration.ts'

const invocation = (): CommandInvocation => ({
  commandId: 'configuration-test' as CommandInvocation['commandId'],
  agent: {} as CommandInvocation['agent'],
  rawInput: '',
  signal: new AbortController().signal,
})
const answer = (id: string, value: string, selected = false): AskUserQuestionAnswer => ({
  answers: [{ id, selected: selected ? [value] : [], ...selected ? {} : { custom: value } }],
})

const emptyConfig = (): PhoneModelConfiguration => ({
  api: 'openai-responses',
  apiKeyEnv: 'COREMATE_MOBILE_API_KEY',
})

function services(
  replies: Record<string, string>,
  events: string[] = [],
  stored?: string,
): PhoneConfigurationServices & { ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn(async (request: AskUserQuestionRequest) => {
    const question = request.questions[0]
    if (question === undefined) throw new Error('missing question')
    const value = replies[question.id]
    if (value === undefined) throw new Error(`missing reply for ${question.id}`)
    return answer(question.id, value, question.options !== undefined)
  })
  return {
    ask,
    resolveCredential: vi.fn(async () => stored),
    storeCredential: vi.fn(async (_ref, value) => { events.push(`credential:${value}`) }),
    updateSettings: vi.fn(async (patch) => { events.push(`settings:${JSON.stringify(patch)}`) }),
  }
}

describe('OpenGUI interactive model configuration', () => {
  it('asks for a new route one item at a time and persists the credential before activating settings', async () => {
    const events: string[] = []
    const io = services({
      introduction: '开始配置',
      baseURL: 'https://gateway.example/v1',
      api: 'Responses API（推荐）',
      model: 'vision-model',
      apiKey: 'sk-phone',
    }, events)

    await expect(configurePhoneModel(emptyConfig(), io, invocation())).resolves.toBe(true)
    expect(io.ask.mock.calls.map(call => (call[0] as AskUserQuestionRequest).questions[0]?.id))
      .toEqual(['introduction', 'baseURL', 'api', 'model', 'apiKey'])
    expect((io.ask.mock.calls[0]?.[0] as AskUserQuestionRequest).questions[0]).toMatchObject({
      id: 'introduction',
      header: 'OpenGUI 专用模型',
      question: '当前 DSH 模型不适合这项任务，请配置一个支持图片输入和工具调用的视觉模型。',
      detail: expect.stringContaining('https://discord.gg/pqHHw7XgJ3'),
      options: [{ label: '开始配置', description: '配置专用视觉模型。' }],
    })
    expect((io.ask.mock.calls[0]?.[0] as AskUserQuestionRequest).questions[0]?.detail)
      .toContain('微信群：二维码暂未开放，这是占位入口')
    expect((io.ask.mock.calls[1]?.[0] as AskUserQuestionRequest).questions[0]).toMatchObject({
      id: 'baseURL',
      header: 'OpenGUI 端点',
      question: '请输入兼容 OpenAI 协议的 Base URL，例如 https://gateway.example/v1。',
    })
    expect((io.ask.mock.calls[1]?.[0] as AskUserQuestionRequest).questions[0]?.detail).toBeUndefined()
    expect(events).toEqual([
      'credential:sk-phone',
      'settings:{"baseURL":"https://gateway.example/v1","api":"openai-responses","model":"vision-model"}',
    ])
  })

  it('does nothing when endpoint, model, and credential are already usable', async () => {
    const io = services({}, [], 'sk-existing')
    const config = { ...emptyConfig(), baseURL: 'https://gateway.example/v1', model: 'vision-model' }

    await expect(configurePhoneModel(config, io, invocation())).resolves.toBe(false)
    expect(io.ask).not.toHaveBeenCalled()
    expect(io.storeCredential).not.toHaveBeenCalled()
    expect(io.updateSettings).not.toHaveBeenCalled()
  })

  it('preserves an existing endpoint and protocol while asking only for missing model and key', async () => {
    const io = services({ introduction: '开始配置', model: 'vision-model', apiKey: 'sk-phone' })
    const config = { ...emptyConfig(), baseURL: 'https://gateway.example/v1', api: 'openai-completions' as const }

    await expect(configurePhoneModel(config, io, invocation())).resolves.toBe(true)
    expect(io.ask.mock.calls.map(call => (call[0] as AskUserQuestionRequest).questions[0]?.id))
      .toEqual(['introduction', 'model', 'apiKey'])
    expect(io.updateSettings).toHaveBeenCalledWith({ model: 'vision-model' })
  })

  it('re-asks an invalid endpoint before continuing', async () => {
    const endpointReplies = ['not-a-url', 'https://gateway.example/v1']
    const io = services({
      introduction: '开始配置',
      baseURL: 'unused',
      api: 'Responses API（推荐）',
      model: 'vision-model',
      apiKey: 'sk-phone',
    })
    io.ask.mockImplementation(async (request: AskUserQuestionRequest) => {
      const question = request.questions[0]
      if (question === undefined) throw new Error('missing question')
      const value = question.id === 'baseURL' ? endpointReplies.shift() : {
        introduction: '开始配置', api: 'Responses API（推荐）', model: 'vision-model', apiKey: 'sk-phone',
      }[question.id]
      if (value === undefined) throw new Error(`missing reply for ${question.id}`)
      return answer(question.id, value, question.options !== undefined)
    })

    await expect(configurePhoneModel(emptyConfig(), io, invocation())).resolves.toBe(true)
    expect(io.ask.mock.calls.map(call => (call[0] as AskUserQuestionRequest).questions[0]?.id))
      .toEqual(['introduction', 'baseURL', 'baseURL', 'api', 'model', 'apiKey'])
    expect((io.ask.mock.calls[2]?.[0] as AskUserQuestionRequest).questions[0]).toMatchObject({
      question: 'Base URL 无效：Invalid URL。请重新输入 HTTP/HTTPS 地址。',
    })
    expect((io.ask.mock.calls[2]?.[0] as AskUserQuestionRequest).questions[0]?.detail).toBeUndefined()
  })
})
