import { describe, expect, it } from 'vitest'
import { HOST_HOOK_EVENTS, mergeHostHooks, mergeMcpConfig } from '../src/installation.ts'

describe('scoped WorkBuddy installation', () => {
  it('preserves unrelated configuration and replaces only the exact owned hook command', () => {
    const original = { unrelated: { keep: true }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other-tool' }, { type: 'command', command: 'old-opengui-hook' }] }] } }
    const updated = mergeHostHooks(original, 'new-opengui-hook', ['old-opengui-hook'])
    expect(updated.unrelated).toEqual(original.unrelated)
    expect(JSON.stringify(updated.hooks)).toContain('other-tool')
    expect(JSON.stringify(updated.hooks)).not.toContain('old-opengui-hook')
    expect(JSON.stringify(original.hooks)).toContain('old-opengui-hook')
    expect(mergeHostHooks(updated, 'new-opengui-hook', ['old-opengui-hook'])).toEqual(updated)
    expect(Object.keys(updated.hooks as object).sort()).toEqual([...HOST_HOOK_EVENTS].sort())
    expect(JSON.stringify(updated)).not.toContain('permissionDecision')
  })
  it('changes only the OpenGUI MCP entry and preserves its unrelated settings', () => {
    const original = { extra: true, mcpServers: { other: { command: 'production' }, opengui: { command: 'old', env: { KEEP: 'local' } } } }
    expect(mergeMcpConfig(original, '/managed/node', '/immutable/lib/mcp.js')).toEqual({ extra: true, mcpServers: { other: original.mcpServers.other,
      opengui: { command: '/managed/node', env: { KEEP: 'local' }, args: ['/immutable/lib/mcp.js'], type: 'stdio', timeout: 120000, disabled: false },
    } })
    expect(original.mcpServers.opengui.command).toBe('old')
  })
  it('binds display language to the selected host configuration while retaining other environment values', () => {
    const original = { mcpServers: { opengui: { env: { KEEP: 'local', OPENGUI_HOST_CONFIG_DIR: '/old-host' } } } }
    const updated = mergeMcpConfig(original, '/managed/node', '/immutable/lib/mcp.js', '/selected-host')
    expect(updated).toMatchObject({ mcpServers: { opengui: { env: { KEEP: 'local', OPENGUI_HOST_CONFIG_DIR: '/selected-host' } } } })
    expect(original.mcpServers.opengui.env.OPENGUI_HOST_CONFIG_DIR).toBe('/old-host')
  })
})
