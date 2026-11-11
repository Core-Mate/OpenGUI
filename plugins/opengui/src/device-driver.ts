import type { PhoneAction, PhoneCoordinateSpace, TargetBoundingBox } from './adb.ts'

export interface UiNode {
  readonly text: string
  readonly hint: string
  readonly type: string
  readonly bounds: TargetBoundingBox
  readonly clickable: boolean
  readonly focused: boolean
  readonly windowId: string
  readonly bundleName: string
}

/** Advisory semantics. A node is not proof that its target is visible or hittable. */
export interface UiLayout {
  readonly nodes: readonly UiNode[]
  readonly warnings: readonly string[]
  readonly stable: boolean
  readonly truncated: boolean
}

export interface DeviceFrame {
  readonly png: Buffer
  readonly foregroundPackage: string
  readonly layout?: UiLayout
  readonly stateToken?: string
}

export type DeviceMutation = Exclude<PhoneAction, { action: 'observe' | 'wait' }>
export interface PreparedDeviceAction {
  readonly signature: string
  execute(serial: string, signal: AbortSignal): Promise<void>
}

export interface ActionAssessment {
  readonly status: 'performed' | 'text_present' | 'permission_required' | 'text_unconfirmed'
  readonly detail: string
}

export interface PhoneDriver {
  capture(serial: string, signal: AbortSignal): Promise<DeviceFrame>
  prepare(action: DeviceMutation, screen: PhoneCoordinateSpace, before: DeviceFrame): PreparedDeviceAction
  assess?(action: DeviceMutation, after: DeviceFrame): ActionAssessment
}

/** Keep node bounds in the same screenshot coordinate space as tap/swipe. */
export function scaleLayout(layout: UiLayout, screen: PhoneCoordinateSpace): UiLayout {
  const x = screen.screenshotWidth / screen.width
  const y = screen.screenshotHeight / screen.height
  return { ...layout, nodes: layout.nodes.map(node => ({ ...node, bounds: {
    left: node.bounds.left * x, right: node.bounds.right * x,
    top: node.bounds.top * y, bottom: node.bounds.bottom * y,
  } })) }
}
