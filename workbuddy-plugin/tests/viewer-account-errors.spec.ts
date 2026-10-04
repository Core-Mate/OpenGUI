import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CoreMateClient } from '../src/coremate-client.ts'
import { setup } from './viewer-fixture.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

async function catalog(status: number | 'network') {
  const directory = mkdtempSync(join(tmpdir(), 'opengui-viewer-account-'))
  directories.push(directory)
  const client = new CoreMateClient(directory, (async (url: string) => {
    if (url.endsWith('/verify-otp')) return Response.json({ token: 'fixture-session', user: { id: 42 } })
    if (status === 'network') throw new Error('private-provider-detail-and-token')
    return new Response('{}', { status })
  }) as typeof fetch)
  client.configure('https://backend.example.test')
  await client.login('13800001234', '123456')
  const { viewer } = setup(client)
  const opened = await viewer.open('catalog-check', [], AbortSignal.timeout(1000))
  const response = await fetch(`${opened.url}models`)
  return { response, body: await response.json(), client }
}

describe('model catalog failure guidance', () => {
  it('distinguishes a missing model route from a valid login session', async () => {
    const result = await catalog(404)
    expect(result.response.status).toBe(503)
    expect(result.body.error).toContain('模型配置接口不存在（HTTP 404）')
    expect(result.body.error).toContain('跟随 WorkBuddy')
    expect(result.client.status().user).not.toBeNull()
  })

  it('requests login again only when the service rejects the session', async () => {
    const result = await catalog(401)
    expect(result.response.status).toBe(401)
    expect(result.body.error).toContain('登录已过期')
    expect(result.client.status().user).toBeNull()
  })

  it('keeps unknown network details out of the rendered error', async () => {
    const result = await catalog('network')
    expect(result.response.status).toBe(503)
    expect(result.body.error).toContain('网络')
    expect(JSON.stringify(result.body)).not.toContain('private-provider-detail')
    expect(result.client.status().user).not.toBeNull()
  })
})
