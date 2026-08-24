/** Interactive, conversation-local setup for the OpenGUI control model. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import type { MobileApi } from './provider.ts'

const PACKAGE_NAME = 'coremate-mobile'
const RESPONSES_LABEL = 'Responses API（推荐）'
const COMPLETIONS_LABEL = 'Chat Completions API'
const START_LABEL = '开始配置'
const DISCORD_URL = 'https://discord.gg/pqHHw7XgJ3'

/** Configuration facts needed to decide which setup questions remain. */
export interface PhoneModelConfiguration {
  readonly baseURL?: string
  readonly api: MobileApi
  readonly model?: string
  readonly apiKeyEnv: string
}

/** Mutable subset committed to the ordinary settings document. */
export interface PhoneModelConfigurationPatch {
  baseURL?: string
  api?: MobileApi
  model?: string
}

/** Narrow capability surface used by the setup flow and its unit tests. */
export interface PhoneConfigurationServices {
  readonly ask: (request: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer>
  readonly resolveCredential: (ref: ReturnType<typeof credentialRef>) => Promise<string | undefined>
  readonly storeCredential: (ref: ReturnType<typeof credentialRef>, value: string) => Promise<void>
  readonly updateSettings: (patch: PhoneModelConfigurationPatch) => Promise<void>
}

export interface PhoneConfigurationInteraction {
  readonly agent: Agent
  readonly signal: AbortSignal
}

function answerText(answer: AskUserQuestionAnswer, id: string): string {
  const item = answer.answers.find(candidate => candidate.id === id)
  return (item?.custom ?? item?.selected[0] ?? '').trim()
}

async function askOne(
  services: PhoneConfigurationServices,
  invocation: PhoneConfigurationInteraction,
  question: AskUserQuestionItem,
): Promise<string> {
  const answer = await services.ask({
    questions: [question],
    agent: invocation.agent,
    signal: invocation.signal,
  })
  const value = answerText(answer, question.id)
  if (value.length === 0) {
    throw new Error(`coremate-mobile: OpenGUI 模型配置已取消（未填写${question.header ?? question.id}）`)
  }
  return value
}

async function askBaseURL(
  services: PhoneConfigurationServices,
  invocation: PhoneConfigurationInteraction,
): Promise<string> {
  let question = '请输入兼容 OpenAI 协议的 Base URL，例如 https://gateway.example/v1。'
  while (true) {
    const value = await askOne(services, invocation, {
      id: 'baseURL',
      header: 'OpenGUI 端点',
      question,
    })
    try {
      const parsed = new URL(value)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('只支持 HTTP 或 HTTPS')
      return value
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      question = `Base URL 无效：${reason}。请重新输入 HTTP/HTTPS 地址。`
    }
  }
}

async function askIntroduction(
  services: PhoneConfigurationServices,
  invocation: PhoneConfigurationInteraction,
): Promise<void> {
  while (true) {
    const value = await askOne(services, invocation, {
      id: 'introduction',
      header: 'OpenGUI 专用模型',
      question: '当前 DSH 模型不适合这项任务，请配置一个支持图片输入和工具调用的视觉模型。',
      detail: [
        'Base URL 是模型服务地址；协议决定调用 Responses 或 Chat Completions；模型 ID 指定视觉模型；API Key 用于鉴权。',
        `需要帮助：加入 Discord ${DISCORD_URL}。`,
        '微信群：二维码暂未开放，这是占位入口；请先加入 Discord。',
      ].join('\n\n'),
      options: [{ label: START_LABEL, description: '配置专用视觉模型。' }],
    })
    if (value === START_LABEL || value === 'start') return
  }
}

async function askApi(
  services: PhoneConfigurationServices,
  invocation: PhoneConfigurationInteraction,
): Promise<MobileApi> {
  while (true) {
    const value = await askOne(services, invocation, {
      id: 'api',
      header: '接口协议',
      question: '服务端使用哪一种 OpenAI 兼容协议？',
      detail: '不确定时请选择 Responses API；只有服务商明确要求 Chat Completions 时才选另一项。',
      options: [
        { label: RESPONSES_LABEL, description: '使用 /responses 接口。' },
        { label: COMPLETIONS_LABEL, description: '使用 /chat/completions 接口。' },
      ],
    })
    if (value === RESPONSES_LABEL || value === 'openai-responses') return 'openai-responses'
    if (value === COMPLETIONS_LABEL || value === 'openai-completions') return 'openai-completions'
  }
}

async function askModel(
  services: PhoneConfigurationServices,
  invocation: PhoneConfigurationInteraction,
): Promise<string> {
  return askOne(services, invocation, {
    id: 'model',
    header: '模型 ID',
    question: '用于控制手机和浏览器的视觉模型 ID 是什么？',
    detail: '该模型必须同时支持图片输入和工具调用。',
  })
}

async function askApiKey(
  services: PhoneConfigurationServices,
  invocation: PhoneConfigurationInteraction,
  ref: ReturnType<typeof credentialRef>,
): Promise<string> {
  let detail = `请输入 ${ref}。答案不会写入聊天记录或模型上下文；提交后会保存到 Harness 凭据存储。输入时文字仍可见。`
  while (true) {
    const value = await askOne(services, invocation, {
      id: 'apiKey',
      header: 'API Key',
      question: 'OpenGUI 模型服务的 API Key 是什么？',
      detail,
    })
    try {
      return assertUsableApiKey(value, PACKAGE_NAME, ref)
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Ask only for missing phone-model facts, persist them, and report whether the
 * command changed configuration. A completely new route also asks for its
 * protocol; a partially configured route preserves the existing protocol.
 */
export async function configurePhoneModel(
  config: PhoneModelConfiguration,
  services: PhoneConfigurationServices,
  invocation: PhoneConfigurationInteraction,
): Promise<boolean> {
  const baseURL = config.baseURL?.trim()
  const model = config.model?.trim()
  const ref = credentialRef(config.apiKeyEnv)
  const storedKey = await services.resolveCredential(ref)
  if (baseURL && model && storedKey !== undefined) return false

  await askIntroduction(services, invocation)

  const fromScratch = !baseURL && !model
  const patch: PhoneModelConfigurationPatch = {}
  let apiKey: string | undefined

  if (!baseURL) patch.baseURL = await askBaseURL(services, invocation)
  if (fromScratch) patch.api = await askApi(services, invocation)
  if (!model) patch.model = await askModel(services, invocation)
  if (storedKey === undefined) apiKey = await askApiKey(services, invocation, ref)

  // Collect and validate the complete draft before either durable write. The
  // two provider-owned stores cannot commit atomically, so put the credential
  // first: a settings route never becomes active before its key is available.
  if (apiKey !== undefined) await services.storeCredential(ref, apiKey)
  if (Object.keys(patch).length > 0) await services.updateSettings(patch)
  return true
}
