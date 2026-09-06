import { describe, expect, it } from 'vitest'
import { request as httpRequest } from 'node:http'
import { ConfirmationServer } from '../src/confirmation.ts'

const action = { deviceId: 'a', sessionId: 's', observationId: 'frame-1', action: 'key', key: 'Enter', externalSideEffect: 'send' }
async function decide(url: string, choice: string, origin = new URL(url).origin): Promise<Response> {
  const html = await (await fetch(url)).text()
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1] ?? ''
  return fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, decision: choice }) })
}
describe('local one-action confirmation', () => {
  it('rejects malformed absolute request targets without crashing the approval server', async () => {
    const server = new ConfirmationServer()
    try {
      const approval = await server.request('s', action, Buffer.from('jpeg'))
      const url = new URL(approval.confirmationUrl)
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = httpRequest({ hostname: url.hostname, port: url.port, path: 'http://[', timeout: 1000 }, res => {
          res.resume()
          res.on('end', () => resolve(res.statusCode))
        })
        req.on('error', reject)
        req.on('timeout', () => req.destroy(new Error('Malformed request was not rejected')))
        req.end()
      })
      expect(status).toBe(400)
      expect((await fetch(approval.confirmationUrl)).status).toBe(200)
    } finally { await server.close() }
  })
  it('requires a human approval and consumes it exactly once', async () => {
    const server = new ConfirmationServer()
    try {
      const request = await server.request('s', action, Buffer.from('jpeg'))
      expect(() => server.consume(request.requestId, 's', action)).toThrow('not approved')
      const page = await fetch(request.confirmationUrl)
      expect(page.headers.get('cache-control')).toBe('no-store')
      expect(page.headers.get('referrer-policy')).toBe('strict-origin')
      expect(await page.text()).toContain('frame-1')
      expect((await decide(request.confirmationUrl, 'approve')).status).toBe(200)
      expect(() => server.consume(request.requestId, 'other', action)).toThrow()
      expect(() => server.consume(request.requestId, 's', { ...action, key: 'Home' })).toThrow()
      server.consume(request.requestId, 's', action)
      expect(() => server.consume(request.requestId, 's', action)).toThrow()
      expect((await fetch(request.confirmationUrl)).status).toBe(404)
    } finally { await server.close() }
  })
  it('rejects cross-origin posts, missing CSRF and unrelated capabilities', async () => {
    const server = new ConfirmationServer()
    try {
      const request = await server.request('s', action, Buffer.from('jpeg'))
      expect((await decide(request.confirmationUrl, 'approve', 'https://evil.test')).status).toBe(403)
      expect((await decide(request.confirmationUrl, 'approve', 'null')).status).toBe(403)
      expect((await fetch(request.confirmationUrl, { method: 'POST', headers: { Origin: new URL(request.confirmationUrl).origin }, body: 'decision=approve' })).status).toBe(403)
      expect((await fetch(`${new URL(request.confirmationUrl).origin}/wall-token`)).status).toBe(404)
      expect(() => server.consume(request.requestId, 's', action)).toThrow()
    } finally { await server.close() }
  })
  it('invalidates rejected, cancelled, replaced and expired approvals', async () => {
    let now = 1000
    const server = new ConfirmationServer(() => now)
    try {
      const rejected = await server.request('s', action, Buffer.from('jpeg'))
      await decide(rejected.confirmationUrl, 'reject')
      expect(() => server.consume(rejected.requestId, 's', action)).toThrow()
      const cancelled = await server.request('s', action, Buffer.from('jpeg'))
      server.invalidate('s')
      expect((await fetch(cancelled.confirmationUrl)).status).toBe(404)
      const expired = await server.request('s', action, Buffer.from('jpeg'))
      now += 300_001
      expect((await fetch(expired.confirmationUrl)).status).toBe(410)
      expect(() => server.consume(expired.requestId, 's', action)).toThrow()
    } finally { await server.close() }
  })
})
