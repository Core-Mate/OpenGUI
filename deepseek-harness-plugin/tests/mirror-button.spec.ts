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

    await expect(readMirrorStatus('session-a')).rejects.toThrow('bundled ADB is missing execute permission')
  })

  it('discards status updates without the requested session identity', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ devices: [], taskActive: false }))
      .mockResolvedValueOnce(Response.json({ sessionId: 'session-b', devices: [], taskActive: false }))
    vi.stubGlobal('fetch', fetch)

    await expect(readMirrorStatus('session-a')).resolves.toBeUndefined()
    await expect(readMirrorStatus('session-a')).resolves.toBeUndefined()
    expect(fetch.mock.calls[0]?.[0]).toBe('/coremate-mobile/mirror/status?sessionId=session-a')
  })
})
