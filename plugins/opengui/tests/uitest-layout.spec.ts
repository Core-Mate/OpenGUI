import { describe, expect, it } from 'vitest'
import { clipboardPermissionPending, parseUiTestLayout } from '../src/uitest-layout.ts'
import { scaleLayout } from '../src/device-driver.ts'
import { layout } from './harmony-fixtures.ts'

describe('UiTest observation parsing', () => {
  it('tracks launcher content changes while ignoring clock descendants', () => {
    const desktop = (app: string, clock: string) => ({
      attributes: { type: 'WindowScene', bounds: '[0,0][100,200]', bundleName: 'com.ohos.sceneboard' },
      children: [
        { attributes: { type: 'Text', text: app, bounds: '[10,100][90,130]' }, children: [] },
        { attributes: { type: 'TextClock', bounds: '[10,10][90,50]' }, children: [
          { attributes: { type: 'Text', text: clock, bounds: '[10,10][90,50]' }, children: [] },
        ] },
      ],
    })
    const token = (app: string, time: string) => parseUiTestLayout(JSON.stringify(desktop(app, time))).stateToken
    expect(token('Settings', '10:00')).toBe(token('Settings', '10:01'))
    expect(token('Settings', '10:00')).not.toBe(token('Camera', '10:00'))
  })
  it('treats visibility and opacity as advisory, preserving visible Flutter zero-opacity nodes', () => {
    const parsed = parseUiTestLayout(JSON.stringify(layout('Search', undefined, { opacity: '0.000000' })))
    expect(parsed.layout.nodes[0]?.text).toBe('Search')
    expect(parsed.layout.warnings.join()).toContain('hidden')
    expect(parseUiTestLayout(JSON.stringify(layout('hidden', undefined, { visible: 'false' }))).layout.nodes).toEqual([])
  })
  it('changes the frame token when a field moves, focus changes or text changes', () => {
    const original = parseUiTestLayout(JSON.stringify(layout())).stateToken
    for (const value of [layout('new'), layout('', '[20,20][90,40]'), layout('', undefined, { focused: 'false' })]) {
      expect(parseUiTestLayout(JSON.stringify(value)).stateToken).not.toBe(original)
    }
  })
  it('scales all node bounds into the image coordinate space', () => {
    const parsed = parseUiTestLayout(JSON.stringify(layout()))
    const scaled = scaleLayout(parsed.layout, { width: 100, height: 200, screenshotWidth: 50, screenshotHeight: 100 })
    expect(scaled.nodes[0]?.bounds).toEqual({ left: 5, right: 45, top: 10, bottom: 20 })
  })
  it('detects the clipboard permission window without granting it', () => {
    const value = layout('允许复制来自剪贴板的内容？')
    value.attributes.bundleName = 'com.huawei.hmos.security.privacycenter'
    expect(clipboardPermissionPending(parseUiTestLayout(JSON.stringify(value)).layout)).toBe(true)
    expect(clipboardPermissionPending(parseUiTestLayout(JSON.stringify(layout('剪贴板'))).layout)).toBe(false)
  })
  it('rejects malformed and oversized trees and bounds the exported nodes', () => {
    expect(() => parseUiTestLayout('{}')).toThrow('attributes')
    expect(() => parseUiTestLayout('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2 MiB')
    const value = layout('item')
    value.children = Array.from({ length: 300 }, () => value.children[0]!)
    const parsed = parseUiTestLayout(JSON.stringify(value))
    expect(parsed.layout.nodes).toHaveLength(250)
    expect(parsed.layout.truncated).toBe(true)
  })
})
