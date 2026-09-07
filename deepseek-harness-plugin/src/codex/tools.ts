import type { CodexOpenGuiService, CodexObservation, ExternalSideEffect } from './service.ts'

export interface CodexToolDefinition {
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
  },
  required: ['id', 'name', 'state', 'connected', 'authorized'],
}

const sessionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
    state: { type: 'string', enum: ['active', 'cancelled', 'closed'] },
    createdAt: { type: 'string' }, closedAt: { type: 'string' }, lastError: { type: 'string' },
    deviceWallUrl: { type: 'string' },
    devices: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' },
          connected: { type: 'boolean' }, authorized: { type: 'boolean' },
          operationCount: { type: 'integer' }, observationId: { type: 'string' },
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
    screenshot: {
      type: 'object', additionalProperties: false,
      properties: {
        data: { type: 'string' }, mimeType: { type: 'string', const: 'image/jpeg' }, bytes: { type: 'integer' },
        width: { type: 'integer' }, height: { type: 'integer' }, name: { type: 'string' },
      },
      required: ['data', 'mimeType', 'bytes', 'width', 'height', 'name'],
    },
  },
  required: ['sessionId', 'deviceId', 'observationId', 'width', 'height', 'foregroundPackage', 'screenshot'],
}

export const OPENGUI_CODEX_TOOLS: readonly CodexToolDefinition[] = [
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
    description: 'Freeze and exclusively lock one to four authorized Android phones for an OpenGUI task. Omit deviceIds only when exactly one authorized phone is attached.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { deviceIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 4, items: { type: 'string', minLength: 1 } } },
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
    description: 'Perform one allowlisted Android action against the latest observation. Actions can change external state. Classify send, publish, purchase, or delete actions so OpenGUI can obtain immediate user confirmation before execution.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        sessionId, deviceId,
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
          description: 'Classify the immediate effect. Non-none values trigger a user confirmation before execution.',
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
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId }, required: ['sessionId'] },
    outputSchema: sessionSchema,
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
    description: 'Normally finish a session, release its phone locks, and clean local resources.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId }, required: ['sessionId'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const

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
  service: CodexOpenGuiService,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  confirmedExternalSideEffect = false,
): Promise<unknown> {
  switch (name) {
    case 'opengui_list_devices':
      return { devices: await service.listDevices(signal) }
    case 'opengui_open_session':
      return service.openSession(deviceIds(args.deviceIds), signal)
    case 'opengui_observe':
      return service.observe(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'), signal)
    case 'opengui_act':
      return service.act(
        requiredString(args.sessionId, 'sessionId'),
        optionalString(args.deviceId, 'deviceId'),
        { ...args, confirmedExternalSideEffect },
        signal,
      )
    case 'opengui_status':
      return service.status(requiredString(args.sessionId, 'sessionId'), signal)
    case 'opengui_cancel':
      return service.cancel(requiredString(args.sessionId, 'sessionId'))
    case 'opengui_close_session':
      return service.closeSession(requiredString(args.sessionId, 'sessionId'))
    default:
      throw new Error(`opengui: unknown tool ${name}`)
  }
}

export function requestedSideEffect(args: Record<string, unknown>): ExternalSideEffect {
  const value = args.externalSideEffect
  if (value === undefined || value === 'none') return 'none'
  if (value === 'send' || value === 'publish' || value === 'purchase' || value === 'delete') return value
  throw new Error('opengui: externalSideEffect must be none, send, publish, purchase, or delete')
}

export function isCodexObservation(value: unknown): value is CodexObservation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<CodexObservation>
  return typeof candidate.observationId === 'string' && typeof candidate.screenshot?.data === 'string'
}
