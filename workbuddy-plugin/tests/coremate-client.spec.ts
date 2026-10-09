import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { CoreMateClient } from '../src/coremate-client.ts'
import { setup, a } from './viewer-fixture.ts'

const resources: Array<() => Promise<void> | void> = []
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })
const catalogEntry = (overrides: Record<string, unknown> = {}) => ({ id: 63, agentName: 'gui-agent-core', phoneModelKind: 'text', configName: 'Configured model', modelName: 'fixture-vlm', baseUrl: 'https://provider.example/v1', hasApiKey: true, apiKey: null, isActive: true, updatedAt: '2026-09-16T11:53:56.433Z', systemPrompt: 'never-project', extra: { guiAgentCoreApi: 'openai-completions', guiAgentCoreReasoningEffort: 'low' }, ...overrides })
async function fixture() {
  const calls: Array<{ path: string; authorization: string | undefined; body: Record<string, unknown> }> = []
  let published = false, valid = true, userId = 42
  const model = { id: '63', name: 'Configured model', model: 'fixture-vlm', protocol: 'openai_chat' as const, revision: '2026-09-16T11:53:56.433Z', recommended: true, reasoningEffort: 'low' as const }
  const server: Server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk)
    calls.push({ path: req.url!, authorization: req.headers.authorization, body: body ? JSON.parse(body) : {} })
    res.setHeader('content-type', 'application/json')
    if (req.url!.endsWith('verify-otp')) { res.end(JSON.stringify({ token: 'fixture-user-session', user: { id: userId, name: 'QA', phoneNumber: '13800001234' } })); return }
    if (req.url!.endsWith('send-otp')) { res.end('{"success":true}'); return }
    if (!valid || req.headers.authorization !== 'Bearer fixture-user-session') { res.writeHead(401).end('{"message":"Unauthorized","statusCode":401}'); return }
    if (req.url === '/api/agent-config/runtime/desktop-text-models') { res.end(JSON.stringify({ success: true, data: published ? [catalogEntry()] : [] })); return }
    if (req.url!.startsWith('/api/agent-config/runtime/proxy/')) { res.end('{"choices":[{"message":{"content":"Observed result"}}]}'); return }
    if (req.url!.endsWith('/session')) { res.end('{"user":{"id":42,"phoneNumber":"13800001234"}}'); return }
    res.end('{"success":true}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  resources.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const address = server.address() as { port: number }, directory = mkdtempSync(join(tmpdir(), 'opengui-account-'))
  resources.push(() => rmSync(directory, { recursive: true, force: true }))
  const client = new CoreMateClient(directory); client.configure(`http://127.0.0.1:${address.port}`)
  return { client, calls, model, directory, publish: () => { published = true }, unpublish: () => { published = false }, expire: () => { valid = false }, switchUser: (id: number) => { userId = id } }
}

describe('unified account and configured models', () => {
  it('uses the existing backend user authentication routes without an admin adapter', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-existing-auth-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    const paths: string[] = []
    const client = new CoreMateClient(directory, (async (url: string) => {
      const path = new URL(url).pathname; paths.push(path)
      if (!path.startsWith('/api/user-auth/')) return new Response('<!DOCTYPE html>404', { status: 404 })
      return Response.json({ token: 'fixture-session', user: { id: 42 }, success: true })
    }) as typeof fetch)
    client.configure('https://backend.example.test/api/')
    await client.sendOtp('13800001234'); await client.login('13800001234', '123456'); await client.session(); await client.logout()
    expect(paths).toEqual(['/api/user-auth/send-otp', '/api/user-auth/verify-otp', '/api/user-auth/session', '/api/user-auth/sign-out'])
    expect(client.status().user).toBeNull()
  })
  it('routes inference through the backend proxy by admin configuration ID and rejects other identifiers', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-role-catalog-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    const paths: string[] = [], bodies: Record<string, unknown>[] = []
    const client = new CoreMateClient(directory, (async (url: string, init?: RequestInit) => {
      paths.push(url); if (init?.body) bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify(url.endsWith('/desktop-text-models') ? { success: true, data: [catalogEntry(), catalogEntry({ id: 65, configName: 'Responses model', isActive: false, extra: { guiAgentCoreApi: 'openai-responses' } })] }
        : { token: 'fixture-session', user: { id: 42 }, choices: [] }))
    }) as typeof fetch)
    client.configure('http://127.0.0.1:1'); await client.login('13800001234', '123456')
    const [chat, responses] = await client.models()
    expect([chat?.id, responses?.id, responses?.protocol, responses?.recommended]).toEqual(['63', '65', 'openai_responses', undefined])
    await client.infer(chat!, { messages: [], stream: true }, AbortSignal.timeout(1000))
    expect(paths.at(-1)).toContain('/api/agent-config/runtime/proxy/63/v1/chat/completions')
    expect(bodies.at(-1)).toMatchObject({ stream: false, reasoning_effort: 'low' })
    await client.infer(responses!, {}, AbortSignal.timeout(1000))
    expect(paths.at(-1)).toContain('/api/agent-config/runtime/proxy/65/v1/responses')
    expect(bodies.at(-1)).not.toHaveProperty('reasoning_effort')
    const count = paths.length
    for (const id of ['phone', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0', '../63']) await expect(client.infer({ ...chat!, id }, {}, AbortSignal.timeout(1000))).rejects.toThrow('model_not_configured')
    expect(paths).toHaveLength(count)
  })
  it('keeps the session when the model provider behind the proxy rejects a request', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-upstream-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    const client = new CoreMateClient(directory, (async (url: string) => url.includes('/proxy/')
      ? new Response('{"error":{"message":"invalid provider key"}}', { status: 401 })
      : new Response(JSON.stringify({ token: 'fixture-session', user: { id: 42 } }))) as typeof fetch)
    client.configure('http://127.0.0.1:1'); await client.login('13800001234', '123456')
    const model = { id: '63', name: 'Configured model', model: 'fixture-vlm', protocol: 'openai_chat' as const, revision: '' }
    await expect(client.infer(model, {}, AbortSignal.timeout(1000))).rejects.toThrow('model_upstream_error: HTTP 401')
    expect(client.status().user?.id).toBe('42')
  })
  it('does not clear a newer login when an older catalog request returns unauthorized', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-account-race-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    let reply!: (response: Response) => void, userId = 1
    const client = new CoreMateClient(directory, (async (url: string) => url.endsWith('/desktop-text-models') ? new Promise<Response>(resolve => { reply = resolve })
      : new Response(JSON.stringify({ token: `fixture-token-${userId}`, user: { id: userId++ } }))) as typeof fetch)
    client.configure('http://127.0.0.1:1'); await client.login('13800001234', '123456')
    const stale = client.models(), rejected = expect(stale).rejects.toThrow('login_required')
    await client.login('13800001234', '123456'); reply(new Response('{"message":"Unauthorized","statusCode":401}', { status: 401 })); await rejected
    expect(client.status().user?.id).toBe('2')
  })
  it('lists only usable phone text models from the admin Agent config and never projects provider secrets', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-runtime-catalog-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    let data: unknown[] = []
    const client = new CoreMateClient(directory, (async (url: string) => url.endsWith('/desktop-text-models')
      ? Response.json({ success: true, data }) : Response.json({ token: 'fixture-session', user: { id: 42 } })) as typeof fetch)
    client.configure('https://backend.example.test'); await client.login('13800001234', '123456')
    data = [
      catalogEntry(),
      catalogEntry({ id: 64, configName: '', modelName: 'qwen3.6-plus', isActive: false }),
      catalogEntry({ id: 70, hasApiKey: false }),
      catalogEntry({ id: 71, phoneModelKind: 'image' }),
      catalogEntry({ id: 72, agentName: 'executor-vlm' }),
      catalogEntry({ id: 73, baseUrl: '' }),
      catalogEntry({ id: -1 }),
    ]
    const models = await client.models()
    expect(models).toEqual([
      { id: '63', name: 'Configured model', model: 'fixture-vlm', protocol: 'openai_chat', revision: '2026-09-16T11:53:56.433Z', recommended: true, reasoningEffort: 'low' },
      { id: '64', name: 'qwen3.6-plus', model: 'qwen3.6-plus', protocol: 'openai_chat', revision: '2026-09-16T11:53:56.433Z', reasoningEffort: 'low' },
    ])
    expect(JSON.stringify(models)).not.toContain('never-project')
    expect(JSON.stringify(models)).not.toContain('provider.example')
    data = []; expect(await client.models()).toEqual([])
  })
  it('restores a preference saved by display name from older builds', async () => {
    const f = await fixture(); await f.client.login('13800001234', '123456'); f.publish(); f.client.selectModel('Configured model')
    expect(await f.client.selectedModel(AbortSignal.timeout(1000))).toEqual(f.model)
  })
  it('distinguishes a missing authentication route from a wrong code without retaining a session', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-auth-missing-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    let status = 404
    const client = new CoreMateClient(directory, (async () => new Response(status === 404 ? '<!DOCTYPE html>404' : '{}', { status })) as typeof fetch)
    client.configure('https://backend.example.test')
    await expect(client.login('13800001234', '123456')).rejects.toThrow('service_route_unavailable: auth')
    status = 401
    await expect(client.login('13800001234', '123456')).rejects.toThrow('invalid_login_code')
    expect(client.status().user).toBeNull()
  })
  it('opens a usable workbench when the preferred model is removed and requires an explicit fallback decision', async () => {
    const f = await fixture(); await f.client.login('13800001234', '123456'); f.publish(); f.client.selectModel(f.model.id); f.unpublish()
    const { viewer } = setup(f.client), display = await viewer.open('task', [a], AbortSignal.timeout(1000))
    expect(display.modelSelectionError).toBeDefined()
    expect(() => viewer.find('task', [a])).toThrow('model_selection_required')
    // The pending model choice is a deliberate wait: host stop hooks must keep the task.
    viewer.board(display.viewerId).objective = 'Check the login page'
    expect(viewer.awaitingDeviceTask(display.viewerId)).toBe(true)
    const response = await fetch(`${display.url}board`, { method: 'POST', headers: { Origin: new URL(display.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(display.workbenchUrl).hash.slice(7) }, body: JSON.stringify({ action: 'model', modelId: 'host' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).modelSelectionError).toBeUndefined()
    expect(viewer.awaitingDeviceTask(display.viewerId)).toBe(false)
    expect(viewer.find('task', [a])).toBe(display.viewerId)
    expect(await f.client.selectedModel(AbortSignal.timeout(1000))).toBeUndefined()
  })
  it('uses the existing user login, persists only a private session and projects configured model metadata', async () => {
    const f = await fixture()
    expect(await f.client.models()).toEqual([])
    await f.client.sendOtp('13800001234'); await f.client.login('13800001234', '123456')
    expect(f.client.status().user?.phone).toBe('138****1234')
    expect(JSON.stringify(f.client.status())).not.toContain('fixture-user-session')
    expect(await f.client.models()).toEqual([])
    f.publish(); expect(await f.client.models()).toEqual([f.model])
    f.client.selectModel(f.model.id)
    expect(await f.client.selectedModel(AbortSignal.timeout(1000))).toEqual(f.model)
    expect((await f.client.infer(f.model, { messages: [], stream: true }, AbortSignal.timeout(1000))).choices[0].message.content).toBe('Observed result')
    expect(f.calls.at(-1)).toMatchObject({ path: '/api/agent-config/runtime/proxy/63/v1/chat/completions', authorization: 'Bearer fixture-user-session', body: { stream: false, reasoning_effort: 'low' } })
    const restarted = new CoreMateClient(f.directory)
    expect(restarted.scope).toBe(f.client.scope)
    expect(readFileSync(join(f.directory, 'account.json'), 'utf8')).not.toContain('13800001234')
    if (process.platform !== 'win32') expect(statSync(join(f.directory, 'account.json')).mode & 0o077).toBe(0)
    await restarted.logout(); expect(restarted.status().user).toBeNull()
    expect(await restarted.selectedModel(AbortSignal.timeout(1000))).toBeUndefined()
    await restarted.login('13800001234', '123456')
    expect(await restarted.selectedModel(AbortSignal.timeout(1000))).toEqual(f.model)
    await restarted.logout(); f.switchUser(43); await restarted.login('13800001234', '123456')
    expect(await restarted.selectedModel(AbortSignal.timeout(1000))).toBeUndefined()
    await restarted.logout(); f.switchUser(42); await restarted.login('13800001234', '123456')
    expect(await restarted.selectedModel(AbortSignal.timeout(1000))).toEqual(f.model)
  })
  it('clears expired sessions and rejects unsafe service URLs before network requests', async () => {
    const f = await fixture()
    expect(() => f.client.configure('https://user:secret@example.test')).toThrow('invalid_service_url')
    expect(() => f.client.configure('http://remote.example.test')).toThrow('invalid_service_url')
    await expect(f.client.sendOtp('not-a-phone')).rejects.toThrow('invalid_phone_number')
    await f.client.login('13800001234', '123456'); f.expire()
    await expect(f.client.models()).rejects.toThrow('login_required')
    expect(f.client.status().user).toBeNull()
    expect(f.client.scope).toBe('local')
  })
  it('uses a release-bundled account service that users cannot change and resets sessions from other services', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-fixed-service-')); resources.push(() => rmSync(directory, { recursive: true, force: true }))
    const paths: string[] = []
    const request = (async (url: string) => { paths.push(url); return Response.json({ token: 'fixture-session', user: { id: 42, phoneNumber: '13800001234' } }) }) as typeof fetch
    const legacy = new CoreMateClient(directory, request, undefined); legacy.configure('https://admin.example.test'); await legacy.login('13800001234', '123456')
    const client = new CoreMateClient(directory, request, 'https://backend.example.test/')
    expect(client.status()).toMatchObject({ serviceUrl: 'https://backend.example.test', serviceFixed: true, user: null })
    expect(() => client.configure('https://other.example.test')).toThrow('service_fixed')
    client.configure('https://backend.example.test')
    await client.login('13800001234', '123456')
    expect(paths.at(-1)).toBe('https://backend.example.test/api/user-auth/verify-otp')
    expect(new CoreMateClient(directory, request, 'https://backend.example.test').status().user?.id).toBe('42')
  })
})
