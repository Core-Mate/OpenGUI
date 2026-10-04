import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join, win32 } from 'node:path'
import type { DeviceInfo } from './device-info.ts'

export interface UsbInterfaces { status: 'checked' | 'unknown'; adbInterfaces?: number; mediaInterfaces?: number }
export interface ConnectionDiagnostic {
  checkedAt: string
  platform: NodeJS.Platform
  adb: { status: 'checked' | 'unknown'; authorizedUsb?: number; unauthorizedUsb?: number; unavailableUsb?: number }
  usb: UsbInterfaces
  guidance: string[]
}
type Probe = (file: string, args: readonly string[], signal: AbortSignal) => Promise<string>
const MAX_BYTES = 2 * 1024 * 1024

/** Fixed read-only commands; private hardware properties and process errors never escape. */
const probe: Probe = (file, args, signal) => new Promise((resolve, reject) => {
  signal.throwIfAborted()
  execFile(file, [...args], { signal, timeout: 5000, maxBuffer: MAX_BYTES, encoding: 'utf8', windowsHide: true }, (error, stdout) => error ? reject(new Error('usb_inspection_unavailable')) : resolve(stdout))
})
function counts(rows: readonly number[][]): UsbInterfaces {
  if (rows.length > 512 || rows.some(row => row.length !== 3 || row.some(value => !Number.isInteger(value) || value < 0 || value > 255))) throw new Error('usb_interface_invalid')
  return { status: 'checked', adbInterfaces: rows.filter(([c, s, p]) => c === 255 && s === 66 && p === 1).length, mediaInterfaces: rows.filter(([c, s, p]) => c === 6 && s === 1 && p === 1).length }
}
/** Depth-one ioreg roots contain only the matched interface's own properties. */
export function macUsbInterfaces(raw: string): UsbInterfaces {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('usb_inspection_too_large')
  if (!raw.trim()) return counts([])
  const blocks = raw.split(/^.*\+-o .*<class [^>]+>.*$/mu).slice(1)
  if (!blocks.length) throw new Error('usb_interface_invalid')
  const rows = blocks.map(block => ['Class', 'SubClass', 'Protocol'].map(field => {
    const matches = [...block.matchAll(new RegExp('^[ |\\t]*"bInterface' + field + '" = (0x[0-9a-fA-F]+|[0-9]+)[ \\t]*$', 'gmu'))]
    if (matches.length !== 1) throw new Error('usb_interface_invalid')
    return Number(matches[0]![1])
  }))
  return counts(rows)
}
export function windowsUsbInterfaces(raw: string): UsbInterfaces {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('usb_inspection_too_large')
  const value: unknown = JSON.parse(raw.replace(/^\uFEFF/u, ''))
  if (!Array.isArray(value) || value.length > 512 || value.some(row => typeof row !== 'string' || row.length > 200)) throw new Error('usb_interface_invalid')
  return counts(value.flatMap(id => {
    const match = String(id).match(/^USB\\Class_([0-9a-f]{2})&SubClass_([0-9a-f]{2})&Prot_([0-9a-f]{2})$/iu)
    return match ? [[1, 2, 3].map(index => parseInt(match[index]!, 16))] : []
  }))
}
const WINDOWS_QUERY = "$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$devices=@(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\\*' });if($devices.Count -gt 512){throw 'limit'};$ids=@(foreach($device in $devices){$prop=Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName 'DEVPKEY_Device_CompatibleIds';foreach($id in $prop.Data){if($id -match '^USB\\\\Class_[0-9a-f]{2}&SubClass_[0-9a-f]{2}&Prot_[0-9a-f]{2}$'){[string]$id;break}}});ConvertTo-Json -InputObject $ids -Compress";

/** Interface counts are evidence of USB enumeration, never proof of a target phone or authorization. */
export async function inspectUsbInterfaces(signal: AbortSignal, options: { platform?: NodeJS.Platform; run?: Probe; linuxDirectory?: string } = {}): Promise<UsbInterfaces> {
  const platform = options.platform ?? process.platform, run = options.run ?? probe
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(6000)])
  try {
    bounded.throwIfAborted()
    let result: UsbInterfaces
    if (platform === 'darwin') result = macUsbInterfaces(await run('/usr/sbin/ioreg', ['-r', '-c', 'IOUSBHostInterface', '-l', '-d', '1', '-w', '0'], bounded))
    else if (platform === 'win32') {
      const file = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      result = windowsUsbInterfaces(await run(file, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY], bounded))
    } else if (platform === 'linux') {
      const directory = options.linuxDirectory ?? '/sys/bus/usb/devices'
      const names = (await readdir(directory)).filter(name => /^\d+-\d+(?:\.\d+)*:\d+\.\d+$/u.test(name))
      if (names.length > 512) throw new Error('usb_inspection_too_large')
      const rows: number[][] = []
      for (const name of names) {
        bounded.throwIfAborted()
        rows.push(await Promise.all(['Class', 'SubClass', 'Protocol'].map(async field => {
          const value = (await readFile(join(directory, name, 'bInterface' + field), { encoding: 'utf8', signal: bounded })).trim()
          if (!/^[0-9a-f]{2}$/iu.test(value)) throw new Error('usb_interface_invalid')
          return parseInt(value, 16)
        })))
      }
      result = counts(rows)
    } else return { status: 'unknown' }
    bounded.throwIfAborted(); return result
  } catch { signal.throwIfAborted(); return { status: 'unknown' } }
}

export function connectionDiagnostic(devices: readonly Pick<DeviceInfo, 'connection' | 'state' | 'connected' | 'authorized'>[] | undefined, usb: UsbInterfaces, platform = process.platform): ConnectionDiagnostic {
  const physical = devices?.filter(device => device.connection === 'usb')
  const adb: ConnectionDiagnostic['adb'] = physical ? { status: 'checked', authorizedUsb: physical.filter(d => d.connected && d.authorized).length, unauthorizedUsb: physical.filter(d => d.state === 'unauthorized').length, unavailableUsb: physical.filter(d => !d.connected || d.state === 'offline').length } : { status: 'unknown' }
  const guidance: string[] = []
  if (adb.status === 'unknown') guidance.push('ADB 检测未完成，请重新检测；系统 USB 接口可见也不代表调试已可用。')
  if (adb.unauthorizedUsb) guidance.push('ADB 已发现需要授权的 USB 手机。解锁手机，在“允许 USB 调试”弹窗中允许这台电脑，再重新检测。')
  if (adb.unavailableUsb) guidance.push('ADB 中有离线或不可用的 USB 设备。检查原手机和数据线、解锁并重新授权，再重新检测；不会自动重放操作。')
  if (adb.authorizedUsb) guidance.push('已有 USB 手机通过 ADB 授权。按型号和尾号确认目标手机；该结果不代表所有已插入手机都已连接或触控权限已恢复。')
  if (usb.status === 'unknown') guidance.push('电脑侧 USB 检测未完成，不能判断手机是否已被系统识别。')
  else if (usb.adbInterfaces && !adb.authorizedUsb && !adb.unauthorizedUsb) guidance.push('系统检测到 USB 调试接口，但 ADB 尚未确认可用手机。检查手机调试授权；Windows 可检查设备管理器中的 Android 驱动，Linux 可检查 USB 访问权限。')
  else if (usb.mediaInterfaces && !adb.authorizedUsb && !adb.unauthorizedUsb) guidance.push('系统检测到文件传输／相机接口，尚未确认目标 Android 手机的调试连接。请在原手机开启 USB 调试，选择传输文件并检查电脑授权。')
  else if (!usb.adbInterfaces && !usb.mediaInterfaces && !adb.authorizedUsb && !adb.unauthorizedUsb) guidance.push('本次未检测到 USB 调试或文件传输／相机接口。解锁原手机，选择传输文件，换用支持数据传输的数据线或 USB 接口，再重新检测；此结果不能确定是否为仅充电模式或数据线故障。')
  guidance.push('这是当前电脑的只读连接检查；USB 接口数量不等于手机数量。网络设备与模拟器不计入 USB 手机，检测结果不会绑定设备、恢复任务或授予控制。')
  return { checkedAt: new Date().toISOString(), platform, adb, usb, guidance }
}
