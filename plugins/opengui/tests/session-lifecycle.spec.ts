import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexOpenGuiService } from '../src/codex/service.ts'
import { SESSION_IDLE_MS } from '../src/state.ts'
import { wallPage } from '../src/wall-page.ts'
import { FakeHost } from './fixtures.ts'

const services: CodexOpenGuiService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.dispose())) })
const signal = () => new AbortController().signal
function create(host = new FakeHost(), now = Date.now, onSessionClosed?: (id: string) => Promise<void>) {
  const service = new CodexOpenGuiService({ host, now, onSessionClosed })
  services.push(service)
  return service
}
function wallUrl(page: string, route: string, deviceId = 'phone-a'): string {
  const url = new URL(page)
  url.pathname += 'api/' + route
  url.searchParams.set('deviceId', deviceId)
  return url.toString()
}

describe('isolated session lifecycle', () => {
  it('does not authorize another session with a device wall token', async () => {
    const service = create()
    const a = await service.openSession(['phone-a'], signal())
    const b = await service.openSession(['phone-b'], signal())
    const crossed = new URL(wallUrl(a.deviceWallUrl, 'status'))
    crossed.searchParams.set('sessionId', b.sessionId)
    expect((await fetch(crossed)).status).toBe(404)
    crossed.pathname = new URL(wallUrl(a.deviceWallUrl, 'preview')).pathname
    crossed.searchParams.set('deviceId', 'phone-b')
    expect((await fetch(crossed)).status).toBe(404)
    expect((await fetch(wallUrl(b.deviceWallUrl, 'status'))).status).toBe(200)
    expect((await fetch(a.deviceWallUrl)).headers.get('content-security-policy')).toContain("img-src 'self' blob:")
  })
  it('does not lock or release control resources for monitoring', async () => {
    const host = new FakeHost(), service = create(host)
    const monitor = await service.openSession(['phone-a'], signal(), 'observe')
    const control = await service.openSession(['phone-a'], signal())
    await expect(service.act(monitor.sessionId, undefined, { action: 'key', key: 'Home' }, signal())).rejects.toThrow('observe-only')
    await service.closeSession(monitor.sessionId)
    expect(host.released).toEqual([])
    await expect(service.observe(control.sessionId, undefined, signal())).resolves.toMatchObject({ deviceId: 'phone-a' })
  })

  it('holds the old device lock until asynchronous cleanup finishes', async () => {
    const host = new FakeHost(), service = create(host)
    let finish!: () => void
    host.releaseDevice = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const opened = await service.openSession(['phone-a'], signal())
    const cancel = service.cancel(opened.sessionId)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await expect(service.openSession(['phone-a'], signal())).rejects.toThrow('already locked')
    finish(); await cancel
    host.releaseDevice = async () => {}
    const next = await service.openSession(['phone-a'], signal())
    await service.closeSession(opened.sessionId)
    await expect(service.openSession(['phone-a'], signal())).rejects.toThrow('already locked')
    expect(next.state).toBe('active')
  })

  it('cancels the in-flight command and waits for it before unlocking', async () => {
    const host = new FakeHost(), service = create(host)
    host.observe = (_actor, abort) => new Promise((_resolve, reject) => {
      abort.addEventListener('abort', () => reject(abort.reason), { once: true })
    })
    const opened = await service.openSession(['phone-a'], signal())
    const pending = service.observe(opened.sessionId, undefined, signal())
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await service.cancel(opened.sessionId)
    await rejected
    expect(service.activeSessionCount).toBe(0)
  })

  it('does not renew the idle timeout through the device wall', async () => {
    let now = 1_000
    const removed = vi.fn(async () => {})
    const service = create(new FakeHost(), () => now, removed)
    const opened = await service.openSession(['phone-a'], signal())
    now += SESSION_IDLE_MS
    expect((await fetch(wallUrl(opened.deviceWallUrl, 'status'))).status).toBe(200)
    await service.expireIdleSessions()
    expect(service.listSessions()[0]?.state).toBe('cancelled')
    expect(removed).toHaveBeenCalledOnce()
  })

  it('renews idle sessions only through explicit session requests', async () => {
    let now = 0
    const service = create(new FakeHost(), () => now)
    const opened = await service.openSession(['phone-a'], signal())
    now = SESSION_IDLE_MS - 1
    await service.status(opened.sessionId, signal())
    now = SESSION_IDLE_MS + 1
    await service.expireIdleSessions()
    expect(service.activeSessionCount).toBe(1)
  })

  it('stops terminal wall captures and preserves the final metadata', async () => {
    const host = new FakeHost(), service = create(host)
    host.preview = vi.fn(host.preview)
    const opened = await service.openSession(['phone-a'], signal())
    expect((await fetch(wallUrl(opened.deviceWallUrl, 'preview'))).status).toBe(200)
    await service.cancel(opened.sessionId)
    expect((await fetch(wallUrl(opened.deviceWallUrl, 'preview'))).status).toBe(400)
    expect(host.preview).toHaveBeenCalledOnce()
    expect(await (await fetch(wallUrl(opened.deviceWallUrl, 'status'))).json()).toMatchObject({ state: 'cancelled' })
  })

  it('requires a wall token and rejects writes', async () => {
    const service = create(), opened = await service.openSession(['phone-a'], signal())
    const url = new URL(opened.deviceWallUrl)
    expect((await fetch(url.origin + '/api/status')).status).toBe(404)
    expect((await fetch(wallUrl(opened.deviceWallUrl, 'status'), { method: 'POST' })).status).toBe(404)
    const response = await fetch(opened.deviceWallUrl)
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  })

  it('does not interpolate script-breaking session identifiers', () => {
    const page = wallPage('</script><script>alert(1)</script>')
    expect(page.split('<script>').length).toBe(2)
    const js = page.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(js).toBeTruthy()
    expect(() => new Function(js!)).not.toThrow()
  })
})
