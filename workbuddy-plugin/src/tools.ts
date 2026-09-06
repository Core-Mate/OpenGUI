import type { WorkBuddyOpenGuiService, WorkBuddyObservation, OpenSessionOptions, SessionResult } from './service.ts'
import { Ajv } from 'ajv'

export interface WorkBuddyToolDefinition {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly outputSchema: Record<string, unknown>
  readonly annotations: {
    readonly readOnlyHint: boolean
    readonly destructiveHint: boolean
    readonly idempotentHint: boolean
    readonly openWorldHint: boolean
  }
}

const sessionId = { type: 'string', minLength: 1, description: 'Session id returned by opengui_open_session.' }
const deviceId = { type: 'string', minLength: 1, description: 'Required when the session contains more than one phone.' }

const deviceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' },
    state: { type: 'string' }, connected: { type: 'boolean' }, authorized: { type: 'boolean' },
    mirror: { type: 'object' },
    displayError: { type: 'object' },
  },
  required: ['id', 'name', 'state', 'connected', 'authorized'],
}
const displaySchema = { type: 'object', properties: { devices: { type: 'array', items: deviceSchema } }, required: ['devices'] }

const sessionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
    purpose: { type: 'string', enum: ['control', 'mirror'] },
    mirrorResumeToken: { type: 'string' },
    state: { type: 'string', enum: ['active', 'cancelled', 'closed'] },
    activity: { type: 'string' },
    leaseExpiresAt: { type: 'string' }, objective: { type: 'string' }, successCriteria: { type: 'string' },
    result: { type: 'object' }, automation: { type: 'object' },
    createdAt: { type: 'string' }, closedAt: { type: 'string' }, lastError: { type: 'string' },
    deviceWallUrl: { type: 'string' },
    devices: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' },
          connected: { type: 'boolean' }, authorized: { type: 'boolean' },
          operationCount: { type: 'integer' }, remainingOperations: { type: 'integer' }, observationId: { type: 'string' },
          mirror: { type: 'object', additionalProperties: false, properties: {
            phase: { type: 'string', enum: ['idle', 'downloading', 'extracting', 'launching', 'running', 'error'] },
            downloadedBytes: { type: 'number' }, totalBytes: { type: 'number' }, message: { type: 'string' },
            visible: { type: 'boolean' }, rendererReady: { type: 'boolean' }, ready: { type: 'boolean' },
          }, required: ['phase'] },
        },
        required: ['id', 'name', 'connected', 'authorized', 'operationCount'],
      },
    },
  },
  required: ['sessionId', 'state', 'createdAt', 'deviceWallUrl', 'devices'],
}

const observationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' }, deviceId: { type: 'string' }, observationId: { type: 'string' },
    unchangedFromObservationId: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' },
    foregroundPackage: { type: 'string' },
    capturedAt: { type: 'string' }, connectionEpoch: { type: 'integer' }, settled: { type: 'boolean' },
    automation: { type: 'object' },
    screenshot: {
      type: 'object', additionalProperties: false,
      properties: {
        mimeType: { type: 'string', const: 'image/jpeg' }, bytes: { type: 'integer' },
        width: { type: 'integer' }, height: { type: 'integer' }, name: { type: 'string' },
      },
      required: ['mimeType', 'bytes', 'width', 'height', 'name'],
    },
  },
  required: ['sessionId', 'deviceId', 'observationId', 'width', 'height', 'foregroundPackage', 'screenshot'],
}

export const OPENGUI_WORKBUDDY_TOOLS: readonly WorkBuddyToolDefinition[] = [
  {
    name: 'opengui_start', title: 'Start OpenGUI',
    description: 'Begin every OpenGUI task here. Show persistent local read-only windows for all authorized phones, without taking control locks or returning phone images. Windows survive task completion and transport recycling. Verify initial display once per task; later minimization or closure does not stop screenshot-driven control.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }, outputSchema: displaySchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_resume_mirror', title: 'Resume OpenGUI Mirror',
    description: 'Recover a standalone mirror after WorkBuddy recycled the previous turn connection. Requires sessionId and the private mirrorResumeToken from open_session. Never recover control sessions.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, mirrorResumeToken: { type: 'string', minLength: 1 } }, required: ['sessionId', 'mirrorResumeToken'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ...(['open', 'close'] as const).map(action => ({
    name: `opengui_${action}_mirror`, title: `${action === 'open' ? 'Open' : 'Close'} OpenGUI Mirror`,
    description: action === 'open'
      ? 'Open a local read-only silent scrcpy window by deviceId (or legacy sessionId). Returns launch progress, never images. Poll opengui_status for display readiness. Use opengui_start for standalone viewing of all authorized phones.'
      : 'Close a phone mirror only on explicit user request. Closing the final window ends a legacy mirror-only session; established control tasks continue. Use opengui_cancel to stop a task.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, deviceId }, anyOf: [{ properties: { sessionId }, required: ['sessionId'] }, { properties: { deviceId }, required: ['deviceId'] }] },
    outputSchema: { type: 'object', anyOf: [sessionSchema, displaySchema] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  })),
  {
    name: 'opengui_list_devices',
    title: 'List OpenGUI Devices',
    description: 'List locally attached Android devices with opaque ids, display names, connection state, and USB authorization state.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: { type: 'object', additionalProperties: false, properties: { devices: { type: 'array', items: deviceSchema } }, required: ['devices'] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_open_session',
    title: 'Open OpenGUI Session',
    description: 'Freeze and exclusively lock one to four task phones. Start persistent local read-only mirrors for authorized phones. Initial display must be verified once per task; subsequent minimization, occlusion or closure does not pause control. Finishing a task never closes windows. Omit deviceIds only with one authorized phone. Legacy purpose mirror takes no control lock.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { purpose: { type: 'string', enum: ['control', 'mirror'], default: 'control' }, deviceId, deviceIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 4, items: { type: 'string', minLength: 1 } }, objective: { type: 'string', minLength: 1, maxLength: 2000 }, successCriteria: { type: 'string', minLength: 1, maxLength: 2000 } },
      not: { properties: { deviceId: {}, deviceIds: {} }, required: ['deviceId', 'deviceIds'] },
    },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'opengui_observe',
    title: 'Observe OpenGUI Phone',
    description: 'Capture the current bounded phone screenshot, logical dimensions, foreground app, and a new observationId. Use the returned image as the only coordinate space for the next action.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, deviceId }, required: ['sessionId'] },
    outputSchema: observationSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'opengui_act',
    title: 'Act on OpenGUI Phone',
    description: 'Perform one allowlisted action within the user-authorized task against the latest real image. No redundant plugin approval is requested. Respect host restrictions and task scope. Inspect the returned image before deciding another action; never replay an uncertain mutation.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        sessionId, deviceId,
        confirmationRequestId: { type: 'string', minLength: 1, description: 'Deprecated compatibility field; ignored, never grants permission.' },
        action: { type: 'string', enum: ['tap', 'swipe', 'text', 'key', 'launch', 'wait'] },
        observationId: { type: 'string', minLength: 1 },
        targetBBox: {
          type: 'object', additionalProperties: false,
          properties: { left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' } },
          required: ['left', 'top', 'right', 'bottom'],
        },
        x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' },
        durationMs: { type: 'integer', minimum: 50, maximum: 2000 },
        text: { type: 'string', minLength: 1, maxLength: 500 },
        key: { type: 'string', enum: ['Back', 'Home', 'Enter', 'AppSwitch'] },
        packageName: { type: 'string' }, waitMs: { type: 'integer', minimum: 100, maximum: 10000 },
        externalSideEffect: {
          type: 'string', enum: ['none', 'send', 'publish', 'purchase', 'delete'], default: 'none',
          description: 'Deprecated compatibility metadata; never grants permission or triggers plugin approval.',
        },
      },
      required: ['sessionId', 'action', 'observationId'],
    },
    outputSchema: observationSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'opengui_status',
    title: 'Get OpenGUI Status',
    description: 'Read session state, frozen devices, operation counts, current observation ids, device-wall URL, and the latest error.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId } },
    outputSchema: { type: 'object', anyOf: [sessionSchema, displaySchema] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_cancel',
    title: 'Cancel OpenGUI Session',
    description: 'Immediately abort in-flight Android work, release all phone locks, and begin resource cleanup.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId }, required: ['sessionId'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_close_session',
    title: 'Close OpenGUI Session',
    description: 'Finish control and release its phone locks, never persistent displays. Report outcome and final observation evidence. Resource cleanup alone does not prove task completion.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId,
      outcome: { type: 'string', enum: ['completed', 'blocked', 'unknown', 'cancelled'] },
      summary: { type: 'string', maxLength: 2000 },
      evidenceObservationIds: { type: 'array', maxItems: 4, items: { type: 'string', minLength: 1 } },
    }, required: ['sessionId'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
].map(tool => ({ ...tool, inputSchema: { ...tool.inputSchema, properties: {
  ...tool.inputSchema.properties,
  hostContext: { type: 'string', minLength: 1, description: 'Internal single-use WorkBuddy hook context. Automatically injected by the installed hook; never invent or reuse it.' },
} } })) as readonly WorkBuddyToolDefinition[]

const ajv = new Ajv({ allErrors: true, strict: true })
const validators = new Map(OPENGUI_WORKBUDDY_TOOLS.map(tool => [tool.name, ajv.compile(tool.inputSchema)]))

export function validateToolArguments(name: string, args: unknown): asserts args is Record<string, unknown> {
  const validate = validators.get(name)
  if (!validate) throw new Error(`opengui: unknown tool ${name}`)
  if (!validate(args)) throw new Error(`opengui: invalid arguments: ${ajv.errorsText(validate.errors)}`)
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`opengui: ${name} must be a non-empty string`)
  return value.trim()
}

function optionalString(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, name)
}

function deviceIds(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error('opengui: deviceIds must be an array of strings')
  }
  return value as string[]
}

/** Dispatch one normalized public interface to the shared service. */
export async function callOpenGuiTool(
  service: WorkBuddyOpenGuiService,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  options: OpenSessionOptions = {},
): Promise<unknown> {
  validateToolArguments(name, args)
  switch (name) {
    case 'opengui_start': return service.start(signal)
    case 'opengui_list_devices':
      return { devices: await service.listDevices(signal) }
    case 'opengui_open_session':
      return service.openSession(args.deviceId ? [requiredString(args.deviceId, 'deviceId')] : deviceIds(args.deviceIds), signal, args.purpose as 'control' | 'mirror' | undefined, { ...options, objective: optionalString(args.objective, 'objective'), successCriteria: optionalString(args.successCriteria, 'successCriteria') })
    case 'opengui_open_mirror':
      if (!args.sessionId) return service.deviceMirror(requiredString(args.deviceId, 'deviceId'), false, signal)
      return service.openMirror(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'), signal)
    case 'opengui_close_mirror':
      if (!args.sessionId) return service.deviceMirror(requiredString(args.deviceId, 'deviceId'), true, signal)
      return service.closeMirror(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'))
    case 'opengui_observe':
      return service.observe(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'), signal)
    case 'opengui_act':
      return service.act(
        requiredString(args.sessionId, 'sessionId'),
        optionalString(args.deviceId, 'deviceId'),
        args,
        signal,
      )
    case 'opengui_status':
      if (!args.sessionId) return service.displayStatus(signal)
      return service.status(requiredString(args.sessionId, 'sessionId'), signal)
    case 'opengui_cancel':
      return service.cancel(requiredString(args.sessionId, 'sessionId'))
    case 'opengui_close_session':
      return service.closeSession(requiredString(args.sessionId, 'sessionId'), args.outcome ? {
        outcome: args.outcome as SessionResult['outcome'],
        ...(typeof args.summary === 'string' ? { summary: args.summary } : {}),
        ...(Array.isArray(args.evidenceObservationIds) ? { evidenceObservationIds: args.evidenceObservationIds as string[] } : {}),
      } : undefined)
    default:
      throw new Error(`opengui: unknown tool ${name}`)
  }
}

export function isWorkBuddyObservation(value: unknown): value is WorkBuddyObservation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<WorkBuddyObservation>
  return typeof candidate.observationId === 'string' && typeof candidate.screenshot?.data === 'string'
}
