import type { DeviceChoice, DeviceInfo } from './device-info.ts'
import type { EnvironmentState } from './environment.ts'

export interface ConnectionHint { label: string; detail: string; warning: boolean }

/** Presentation only: never grants control or infers a permission from a frame. */
export function connectionHint(device: Pick<DeviceInfo, 'os' | 'connection'> & { selectionStatus?: DeviceChoice['selectionStatus']; busy?: boolean; state?: string }, environment?: EnvironmentState): ConnectionHint {
  const simulator = device.connection === 'local_simulator'
  const ios = device.os === 'ios'
  const reconnect = ios ? '在 Xcode Simulator 中启动原模拟器后重新检测。' : simulator ? '启动原 Android 模拟器后重新检测。' : device.connection === 'network' ? '检查无线调试连接和授权后重新检测。' : '解锁手机，确认数据线支持传输、USB 用途为「传输文件」、已开启 USB 调试并允许电脑授权，然后重新检测。'
  const status = device.selectionStatus
  if (status === 'requires_authorization') return { label: '需要手机授权', detail: '电脑已发现设备，但还没有调试授权。请在手机上点「允许 USB 调试」，然后重新检测。', warning: true }
  if (status === 'version_conflict') return { label: '版本不兼容', detail: '系统低于 Android 5.0（SDK 21），暂不支持。请换一台设备。', warning: true }
  if (status === 'interrupted') return { label: '连接中断', detail: '设备已离线。' + reconnect + '恢复后会先核对画面，不会重复上一步。', warning: true }
  if (status === 'not_connected') return { label: '未连接', detail: reconnect + '任务记录会保留。', warning: true }
  if (device.busy) return { label: '被其他任务占用', detail: '这台设备正在被其他任务使用，请先结束那个任务再重新检测。', warning: true }
  if (device.state === 'closed') return { label: '画面已关闭', detail: '请从原任务重新打开工作台；旧画面不能用于继续操作。', warning: true }
  if (device.state && !['ready', 'device'].includes(device.state)) return { label: '等待设备画面', detail: '正在连接设备画面。长时间没有画面时，' + reconnect, warning: true }
  if (environment?.stale) return { label: '已连接 · 环境待确认', detail: '任务环境需要重新检查，旧检查结果不能用于继续执行。请点击「重新检测」。', warning: true }
  const required = environment?.checks.filter(check => check.required) ?? []
  const failures = required.filter(check => check.status === 'failed')
  if (failures.length) return { label: failures.some(check => check.id === 'version' || check.id === 'android') ? '已连接 · 版本冲突' : '已连接 · 环境未通过', detail: '必需项未通过：' + failures.map(check => check.label).join('、') + '。处理后点击「重新检测」。', warning: true }
  const unknown = required.filter(check => check.status !== 'passed')
  if (status === 'environment_pending' || unknown.length) return { label: '已连接 · 环境待确认', detail: unknown.length ? '尚未确认：' + unknown.map(check => check.label).join('、') + '。请重新检测，确认前不会继续执行。' : '未能读取系统版本，请重新检测。', warning: true }
  return { label: device.state === 'ready' ? '设备画面已连接' : '已连接', detail: (ios ? '模拟器画面为带时间戳的间隔截图。' : '连接正常。') + (environment ? '任务环境已通过检查。' : '本任务尚未声明环境预检。'), warning: false }
}
