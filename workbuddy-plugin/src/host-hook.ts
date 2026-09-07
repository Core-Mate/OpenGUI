#!/usr/bin/env node
import { readFile, lstat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrokerClient, connectWorkBuddyBroker } from './broker-client.ts'
import { brokerPort, VERSION, workbuddyStateDir } from './state.ts'
import { OPENGUI_WORKBUDDY_TOOLS } from './tools.ts'
import { errorInfo } from './errors.ts'

const names = new Set(OPENGUI_WORKBUDDY_TOOLS.map(tool => tool.name))
type ObjectValue = Record<string, unknown>
function object(value: unknown): ObjectValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : undefined
}
function argsObject(value: unknown): ObjectValue | undefined {
  if (typeof value === 'string') { try { return object(JSON.parse(value)) } catch { return undefined } }
  return object(value)
}
function toolName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/^mcp__opengui__/u, '')
  return names.has(normalized) ? normalized : undefined
}

/** Normalize only this connector's exact tool names, including WorkBuddy deferred calls. */
export function normalizeHookTool(event: ObjectValue): { name: string; args: ObjectValue; inject: (token: string) => ObjectValue } | undefined {
  const input = object(event.tool_input)
  if (!input) return undefined
  const direct = toolName(event.tool_name)
  if (direct) return { name: direct, args: input, inject: token => ({ ...input, hostContext: token }) }
  if (event.tool_name !== 'DeferExecuteTool') return undefined
  const name = toolName(input.toolName)
  const field = Object.hasOwn(input, 'params') ? 'params' : 'arguments'
  const args = argsObject(input[field])
  if (!name || !args) return undefined
  return { name, args, inject: token => {
    const updated = { ...args, hostContext: token }
    return { ...input, [field]: typeof input[field] === 'string' ? JSON.stringify(updated) : updated }
  } }
}

export async function handleHostHook(
  event: ObjectValue,
  connect: (mayStart: boolean) => Promise<Pick<BrokerClient, 'hostEvent' | 'close'> | undefined>,
): Promise<ObjectValue> {
  const kind = String(event.hook_event_name ?? '')
  const tool = normalizeHookTool(event)
  if (kind === 'PreToolUse' && !tool) return {}
  if (!['PreToolUse', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'FinalStop', 'SessionEnd', 'StopFailure'].includes(kind)) return {}
  if (typeof event.session_id !== 'string') return {}
  const connection = await connect(kind === 'PreToolUse')
  if (!connection) return {}
  try {
    const result = object(await connection.hostEvent({
      hook_event_name: kind,
      session_id: event.session_id,
      ...(typeof event.agent_id === 'string' ? { agent_id: event.agent_id } : {}),
      ...(typeof event.final_stop_reason === 'string' ? { final_stop_reason: event.final_stop_reason } : {}),
      ...(tool ? { tool_name: tool.name, tool_input: tool.args } : {}),
    }, AbortSignal.timeout(8000))) ?? {}
    if (kind === 'PreToolUse' && tool) {
      if (typeof result.hostContext !== 'string') throw new Error('opengui: hook binding unavailable')
      // Input binding does not set permissionDecision=allow or bypass host policy.
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', modifiedInput: tool.inject(result.hostContext) } }
    }
    return result
  } finally { connection.close() }
}

async function existingBroker(): Promise<BrokerClient | undefined> {
  const stateDir = workbuddyStateDir()
  const path = join(stateDir, 'broker-token')
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077)))) throw new Error('opengui: unsafe broker token')
    const token = await readFile(path, 'utf8')
    if (!/^[a-f0-9]{64}$/u.test(token)) throw new Error('opengui: invalid broker token')
    return await BrokerClient.connect(brokerPort(stateDir), token, VERSION, 'hook')
  } catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(String((error as NodeJS.ErrnoException).code))) return undefined
    throw error
  }
}

async function main(): Promise<void> {
  let input = ''
  let event: ObjectValue = {}
  try {
    for await (const chunk of process.stdin) {
      input += String(chunk)
      if (Buffer.byteLength(input) > 4 * 1024 * 1024) throw new Error('opengui: oversized hook input')
    }
    event = object(JSON.parse(input)) ?? {}
    const result = await handleHostHook(event, mayStart => mayStart ? connectWorkBuddyBroker('hook') : existingBroker())
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    const info = errorInfo(error)
    if (event.hook_event_name === 'PreToolUse' && normalizeHookTool(event)) {
      process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `OpenGUI host hook unavailable: ${info.message}` } })}\n`)
    } else {
      process.stderr.write(`OpenGUI lifecycle cleanup unavailable (${info.code}); the control lease remains the cleanup fallback.\n`)
      process.stdout.write('{}\n')
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
