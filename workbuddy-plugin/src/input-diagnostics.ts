import { OpenGuiError } from './errors.ts'
import type { DeviceInfo } from './device-info.ts'

export interface InputDiagnostic {
  deviceId: string
  code: 'input_permission_denied'
  source: 'device_input_receipt'
  detectedAt: string
  status: 'blocked' | 'recheck_pending' | 'resolved'
  guidance: string
  recheckedAt?: string
  resolvedAt?: string
}

/** Recognize explicit Android input-injection denials, never infer them from unchanged images. */
export function inputPermissionDenied(value: unknown): boolean {
  const text = String(value).slice(0, 20_000)
  return /\bSecurityException\b[^\n]*\bINJECT_EVENTS\b/iu.test(text)
    || /\bInjecting (?:input events|to another application) requires[^\n]*\bINJECT_EVENTS\b/iu.test(text)
}

export function inputPermissionError(): OpenGuiError {
  return new OpenGuiError('input_permission_denied', 'opengui: Android denied input injection; let the user handle developer security settings on the original phone, then recheck and observe. Do not replay the failed action.', 'outcome_unknown', 'wait')
}

export function inputDiagnostic(device: DeviceInfo, now: number): InputDiagnostic {
  const xiaomi = /\b(?:xiaomi|redmi|poco)\b/iu.test(`${device.manufacturer ?? ''} ${device.model ?? ''}`)
  return { deviceId: device.id, code: 'input_permission_denied', source: 'device_input_receipt', detectedAt: new Date(now).toISOString(), status: 'blocked',
    guidance: xiaomi
      ? '请在原手机的开发者选项中检查“USB 调试（安全设置）”，按手机提示允许模拟点击；这与“USB 调试”是不同的选项。设置完成后可能需要重启手机，再连接原设备。'
      : '请在原手机检查开发者选项及厂商的模拟输入安全限制。小米／Redmi／POCO 通常还需“USB 调试（安全设置）”；设置后可能需要重启。具体入口以手机系统为准。' }
}

export function isInputAction(kind: string): boolean { return ['tap', 'swipe', 'text', 'replace_text', 'read_text', 'key'].includes(kind) }
