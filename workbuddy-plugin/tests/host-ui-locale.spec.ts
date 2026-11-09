import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hostUiContext, parseHostUiContext, readHostUiLocale } from '../src/host-ui-locale.ts'
import { startBroker } from '../src/broker.ts'
import { BrokerClient } from '../src/broker-client.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { VERSION } from '../src/state.ts'
import { FakeHost } from './fake-host.ts'

const cleanups: Array<() => unknown> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
async function host(locale: string) {
  const root = await mkdtemp(join(tmpdir(), 'opengui-host-locale-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'app'))
  const path = join(root, 'app', 'app-config.json')
  await writeFile(path, JSON.stringify({ locale, unrelatedPrivateSetting: 'not-for-browser' }))
  return { root, path }
}

describe('native host display language', () => {
  it('resolves the selected configuration root without mistaking the OS locale for the display preference', () => {
    expect(hostUiContext({ OPENGUI_HOST_CONFIG_DIR: '/selected', WORKBUDDY_CONFIG_DIR: '/inherited', WORKBUDDY_MENU_LOCALE: 'en-US', WORKBUDDY_LOCALE: 'zh-CN' })).toEqual({ configDir: '/selected', locale: 'en-US' })
    expect(hostUiContext({ WORKBUDDY_CONFIG_DIR: '/host' })).toEqual({ configDir: '/host' })
    expect(hostUiContext({ CODEBUDDY_CONFIG_DIR: '/legacy-host' })).toEqual({ configDir: '/legacy-host' })
    expect(hostUiContext({ LANG: 'zh_CN.UTF-8', WORKBUDDY_LOCALE: 'zh-CN' })).toEqual({})
    expect(parseHostUiContext({ configDir: 'relative/path', locale: '<script>' })).toEqual({})
  })

  it('follows live settings and gracefully handles missing, malformed and oversized configuration', async () => {
    const { root, path } = await host('en-US'), context = { configDir: root, locale: 'zh-CN' }
    expect(readHostUiLocale(context)).toBe('en')
    await writeFile(path, JSON.stringify({ locale: 'zh-TW' })); expect(readHostUiLocale(context)).toBe('zh-CN')
    await writeFile(path, JSON.stringify({ locale: 'pt-BR' })); expect(readHostUiLocale(context)).toBe('en')
    for (const contents of ['{', 'null', '{"locale":42}', ' '.repeat(256 * 1024 + 1)]) {
      await writeFile(path, contents); expect(readHostUiLocale(context)).toBe('zh-CN')
      expect(readHostUiLocale({ configDir: root })).toBeUndefined()
    }
    await rm(path); expect(readHostUiLocale(context)).toBe('zh-CN')
    expect(readHostUiLocale({})).toBeUndefined()
  })

  it('keeps China and international pages independent through one shared broker and exposes only the locale', async () => {
    const cn = await host('zh-CN'), international = await host('en-US')
    const service = new WorkBuddyOpenGuiService({ host: new FakeHost() })
    const broker = await startBroker({ port: 0, token: 'locale-qa', service })
    cleanups.push(broker.close)
    const first = await BrokerClient.connect(broker.port, 'locale-qa', VERSION, 'mcp', { configDir: cn.root })
    cleanups.push(() => first.close())
    const second = await BrokerClient.connect(broker.port, 'locale-qa', VERSION, 'mcp', { configDir: international.root })
    cleanups.push(() => second.close())
    const open = async (client: BrokerClient) => client.call('opengui_open_guide', {}, AbortSignal.timeout(5000)) as Promise<{ url: string }>
    const a = await open(first), b = await open(second)
    const status = async (url: string) => fetch(url + 'status').then(r => r.json()) as Promise<Record<string, unknown>>
    expect(await status(a.url)).toMatchObject({ uiLocale: 'zh-CN' })
    expect(await status(b.url)).toMatchObject({ uiLocale: 'en' })
    expect(await fetch(a.url).then(r => r.text())).toContain('let hostLocale = "zh-CN";')
    const html = await fetch(b.url).then(r => r.text())
    expect(html).toContain('let hostLocale = "en";')
    expect(html).not.toContain(international.root)
    expect(JSON.stringify(await status(b.url))).not.toMatch(/not-for-browser|app-config|opengui-host-locale-/u)
    await writeFile(join(international.root, 'app', 'app-config.json'), '{"locale":"zh-CN"}')
    expect(await status(b.url)).toMatchObject({ uiLocale: 'zh-CN' })
    await writeFile(cn.path, '{"locale":"en-US"}')
    expect(await status(a.url)).toMatchObject({ uiLocale: 'en' })
    expect(await status(b.url)).toMatchObject({ uiLocale: 'zh-CN' })
  })
})
