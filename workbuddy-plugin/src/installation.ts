export const HOST_HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'Stop', 'SubagentStop', 'FinalStop', 'SessionEnd', 'StopFailure'] as const

/** Incrementally replace only hook commands owned by this installation. */
export function mergeHostHooks(settings: Record<string, unknown>, command: string, previousCommands: readonly string[] = []): Record<string, unknown> {
  const hooks = structuredClone((settings.hooks ?? {}) as Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>>)
  for (const [event, groups] of Object.entries(hooks)) {
    hooks[event] = groups.map(group => ({ ...group, hooks: group.hooks.filter(hook => hook.command !== command && !previousCommands.includes(String(hook.command))) })).filter(group => group.hooks.length > 0)
  }
  for (const event of HOST_HOOK_EVENTS) {
    const group = {
      ...(event === 'PreToolUse' ? { matcher: '^(mcp__opengui__opengui_[a-z_]+|opengui_[a-z_]+|DeferExecuteTool)$' } : {}),
      hooks: [{ type: 'command', command, timeout: 10 }],
    }
    hooks[event] = [...(hooks[event] ?? []), group]
  }
  return { ...settings, hooks }
}

export function mergeMcpConfig(config: Record<string, unknown>, node: string, entrypoint: string): Record<string, unknown> {
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>
  return { ...config, mcpServers: { ...servers, opengui: {
    ...((servers.opengui ?? {}) as Record<string, unknown>), type: 'stdio', command: node,
    args: [entrypoint], timeout: 120000, disabled: false,
  } } }
}
