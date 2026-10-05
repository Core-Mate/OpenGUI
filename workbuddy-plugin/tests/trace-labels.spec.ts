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
