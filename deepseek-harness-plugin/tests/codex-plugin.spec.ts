import { access, readFile, stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { OPENGUI_CODEX_TOOLS } from '../src/codex/tools.ts'

const root = new URL('../', import.meta.url)
const json = async (path: string) => JSON.parse(await readFile(new URL(path, root), 'utf8')) as Record<string, any>

describe('Codex plugin package', () => {
  it('publishes exactly seven namespaced local interfaces with safety annotations', () => {
    expect(OPENGUI_CODEX_TOOLS.map(tool => tool.name)).toEqual([
      'opengui_list_devices', 'opengui_open_session', 'opengui_observe', 'opengui_act',
      'opengui_status', 'opengui_cancel', 'opengui_close_session',
    ])
    expect(OPENGUI_CODEX_TOOLS.filter(tool => tool.annotations.readOnlyHint).map(tool => tool.name))
      .toEqual(['opengui_list_devices', 'opengui_observe', 'opengui_status'])
    expect(OPENGUI_CODEX_TOOLS.find(tool => tool.name === 'opengui_act')?.annotations)
      .toMatchObject({ destructiveHint: true, openWorldHint: true })
  })

  it('keeps package, local manifest, and public Skills-only manifest at one version', async () => {
    const [pkg, plugin, publicPlugin] = await Promise.all([
      json('package.json'), json('.codex-plugin/plugin.json'), json('codex-public/.codex-plugin/plugin.json'),
    ])
    const compatibility = await json('skills/opengui-coremate-install/dsh-compatibility.json')
    const peerRange = compatibility.supportedVersions.join(' || ')
    expect([pkg.version, plugin.version, publicPlugin.version]).toEqual(['0.1.13', '0.1.13', '0.1.13'])
    expect(pkg.name).toBe('dsh-coremate-mobile')
    expect(Object.entries(pkg.peerDependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
      .every(([, version]) => version === peerRange)).toBe(true)
    expect(Object.entries(pkg.devDependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
      .every(([, version]) => version === compatibility.preferredVersion)).toBe(true)
    expect(plugin).toMatchObject({ name: 'opengui', skills: './skills/', mcpServers: './.mcp.json' })
    expect(publicPlugin).toMatchObject({ name: 'opengui', skills: './skills/' })
    expect(publicPlugin).not.toHaveProperty('mcpServers')
  })

  it('points the repo marketplace directly at the only source directory', async () => {
    const marketplace = await json('../.agents/plugins/marketplace.json')
    expect(marketplace.plugins).toEqual([expect.objectContaining({
      name: 'opengui',
      source: { source: 'local', path: './deepseek-harness-plugin' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    })])
  })

  it('builds executable MCP and CLI entries without changing the DSH package identity', async () => {
    await Promise.all(['lib/index.js', 'lib/codex-mcp.js', 'lib/codex-cli.js'].map(path => access(new URL(path, root))))
    expect((await stat(new URL('lib/codex-cli.js', root))).mode & 0o111).not.toBe(0)
    const mcp = await json('.mcp.json')
    expect(mcp.mcpServers['opengui-local-android']).toEqual({ cwd: '.', command: 'node', args: ['./lib/codex-mcp.js'] })
  })
})
