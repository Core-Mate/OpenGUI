import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'
import { page } from '../src/wall.ts'
import { get } from 'node:http'

const services: WorkBuddyOpenGuiService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.dispose())) })

async function setup() {
  const host = new FakeHost()
  host.preview = vi.fn(host.preview)
  const service = new WorkBuddyOpenGuiService({ host })
  services.push(service)
  const a = await service.openSession(['phone-a'], AbortSignal.timeout(5000))
  const b = await service.openSession(['phone-b'], AbortSignal.timeout(5000))
  return { a, b, host, service }
}

function api(url: string, path: string) {
  const target = new URL(url)
  target.pathname += `api/${path}`
  return target
}

describe('private device wall', () => {
  it('serves a read-only page with security headers and no embedded session interpolation', async () => {
    const { a } = await setup()
    const response = await fetch(a.deviceWallUrl)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await response.text()).toContain('只读预览')
    expect(page()).not.toContain(a.sessionId)
  })

  it('requires a separate token for each session', async () => {
    const { a, b } = await setup()
    const target = api(a.deviceWallUrl, 'status')
    target.searchParams.set('sessionId', b.sessionId)
    expect((await fetch(target)).status).toBe(404)
    target.pathname = '/invalid/api/status'
    expect((await fetch(target)).status).toBe(404)
  })

  it('rejects cross-origin requests, rebinding hosts, and writes', async () => {
    const { a } = await setup()
    expect((await fetch(a.deviceWallUrl, { headers: { Origin: 'https://attacker.example' } })).status).toBe(403)
    const rebound = await new Promise<number | undefined>((resolve, reject) => {
      get(a.deviceWallUrl, { headers: { Host: 'attacker.example' } }, response => {
        response.resume()
        resolve(response.statusCode)
      }).once('error', reject)
    })
    expect(rebound).toBe(403)
    expect((await fetch(a.deviceWallUrl, { method: 'POST' })).status).toBe(405)
  })

  it('never reads a phone frame after its session has ended', async () => {
    const { a, service, host } = await setup()
    const target = api(a.deviceWallUrl, 'preview')
    target.searchParams.set('deviceId', 'phone-a')
    expect((await fetch(target)).status).toBe(200)
    await service.closeSession(a.sessionId)
    expect((await fetch(target)).status).toBe(400)
    expect(host.preview).toHaveBeenCalledTimes(1)
    expect((await fetch(api(a.deviceWallUrl, 'status'))).status).toBe(200)
  })
})
