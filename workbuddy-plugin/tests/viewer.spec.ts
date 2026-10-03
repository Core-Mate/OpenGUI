import { describe, expect, it, vi } from 'vitest'
import { a, b, setup, connect } from './viewer-fixture.ts'

describe('independent first-frame viewer contract', () => {
  it('scopes native frame ancestry to one viewer without relaxing API or frame receipts', async () => {
    const { viewer } = setup()
    const opened = await viewer.open('task', [a], AbortSignal.timeout(1000))
    const other = await viewer.open('other', [b], AbortSignal.timeout(1000))
    const native = 'http://127.0.0.1:34567'
    expect(() => viewer.allowNativeEmbedding(opened.viewerId, 'other', native)).toThrow('foreign_viewer')
    expect(() => viewer.allowNativeEmbedding(opened.viewerId, 'task', 'https://example.com')).toThrow('Invalid native')
    viewer.allowNativeEmbedding(opened.viewerId, 'task', native)
    const headers = { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe' }
    const page = await fetch(opened.url, { headers })
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain('frame-ancestors file: ' + native)
    expect((await fetch(other.url, { headers })).status).toBe(403)
    expect((await fetch(other.url)).headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect((await fetch(opened.url + 'status', { headers })).status).toBe(403)
    expect((await fetch(opened.url + 'frame', { method: 'POST', headers: { ...headers, origin: native }, body: '{}' })).status).toBe(403)
    expect(() => viewer.assertReady(opened.viewerId)).toThrow('waiting_for_frame')
  })
  it('retains a hidden page without video and releases presence on closure', async () => {
    const { viewer, sinks, advance } = setup()
    const opened = await viewer.open('task', [a], AbortSignal.timeout(1000))
    const page = await connect(opened.url, 'a', new URL(opened.url).origin, true)
    viewer.endTask(opened.viewerId)
    advance(310_000)
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(viewer.active).toBe(true)
    expect(sinks.size).toBe(0)
    expect(await viewer.status(opened.viewerId, 'task')).toMatchObject({ viewerId: opened.viewerId })
    page.socket.destroy()
    await vi.waitFor(() => expect(viewer.active).toBe(false))
  })

  it('accepts native Origin-less receipts only with a live visible-frame challenge', async () => {
    const { viewer, sinks, advance } = setup()
    const opened = await viewer.open('task', [a], AbortSignal.timeout(1000))
    const page = await connect(opened.url)
    const challenge = page.messages.filter(m => m.type === 'connection').at(-1)!
    const body = { connectionId: challenge.connectionId, challenge: challenge.challenge, deviceId: 'a', visible: true }
    const post = (extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => fetch(opened.url + 'frame', {
      method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'empty', ...headers },
      body: JSON.stringify({ ...body, ...extra }),
    })
    expect((await post()).status).toBe(403)
    viewer.allowNativeEmbedding(opened.viewerId, 'task', 'http://127.0.0.1:34567')
    expect((await post()).status).toBe(409)
    sinks.get('a')!.sendBinary(Buffer.from([2, 0]))
    for (const headers of [
      { origin: 'null' }, { origin: 'https://example.com' },
      { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-dest': 'iframe' }, { 'content-type': 'text/plain' },
    ] as Record<string, string>[]) expect((await post({}, headers)).status).toBe(403)
    expect((await post({ visible: false })).status).toBe(409)
    expect((await post({ challenge: 'forged' })).status).toBe(409)
    expect((await post({ deviceId: 'b' })).status).toBe(409)
    expect(() => viewer.assertReady(opened.viewerId)).toThrow('waiting_for_frame')
    expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(409)
    expect(() => viewer.assertReady(opened.viewerId)).not.toThrow()
    advance(30_001)
    expect((await post()).status).toBe(409)
  })

  it('requires a viewer, does not grant readiness by opening, and freezes task devices', async () => {
    const { viewer } = setup()
    expect(() => viewer.find('task', [a])).toThrow('display_required')
    const opened = await viewer.open('task', [a], AbortSignal.timeout(1000))
    expect(opened.state).toBe('waiting_for_frame')
    expect(() => viewer.assertReady(opened.viewerId)).toThrow('waiting_for_frame')
    expect((await viewer.open('task', [a], AbortSignal.timeout(1000))).viewerId).toBe(opened.viewerId)
    await expect(viewer.open('task', [b], AbortSignal.timeout(1000))).rejects.toThrow('device_frozen')
    expect(() => viewer.find('other', [a], opened.viewerId)).toThrow('foreign_viewer')
  })

  it('rejects hidden, mismatched, stale and replayed receipts', async () => {
    const { viewer, sinks, advance } = setup()
    const opened = await viewer.open('task', [a], AbortSignal.timeout(1000))
    const page = await connect(opened.url)
    expect((await page.receipt()).status).toBe(409)
    sinks.get('a')!.sendBinary(Buffer.from([2, 0]))
    expect((await page.receipt({ visible: false })).status).toBe(409)
    expect((await page.receipt({ deviceId: 'b' })).status).toBe(409)
    expect((await page.receipt({ challenge: 'forged' })).status).toBe(409)
    advance(10_001)
    expect((await page.receipt()).status).toBe(409)
    expect(() => viewer.assertReady(opened.viewerId)).toThrow('waiting_for_frame')
    page.socket.destroy()
    const fresh = await connect(opened.url)
    sinks.get('a')!.sendBinary(Buffer.from([2, 0]))
    expect((await fresh.receipt()).status).toBe(200)
    expect((await fresh.receipt()).status).toBe(409)
    expect(() => viewer.assertReady(opened.viewerId)).not.toThrow()
  })

  it('waits for every selected device and keeps established control after page closure', async () => {
    const { viewer, sinks, release } = setup()
    const opened = await viewer.open('task', [a, b], AbortSignal.timeout(1000))
    const one = await connect(opened.url, 'a'), two = await connect(opened.url, 'b')
    sinks.get('a')!.sendBinary(Buffer.from([2])); await one.receipt()
    expect(() => viewer.assertReady(opened.viewerId)).toThrow()
    sinks.get('b')!.sendBinary(Buffer.from([2])); await two.receipt()
    expect(() => viewer.assertReady(opened.viewerId)).not.toThrow()
    one.socket.destroy(); two.socket.destroy()
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(2))
    expect(() => viewer.assertReady(opened.viewerId)).not.toThrow()
    viewer.closeViewer(opened.viewerId, 'task')
    expect(() => viewer.assertReady(opened.viewerId)).not.toThrow()
    expect((await viewer.open('task', [a, b], AbortSignal.timeout(1000))).viewerId).toBe(opened.viewerId)
  })

  it('does not inherit first-frame authorization when a new task starts', async () => {
    const { viewer, sinks } = setup()
    const old = await viewer.open('task', [a], AbortSignal.timeout(1000))
    const page = await connect(old.url); sinks.get('a')!.sendBinary(Buffer.from([2])); await page.receipt()
    viewer.endTask(old.viewerId)
    expect((await fetch(`${old.url}status`).then(r => r.json()) as {taskState: string}).taskState).toBe('ended')
    expect(page.socket.destroyed).toBe(false)
    const next = await viewer.open('task', [a], AbortSignal.timeout(1000))
    expect(next.viewerId).not.toBe(old.viewerId)
    expect(() => viewer.assertReady(next.viewerId)).toThrow()
    expect(() => viewer.find('task', [a], old.viewerId)).toThrow('display_required')
  })

  it('makes the deadline terminal across repeated opens and sessions', async () => {
    const { viewer, advance } = setup()
    const old = await viewer.open('task', [a], AbortSignal.timeout(1000)); advance(30_001)
    expect(await viewer.status(old.viewerId, 'task')).toMatchObject({ state: 'error', errorCode: 'display_timeout' })
    expect((await viewer.open('task', [a], AbortSignal.timeout(1000))).viewerId).toBe(old.viewerId)
    expect(() => viewer.find('task', [a])).toThrow('display_timeout')
    expect(() => viewer.assertReady(old.viewerId)).toThrow('display_timeout')
  })

  it('rejects cross-origin viewing, foreign devices and action routes', async () => {
    const { viewer } = setup()
    const opened = await viewer.open('task', [a], AbortSignal.timeout(1000))
    expect((await fetch(opened.url, { headers: { Origin: 'https://invalid.example' } })).status).toBe(403)
    await expect(connect(opened.url, 'b')).rejects.toThrow('403')
    await expect(connect(opened.url, 'a', 'https://invalid.example')).rejects.toThrow('403')
    expect((await fetch(`${opened.url}act`, { method: 'POST', headers: { Origin: new URL(opened.url).origin } })).status).toBe(404)
    expect((await fetch(opened.url)).headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(JSON.stringify(await viewer.status(opened.viewerId, 'task'))).not.toContain('private-a')
  })
})
