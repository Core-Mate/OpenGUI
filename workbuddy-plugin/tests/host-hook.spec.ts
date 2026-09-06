import { describe, expect, it, vi } from 'vitest'
import { handleHostHook, normalizeHookTool } from '../src/host-hook.ts'

describe('WorkBuddy native hook adapter', () => {
  it.each([false, true])('injects a binding into deferred parameters without changing host permissions (string=%s)', async stringify => {
    const args = { sessionId: 'own-session' }
    const event = { hook_event_name: 'PreToolUse', session_id: 'native-host-id', tool_name: 'DeferExecuteTool', tool_input: {
      toolName: 'mcp__opengui__opengui_observe', params: stringify ? JSON.stringify(args) : args,
    } }
    const connection = { hostEvent: vi.fn(async () => ({ hostContext: 'single-use' })), close: vi.fn() }
    const result = await handleHostHook(event, async () => connection)
    const expected = { ...args, hostContext: 'single-use' }
    expect(result).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', modifiedInput: {
      ...event.tool_input, params: stringify ? JSON.stringify(expected) : expected,
    } } })
    expect(JSON.stringify(result)).not.toContain('permissionDecision')
    expect(connection.hostEvent).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'native-host-id', tool_name: 'opengui_observe', tool_input: args }), expect.any(AbortSignal))
    expect(connection.close).toHaveBeenCalledTimes(1)
  })
  it('does not start the broker or affect tools belonging to another connector', async () => {
    const connect = vi.fn()
    for (const name of ['mcp__other__opengui_act', 'Bash', 'ToolSearch']) {
      expect(await handleHostHook({ hook_event_name: 'PreToolUse', session_id: 'host', tool_name: name, tool_input: {} }, connect)).toEqual({})
    }
    expect(connect).not.toHaveBeenCalled()
    expect(normalizeHookTool({ tool_name: 'mcp__opengui__opengui_start', tool_input: {} })?.name).toBe('opengui_start')
  })
  it('forwards only lifecycle identity, never transcript contents or phone images', async () => {
    const connection = { hostEvent: vi.fn(async () => ({ decision: 'block', reason: 'Observe and verify' })), close: vi.fn() }
    const connect = vi.fn(async () => connection)
    expect(await handleHostHook({ hook_event_name: 'Stop', session_id: 'host', transcript_path: 'private', tool_response: { image: 'private-pixels' } }, connect)).toEqual({ decision: 'block', reason: 'Observe and verify' })
    expect(connect).toHaveBeenCalledWith(false)
    expect(connection.hostEvent.mock.calls[0]![0]).toEqual({ hook_event_name: 'Stop', session_id: 'host' })
  })
})
