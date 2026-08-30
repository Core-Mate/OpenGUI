/**
 * Dedicated Android phone-control plugin: one configurable vision-capable LLM
 * route, one fixed-target subagent per selected phone, and one allowlisted ADB tool.
 * @module dsh-coremate-mobile
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
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
  assertAdbReady,
  managedAdbPath,
  parseDevices,
  runAdb,
} from './adb.ts'
import type { ObservationId } from './adb.ts'
import { encodePhoneScreenshotFrame } from './image.ts'
import { configurePhoneModel } from './configuration.ts'
import { DeviceFleet } from './device-fleet.ts'
import type { FleetDevice } from './device-fleet.ts'
import { OwnedForwardRegistry } from './forward-registry.ts'
import { installMirrorHttp } from './mirror-http.ts'
import { relayNestedTaskProgress, relayPhoneTaskProgress } from './phone-progress.ts'
import { OpenGuiTaskManager, OPENGUI_USAGE } from './phone-task.ts'
import type { CoremateTaskPresentation, CoremateTaskResult, OpenGuiTaskLease } from './phone-task.ts'
import { resolveMobileProfile, type MobileApi } from './provider.ts'
import { latestPhoneScreenshotMessages } from './runtime.ts'
import { PhonePreview } from './preview.ts'
import { PhoneController } from './phone-controller.ts'
import type { RawPhoneObservation } from './phone-controller.ts'
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
  decideModelRouting,
  inheritedCapabilityFailure,
  migratedLegacyTrust,
  type CoremateModelStrategy,
} from './model-routing.ts'
import {
  classifyModelCapability,
  declareCurrentModelVision,
  modelRouteKey,
  withdrawVisionDeclaration,
  type ModelCapability,
  type ModelRoute,
  type VisionDeclaration,
} from './model-capability.ts'
import { cleanCoremateSuggestionBlocks, COREMATE_SUGGESTION_INSTRUCTION } from './suggestions.ts'
import { AsyncSemaphore } from './concurrency.ts'

export { actionCommand, canUseAdbInputText, managedAdbPath, normalizePhoneAction, ObservationId, parseDevices, parseScreenSize, selectAuthorizedSerial, textInputCommands } from './adb.ts'
export type { AdbDevice, PhoneAction, PhoneCoordinateSpace, ScreenSize, TargetBoundingBox } from './adb.ts'
export { encodePhoneScreenshot, PHONE_SCREENSHOT_JPEG_QUALITY } from './image.ts'
export { resolveMobileProfile } from './provider.ts'
export type { MobileApi, MobileProfileConfig } from './provider.ts'

export const name = 'coremate-mobile'
export const inject = ['llm', 'settings', 'tools', 'subagents', 'systemPrompt', 'attachments', 'commands']

const PROVIDER = 'coremate-mobile'
const NS = settingsNamespace('coremate-mobile')
const LLM_PI_AI_NS = settingsNamespace('llm-pi-ai')
const API_KEY_ENV = 'COREMATE_MOBILE_API_KEY'
const CANCELLED_TEXT = '本次 OpenGUI 任务未执行；当前模型尚未配置。手机画面和手动投屏不受影响，下次提交时会重新询问。'
const ROOT_ROUTING_PROMPT = `When phone_agent is available, every request to inspect, operate, test, or coordinate an Android phone, mobile app, or mobile game must use phone_agent. This routing is based on the user's intent; the user does not need to mention OpenGUI, @OpenGUI, or /opengui. Never substitute Bash, shell commands, raw adb, or another UI-control path. If phone_agent cannot start, report the OpenGUI connection or configuration problem instead of bypassing it.`

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
  /** Exact provider/model routes the user confirmed when metadata is unavailable. */
  trustedCurrentModels?: string[]
  /** Plugin-owned image declarations, retained so a capability failure can safely undo them. */
  visionDeclarations?: string[]
  /** Maximum duration of each local ADB process. */
  commandTimeoutMs?: number
  /** Maximum phone-control operations in one child task. */
  maxOperations?: number
  /** Maximum selected phones controlled concurrently by one task. */
  maxParallelDevices?: number
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
  trustedCurrentModels: [],
  visionDeclarations: [],
  commandTimeoutMs: 15_000,
  maxOperations: 100,
  maxParallelDevices: 4,
  contextWindow: 262_144,
  maxTokens: 32_768,
  streamIdleTimeoutMs: 300_000,
} as const satisfies Required<Pick<Config,
  'api' | 'apiKeyEnv' | 'modelStrategy' | 'trustUnknownCurrentModels' | 'trustedCurrentModels' | 'visionDeclarations' | 'commandTimeoutMs' | 'maxOperations' | 'maxParallelDevices' | 'contextWindow' | 'maxTokens' | 'streamIdleTimeoutMs'>>

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  api: z.union(['openai-responses', 'openai-completions'] as const).default(DEFAULT_CONFIG.api),
  model: z.string(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_CONFIG.apiKeyEnv),
  modelStrategy: z.union(['current-first', 'dedicated'] as const).default(DEFAULT_CONFIG.modelStrategy),
  trustUnknownCurrentModels: z.boolean().default(DEFAULT_CONFIG.trustUnknownCurrentModels),
  trustedCurrentModels: z.array(z.string()).default(DEFAULT_CONFIG.trustedCurrentModels),
  visionDeclarations: z.array(z.string()).default(DEFAULT_CONFIG.visionDeclarations),
  commandTimeoutMs: z.number().step(1).min(1_000).max(120_000).default(DEFAULT_CONFIG.commandTimeoutMs),
  maxOperations: z.number().step(1).min(1).max(10_000).default(DEFAULT_CONFIG.maxOperations),
  maxParallelDevices: z.number().step(1).min(1).max(16).default(DEFAULT_CONFIG.maxParallelDevices),
  contextWindow: z.number().step(1).min(1).default(DEFAULT_CONFIG.contextWindow),
  maxTokens: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxTokens),
  streamIdleTimeoutMs: z.number().step(1).min(1_000).max(2_147_483_647).default(DEFAULT_CONFIG.streamIdleTimeoutMs),
  adbPath: z.string(),
})

class OpenGuiTaskCancelled extends Error {
  constructor(message = CANCELLED_TEXT) {
    super(message)
    this.name = 'OpenGuiTaskCancelled'
  }
}

type ResolvedConfig = Config & {
  api: NonNullable<Config['api']>
  apiKeyEnv: string
  modelStrategy: CoremateModelStrategy
  trustUnknownCurrentModels: boolean
  trustedCurrentModels: string[]
  visionDeclarations: string[]
  commandTimeoutMs: number
  maxOperations: number
  maxParallelDevices: number
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
    trustedCurrentModels: [...(config.trustedCurrentModels ?? DEFAULT_CONFIG.trustedCurrentModels)],
    visionDeclarations: [...(config.visionDeclarations ?? DEFAULT_CONFIG.visionDeclarations)],
    commandTimeoutMs: config.commandTimeoutMs ?? DEFAULT_CONFIG.commandTimeoutMs,
    maxOperations: config.maxOperations ?? DEFAULT_CONFIG.maxOperations,
    maxParallelDevices: config.maxParallelDevices ?? DEFAULT_CONFIG.maxParallelDevices,
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

function textFromBlocks(output: readonly ContentBlock[]): string {
  return output.filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text).join('')
}

function textFrom(result: SubagentResult): string {
  return textFromBlocks(result.output)
}

export async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  limit: number,
  signal: AbortSignal,
  worker: (value: Input, index: number, signal: AbortSignal) => Promise<Output>,
): Promise<Output[]> {
  const output = new Array<Output>(values.length)
  const batch = new AbortController()
  const combined = AbortSignal.any([signal, batch.signal])
  let next = 0
  const runWorker = async (): Promise<void> => {
    while (true) {
      if (combined.aborted) throw combined.reason
      const index = next++
      if (index >= values.length) return
      try {
        output[index] = await worker(values[index]!, index, combined)
      } catch (error) {
        if (!batch.signal.aborted) batch.abort(error)
        throw error
      }
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: Math.min(limit, values.length) }, runWorker))
  const failure = settled.find((value): value is PromiseRejectedResult => value.status === 'rejected')
  if (failure !== undefined) throw failure.reason
  return output
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
  let sourceEventSeq: (() => number | undefined) | undefined
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
      if (progress.nestedUnderCallId === undefined) {
        const relay = relayPhoneTaskProgress(source)
        stopProgress = () => relay.dispose()
        sourceEventSeq = () => relay.latestAssistantMessageSeq()
      } else {
        stopProgress = relayNestedTaskProgress({
          ...source,
          rootCallId: progress.nestedUnderCallId,
          sourceId: String(child.session.id),
        })
      }
    }
    const result = await run.result
    if (result.stopReason !== 'completed') {
      const partial = textFrom(result)
      throw new Error(`coremate-mobile task ended with ${result.stopReason}${partial ? `\nPartial output:\n${partial}` : ''}`)
    }
    const source = sourceEventSeq?.()
    return {
      runId: run.id,
      output: result.output,
      ...(source === undefined ? {} : { sourceEventSeq: source }),
    }
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

/**
 * Register model routing, delegation, and ADB control.
 * @param ctx Harness plugin context.
 * @param baseConfig Initial plugin configuration before settings overrides.
 */
export function apply(ctx: Context, baseConfig: Config): void {
  ctx.systemPrompt.section({
    name: 'tool:opengui-root-routing',
    order: 120,
    text: ROOT_ROUTING_PROMPT,
  })
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
  const hostedObservations = new WeakMap<object, PhoneObservation>()
  let phoneController!: PhoneController
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
  interface OpenGuiExecutionContext {
    readonly targets: readonly FleetDevice[]
    readonly route: AgentOptions
  }
  const tasks = new OpenGuiTaskManager<OpenGuiExecutionContext>()

  const executePhoneTask = async (
    task: string,
    parent: CommandInvocation['agent'],
    lease: OpenGuiTaskLease<OpenGuiExecutionContext>,
    presentation: CoremateTaskPresentation,
  ): Promise<CoremateTaskResult> => {
    const foregroundProgress = progressFor(parent, presentation)
    const showMirror = presentation === 'parent-chat'
    const context = lease.context
    if (context === undefined) throw new Error('coremate-mobile: OpenGUI task context is missing')
    const targets = await fleet.resolveConnected(context.targets.map(target => target.id), lease.signal)
    if (targets.length !== context.targets.length || targets.some((target, index) => target.serial !== context.targets[index]?.serial)) {
      throw new Error('coremate-mobile: a phone locked to this task disconnected; reconnect it and submit the task again')
    }
    const startRun = async (executionSignal: AbortSignal): Promise<CoremateTaskResult> => {
      const operation = async (target: FleetDevice, _index: number, childSignal: AbortSignal): Promise<{ target: FleetDevice, result: CoremateTaskResult }> => {
        const child = await ctx.subagents.start('spawn', {
          label: `Control ${target.label}`,
          prompt: [{ type: 'text', text: `Target phone: ${target.label}\n\nTask: ${task}` }],
          parent,
          signal: childSignal,
          agentOptions: context.route,
          maxDepth: 2,
          toolFilter: { allow: ['phone_control'] },
          persona: `You control exactly one fixed Android phone, labeled ${target.label}. Never try to discover, switch, or act on another phone. Observe before the first change. For every mutation, echo the exact current observationId. Tap with a tight targetBBox and swipe with coordinates in current screenshot pixels. Perform exactly one action per phone_control call and inspect the returned observation. Use wait only when the UI is visibly loading; ordinary actions already auto-observe. Never reuse coordinates from an old observation. Stop and report any authorization, device, model, repeated-no-progress, operation-limit, or unsupported-action error.`,
        })
        if (child.localAgent === undefined) {
          await child.dispose()
          throw new Error('coremate-mobile: a phone task requires a local child agent')
        }
        phoneController.assignTarget(child.localAgent, target.serial)
        return { target, result: await settleForeground(child, foregroundProgress) }
      }
      let results: { target: FleetDevice, result: CoremateTaskResult }[]
      try {
        results = await mapWithConcurrency(
          targets,
          resolvedConfig(current()).maxParallelDevices,
          executionSignal,
          operation,
        )
      } catch (error) {
        if (error instanceof Error && context.route.provider === INHERITED_PROVIDER && inheritedCapabilityFailure(error)) {
          lease.recordCapabilityFailure(error)
        }
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
      return parent.runMaintenance(maintenanceSignal => startRun(AbortSignal.any([lease.signal, maintenanceSignal])))
    }
    return startRun(lease.signal)
  }

  const executeBrowserTask = async (
    task: string,
    parent: CommandInvocation['agent'],
    lease: OpenGuiTaskLease<OpenGuiExecutionContext>,
    presentation: CoremateTaskPresentation,
  ): Promise<CoremateTaskResult> => {
    const foregroundProgress = progressFor(parent, presentation)
    const showProgress = presentation === 'parent-chat'
    const context = lease.context
    if (context === undefined) throw new Error('coremate-mobile: OpenGUI task context is missing')
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
          agentOptions: context.route,
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
      } catch (error) {
        if (error instanceof Error && context.route.provider === INHERITED_PROVIDER && inheritedCapabilityFailure(error)) {
          lease.recordCapabilityFailure(error)
        }
        throw error
      } finally {
        if (child?.localAgent !== undefined) browserController.release(child.localAgent)
        if (!settlementStarted && child !== undefined) await child.dispose().catch(() => {})
        await managedBrowser.close()
      }
    }
    if (showProgress) {
      return parent.runMaintenance(maintenanceSignal => startRun(AbortSignal.any([lease.signal, maintenanceSignal])))
    }
    return startRun(lease.signal)
  }

  const executeRouterTask = async (
    task: string,
    parent: CommandInvocation['agent'],
    lease: OpenGuiTaskLease<OpenGuiExecutionContext>,
    presentation: CoremateTaskPresentation,
  ): Promise<CoremateTaskResult> => {
    const context = lease.context
    if (context === undefined) throw new Error('coremate-mobile: OpenGUI task context is missing')
    const startRun = async (executionSignal: AbortSignal): Promise<CoremateTaskResult> => {
      const child = await ctx.subagents.start('spawn', {
        label: 'Run OpenGUI task',
        prompt: [{ type: 'text', text: `Task: ${task}` }],
        parent,
        signal: executionSignal,
        agentOptions: context.route,
        maxDepth: 1,
        toolFilter: { allow: ['phone_agent', 'browser_agent'] },
          persona: `Route and complete the user task with the smallest necessary delegation. Treat APP, app, application, Android, phone, mobile game, daily reward, 手机, 应用, 游戏, 福利 and similar device work as phone_agent tasks. Use browser_agent only when the user explicitly names a website, webpage, URL, web app, or browser target. Never infer the DSH page itself as the task target. Call both sequentially only when the task genuinely spans both. Do not pretend to operate either target yourself. Return a concise completion summary grounded in the delegated results.\n\n${COREMATE_SUGGESTION_INSTRUCTION}`,
      })
      if (child.localAgent !== undefined) lease.bindAgent(child.localAgent)
      const result = await settleForeground(child, progressFor(parent, presentation))
      const capabilityError = lease.capabilityFailure()
      if (capabilityError !== undefined) throw capabilityError
      return result
    }
    if (presentation === 'parent-chat') {
      return parent.runMaintenance(maintenanceSignal => startRun(AbortSignal.any([lease.signal, maintenanceSignal])))
    }
    return startRun(lease.signal)
  }

  ctx.effect(function* () {
    yield async () => {
      tasks.cancel()
      await Promise.allSettled([tasks.dispose(), managedBrowser.close()])
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

  type TaskInteraction = Pick<CommandInvocation, 'agent' | 'signal'>

  const dedicatedAgentOptions = async (invocation: TaskInteraction, force = false): Promise<AgentOptions> => {
    const questions = ctx.get('userQuestions')
    const credentials = ctx.get('credentials')
    const initial = resolvedConfig(current())
    const initialProfile = profile()
    const initialKey = credentials === undefined
      ? undefined
      : await credentials.resolve(credentialRef(initial.apiKeyEnv))
    if (!force && initialProfile !== undefined && initial.model?.trim() && initialKey !== undefined) {
      return { provider: PROVIDER, model: initial.model.trim(), maxTokens: initial.maxTokens }
    }
    if (questions === undefined || credentials === undefined) {
      throw new Error('coremate-mobile: 当前 Host 不支持对话式配置；请在 settings.yaml 和凭据存储中配置 OpenGUI 模型')
    }

    const configured = await configurePhoneModel(initial, {
      ask: request => questions.ask(request),
      resolveCredential: async ref => (await credentials.resolve(ref))?.value,
      storeCredential: (ref, secret) => credentials.set(ref, secret),
      updateSettings: patch => ctx.settings.update(NS, patch),
    }, invocation, force)
    if (configured.status === 'cancelled') throw new OpenGuiTaskCancelled()
    if (configured.changed) refreshRoute()
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

  const upstreamRoute = (options: AgentOptions): ModelRoute | undefined => {
    let provider = options.provider?.trim()
    let model = options.model?.trim()
    if (provider === INHERITED_PROVIDER && model) {
      const decoded = decodeInheritedModel(model)
      provider = decoded.provider
      model = decoded.model
    }
    return provider && model ? { provider, model } : undefined
  }

  const currentCapability = async (options: AgentOptions, signal: AbortSignal): Promise<ModelCapability> => {
    const route = upstreamRoute(options)
    if (route === undefined) return 'unknown-unpatchable'
    if (route.provider === PROVIDER) return 'ready'
    let modalities: readonly ('text' | 'image')[] | undefined
    try {
      const info = await ctx.llm.resolveModelInfo(route.provider, route.model, signal)
      modalities = info.inputModalities
    } catch (error) {
      ctx.logger.debug(error instanceof Error ? error : new Error(String(error)))
    }
    const piAiDescriptor = ctx.settings.describe().find(item => item.ns === LLM_PI_AI_NS)
    const piAiSettings = piAiDescriptor?.user ?? piAiDescriptor?.base
    return classifyModelCapability({
      ...route,
      ...(modalities === undefined ? {} : { resolvedModalities: modalities }),
      configurableProviders: ctx.llm.listConfigurableProviders(),
      piAiUser: piAiSettings,
    })
  }

  const parseVisionDeclaration = (value: string): VisionDeclaration | undefined => {
    try {
      const parsed = JSON.parse(value) as Partial<VisionDeclaration>
      return typeof parsed.routeKey === 'string' && typeof parsed.after === 'string'
        ? { routeKey: parsed.routeKey, after: parsed.after }
        : undefined
    } catch {
      return undefined
    }
  }

  const rememberVisionDeclaration = async (declaration: VisionDeclaration): Promise<void> => {
    const value = resolvedConfig(current())
    const retained = value.visionDeclarations
      .map(parseVisionDeclaration)
      .filter((item): item is VisionDeclaration => item !== undefined && item.routeKey !== declaration.routeKey)
    await ctx.settings.update(NS, {
      visionDeclarations: [...retained, declaration].map(item => JSON.stringify(item)),
    })
  }

  const waitForVisionDeclaration = async (route: ModelRoute, signal: AbortSignal): Promise<void> => {
    const deadline = Date.now() + 3_000
    while (true) {
      if (signal.aborted) throw signal.reason
      try {
        const info = await ctx.llm.resolveModelInfo(route.provider, route.model, signal)
        if (info.inputModalities?.includes('image')) return
      } catch (error) {
        ctx.logger.debug(error instanceof Error ? error : new Error(String(error)))
      }
      if (Date.now() >= deadline) throw new Error('coremate-mobile: DSH 模型配置已保存，但热更新未及时生效；请重新提交任务')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  const answerValue = (answer: AskUserQuestionAnswer, id: string): string => {
    const item = answer.answers.find(candidate => candidate.id === id)
    return (item?.selected[0] ?? item?.custom ?? '').trim()
  }

  const waitForSelectedPhone = async (invocation: TaskInteraction): Promise<readonly FleetDevice[]> => {
    const signal = invocation.signal
    while (true) {
      let failure: Error
      try {
        return await fleet.selectedDevices(signal)
      } catch (error) {
        if (signal.aborted) throw signal.reason
        failure = error instanceof Error ? error : new Error(String(error))
      }
      const questions = ctx.get('userQuestions')
      if (questions === undefined) {
        throw new Error(`${failure.message}; 请前往 OpenGUI Tab 连接并选择设备后重试`)
      }
      const answer = await questions.ask({
        questions: [{
          id: 'deviceConnection',
          header: '连接 Android 手机',
          question: 'OpenGUI 需要先检测到一台已授权并选中的手机。',
          detail: `${failure.message}\n\n请连接 USB，开启 USB 调试并在手机上允许这台电脑。连接多台手机时，请前往 OpenGUI Tab 选择至少一台。`,
          options: [
            { label: '重新检测', description: '保持任务暂停，重新检查手机连接与选择。' },
            { label: '取消任务', description: '结束本次 OpenGUI 任务，不调用模型。' },
          ],
        }],
        agent: invocation.agent,
        signal,
      })
      if (answerValue(answer, 'deviceConnection') !== '重新检测') {
        throw new OpenGuiTaskCancelled('本次 OpenGUI 任务已取消；未调用模型，也未操作设备。')
      }
    }
  }

  let configuring = false
  const prepareTask = async (invocation: TaskInteraction): Promise<AgentOptions> => {
    if (configuring) throw new Error('coremate-mobile: OpenGUI 模型配置正在另一条命令中进行')
    configuring = true
    try {
      let value = resolvedConfig(current())
      const capability = await currentCapability(invocation.agent.options, invocation.signal)
      const route = upstreamRoute(invocation.agent.options)
      const migrated = migratedLegacyTrust(value, route, capability)
      if (migrated !== undefined) {
        const trustedCurrentModels = [...migrated]
        await ctx.settings.update(NS, { trustUnknownCurrentModels: false, trustedCurrentModels })
        value = { ...value, trustUnknownCurrentModels: false, trustedCurrentModels }
      }
      const decision = decideModelRouting(value, invocation.agent.options, capability)
      if (decision.kind === 'inherit') return inheritedOptions(invocation.agent.options)

      const questions = ctx.get('userQuestions')
      if (decision.kind === 'dedicated') {
        if (decision.reason !== 'unsupported') return dedicatedAgentOptions(invocation)
        if (questions === undefined) {
          throw new Error('coremate-mobile: 当前模型只能处理文字，请配置 OpenGUI 视觉模型')
        }
        const answer = await questions.ask({
          questions: [{
            id: 'textOnlyModel',
            header: '需要视觉模型',
            question: '当前模型只能处理文字，无法查看手机或网页画面。',
            options: [
              { label: '配置视觉模型', description: '为 OpenGUI 单独配置支持图片和工具调用的模型。' },
              { label: '取消本次任务', description: '不调用模型，也不操作设备。' },
            ],
          }],
          agent: invocation.agent,
          signal: invocation.signal,
        })
        if (answerValue(answer, 'textOnlyModel') !== '配置视觉模型') throw new OpenGuiTaskCancelled()
        const dedicated = await dedicatedAgentOptions(invocation)
        await ctx.settings.update(NS, { modelStrategy: 'dedicated' })
        return dedicated
      }
      if (questions === undefined) {
        throw new Error('coremate-mobile: 当前模型未声明图片和工具能力，并且当前 Host 不支持执行前确认')
      }
      const answer = await questions.ask({
        questions: [{
          id: 'currentModel',
          header: '确认当前模型',
          question: '当前模型没有注明是否支持图片输入和工具调用。它是否具备这些能力？',
          detail: `当前模型：${decision.provider}/${decision.model}。这里只记住这一个模型，切换模型后会重新判断。`,
          options: [
            { label: '支持，自动补全并继续', description: '仅补全当前模型的能力声明，然后继续原任务。' },
            { label: '配置专用视觉模型', description: '改用单独的视觉模型处理 OpenGUI 任务。' },
          ],
        }],
        agent: invocation.agent,
        signal: invocation.signal,
      })
      const selection = answerValue(answer, 'currentModel')
      if (selection === '支持，自动补全并继续') {
        const confirmedRoute = { provider: decision.provider, model: decision.model }
        if (capability === 'unknown-patchable') {
          const services = {
            describe: () => ctx.settings.describe(),
            mutate: (ns: typeof LLM_PI_AI_NS, ops: Parameters<typeof ctx.settings.mutate>[1], revision?: number) => ctx.settings.mutate(ns, ops, revision),
            currentRoute: () => upstreamRoute(invocation.agent.options),
          }
          const declaration = await declareCurrentModelVision(services, confirmedRoute)
          if (declaration !== undefined) {
            try {
              await rememberVisionDeclaration(declaration)
            } catch (error) {
              await withdrawVisionDeclaration(services, confirmedRoute, declaration).catch(rollbackError => {
                ctx.logger.warn(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)))
              })
              throw error
            }
          }
          await waitForVisionDeclaration(confirmedRoute, invocation.signal)
        } else {
          const trustedCurrentModels = [...new Set([...value.trustedCurrentModels, modelRouteKey(confirmedRoute)])]
          await ctx.settings.update(NS, { trustedCurrentModels, trustUnknownCurrentModels: false })
        }
        return inheritedOptions(invocation.agent.options)
      }
      if (selection !== '配置专用视觉模型') throw new OpenGuiTaskCancelled()
      const dedicated = await dedicatedAgentOptions(invocation)
      await ctx.settings.update(NS, { modelStrategy: 'dedicated' })
      return dedicated
    } finally {
      configuring = false
    }
  }

  const recoverTask = async (
    error: Error,
    invocation: TaskInteraction,
    options: AgentOptions,
  ): Promise<string | undefined> => {
    if (!inheritedCapabilityFailure(error)) return undefined
    const failedRoute = upstreamRoute(options)
    if (failedRoute !== undefined) {
      const value = resolvedConfig(current())
      const routeKey = modelRouteKey(failedRoute)
      const declaration = value.visionDeclarations
        .map(parseVisionDeclaration)
        .find(item => item?.routeKey === routeKey)
      if (declaration !== undefined) {
        await withdrawVisionDeclaration({
          describe: () => ctx.settings.describe(),
          mutate: (ns, ops, revision) => ctx.settings.mutate(ns, ops, revision),
          currentRoute: () => failedRoute,
        }, failedRoute, declaration).catch(withdrawalError => {
          ctx.logger.warn(withdrawalError instanceof Error ? withdrawalError : new Error(String(withdrawalError)))
        })
      }
      await ctx.settings.update(NS, {
        trustUnknownCurrentModels: false,
        trustedCurrentModels: value.trustedCurrentModels.filter(item => item !== routeKey),
        visionDeclarations: value.visionDeclarations.filter(item => parseVisionDeclaration(item)?.routeKey !== routeKey),
      })
    }
    const questions = ctx.get('userQuestions')
    if (questions === undefined) {
      return `当前模型无法处理 OpenGUI 的图片或工具请求。为避免重复操作，原任务未自动重试；它可能已产生部分操作。`
    }
    const answer = await questions.ask({
      questions: [{
        id: 'capabilityFallback',
        header: '当前模型不兼容',
        question: options.provider === PROVIDER ? '是否重新配置 OpenGUI 视觉模型？' : '是否切换到 OpenGUI 专用视觉模型？',
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
      return '当前模型无法处理 OpenGUI 的图片或工具请求。为避免重复操作，原任务未自动重试；它可能已产生部分操作。'
    }
    await dedicatedAgentOptions(invocation, options.provider === PROVIDER)
    await ctx.settings.update(NS, { modelStrategy: 'dedicated' })
    return '视觉模型已配置。为避免重复操作，原任务未自动重试，请重新提交。'
  }
  const runRootTask = async (
    interaction: TaskInteraction,
    operation: (lease: OpenGuiTaskLease<OpenGuiExecutionContext>) => Promise<CoremateTaskResult>,
  ): Promise<CoremateTaskResult> => tasks.runRoot<CoremateTaskResult>(interaction.agent, interaction.signal, 'waiting-for-device', async lease => {
    const route = await prepareTask(interaction)
    const targets = await waitForSelectedPhone(interaction)
    lease.setPhase('routing')
    lease.context = { targets, route }
    lease.setPhase('running')
    try {
      return await operation(lease)
    } catch (error) {
      if (error instanceof Error) {
        const recovered = await recoverTask(error, interaction, route)
        if (recovered !== undefined) throw new Error(recovered)
      }
      throw error
    }
  })

  const directCommand = (commandName: 'opengui' | 'coremate'): CommandDefinition => ({
    name: commandName,
    description: commandName === 'opengui'
      ? 'Run a phone or local-browser task with OpenGUI'
      : 'Legacy alias for /opengui',
    input: { hint: '<task>' },
    handler: async (invocation): Promise<CommandResult> => {
      const task = invocation.rawInput.trim()
      if (task.length === 0) return { kind: 'success', text: OPENGUI_USAGE }
      try {
        const result = await runRootTask(invocation, lease => executeRouterTask(task, invocation.agent, lease, 'parent-chat'))
        const cleaned = cleanCoremateSuggestionBlocks(result.output)
        const text = textFromBlocks(cleaned.output).trim()
        return {
          kind: 'success',
          text: text.length > 0 ? text : `OpenGUI task completed (run ${result.runId}).`,
          ...(result.sourceEventSeq === undefined ? {} : { sourceEventSeq: result.sourceEventSeq }),
        }
      } catch (error) {
        if (error instanceof OpenGuiTaskCancelled) return { kind: 'success', text: error.message }
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
  ctx.commands.register(directCommand('opengui'))
  ctx.commands.register(directCommand('coremate'))

  const scrcpyInstaller = new ScrcpyInstaller()
  const scrcpyAsset = resolveScrcpyAsset()
  const forwardRegistry = new OwnedForwardRegistry()
  const forwardRecovery = forwardRegistry.recover((args, signal) => run(args, signal)).then(result => {
    if (result.removed > 0 || result.retained > 0) {
      ctx.logger.info(`coremate-mobile: recovered ${result.removed} owned ADB forwards; ${result.retained} retained for retry`)
    }
  }).catch(error => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))))
  const textInput = new ScrcpyTextInput({
    adbPath,
    runAdb: (args, signal) => run(args, signal),
    installer: scrcpyInstaller,
    forwardRegistry,
    ...(scrcpyAsset === undefined ? {} : { asset: scrcpyAsset }),
  })
  const mirror = new ScrcpyMirror({
    adbPath,
    installer: scrcpyInstaller,
    ...(scrcpyAsset === undefined ? {} : { asset: scrcpyAsset }),
    onError: error => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))),
  })
  const cleanupForTermination = (): void => {
    mirror.stopAllSync()
    forwardRegistry.releaseAllSync(adbPath())
    process.off('SIGTERM', cleanupForTermination)
    if (process.listenerCount('SIGTERM') === 0) process.kill(process.pid, 'SIGTERM')
  }
  process.prependListener('SIGTERM', cleanupForTermination)
  const mediaPermits = new AsyncSemaphore(2)
  phoneController = new PhoneController({
    runAdb: run,
    discoverTarget: async (signal) => {
      const selected = await fleet.selectedDevices(signal)
      if (selected.length !== 1) {
        throw new Error('coremate-mobile: this phone agent was not bound to exactly one selected device')
      }
      return selected[0]!.serial
    },
    validateTarget: async (serial, signal) => {
      const devices = parseDevices(String(await run(['devices', '-l'], signal)))
      if (!devices.some(device => device.serial === serial && device.state === 'device')) {
        throw new Error('coremate-mobile: a phone locked to this task disconnected or lost USB authorization')
      }
    },
    pasteUnicode: (serial, text, signal) => textInput.paste(serial, text, signal),
    encodeScreenshot: encodePhoneScreenshotFrame,
    maxOperations: () => resolvedConfig(current()).maxOperations,
    mediaPermits,
  })
  const preview = new PhonePreview(async (serial, signal) => {
    const value = await run(['-s', serial, 'exec-out', 'screencap', '-p'], signal, true)
    return Buffer.isBuffer(value) ? value : Buffer.from(value)
  }, 2, Date.now, mediaPermits)
  const streams = new ScrcpyVideoStreams({
    adbPath,
    runAdb: (args, signal) => run(args, signal),
    installer: scrcpyInstaller,
    forwardRegistry,
    ...(scrcpyAsset === undefined ? {} : { asset: scrcpyAsset }),
    onError: error => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))),
  })
  const taskControl = {
    isActive: (): boolean => tasks.isActive(),
    state: () => tasks.state(),
    cancel: (): boolean => tasks.cancel(),
  }
  installMirrorHttp(ctx, mirror, fleet, taskControl, managedBrowser, preview, streams)
  ctx.effect(function* () {
    yield async () => {
      process.off('SIGTERM', cleanupForTermination)
      await forwardRecovery
      await Promise.all([mirror.dispose(), textInput.dispose(), streams.dispose()])
      const cleanup = await forwardRegistry.recover((args, signal) => run(args, signal))
      if (cleanup.retained > 0) ctx.logger.warn(new Error(`coremate-mobile: ${cleanup.retained} owned ADB forwards remain for next-start recovery`))
    }
  }, 'coremate-mobile native scrcpy mirror lifecycle')
  const hostObservation = async (agent: object, raw: RawPhoneObservation): Promise<PhoneObservation> => {
    const previous = hostedObservations.get(agent)
    const image = raw.unchangedFromObservationId !== undefined
      && previous?.observationId === raw.unchangedFromObservationId
      ? previous.image
      : await ctx.attachments.saveImage({
        data: raw.image.data,
        mediaType: 'image/jpeg',
        name: raw.image.name,
      }).then(ref => ({
        attachmentId: ref.attachmentId,
        mediaType: 'image/jpeg' as const,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: ref.name ?? raw.image.name,
      }))
    const value: PhoneObservation = {
      observationId: raw.observationId,
      ...(raw.unchangedFromObservationId === undefined ? {} : { unchangedFromObservationId: raw.unchangedFromObservationId }),
      serial: raw.serial,
      width: raw.width,
      height: raw.height,
      foregroundPackage: raw.foregroundPackage,
      image,
    }
    hostedObservations.set(agent, value)
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
      return hostObservation(agent, await phoneController.execute(agent, args, exec.signal))
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
          status: { type: 'string', required: true, enum: ['completed', 'cancelled'] },
          runId: { type: 'string' },
          output: { type: 'array', required: true, items: { type: 'json' } },
        },
      },
      render: (_args, value) => value.output as unknown as ContentBlock[],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('coremate-mobile: phone_agent requires a calling agent')
      const nested = tasks.nestedLease(exec.agent, exec.signal)
      try {
        const result = nested === undefined
          ? await runRootTask({ agent: exec.agent, signal: exec.signal }, lease => executePhoneTask(args.task, exec.agent!, lease, { nestedUnderCallId: exec.callId }))
          : await executePhoneTask(args.task, exec.agent, nested, { nestedUnderCallId: exec.callId })
        return { status: 'completed' as const, runId: result.runId, output: result.output as unknown as JsonValue[] }
      } catch (error) {
        if (!(error instanceof OpenGuiTaskCancelled)) throw error
        return { status: 'cancelled' as const, output: [{ type: 'text', text: error.message }] as unknown as JsonValue[] }
      }
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
          status: { type: 'string', required: true, enum: ['completed', 'cancelled'] },
          runId: { type: 'string' },
          output: { type: 'array', required: true, items: { type: 'json' } },
        },
      },
      render: (_args, value) => value.output as unknown as ContentBlock[],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('coremate-mobile: browser_agent requires a calling agent')
      const nested = tasks.nestedLease(exec.agent, exec.signal)
      try {
        const result = nested === undefined
          ? await runRootTask({ agent: exec.agent, signal: exec.signal }, lease => executeBrowserTask(args.task, exec.agent!, lease, { nestedUnderCallId: exec.callId }))
          : await executeBrowserTask(args.task, exec.agent, nested, { nestedUnderCallId: exec.callId })
        return { status: 'completed' as const, runId: result.runId, output: result.output as unknown as JsonValue[] }
      } catch (error) {
        if (!(error instanceof OpenGuiTaskCancelled)) throw error
        return { status: 'cancelled' as const, output: [{ type: 'text', text: error.message }] as unknown as JsonValue[] }
      }
    },
  }))
}
