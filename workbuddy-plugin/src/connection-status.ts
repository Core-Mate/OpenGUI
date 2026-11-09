import type { DeviceChoice, DeviceInfo } from './device-info.ts'
import type { EnvironmentState } from './environment.ts'

export interface ConnectionHint { label: string; detail: string; warning: boolean }

/** Presentation only: never grants control or infers a permission from a frame. */
export function connectionHint(device: Pick<DeviceInfo, 'os' | 'connection'> & { selectionStatus?: DeviceChoice['selectionStatus']; busy?: boolean; state?: string }, environment?: EnvironmentState, t: (message: string) => string = message => message): ConnectionHint {
  const simulator = device.connection === 'local_simulator'
  const ios = device.os === 'ios'
  const reconnect = ios ? t('在 Xcode Simulator 中启动原模拟器后重新检测。') : simulator ? t('启动原 Android 模拟器后重新检测。') : device.connection === 'network' ? t('检查无线调试连接和授权后重新检测。') : t('解锁手机，确认数据线支持传输、USB 用途为「传输文件」、已开启 USB 调试并允许电脑授权，然后重新检测。')
  const status = device.selectionStatus
  if (status === 'requires_authorization') return { label: t('需要手机授权'), detail: t('电脑已发现设备，但还没有调试授权。请在手机上点「允许 USB 调试」，然后重新检测。'), warning: true }
  if (status === 'version_conflict') return { label: t('版本不兼容'), detail: t('系统低于 Android 5.0（SDK 21），暂不支持。请换一台设备。'), warning: true }
  if (status === 'interrupted') return { label: t('连接中断'), detail: t('设备已离线。') + reconnect + t('恢复后会先核对画面，不会重复上一步。'), warning: true }
  if (status === 'not_connected') return { label: t('未连接'), detail: reconnect + t('任务记录会保留。'), warning: true }
  if (device.busy) return { label: t('被其他任务占用'), detail: t('这台设备正在被其他任务使用，请先结束那个任务再重新检测。'), warning: true }
  if (device.state === 'closed') return { label: t('画面已关闭'), detail: t('请从原任务重新打开工作台；旧画面不能用于继续操作。'), warning: true }
  if (device.state && !['ready', 'device'].includes(device.state)) return { label: t('等待设备画面'), detail: t('正在连接设备画面。长时间没有画面时，') + reconnect, warning: true }
  if (environment?.stale) return { label: t('已连接 · 环境待确认'), detail: t('任务环境需要重新检查，旧检查结果不能用于继续执行。请点击「重新检测」。'), warning: true }
  const required = environment?.checks.filter(check => check.required) ?? []
  const failures = required.filter(check => check.status === 'failed')
  if (failures.length) return { label: failures.some(check => check.id === 'version' || check.id === 'android') ? t('已连接 · 版本冲突') : t('已连接 · 环境未通过'), detail: t('必需项未通过：') + failures.map(check => t(check.label)).join('、') + t('。处理后点击「重新检测」。'), warning: true }
  const unknown = required.filter(check => check.status !== 'passed')
  if (status === 'environment_pending' || unknown.length) return { label: t('已连接 · 环境待确认'), detail: unknown.length ? t('尚未确认：') + unknown.map(check => t(check.label)).join('、') + t('。请重新检测，确认前不会继续执行。') : t('未能读取系统版本，请重新检测。'), warning: true }
  return { label: device.state === 'ready' ? t('设备画面已连接') : t('已连接'), detail: (ios ? t('模拟器画面为带时间戳的间隔截图。') : t('连接正常。')) + (environment ? t('任务环境已通过检查。') : t('本任务尚未声明环境预检。')), warning: false }
}
