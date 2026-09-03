/** Browser-visible state of one optional native scrcpy mirror. */
export type MirrorPhase = 'idle' | 'downloading' | 'extracting' | 'launching' | 'running' | 'unsupported' | 'error'

/** Deliberately omits device serials and filesystem paths from the web surface. */
export interface MirrorDeviceStatus {
  id: string
  label: string
  model?: string
  selected: boolean
  occupied: boolean
  occupiedByCurrentSession: boolean
  connected: boolean
  phase: MirrorPhase
  downloadedBytes?: number
  totalBytes?: number
  message?: string
}

export interface MirrorStatus {
  sessionId: string
  taskActive: boolean
  taskId?: string
  attemptId?: string
  taskPhase: CoremateTaskPhase
  selectionLocked: boolean
  hostPlatform: string
  cached: boolean
  devices: MirrorDeviceStatus[]
}

/** Actual versions loaded by the local DSH Host process. */
export interface RuntimeInfo {
  dshVersion: string
  openGuiVersion: string
  dshCompatibility: 'supported' | 'unsupported' | 'unknown'
  preferredDshVersion: string
  supportedDshVersions: string[]
}

/** Lightweight activity state used by the composer stop control. */
export interface CoremateTaskStatus {
  sessionId: string
  active: boolean
  phase: CoremateTaskPhase
  selectionLocked: boolean
  taskId?: string
  attemptId?: string
  deviceIds: string[]
}

export interface CoremateTaskStatusResponse {
  tasks: CoremateTaskStatus[]
}

export type CoremateTaskPhase = 'idle' | 'waiting-for-device' | 'routing' | 'running' | 'stopping'

/** First-use managed-browser installation state exposed to the local client only. */
export interface BrowserInstallStatus {
  phase: 'idle' | 'awaiting-confirmation' | 'downloading' | 'extracting' | 'ready' | 'unsupported' | 'error'
  version: string
  hostPlatform: string
  totalBytes?: number
  downloadedBytes?: number
  message?: string
  owner?: {
    sessionId: string
    taskId: string
    attemptId: string
  }
}

/** Release discovery and user-approved plugin update state exposed to the local client. */
export interface PluginUpdateStatus {
  phase: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'verifying' | 'installing' | 'restart-required' | 'error'
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  totalBytes?: number
  downloadedBytes?: number
  checkedAt?: string
  message?: string
}

export const MIRROR_STATUS_PATH = '/coremate-mobile/mirror/status'
export const DEVICE_SELECTION_PATH = '/coremate-mobile/devices/selection'
export const DEVICE_PREVIEW_PATH = '/coremate-mobile/devices/preview'
export const DEVICE_STREAM_PATH = '/coremate-mobile/devices/stream'
export const DEVICE_STREAM_STATUS_PATH = '/coremate-mobile/devices/stream/status'
export const DEVICE_STREAM_ENABLE_PATH = '/coremate-mobile/devices/stream/enable'
export const MIRROR_START_PATH = '/coremate-mobile/mirror/start'
export const MIRROR_STOP_PATH = '/coremate-mobile/mirror/stop'
export const PHONE_TASK_STATUS_PATH = '/coremate-mobile/task/status'
export const PHONE_TASK_STOP_PATH = '/coremate-mobile/task/stop'
export const BROWSER_INSTALL_STATUS_PATH = '/coremate-mobile/browser/install/status'
export const BROWSER_INSTALL_APPROVE_PATH = '/coremate-mobile/browser/install/approve'
export const BROWSER_INSTALL_DECLINE_PATH = '/coremate-mobile/browser/install/decline'
export const PLUGIN_UPDATE_STATUS_PATH = '/coremate-mobile/plugin/update/status'
export const PLUGIN_UPDATE_CHECK_PATH = '/coremate-mobile/plugin/update/check'
export const PLUGIN_UPDATE_INSTALL_PATH = '/coremate-mobile/plugin/update/install'
export const RUNTIME_INFO_PATH = '/coremate-mobile/runtime/info'
