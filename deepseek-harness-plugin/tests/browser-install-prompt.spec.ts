import { describe, expect, it } from 'vitest'
import type { BrowserInstallStatus } from '../src/mirror-contract.ts'
import { browserInstallPresentation } from '../src/client/BrowserInstallPrompt.tsx'

function status(phase: BrowserInstallStatus['phase'], overrides: Partial<BrowserInstallStatus> = {}): BrowserInstallStatus {
  return {
    phase,
    version: '141.0.0',
    hostPlatform: 'darwin-arm64',
    ...overrides,
  }
}

describe('OpenGUI workbench browser installation status', () => {
  it('occupies no workbench space outside actionable or failed states', () => {
    expect(browserInstallPresentation()).toEqual({ kind: 'hidden' })
    expect(browserInstallPresentation(status('idle'))).toEqual({ kind: 'hidden' })
    expect(browserInstallPresentation(status('ready'))).toEqual({ kind: 'hidden' })
    expect(browserInstallPresentation(status('unsupported'))).toEqual({ kind: 'hidden' })
  })

  it('shows the first-use decision inside the workbench', () => {
    expect(browserInstallPresentation(status('awaiting-confirmation'))).toEqual({ kind: 'confirmation' })
  })

  it('reports bounded download progress and extraction', () => {
    expect(browserInstallPresentation(status('downloading', {
      downloadedBytes: 24,
      totalBytes: 100,
    }))).toEqual({ kind: 'progress', label: '正在下载托管浏览器：24%', percent: 24 })
    expect(browserInstallPresentation(status('downloading'))).toEqual({
      kind: 'progress',
      label: '正在下载托管浏览器…',
    })
    expect(browserInstallPresentation(status('extracting'))).toEqual({
      kind: 'progress',
      label: '正在解压托管浏览器…',
    })
  })

  it('keeps installation errors visible in the workbench', () => {
    expect(browserInstallPresentation(status('error', { message: 'checksum mismatch' }))).toEqual({
      kind: 'error',
      label: 'checksum mismatch',
    })
  })
})
