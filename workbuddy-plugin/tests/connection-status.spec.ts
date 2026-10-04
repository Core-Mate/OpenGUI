import { describe, expect, it } from 'vitest'
import { connectionHint } from '../src/connection-status.ts'
import { deviceSelectionStatus } from '../src/device-info.ts'
import { environmentSpec, initialEnvironment } from '../src/environment.ts'

const phone = { id: 'opaque-phone', name: 'Phone', os: 'android' as const, sdk: 35, osVersion: '15', connection: 'usb' as const, connected: true, authorized: true, state: 'device' }
const classify = (patch: Partial<typeof phone>) => {
  const device = { ...phone, ...patch }
  return connectionHint({ ...device, selectionStatus: deviceSelectionStatus(device) })
}
function environment() {
  const state = initialEnvironment(environmentSpec({ packageName: 'org.example.app', expectedVersion: '1.0', requireAccount: true }), phone.id)
  state.stale = false
  for (const check of state.checks) check.status = 'passed'
  return state
}

describe('connection guidance without execution authority', () => {
  it('distinguishes unauthorized, offline, absent, incompatible and unknown native facts', () => {
    expect(classify({ authorized: false })).toMatchObject({ label: '需要手机授权', warning: true })
    expect(classify({ connected: false, state: 'offline' })).toMatchObject({ label: '连接中断', warning: true })
    expect(classify({ connected: false, state: 'absent' })).toMatchObject({ label: '未连接', warning: true })
    expect(classify({ sdk: 20 })).toMatchObject({ label: '版本不兼容', warning: true })
    expect(classify({ osVersion: '' })).toMatchObject({ label: '已连接 · 环境待确认', warning: true })
    expect(classify({})).toMatchObject({ label: '已连接', warning: false })
  })
  it('uses the original connection transport without offering USB authorization on iOS', () => {
    for (const state of ['waiting_for_frame', 'disconnected']) {
      const ios = connectionHint({ os: 'ios', connection: 'local_simulator', state })
      expect(ios.detail).toContain('Xcode Simulator'); expect(ios.detail).not.toContain('USB')
      expect(connectionHint({ os: 'android', connection: 'network', state }).detail).toContain('无线调试')
      expect(connectionHint({ os: 'android', connection: 'local_simulator', state }).detail).toContain('原 Android 模拟器')
    }
  })
  it('does not hide a failed version or permission behind a decoded frame', () => {
    const state = environment()
    state.checks.find(check => check.id === 'version')!.status = 'failed'
    expect(connectionHint({ ...phone, state: 'ready' }, state)).toMatchObject({ label: '已连接 · 版本冲突', warning: true })
    state.checks.find(check => check.id === 'version')!.status = 'passed'
    state.checks.find(check => check.id === 'app')!.status = 'failed'
    expect(connectionHint({ ...phone, state: 'ready' }, state)).toMatchObject({ label: '已连接 · 环境未通过', warning: true })
  })
  it('retains required unknown and stale checks while keeping optional MTP nonblocking', () => {
    const state = environment()
    state.checks.find(check => check.id === 'usb')!.status = 'unknown'
    expect(connectionHint({ ...phone, state: 'ready' }, state).warning).toBe(false)
    state.checks.find(check => check.id === 'account')!.status = 'unknown'
    const pending = connectionHint({ ...phone, state: 'ready' }, state)
    expect(pending.warning).toBe(true); expect(pending.detail).toContain('所需测试账号')
    state.stale = true
    expect(connectionHint({ ...phone, state: 'ready' }, state).detail).toContain('旧检查结果')
  })
  it('does not claim app or account verification when no environment was declared', () => {
    const hint = connectionHint({ ...phone, state: 'ready' })
    expect(hint.label).toBe('设备画面已连接')
    expect(hint.detail).toContain('尚未声明环境预检')
  })
  it('does not let passed environment checks mask missing video or device occupancy', () => {
    expect(connectionHint({ ...phone, state: 'disconnected' }, environment()).warning).toBe(true)
    expect(connectionHint({ ...phone, state: 'ready', busy: true }, environment()).label).toBe('被其他任务占用')
    expect(connectionHint({ ...phone, state: 'closed' }, environment()).label).toBe('画面已关闭')
  })
})
