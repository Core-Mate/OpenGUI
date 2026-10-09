export type DeviceConnection = 'usb' | 'network' | 'local_simulator'
export interface DeviceInfo {
  readonly id: string
  readonly name: string
  readonly model?: string
  readonly manufacturer?: string
  readonly os?: 'android' | 'ios'
  readonly osVersion?: string
  readonly sdk?: number
  readonly serialSuffix?: string
  readonly connection?: DeviceConnection
  readonly state: string
  readonly connected: boolean
  readonly authorized: boolean
}
export interface DeviceChoice extends DeviceInfo {
  readonly connectionHint?: { label: string; detail: string; warning: boolean }
  readonly selectable: boolean
  readonly selected: boolean
  readonly busy: boolean
  readonly selectionStatus: 'connected' | 'not_connected' | 'requires_authorization' | 'interrupted' | 'version_conflict' | 'environment_pending'
}
export function deviceSelectionStatus(device: DeviceInfo): DeviceChoice['selectionStatus'] {
  if (!device.connected) return device.state === 'offline' ? 'interrupted' : 'not_connected'
  if (!device.authorized) return 'requires_authorization'
  if (device.os === 'android' && device.sdk !== undefined && device.sdk < 21) return 'version_conflict'
  return device.osVersion && (device.os !== 'android' || device.sdk !== undefined) ? 'connected' : 'environment_pending'
}
