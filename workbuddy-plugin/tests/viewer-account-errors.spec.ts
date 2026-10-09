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
  const paths: string[] = []
  const client = new CoreMateClient(directory, (async (url: string) => {
    paths.push(url)
    if (url.endsWith('/verify-otp')) return Response.json({ token: 'fixture-session', user: { id: 42 } })
    if (status === 'network') throw new Error('private-provider-detail-and-token')
    return new Response('{}', { status })
  }) as typeof fetch)
  client.configure('https://backend.example.test')
  await client.login('13800001234', '123456')
  const { viewer } = setup(client)
  const opened = await viewer.open('catalog-check', [], AbortSignal.timeout(1000))
  const response = await fetch(`${opened.url}models`)
  return { response, body: await response.json(), client, paths }
}

describe('retired model catalog route', () => {
  it.each([404, 401, 'network'] as const)('stays local and preserves login when the old model service is unavailable (%s)', async status => {
    const result = await catalog(status)
    expect(result.response.status).toBe(200)
    expect(result.body).toEqual({ models: [] })
    expect(result.client.status().user?.id).toBe('42')
    expect(result.paths).toEqual(['https://backend.example.test/api/user-auth/verify-otp'])
  })
})
