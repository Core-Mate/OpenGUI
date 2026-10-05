import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { nativeEndpoint } from '../src/native-endpoint.ts'
import { startHttpMcp } from '../src/mcp-http.ts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function root() { const path = await mkdtemp(join(tmpdir(), 'opengui-native-')); roots.push(path); return path }

it('retains authentication and URL after a server restart without taking over an occupied port', async () => {
  const state = await root()
  const config = await nativeEndpoint(state)
  const first = await startHttpMcp(config)
  try {
    await expect(startHttpMcp(config)).rejects.toMatchObject({ code: 'EADDRINUSE' })
    expect((await fetch(first.url)).status).toBe(401)
  } finally { await first.close() }
  const next = await nativeEndpoint(state)
  expect(next).toEqual(config)
  const second = await startHttpMcp(next)
  try {
    expect(second.url).toBe(first.url)
    expect((await fetch(second.url, { headers: { authorization: 'Bearer ' + next.token, 'mcp-session-id': 'old-session' } })).status).toBe(404)
  } finally { await second.close() }
})

it('keeps host state directories isolated', async () => {
  const a = await nativeEndpoint(await root())
  const b = await nativeEndpoint(await root())
  expect(a.token).not.toBe(b.token)
})

it('refuses redirected, exposed, or malformed endpoint state without rewriting it', async () => {
  const state = await root()
  const file = join(state, 'native-mcp.json')
  const outside = join(await root(), 'other.json')
  await writeFile(outside, 'private', { mode: 0o600 })
  await symlink(outside, file)
  await expect(nativeEndpoint(state)).rejects.toThrow()
  expect(await readFile(outside, 'utf8')).toBe('private')
  await rm(file)
  await nativeEndpoint(state)
  const original = await readFile(file, 'utf8')
  await chmod(file, 0o644)
  await expect(nativeEndpoint(state)).rejects.toThrow('permissions')
  expect(await readFile(file, 'utf8')).toBe(original)
  await chmod(file, 0o600)
  await writeFile(file, '{"version":2}')
  await expect(nativeEndpoint(state)).rejects.toThrow('configuration')
  expect(await readFile(file, 'utf8')).toBe('{"version":2}')
})
