import readline from 'node:readline'
import { CodexOpenGuiService } from './codex/service.ts'
import {
  callOpenGuiTool,
  isCodexObservation,
  OPENGUI_CODEX_TOOLS,
  requestedSideEffect,
} from './codex/tools.ts'
import { packageInfo } from './package-info.ts'

interface JsonRpcMessage {
  readonly jsonrpc?: string
  readonly id?: string | number | null
  readonly method?: string
  readonly params?: Record<string, unknown>
  readonly result?: unknown
  readonly error?: { message?: string }
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

const service = new CodexOpenGuiService()
const pending = new Map<string, PendingRequest>()
let nextRequestId = 1
let shuttingDown = false

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id: JsonRpcMessage['id'], result: unknown): void {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id: JsonRpcMessage['id'], code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function request(method: string, params: Record<string, unknown>): Promise<unknown> {
  const id = `opengui-${nextRequestId++}`
  send({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolveRequest, rejectRequest) => {
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest })
  })
}

function publicResult(value: unknown): Record<string, unknown> {
  if (!isCodexObservation(value)) {
    return {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: value,
    }
  }
  const { screenshot, ...metadata } = value
  return {
    content: [
      { type: 'text', text: JSON.stringify({ ...metadata, screenshot: { ...screenshot, data: undefined } }) },
      { type: 'image', data: screenshot.data, mimeType: screenshot.mimeType },
    ],
    structuredContent: value,
  }
}

async function confirmSideEffect(sideEffect: string): Promise<boolean> {
  const label = { send: '发送', publish: '发布', purchase: '购买', delete: '删除' }[sideEffect] ?? sideEffect
  const result = await request('elicitation/create', {
    mode: 'form',
    message: `OpenGUI 即将在手机上执行“${label}”操作。请仅在你确认当前屏幕、目标和内容都正确时继续。`,
    requestedSchema: {
      type: 'object',
      properties: { confirm: { type: 'boolean', title: `确认执行${label}` } },
      required: ['confirm'],
    },
  }) as { action?: unknown; content?: { confirm?: unknown } }
  return result.action === 'accept' && result.content?.confirm === true
}

async function handleToolCall(id: JsonRpcMessage['id'], params: Record<string, unknown> | undefined): Promise<void> {
  const name = typeof params?.name === 'string' ? params.name : ''
  const args = typeof params?.arguments === 'object' && params.arguments !== null && !Array.isArray(params.arguments)
    ? params.arguments as Record<string, unknown>
    : {}
  try {
    const sideEffect = name === 'opengui_act' ? requestedSideEffect(args) : 'none'
    let confirmed = false
    if (sideEffect !== 'none') {
      confirmed = await confirmSideEffect(sideEffect)
      if (!confirmed) {
        sendResult(id, {
          content: [{ type: 'text', text: `OpenGUI ${sideEffect} action was not confirmed and was not executed.` }],
          structuredContent: { status: 'confirmation_declined', sideEffect },
        })
        return
      }
    }
    const value = await callOpenGuiTool(service, name, args, new AbortController().signal, confirmed)
    sendResult(id, publicResult(value))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendResult(id, {
      isError: true,
      content: [{ type: 'text', text: message }],
      structuredContent: { error: message },
    })
  }
}

async function handleRequest(message: JsonRpcMessage): Promise<void> {
  const { id, method, params } = message
  if (method === 'initialize') {
    const info = packageInfo()
    sendResult(id, {
      protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'OpenGUI local Android control', version: info.version },
      instructions: 'Use opengui_list_devices and opengui_open_session before observing or acting. Always use the newest observationId. Ask for explicit confirmation before send, publish, purchase, or delete. Close or cancel every session when finished.',
    })
    return
  }
  if (method === 'ping') {
    sendResult(id, {})
    return
  }
  if (method === 'tools/list') {
    sendResult(id, { tools: OPENGUI_CODEX_TOOLS })
    return
  }
  if (method === 'tools/call') {
    await handleToolCall(id, params)
    return
  }
  if (id !== undefined) sendError(id, -32601, `Method not found: ${method ?? ''}`)
}

async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  await service.dispose().catch(error => process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`))
  process.exitCode = code
  lines.close()
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
lines.on('line', (line) => {
  if (line.trim().length === 0) return
  let message: JsonRpcMessage
  try {
    message = JSON.parse(line) as JsonRpcMessage
  } catch {
    return
  }
  if (message.method === undefined && message.id !== undefined) {
    const requestId = String(message.id)
    const waiter = pending.get(requestId)
    if (waiter !== undefined) {
      pending.delete(requestId)
      if (message.error !== undefined) waiter.reject(new Error(message.error.message ?? 'MCP request failed'))
      else waiter.resolve(message.result)
    }
    return
  }
  void handleRequest(message)
})
lines.once('close', () => { void shutdown(0) })
process.once('SIGINT', () => { void shutdown(130) })
process.once('SIGTERM', () => { void shutdown(143) })
