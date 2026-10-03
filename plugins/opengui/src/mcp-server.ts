import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { OPENGUI_CODEX_TOOLS, validateToolArguments } from './codex/tools.ts'
import { ensureDaemon, request, sendRequest } from './daemon.ts'
import { VERSION, dataDirectory } from './state.ts'
import { errorInfo, OpenGuiError } from './errors.ts'
import { CODEX_WORKBENCH_RESOURCE_URI, CODEX_WORKBENCH_RESOURCE_MIME, codexWorkbenchResource } from './mcp-app.ts'

/** Identity is supplied per call by the host, never by model arguments or process globals. */
export function codexCallOwner(meta: unknown): string {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('codex_identity_missing')
  const { thread_id, threadId } = meta as Record<string, unknown>
  const values = [thread_id, threadId].filter(value => value !== undefined)
  if (!values.length) throw new Error('codex_identity_missing')
  if (values.some(value => typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))) {
    throw new Error('codex_identity_invalid')
  }
  if (values.some(value => value !== values[0])) throw new Error('codex_identity_conflict')
  return values[0] as string
}

export type CodexMcpCall = (name: string, args: Record<string, unknown>, owner: string, signal: AbortSignal) => Promise<unknown>

export function daemonMcpCall(entry: string): CodexMcpCall {
  return async (name, args, owner, signal) => {
    if (process.platform !== 'darwin') throw new Error('OpenGUI requires local macOS')
    const endpoint = await ensureDaemon(entry, dataDirectory(), AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
    signal.throwIfAborted()
    const response = await sendRequest(endpoint, request(name, args, owner), signal)
    if (!response.ok) {
      if (response.failure) throw new OpenGuiError(response.failure.code, response.failure.message, response.failure.executionState, response.failure.recovery)
      throw new Error(response.error ?? 'OpenGUI request failed')
    }
    return response.result
  }
}

/** The MCP connection may serve multiple conversations concurrently. */
export async function startCodexMcp(transport: Transport, call: CodexMcpCall): Promise<Server> {
  const server = new Server({ name: 'opengui-codex', version: VERSION }, {
    capabilities: { tools: {}, resources: {} },
    instructions: [
      'Use the current Codex model to plan and decide phone tasks. OpenGUI executes validated actions and stores evidence; do not configure another model.',
      'Call opengui_open_workbench for the native panel in this conversation. Keep it open for progress and evidence. If the host cannot render its resource, use open_in_codex for its URL. Submit a chat goal with opengui_run_task and a stable requestId. The shared service executes it with the configured model. Never submit the same goal twice and never call next/decide.',
      'Continue next/decide until terminal or waiting for user help. Read each returned imagePath with the host image viewer before deciding. Preserve observation IDs, coordinate contracts, device leases, and action serialization.',
      'Keep the workbench visible for the first decoded frame. A first-frame timeout is terminal; do not recreate sessions to bypass it. Do not mix legacy controls or shell/ADB with task execution.',
      'Completion requires a fresh independent terminal observation and success checks citing it. Stop the parent and await cleanup when asked. An unknown action must not be replayed.',
      'Tool calls require per-call Codex thread metadata. If identity is unavailable, report the integration blocker; do not invent an identity or use a different conversation.',
    ].join(' '),
  })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: OPENGUI_CODEX_TOOLS.map(tool => tool.name === 'opengui_open_workbench'
    ? { ...tool, _meta: { ui: { resourceUri: CODEX_WORKBENCH_RESOURCE_URI } } } : tool) as unknown as Tool[] }))
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: CODEX_WORKBENCH_RESOURCE_URI, name: 'OpenGUI 工作台', mimeType: CODEX_WORKBENCH_RESOURCE_MIME }] }))
  server.setRequestHandler(ReadResourceRequestSchema, async message => {
    if (message.params.uri !== CODEX_WORKBENCH_RESOURCE_URI) throw new Error('Unknown OpenGUI resource')
    return { contents: [{ uri: CODEX_WORKBENCH_RESOURCE_URI, mimeType: CODEX_WORKBENCH_RESOURCE_MIME, text: codexWorkbenchResource,
      _meta: { ui: { csp: { frameDomains: ['http://127.0.0.1:*'] } } } }] }
  })
  server.setRequestHandler(CallToolRequestSchema, async (message, extra) => {
    try {
      const owner = codexCallOwner(message.params._meta)
      const args = message.params.arguments ?? {}
      validateToolArguments(message.params.name, args)
      const signal = AbortSignal.any([extra.signal, AbortSignal.timeout(120_000)])
      signal.throwIfAborted()
      const value = await call(message.params.name, args, owner, signal)
      return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> }
    } catch (error) {
      const info = errorInfo(error)
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(info) }], structuredContent: info }
    }
  })
  await server.connect(transport)
  return server
}
