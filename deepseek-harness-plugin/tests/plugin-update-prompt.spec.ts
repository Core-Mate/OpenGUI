import { describe, expect, it } from 'vitest'
import type { PluginUpdateStatus } from '../src/mirror-contract.ts'
import { pluginUpdatePresentation } from '../src/client/PluginUpdatePrompt.tsx'

function status(phase: PluginUpdateStatus['phase'], overrides: Partial<PluginUpdateStatus> = {}): PluginUpdateStatus {
  return { phase, currentVersion: '0.1.6', latestVersion: '0.1.7', ...overrides }
}

describe('OpenGUI plugin update prompt', () => {
  it('stays out of the workbench when current or during a background check', () => {
    expect(pluginUpdatePresentation()).toEqual({ kind: 'hidden' })
    expect(pluginUpdatePresentation(status('up-to-date'))).toEqual({ kind: 'hidden' })
    expect(pluginUpdatePresentation(status('checking'))).toEqual({ kind: 'hidden' })
  })

  it('offers an available release and reports bounded progress', () => {
    expect(pluginUpdatePresentation(status('available'))).toEqual({ kind: 'available', title: 'OpenGUI v0.1.7 可用' })
    expect(pluginUpdatePresentation(status('downloading', { downloadedBytes: 40, totalBytes: 100 }), true)).toEqual({
      kind: 'progress', title: '正在下载 OpenGUI 更新：40%', percent: 40,
    })
    expect(pluginUpdatePresentation(status('verifying'), true)).toEqual({ kind: 'progress', title: '正在校验 OpenGUI 更新…' })
    expect(pluginUpdatePresentation(status('installing'), true)).toEqual({ kind: 'progress', title: '正在安装 OpenGUI 更新…' })
  })

  it('keeps restart and user-triggered failures visible', () => {
    expect(pluginUpdatePresentation(status('restart-required'))).toEqual({ kind: 'restart', title: 'OpenGUI v0.1.7 已安装' })
    expect(pluginUpdatePresentation(status('error', { message: 'checksum mismatch' }))).toEqual({ kind: 'hidden' })
    expect(pluginUpdatePresentation(status('error', { message: 'checksum mismatch' }), true)).toEqual({
      kind: 'error', title: 'checksum mismatch',
    })
  })
})
