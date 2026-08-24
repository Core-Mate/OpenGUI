/**
 * Dedicated Android phone-control plugin: one configurable vision-capable LLM
 * route, one fixed-target subagent per selected phone, and one allowlisted ADB tool.
 * @module dsh-coremate-mobile
 */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, CallId, ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue, SessionEvent } from '@deepseek-ai/dsh-session'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import {
  actionCommand,
  assertAdbReady,
  canUseAdbInputText,
  managedAdbPath,
  normalizePhoneAction,
  parseDevices,
  parseScreenSize,
  runAdb,
  textInputCommands,
} from './adb.ts'
import type { ObservationId, PhoneCoordinateSpace } from './adb.ts'
import { encodePhoneScreenshot } from './image.ts'
import { configurePhoneModel } from './configuration.ts'
import { DeviceFleet } from './device-fleet.ts'
import type { FleetDevice } from './device-fleet.ts'
import { installMirrorHttp } from './mirror-http.ts'
import { relayNestedTaskProgress, relayPhoneTaskProgress } from './phone-progress.ts'
import { CoremateTaskCoordinator } from './phone-task.ts'
import type { CoremateTaskPresentation, CoremateTaskResult, CoremateTaskState } from './phone-task.ts'
import { resolveMobileProfile, type MobileApi } from './provider.ts'
import { latestPhoneScreenshotMessages, PhoneExecutionState, PhoneOperationQueue, waitForPhoneUi } from './runtime.ts'
import { PhonePreview } from './preview.ts'
import { resolveScrcpyAsset, ScrcpyInstaller, ScrcpyMirror, ScrcpyTextInput } from './scrcpy.ts'
import { ScrcpyVideoStreams } from './scrcpy-stream.ts'
import { BrowserController } from './browser-control.ts'
import type { BrowserControlInput, BrowserImage } from './browser-control.ts'
import { ManagedBrowser } from './browser.ts'
import {
  decodeInheritedModel,
  inheritedAgentOptions,
  INHERITED_PROVIDER,
  InheritedModelAdapter,
} from './inherited-model.ts'
import {
  currentModelCapability,
  decideModelRouting,
  inheritedCapabilityFailure,
  type CoremateModelStrategy,
} from './model-routing.ts'
import { COREMATE_SUGGESTION_INSTRUCTION } from './suggestions.ts'

export { actionCommand, canUseAdbInputText, managedAdbPath, normalizePhoneAction, ObservationId, parseDevices, parseScreenSize, selectAuthorizedSerial, textInputCommands } from './adb.ts'
export type { AdbDevice, PhoneAction, PhoneCoordinateSpace, ScreenSize, TargetBoundingBox } from './adb.ts'
export { encodePhoneScreenshot, PHONE_SCREENSHOT_JPEG_QUALITY } from './image.ts'
export { resolveMobileProfile } from './provider.ts'
export type { MobileApi, MobileProfileConfig } from './provider.ts'

export const name = 'coremate-mobile'
export const inject = ['llm', 'settings', 'tools', 'subagents', 'systemPrompt', 'attachments', 'commands']

const PROVIDER = 'coremate-mobile'
const NS = settingsNamespace('coremate-mobile')
const API_KEY_ENV = 'COREMATE_MOBILE_API_KEY'

/** Pi-ai route that keeps durable phone history intact while bounding model-facing image history. */
class PhonePiAiAdapter extends PiAiAdapter {
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return super.stream({ ...options, messages: latestPhoneScreenshotMessages(options.messages) })
  }
}

/** User-owned phone model settings and local execution bounds. */
export interface Config {
  /** OpenAI-compatible phone-model endpoint. */
  baseURL?: string
  /** OpenAI wire protocol implemented by the endpoint. */
  api?: MobileApi
  /** Image- and tool-capable model identifier. */
  model?: string
  /** Credential reference used to resolve the API key. */
  apiKeyEnv?: string
  /** Prefer the receiving DSH model, or always use the dedicated fallback. */
  modelStrategy?: CoremateModelStrategy
  /** Reuse models whose image capability metadata is absent without asking again. */
  trustUnknownCurrentModels?: boolean
  /** Maximum duration of each local ADB process. */
  commandTimeoutMs?: number
  /** Maximum phone-control operations in one child task. */
  maxOperations?: number
  /** Declared model context capacity. */
  contextWindow?: number
  /** Declared maximum model output. */
  maxTokens?: number
  /** Maximum time without a provider stream event. */
  streamIdleTimeoutMs?: number
  /** Development/test override. Production bundles use the managed runtime. */
  adbPath?: string
}

const DEFAULT_CONFIG = {
  api: 'openai-responses',
  apiKeyEnv: API_KEY_ENV,
  modelStrategy: 'current-first',
  trustUnknownCurrentModels: false,
  commandTimeoutMs: 15_000,
  maxOperations: 100,
  contextWindow: 262_144,
  maxTokens: 32_768,
  streamIdleTimeoutMs: 300_000,
} as const satisfies Required<Pick<Config,
  'api' | 'apiKeyEnv' | 'modelStrategy' | 'trustUnknownCurrentModels' | 'commandTimeoutMs' | 'maxOperations' | 'contextWindow' | 'maxTokens' | 'streamIdleTimeoutMs'>>

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  api: z.union(['openai-responses', 'openai-completions'] as const).default(DEFAULT_CONFIG.api),
  model: z.string(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_CONFIG.apiKeyEnv),
  modelStrategy: z.union(['current-first', 'dedicated'] as const).default(DEFAULT_CONFIG.modelStrategy),
  trustUnknownCurrentModels: z.boolean().default(DEFAULT_CONFIG.trustUnknownCurrentModels),
  commandTimeoutMs: z.number().step(1).min(1_000).max(120_000).default(DEFAULT_CONFIG.commandTimeoutMs),
  maxOperations: z.number().step(1).min(1).max(10_000).default(DEFAULT_CONFIG.maxOperations),
  contextWindow: z.number().step(1).min(1).default(DEFAULT_CONFIG.contextWindow),
  maxTokens: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxTokens),
  streamIdleTimeoutMs: z.number().step(1).min(1_000).max(2_147_483_647).default(DEFAULT_CONFIG.streamIdleTimeoutMs),
  adbPath: z.string(),
})

type ResolvedConfig = Config & {
  api: NonNullable<Config['api']>
  apiKeyEnv: string
  modelStrategy: CoremateModelStrategy
  trustUnknownCurrentModels: boolean
  commandTimeoutMs: number
  maxOperations: number
  contextWindow: number
  maxTokens: number
  streamIdleTimeoutMs: number
}

function resolvedConfig(config: Config): ResolvedConfig {
  const resolved: ResolvedConfig = {
    api: config.api ?? DEFAULT_CONFIG.api,
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_CONFIG.apiKeyEnv,
    modelStrategy: config.modelStrategy ?? DEFAULT_CONFIG.modelStrategy,
    trustUnknownCurrentModels: config.trustUnknownCurrentModels ?? DEFAULT_CONFIG.trustUnknownCurrentModels,
    commandTimeoutMs: config.commandTimeoutMs ?? DEFAULT_CONFIG.commandTimeoutMs,
    maxOperations: config.maxOperations ?? DEFAULT_CONFIG.maxOperations,
    contextWindow: config.contextWindow ?? DEFAULT_CONFIG.contextWindow,
    maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs ?? DEFAULT_CONFIG.streamIdleTimeoutMs,
  }
  if (config.baseURL !== undefined) resolved.baseURL = config.baseURL
  if (config.model !== undefined) resolved.model = config.model
  if (config.adbPath !== undefined) resolved.adbPath = config.adbPath
  return resolved
}

function configuredProfile(config: Config): ResolvedPiAiProviderProfile | undefined {
  const value = resolvedConfig(config)
  const baseURL = value.baseURL?.trim()
  const model = value.model?.trim()
  if (!baseURL || !model) return undefined
  const url = new URL(baseURL)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('coremate-mobile: the phone model endpoint must use HTTP or HTTPS')
  }
  return resolveMobileProfile({
    provider: PROVIDER,
    displayName: 'OpenGUI model',
    baseURL,
    api: value.api,
    model,
    apiKeyEnv: value.apiKeyEnv,
    contextWindow: value.contextWindow,
    maxTokens: value.maxTokens,
    streamIdleTimeoutMs: value.streamIdleTimeoutMs,
  })
}

function textFrom(result: SubagentResult): string {
  return result.output.filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text).join('')
}

interface ForegroundProgress {
  readonly parent: CommandInvocation['agent']
  readonly nestedUnderCallId?: CallId
}

function progressFor(
  parent: CommandInvocation['agent'],
  presentation: CoremateTaskPresentation,
): ForegroundProgress | undefined {
  if (presentation === 'result-only') return undefined
  if (presentation === 'parent-chat') return { parent }
  return { parent, nestedUnderCallId: presentation.nestedUnderCallId }
}

async function settleForeground(run: SubagentRun, progress?: ForegroundProgress): Promise<CoremateTaskResult> {
  let failure: unknown
  let stopProgress: (() => void) | undefined
  try {
    if (progress !== undefined) {
      const child = run.localAgent
      if (child === undefined) {
        throw new Error('coremate-mobile: direct commands require a local OpenGUI agent for live chat progress')
      }
      const source = {
        initialEvents: child.session.events,
        subscribe: (listener: (event: SessionEvent) => void) => child.ctx.on('session/event', (session, event) => {
          if (session === child.session) listener(event)
        }),
        parent: progress.parent.session,
      }
      stopProgress = progress.nestedUnderCallId === undefined
        ? relayPhoneTaskProgress(source)
        : relayNestedTaskProgress({
          ...source,
          rootCallId: progress.nestedUnderCallId,
          sourceId: String(child.session.id),
        })
    }
    const result = await run.result
    if (result.stopReason !== 'completed') {
      const partial = textFrom(result)
      throw new Error(`coremate-mobile task ended with ${result.stopReason}${partial ? `\nPartial output:\n${partial}` : ''}`)
    }
    return { runId: run.id, output: result.output }
  } catch (error) {
    failure = error
    throw error
  } finally {
    stopProgress?.()
    try {
      await run.dispose()
    } catch (disposeError) {
      if (failure === undefined) throw disposeError
    }
  }
}

function currentPackage(output: string): string {
  return output.match(/(?:mCurrentFocus|mFocusedApp)=[^\n]*?\bu\d+\s+([A-Za-z0-9._]+)\//u)?.[1]
    ?? output.match(/(?:topResumedActivity|mResumedActivity)[^\n]*?\bu\d+\s+([A-Za-z0-9._]+)\//u)?.[1]
    ?? ''
}

function imageRef(image: PhoneObservation['image'] | BrowserImage): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(image.attachmentId),
    mediaType: 'image/jpeg',
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    name: image.name,
  }
}

function isCoremateExecutionProvider(provider: string | undefined): boolean {
  return provider === PROVIDER || provider === INHERITED_PROVIDER
}

interface PhoneObservation {
  observationId: ObservationId
  unchangedFromObservationId?: ObservationId
  serial: string
  width: number
  height: number
  foregroundPackage: string
  image: {
    attachmentId: string
    mediaType: 'image/jpeg'
    bytes: number
    width: number
    height: number
    name: string
  }
}

interface StoredObservation {
  value: PhoneObservation
  fingerprint: string
}

/**
 * Register model routing, delegation, and ADB control.
 * @param ctx Harness plugin context.
 * @param baseConfig Initial plugin configuration before settings overrides.
 */
export function apply(ctx: Context, baseConfig: Config): void {
  let current = (): Config => baseConfig
  let lastRaw: Config | undefined
  let lastProfile: ResolvedPiAiProviderProfile | undefined
  const profile = (): ResolvedPiAiProviderProfile | undefined => {
    const raw = current()
    if (raw === lastRaw) return lastProfile
    lastRaw = raw
    lastProfile = configuredProfile(raw)
    return lastProfile
  }

  const resolveApiKey = async (_provider: string, active: ResolvedPiAiProviderProfile): Promise<string> => {
    const ref = credentialRef(active.apiKeyEnv ?? API_KEY_ENV)
    const credentials = ctx.get('credentials')
    const hit = credentials === undefined ? undefined : await credentials.resolve(ref)
    if (hit !== undefined) return assertUsableApiKey(hit.value, name, ref)
    throw new LlmError(`coremate-mobile: no credential stored for ${ref}`, 'MISSING_CREDENTIAL')
  }
  const adapter = new PhonePiAiAdapter({
    profiles: () => {
      const active = profile()
      return active === undefined ? new Map() : new Map([[PROVIDER, active]])
    },
    resolveApiKey,
    resolveAttachments: () => ctx.get('attachments'),
  })
  const observations = new WeakMap<object, StoredObservation>()
  const executionState = new PhoneExecutionState()
  const operationQueue = new PhoneOperationQueue()
  const managedBrowser = new ManagedBrowser()
  const browserController = new BrowserController({
    async saveImage(data, imageName) {
      const ref = await ctx.attachments.saveImage({ data, mediaType: 'image/jpeg', name: imageName })
      return {
        attachmentId: ref.attachmentId,
        mediaType: 'image/jpeg',
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: ref.name ?? imageName,
      }
    },
  })
  const adbPath = (): string => managedAdbPath(resolvedConfig(current()).adbPath)
  const run = async (args: readonly string[], signal: AbortSignal, buffer = false): Promise<string | Buffer> => {
    const path = adbPath()
    await assertAdbReady(path)
    return runAdb(path, args, {
      signal,
      timeoutMs: resolvedConfig(current()).commandTimeoutMs,
      encoding: buffer ? 'buffer' : 'utf8',
    })
  }
  const fleet = new DeviceFleet(async (signal) => {
    const output = String(await run(['devices', '-l'], signal))
    return parseDevices(output)
  })
  const phoneTasks = new CoremateTaskCoordinator(async (task, parent, signal, presentation, requestedOptions) => {
    const foregroundProgress = progressFor(parent, presentation)
    const showMirror = presentation === 'parent-chat'
    const targets = await fleet.selectedDevices(signal)
    const route = requestedOptions ?? inheritedAgentOptions(parent.options)
    const startRun = async (executionSignal: AbortSignal): Promise<CoremateTaskResult> => {
      const batch = new AbortController()
      const childSignal = AbortSignal.any([executionSignal, batch.signal])
      const operations = targets.map(async (target): Promise<{ target: FleetDevice, result: CoremateTaskResult }> => {
        const child = await ctx.subagents.start('spawn', {
          label: `Control ${target.label}`,
          prompt: [{ type: 'text', text: `Target phone: ${target.label}\n\nTask: ${task}` }],
          parent,
          signal: childSignal,
          agentOptions: route,
          maxDepth: 2,
          toolFilter: { allow: ['phone_control'] },
          persona: `You control exactly one fixed Android phone, labeled ${target.label}. Never try to discover, switch, or act on another phone. Observe before the first change. For every mutation, echo the exact current observationId. Tap with a tight targetBBox and swipe with coordinates in current screenshot pixels. Perform exactly one action per phone_control call and inspect the returned observation. Use wait only when the UI is visibly loading; ordinary actions already auto-observe. Never reuse coordinates from an old observation. Stop and report any authorization, device, model, repeated-no-progress, operation-limit, or unsupported-action error.`,
        })
        if (child.localAgent === undefined) {
          await child.dispose()
          throw new Error('coremate-mobile: a phone task requires a local child agent')
        }
        executionState.assignTarget(child.localAgent, target.serial)
        return { target, result: await settleForeground(child, foregroundProgress) }
      })
      let results: { target: FleetDevice, result: CoremateTaskResult }[]
      try {
        results = await Promise.all(operations)
      } catch (error) {
        batch.abort(error)
        await Promise.allSettled(operations)
        throw error
      }
      if (results.length === 1) return results[0]!.result
      const output: ContentBlock[] = []
      for (const { target, result } of results) {
        output.push({ type: 'text', text: `\n\n## ${target.label}\n` }, ...result.output)
      }
      return {
        runId: results.map(({ result }) => result.runId).join(','),
        output,
      }
    }
    if (showMirror) {
      return parent.runMaintenance(maintenanceSignal => startRun(AbortSignal.any([signal, maintenanceSignal])))
    }
    return startRun(signal)
  })
  const browserTasks = new CoremateTaskCoordinator(async (task, parent, signal, presentation, requestedOptions) => {
    const foregroundProgress = progressFor(parent, presentation)
    const showProgress = presentation === 'parent-chat'
    const route = requestedOptions ?? inheritedAgentOptions(parent.options)
    const startRun = async (executionSignal: AbortSignal): Promise<CoremateTaskResult> => {
      const page = await managedBrowser.open(executionSignal)
      page.setDefaultTimeout(resolvedConfig(current()).commandTimeoutMs)
      page.setDefaultNavigationTimeout(Math.max(30_000, resolvedConfig(current()).commandTimeoutMs))
      let child: SubagentRun | undefined
      let settlementStarted = false
      try {
        child = await ctx.subagents.start('spawn', {
          label: 'Control local browser',
          prompt: [{ type: 'text', text: `Task: ${task}` }],
          parent,
          signal: executionSignal,
          agentOptions: route,
          maxDepth: 2,
          toolFilter: { allow: ['browser_control'] },
          persona: 'You control exactly one visible local browser managed by the OpenGUI plugin. Use browser_control only. Navigate only when the task requires it, observe before coordinate-based actions, and echo the exact current observationId for every later mutation. Tap with a tight targetBBox in current screenshot pixels. Perform one action per call and inspect the returned observation. Use wait only for visible loading. Never claim success without observing the result. Do not submit purchases, publish content, upload files, or delete data unless the user explicitly requested that exact side effect.',
        })
        if (child.localAgent === undefined) {
          throw new Error('coremate-mobile: a browser task requires a local child agent')
        }
        browserController.bind(child.localAgent, page)
        settlementStarted = true
        return await settleForeground(child, foregroundProgress)
      } finally {
        if (child?.localAgent !== undefined) browserController.release(child.localAgent)
        if (!settlementStarted && child !== undefined) await child.dispose().catch(() => {})
        await managedBrowser.close()
      }
    }
    if (showProgress) {
      return parent.runMaintenance(maintenanceSignal => startRun(AbortSignal.any([signal, maintenanceSignal])))
    }
    return startRun(signal)
  })

  const commandTasks = new CoremateTaskCoordinator(async (task, parent, signal, presentation, requestedOptions) => {
    const route = requestedOptions ?? inheritedAgentOptions(parent.options)
    const startRun = async (executionSignal: AbortSignal): Promise<CoremateTaskResult> => {
      const child = await ctx.subagents.start('spawn', {
        label: 'Run OpenGUI task',
        prompt: [{ type: 'text', text: `Task: ${task}` }],
        parent,
        signal: executionSignal,
        agentOptions: route,
        maxDepth: 1,
        toolFilter: { allow: ['phone_agent', 'browser_agent'] },
          persona: `Route and complete the user task with the smallest necessary delegation. Use phone_agent for Android phone work and browser_agent for website work; call both sequentially only when the task genuinely spans both. Do not pretend to operate either target yourself. Return a concise completion summary grounded in the delegated results.\n\n${COREMATE_SUGGESTION_INSTRUCTION}`,
      })
      return settleForeground(child, progressFor(parent, presentation))
    }
    if (presentation === 'parent-chat') {
      return parent.runMaintenance(maintenanceSignal => startRun(AbortSignal.any([signal, maintenanceSignal])))
    }
    return startRun(signal)
  })

  ctx.effect(function* () {
    yield async () => {
      commandTasks.cancel()
      phoneTasks.cancel()
      browserTasks.cancel()
      await Promise.allSettled([commandTasks.dispose(), phoneTasks.dispose(), browserTasks.dispose(), managedBrowser.close()])
    }
  }, 'coremate-mobile task lifecycle')
  ctx.llm.registerConfigurableProviders([{
    provider: PROVIDER,
    displayName: 'OpenGUI 模型',
    settingsNs: NS,
    settingsPath: [],
  }])
  ctx.llm.registerAdapter([INHERITED_PROVIDER], new InheritedModelAdapter(ctx.llm))
  let registration: AdapterRegistrationHandle | undefined
  let registeredModel: string | undefined
  const refreshRoute = (): void => {
    const active = profile()
    if (active === undefined) {
      registration?.()
      registration = undefined
      registeredModel = undefined
      return
    }
    const model = resolvedConfig(current()).model
    if (registration === undefined) registration = ctx.llm.registerAdapter([PROVIDER], adapter)
    else if (registeredModel !== model) registration.replace([PROVIDER])
    registeredModel = model
  }
  refreshRoute()

  installSettingsSection(ctx, NS, Config, baseConfig, {
    setSource(source) { current = source },
    onChange: refreshRoute,
  })

  const dedicatedAgentOptions = async (invocation: CommandInvocation): Promise<AgentOptions> => {
    const questions = ctx.get('userQuestions')
    const credentials = ctx.get('credentials')
    const initial = resolvedConfig(current())
    const initialProfile = profile()
    const initialKey = credentials === undefined
      ? undefined
      : await credentials.resolve(credentialRef(initial.apiKeyEnv))
    if (initialProfile !== undefined && initial.model?.trim() && initialKey !== undefined) {
      return { provider: PROVIDER, model: initial.model.trim(), maxTokens: initial.maxTokens }
    }
    if (questions === undefined || credentials === undefined) {
      throw new Error('coremate-mobile: 当前 Host 不支持对话式配置；请在 settings.yaml 和凭据存储中配置 OpenGUI 模型')
    }

    const changed = await configurePhoneModel(initial, {
      ask: request => questions.ask(request),
      resolveCredential: async ref => (await credentials.resolve(ref))?.value,
      storeCredential: (ref, secret) => credentials.set(ref, secret),
      updateSettings: patch => ctx.settings.update(NS, patch),
    }, invocation)
    if (changed) refreshRoute()
    const value = resolvedConfig(current())
    const active = profile()
    const key = await credentials.resolve(credentialRef(value.apiKeyEnv))
    const model = value.model?.trim()
    if (active === undefined || !model || key === undefined) {
      throw new Error('coremate-mobile: 专用视觉模型配置未完整保存')
    }
    return { provider: PROVIDER, model, maxTokens: value.maxTokens }
  }

  const inheritedOptions = (options: AgentOptions): AgentOptions => inheritedAgentOptions(options)

  const currentCapability = async (options: AgentOptions, signal: AbortSignal) => {
    let provider = options.provider?.trim()
    let model = options.model?.trim()
    if (provider === INHERITED_PROVIDER && model) {
      const decoded = decodeInheritedModel(model)
      provider = decoded.provider
      model = decoded.model
    }
    if (!provider || !model) return 'unknown' as const
    if (provider === PROVIDER) return 'supported' as const
    try {
      const info = await ctx.llm.resolveModelInfo(provider, model, signal)
      return currentModelCapability(info.inputModalities)
    } catch (error) {
      ctx.logger.debug(error instanceof Error ? error : new Error(String(error)))
      return 'unknown' as const
    }
  }

  const answerValue = (answer: AskUserQuestionAnswer, id: string): string => {
    const item = answer.answers.find(candidate => candidate.id === id)
    return (item?.selected[0] ?? item?.custom ?? '').trim()
  }

  const waitForSelectedPhone = async (invocation: CommandInvocation, signal: AbortSignal): Promise<void> => {
    while (true) {
      let failure: Error
      try {
        await fleet.selectedDevices(signal)
        return
      } catch (error) {
        if (signal.aborted) throw signal.reason
        failure = error instanceof Error ? error : new Error(String(error))
      }
      const questions = ctx.get('userQuestions')
      if (questions === undefined) throw failure
      const answer = await questions.ask({
        questions: [{
          id: 'deviceConnection',
          header: '连接 Android 手机',
          question: 'OpenGUI 需要先检测到一台已授权并选中的手机。',
          detail: `${failure.message}\n\n请连接 USB，开启 USB 调试并在手机上允许这台电脑。连接多台手机时，请在输入框下方选择至少一台。`,
          options: [
            { label: '重新检测', description: '保持任务暂停，重新检查手机连接与选择。' },
            { label: '取消任务', description: '结束本次 OpenGUI 任务，不调用模型。' },
          ],
        }],
        agent: invocation.agent,
        signal,
      })
      if (answerValue(answer, 'deviceConnection') !== '重新检测') {
        throw new Error('coremate-mobile: OpenGUI task cancelled while waiting for a phone')
      }
    }
  }

  let configuring = false
  const prepareDirectCommand = async (invocation: CommandInvocation): Promise<AgentOptions> => {
    if (configuring) throw new Error('coremate-mobile: OpenGUI 模型配置正在另一条命令中进行')
    configuring = true
    try {
      const value = resolvedConfig(current())
      const capability = await currentCapability(invocation.agent.options, invocation.signal)
      const decision = decideModelRouting(value, invocation.agent.options, capability)
      if (decision.kind === 'inherit') return inheritedOptions(invocation.agent.options)
      if (decision.kind === 'dedicated') return dedicatedAgentOptions(invocation)

      const questions = ctx.get('userQuestions')
      if (questions === undefined) {
        throw new Error('coremate-mobile: 当前模型未声明图片能力，并且当前 Host 不支持执行前确认')
      }
      const answer = await questions.ask({
        questions: [{
          id: 'currentModel',
          header: 'OpenGUI 模型',
          question: `当前 DSH 模型 ${decision.provider}/${decision.model} 未声明图片输入能力，是否继续使用？`,
          detail: 'OpenGUI 会把手机或浏览器截图发送给当前模型，并允许它调用受限控制工具。',
          options: [
            { label: '始终使用当前模型', description: '本次及以后切换模型时都优先复用当前 DSH 模型。' },
            { label: '配置专用视觉模型', description: '改用单独的视觉模型处理 OpenGUI 任务。' },
          ],
        }],
        agent: invocation.agent,
        signal: invocation.signal,
      })
      if (answerValue(answer, 'currentModel') === '始终使用当前模型') {
        await ctx.settings.update(NS, { trustUnknownCurrentModels: true })
        return inheritedOptions(invocation.agent.options)
      }
      await ctx.settings.update(NS, { modelStrategy: 'dedicated' })
      return dedicatedAgentOptions(invocation)
    } finally {
      configuring = false
    }
  }

  const recoverDirectCommand = async (
    error: Error,
    invocation: CommandInvocation,
    options: AgentOptions,
  ): Promise<string | undefined> => {
    if (options.provider !== INHERITED_PROVIDER || !inheritedCapabilityFailure(error)) return undefined
    const questions = ctx.get('userQuestions')
    if (questions === undefined) {
      return `当前 DSH 模型无法处理 OpenGUI 的图片或工具请求，原任务未自动重试：${error.message}`
    }
    const answer = await questions.ask({
      questions: [{
        id: 'capabilityFallback',
        header: '当前模型不兼容',
        question: '是否切换到 OpenGUI 专用视觉模型？',
        detail: '为避免重复手机操作，原任务不会自动重试；完成配置后请重新提交。',
        options: [
          { label: '配置专用视觉模型', description: '保存回退模型，之后重新提交原任务。' },
          { label: '暂不切换', description: '保留当前模型优先策略。' },
        ],
      }],
      agent: invocation.agent,
      signal: invocation.signal,
    })
    if (answerValue(answer, 'capabilityFallback') !== '配置专用视觉模型') {
      return `当前 DSH 模型无法处理 OpenGUI 的图片或工具请求，原任务未自动重试：${error.message}`
    }
    await ctx.settings.update(NS, { modelStrategy: 'dedicated' })
    await dedicatedAgentOptions(invocation)
    return '当前 DSH 模型不兼容；专用视觉模型已配置。为避免重复操作，原任务未自动重试，请重新提交。'
  }
  ctx.commands.register(commandTasks.command(waitForSelectedPhone, prepareDirectCommand, recoverDirectCommand))
  ctx.commands.register(commandTasks.command(waitForSelectedPhone, prepareDirectCommand, recoverDirectCommand, 'coremate'))

  const scrcpyInstaller = new ScrcpyInstaller()
  const scrcpyAsset = resolveScrcpyAsset()
  const textInput = new ScrcpyTextInput({
    adbPath,
    runAdb: (args, signal) => run(args, signal),
    installer: scrcpyInstaller,
    ...(scrcpyAsset === undefined ? {} : { asset: scrcpyAsset }),
  })
  const mirror = new ScrcpyMirror({
    adbPath,
    installer: scrcpyInstaller,
    ...(scrcpyAsset === undefined ? {} : { asset: scrcpyAsset }),
    onError: error => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))),
  })
  const preview = new PhonePreview(async (serial, signal) => {
    const value = await run(['-s', serial, 'exec-out', 'screencap', '-p'], signal, true)
    return Buffer.isBuffer(value) ? value : Buffer.from(value)
  })
  const streams = new ScrcpyVideoStreams({
    adbPath,
    runAdb: (args, signal) => run(args, signal),
    installer: scrcpyInstaller,
    ...(scrcpyAsset === undefined ? {} : { asset: scrcpyAsset }),
    onError: error => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))),
  })
  const taskControl = {
    isActive: (): boolean => commandTasks.isActive() || phoneTasks.isActive() || browserTasks.isActive(),
    state: (): CoremateTaskState => {
      const states = [commandTasks.state(), phoneTasks.state(), browserTasks.state()]
      return states.find(state => state.active) ?? commandTasks.state()
    },
    cancel: (): boolean => {
      const command = commandTasks.cancel()
      const phone = phoneTasks.cancel()
      const browser = browserTasks.cancel()
      return command || phone || browser
    },
  }
  installMirrorHttp(ctx, mirror, fleet, taskControl, managedBrowser, preview, streams)
  ctx.effect(function* () {
    yield async () => { await Promise.all([mirror.dispose(), textInput.dispose(), streams.dispose()]) }
  }, 'coremate-mobile native scrcpy mirror lifecycle')
  const targetFor = async (agent: object, signal: AbortSignal): Promise<string> => {
    return executionState.resolveTarget(agent, async () => {
      const selected = await fleet.selectedDevices(signal)
      if (selected.length !== 1) {
        throw new Error('coremate-mobile: this phone agent was not bound to exactly one selected device')
      }
      return selected[0]!.serial
    })
  }
  const observe = async (agent: object, serial: string, signal: AbortSignal): Promise<PhoneObservation> => {
    const [sizeRaw, focusRaw, pngRaw] = await Promise.all([
      run(['-s', serial, 'shell', 'wm', 'size'], signal),
      run(['-s', serial, 'shell', 'dumpsys', 'window', 'windows'], signal),
      run(['-s', serial, 'exec-out', 'screencap', '-p'], signal, true),
    ])
    const screen = parseScreenSize(String(sizeRaw))
    const png = Buffer.isBuffer(pngRaw) ? pngRaw : Buffer.from(pngRaw)
    const jpeg = await encodePhoneScreenshot(png)
    const fingerprint = createHash('sha256').update(jpeg).digest('hex')
    const previous = observations.get(agent)
    const unchanged = previous?.fingerprint === fingerprint ? previous : undefined
    const image: PhoneObservation['image'] = unchanged === undefined
      ? await ctx.attachments.saveImage({
        data: jpeg,
        mediaType: 'image/jpeg',
        name: `phone-${serial}-${Date.now()}.jpg`,
      }).then(ref => ({
        attachmentId: ref.attachmentId,
        mediaType: 'image/jpeg' as const,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: ref.name ?? `phone-${serial}.jpg`,
      }))
      : unchanged.value.image
    const observationId = executionState.nextObservationId(agent)
    const value: PhoneObservation = {
      observationId,
      ...(unchanged === undefined ? {} : { unchangedFromObservationId: unchanged.value.observationId }),
      serial,
      width: screen.width,
      height: screen.height,
      foregroundPackage: currentPackage(String(focusRaw)),
      image,
    }
    observations.set(agent, { value, fingerprint })
    executionState.recordObservation(agent, { observationId, screenshotFingerprint: fingerprint })
    return value
  }

  ctx.tools.register(defineTool({
    name: 'phone_control',
    description: 'Observe or perform one allowlisted action on the Android phone locked to this phone-agent task. Mutations require the current observationId; tap and swipe coordinates are pixels in that observation screenshot. Every action returns a verified observation.',
    parameters: {
      action: { type: 'string', enum: ['observe', 'tap', 'swipe', 'text', 'key', 'launch', 'wait'], required: true },
      observationId: { type: 'string', description: 'Exact observationId from the latest phone_control result; required except for observe.' },
      targetBBox: {
        type: 'object',
        description: 'Tight visible target bounds in pixels of the current screenshot; tap uses its center.',
        additionalProperties: false,
        properties: {
          left: { type: 'number', required: true }, top: { type: 'number', required: true },
          right: { type: 'number', required: true }, bottom: { type: 'number', required: true },
        },
      },
      x1: { type: 'number', description: 'Swipe start x in current screenshot pixels.' },
      y1: { type: 'number', description: 'Swipe start y in current screenshot pixels.' },
      x2: { type: 'number', description: 'Swipe end x in current screenshot pixels.' },
      y2: { type: 'number', description: 'Swipe end y in current screenshot pixels.' },
      durationMs: { type: 'integer' }, text: { type: 'string' },
      key: { type: 'string', enum: ['Back', 'Home', 'Enter', 'AppSwitch'] },
      packageName: { type: 'string' },
      waitMs: { type: 'integer', description: 'Explicit UI settle wait from 100 through 10000 ms.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          observationId: { type: 'string', required: true },
          unchangedFromObservationId: { type: 'string' },
          serial: { type: 'string', required: true }, width: { type: 'integer', required: true },
          height: { type: 'integer', required: true }, foregroundPackage: { type: 'string', required: true },
          image: {
            type: 'object', required: true, additionalProperties: false,
            properties: {
              attachmentId: { type: 'string', required: true }, mediaType: { type: 'string', const: 'image/jpeg', required: true },
              bytes: { type: 'integer', required: true }, width: { type: 'integer', required: true }, height: { type: 'integer', required: true },
              name: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args, value) => {
        const metadata = {
          observationId: value.observationId,
          ...(value.unchangedFromObservationId === undefined ? {} : { unchangedFromObservationId: value.unchangedFromObservationId }),
          serial: value.serial,
          width: value.width,
          height: value.height,
          screenshotPixelSpace: { width: value.image.width, height: value.image.height },
          foregroundPackage: value.foregroundPackage,
        }
        const text = { type: 'text' as const, text: JSON.stringify(metadata) }
        return value.unchangedFromObservationId === undefined
          ? [text, { type: 'image' as const, attachment: imageRef(value.image) }]
          : [text]
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      const header = agent?.session.header
      const route = agent?.session.requestHeader()?.config ?? agent?.options
      if (agent === undefined || header?.origin !== 'subagent' || header.parentSession === undefined || !isCoremateExecutionProvider(route?.provider)) {
        throw new Error('coremate-mobile: phone_control is restricted to a coremate-mobile child subagent')
      }
      return operationQueue.run(agent, async () => {
        executionState.beginOperation(agent, resolvedConfig(current()).maxOperations)
        const action = normalizePhoneAction(args)
        const before = action.action === 'observe' ? undefined : executionState.current(agent, action.observationId)
        if (action.action === 'observe') {
          const serial = await targetFor(agent, exec.signal)
          return observe(agent, serial, exec.signal)
        }
        const stored = observations.get(agent)
        if (stored === undefined || stored.value.observationId !== action.observationId || before === undefined) {
          throw new Error('coremate-mobile: current phone observation is unavailable')
        }
        const screen: PhoneCoordinateSpace = {
          width: stored.value.width,
          height: stored.value.height,
          screenshotWidth: stored.value.image.width,
          screenshotHeight: stored.value.image.height,
        }
        const command = action.action === 'text' ? undefined : actionCommand(action, screen)
        if (action.action === 'wait') {
          await waitForPhoneUi(action.waitMs, exec.signal)
          const serial = await targetFor(agent, exec.signal)
          return observe(agent, serial, exec.signal)
        }
        const scrcpyText = action.action === 'text' && !canUseAdbInputText(action.text)
        const commands = action.action === 'text'
          ? scrcpyText ? [] : textInputCommands(action.text)
          : command === undefined ? [] : [command]
        if (commands.length === 0 && !scrcpyText) throw new Error('coremate-mobile: action did not resolve to a device command')
        const signature = JSON.stringify(scrcpyText ? ['scrcpy-text', action.text] : commands)
        executionState.assertActionAllowed(agent, signature)
        const serial = await targetFor(agent, exec.signal)
        if (scrcpyText) await textInput.paste(serial, action.text, exec.signal)
        else for (const candidate of commands) await run(['-s', serial, ...candidate], exec.signal)
        const after = await observe(agent, serial, exec.signal)
        const afterState = executionState.current(agent, after.observationId)
        executionState.recordActionResult(agent, signature, before.screenshotFingerprint, afterState.screenshotFingerprint)
        return after
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_control',
    description: 'Observe or perform one allowlisted action in the visible local browser bound to this browser-agent task. Coordinate actions use the current screenshot and require its exact observationId. Every action returns a verified observation.',
    parameters: {
      action: { type: 'string', enum: ['observe', 'navigate', 'tap', 'text', 'key', 'scroll', 'back', 'reload', 'wait'], required: true },
      observationId: { type: 'string', description: 'Exact observationId from the latest browser_control result; required except for observe and navigate.' },
      url: { type: 'string', description: 'HTTP or HTTPS URL for navigate.' },
      targetBBox: {
        type: 'object',
        description: 'Tight visible target bounds in pixels of the current browser screenshot; tap uses its center.',
        additionalProperties: false,
        properties: {
          left: { type: 'number', required: true }, top: { type: 'number', required: true },
          right: { type: 'number', required: true }, bottom: { type: 'number', required: true },
        },
      },
      text: { type: 'string', description: 'Unicode text inserted into the currently focused field.' },
      key: { type: 'string', enum: ['Enter', 'Escape', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] },
      deltaX: { type: 'integer', description: 'Horizontal scroll delta from -2000 through 2000.' },
      deltaY: { type: 'integer', description: 'Vertical scroll delta from -2000 through 2000.' },
      waitMs: { type: 'integer', description: 'Explicit page settle wait from 100 through 10000 ms.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          observationId: { type: 'string', required: true },
          unchangedFromObservationId: { type: 'string' },
          url: { type: 'string', required: true }, title: { type: 'string', required: true },
          width: { type: 'integer', required: true }, height: { type: 'integer', required: true },
          image: {
            type: 'object', required: true, additionalProperties: false,
            properties: {
              attachmentId: { type: 'string', required: true }, mediaType: { type: 'string', const: 'image/jpeg', required: true },
              bytes: { type: 'integer', required: true }, width: { type: 'integer', required: true }, height: { type: 'integer', required: true },
              name: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args, value) => {
        const metadata = {
          observationId: value.observationId,
          ...(value.unchangedFromObservationId === undefined ? {} : { unchangedFromObservationId: value.unchangedFromObservationId }),
          url: value.url,
          title: value.title,
          width: value.width,
          height: value.height,
          screenshotPixelSpace: { width: value.image.width, height: value.image.height },
        }
        const rendered = { type: 'text' as const, text: JSON.stringify(metadata) }
        return value.unchangedFromObservationId === undefined
          ? [rendered, { type: 'image' as const, attachment: imageRef(value.image) }]
          : [rendered]
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const agent = exec.agent
      const header = agent?.session.header
      const route = agent?.session.requestHeader()?.config ?? agent?.options
      if (agent === undefined || header?.origin !== 'subagent' || header.parentSession === undefined || !isCoremateExecutionProvider(route?.provider)) {
        throw new Error('coremate-mobile: browser_control is restricted to a coremate-mobile child subagent')
      }
      return browserController.execute(agent, args as BrowserControlInput, resolvedConfig(current()).maxOperations, exec.signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_agent',
    description: 'Delegate one complete Android phone task to the receiving DSH model or the dedicated fallback and wait for its verified result.',
    parameters: { task: { type: 'string', required: true } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          runId: { type: 'string', required: true },
          output: { type: 'array', required: true, items: { type: 'json' } },
        },
      },
      render: (_args, value) => value.output as unknown as ContentBlock[],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('coremate-mobile: phone_agent requires a calling agent')
      const result = await phoneTasks.run(args.task, exec.agent, exec.signal, { nestedUnderCallId: exec.callId })
      return { runId: result.runId, output: result.output as unknown as JsonValue[] }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_agent',
    description: 'Delegate one complete website task to a visible local browser managed entirely by this plugin. On first use, waits for the user to approve the pinned Chromium installation.',
    parameters: { task: { type: 'string', required: true } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          runId: { type: 'string', required: true },
          output: { type: 'array', required: true, items: { type: 'json' } },
        },
      },
      render: (_args, value) => value.output as unknown as ContentBlock[],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('coremate-mobile: browser_agent requires a calling agent')
      const result = await browserTasks.run(args.task, exec.agent, exec.signal, { nestedUnderCallId: exec.callId })
      return { runId: result.runId, output: result.output as unknown as JsonValue[] }
    },
  }))
}
