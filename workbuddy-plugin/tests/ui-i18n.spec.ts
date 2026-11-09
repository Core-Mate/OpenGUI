import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { normalizeUiLocale, translateUi } from '../src/ui-i18n.ts'
import { englishMessages } from '../src/ui-messages.ts'
import { connectionHint } from '../src/connection-status.ts'
import { viewerPage } from '../src/viewer-page.ts'
import { formatUiEnvironment, formatUiProgress, formatUiTrace } from '../src/ui-formatters.ts'

describe('workbench interface languages', () => {
  it('normalizes browser languages with a deterministic English fallback', () => {
    for (const language of ['zh', 'zh-CN', 'zh-TW', 'zh_HK']) expect(normalizeUiLocale(language)).toBe('zh-CN')
    for (const language of ['en-US', 'en', 'fr-FR', '', undefined, null]) expect(normalizeUiLocale(language)).toBe('en')
  })

  it('translates named values safely and preserves unknown content', () => {
    expect(translateUi('间隔截图 · 更新于 {time}', 'en', { time: '$& <script>' })).toBe('Periodic screenshot · Updated at $& <script>')
    expect(translateUi('间隔截图 · 更新于 {time}', 'zh-CN', { time: '12:30' })).toBe('间隔截图 · 更新于 12:30')
    expect(translateUi('间隔截图 · 更新于 {time}', 'en')).toContain('{time}')
    for (const text of ['__proto__', 'constructor', 'My task 我的任务', '<b>user content</b>']) expect(translateUi(text, 'en')).toBe(text)
  })

  it('covers explicit UI message keys and preserves placeholder names in English', () => {
    const keys = new Set<string>()
    for (const name of ['workbench-page.ts', 'viewer-page.ts', 'connection-status.ts', 'ui-formatters.ts']) {
      const source = readFileSync(new URL('../src/' + name, import.meta.url), 'utf8')
      for (const match of source.matchAll(/\bt\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gu)) {
        const quoted = match[1]!
        const text = quoted.startsWith('"') ? JSON.parse(quoted) as string : quoted.slice(1, -1)
        if (/\p{Script=Han}/u.test(text)) keys.add(text)
      }
      for (const match of source.matchAll(/data-i18n(?:-(?:title|aria-label|placeholder))?="([^"]+)"/gu)) keys.add(match[1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
    }
    for (const key of keys) expect(Object.hasOwn(englishMessages, key), key).toBe(true)
    for (const [key, translation] of Object.entries(englishMessages)) {
      expect(translation.trim(), key).not.toBe('')
      expect([...translation.matchAll(/\{(\w+)\}/gu)].map(m => m[1]).sort(), key).toEqual([...key.matchAll(/\{(\w+)\}/gu)].map(m => m[1]).sort())
    }
  })

  it('localizes connection warnings before concatenation without changing backend defaults', () => {
    const device = { os: 'android', connection: 'usb', selectionStatus: 'interrupted' } as const
    expect(connectionHint(device).label).toBe('连接中断')
    const english = connectionHint(device, undefined, source => translateUi(source, 'en'))
    expect(english.label).toBe('Connection lost')
    expect(english.detail).toContain('USB')
    expect(english.detail).not.toMatch(/\p{Script=Han}/u)
  })

  it('localizes runtime metadata while preserving user steps, targets and unknown labels', () => {
    const t = (key: string, values?: Record<string, string | number>) => translateUi(key, 'en', values)
    const progress = { completed: 1, total: 3, inProgress: 1, pending: 1, currentNode: '用户步骤', message: '原始进度' }
    expect(formatUiProgress(progress, 'en', t)).toBe('Completed 1 / 3 · In progress: 用户步骤')
    expect(formatUiProgress(progress, 'zh-CN', t)).toBe('原始进度')
    expect(formatUiTrace('点击「用户目标」', 'tap', 'en', t)).toBe('Tap 「用户目标」')
    expect(formatUiTrace('查看 小红书 画面', 'observe', 'en', t)).toBe('Read 小红书 screen')
    expect(formatUiTrace('在「搜索框」输入文本（12 字）', 'text', 'en', t)).toBe('Enter text 「搜索框」 (12 characters)')
    expect(formatUiTrace('用户自己的说明', 'tap', 'en', t)).toBe('用户自己的说明')
    expect(formatUiEnvironment('SDK 34；要求 SDK ≥ 21', t)).toBe('SDK 34; requires SDK ≥ 21')
    expect(formatUiEnvironment('实际 1.2；要求 1.3', t)).toBe('Actual 1.2; required 1.3')
    expect(formatUiEnvironment('权限 android.permission.CAMERA', t)).toBe('Permission android.permission.CAMERA')
  })

  it('embeds self-contained scripts and an accessible language selector', () => {
    const html = viewerPage()
    expect(html).toContain('id="ui-language" aria-label="Language / 语言"')
    expect(html).toContain('<option value="auto" data-i18n="跟随 WorkBuddy">跟随 WorkBuddy</option>')
    expect(html).toContain('<option value="zh-CN">中文</option><option value="en">English</option>')
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)]
    expect(scripts.length).toBe(4)
    for (const script of scripts) expect(() => new Script(script[1]!)).not.toThrow()
  })
})
