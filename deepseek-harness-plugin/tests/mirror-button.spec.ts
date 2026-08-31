import { afterEach, describe, expect, it, vi } from 'vitest'
import { readMirrorStatus } from '../src/client/MirrorButton.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenGUI workbench status errors', () => {
  it('shows the server diagnostic instead of reducing every failure to HTTP 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'OpenGUI bundled ADB is missing execute permission.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )))

    await expect(readMirrorStatus()).rejects.toThrow('bundled ADB is missing execute permission')
  })
})
