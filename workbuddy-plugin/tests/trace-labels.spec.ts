import { describe, expect, it } from 'vitest'
import { actionLabel, appName, observationLabel } from '../src/trace-labels.ts'

describe('run-log labels', () => {
  it('names common apps instead of package names and never includes typed text', () => {
    expect(actionLabel({ action: 'launch', packageName: 'com.google.android.googlequicksearchbox' })).toBe('启动 Google App')
    expect(appName('com.google.android.apps.nexuslauncher')).toBe('桌面')
    expect(appName('com.example.unknown')).toBe('com.example.unknown')
    expect(observationLabel('com.android.chrome')).toContain('Chrome')
    expect(actionLabel({ action: 'text', text: '秘密内容' })).toBe('输入文本（4 字）')
  })
})

describe('action targets', () => {
  it('names the operated element when the model gives a short target, never the typed text', () => {
    expect(actionLabel({ action: 'tap', target: '搜索框' })).toBe('点击「搜索框」')
    expect(actionLabel({ action: 'tap', target: '登录', externalSideEffect: 'submit' })).toBe('点击提交「登录」')
    expect(actionLabel({ action: 'swipe', x1: 10, y1: 900, x2: 10, y2: 200, target: '评论列表' })).toBe('向上滑动「评论列表」')
    expect(actionLabel({ action: 'text', text: 'qa_demo', target: '用户名' })).toBe('在「用户名」输入文本（7 字）')
    expect(actionLabel({ action: 'tap', target: '  「x」\n'.repeat(1) })).toBe('点击「x」')
    expect(actionLabel({ action: 'tap', target: '很长的名字'.repeat(10) })).toBe(`点击「${'很长的名字'.repeat(5).slice(0, 24)}」`)
    expect(actionLabel({ action: 'tap' })).toBe('点击')
  })
})
