import { createHash } from 'node:crypto'
import type { TargetBoundingBox } from './adb.ts'
import type { UiLayout, UiNode } from './device-driver.ts'

export interface ParsedLayout {
  readonly layout: UiLayout
  readonly stateToken: string
  readonly foregroundPackage: string
}

const ADVISORY = 'UiTest semantics may include hidden or occluded nodes. Verify targets against the screenshot; visible/opacity and type are not sufficient.'
const SYSTEM_OVERLAYS = new Set(['com.ohos.sceneboard', 'com.huawei.hmos.inputmethod', 'com.ohos.inputmethod'])

function bounds(value: unknown): TargetBoundingBox | undefined {
  if (typeof value !== 'string') return undefined
  const m = value.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/u)
  if (!m) return undefined
  const [left, top, right, bottom] = m.slice(1).map(Number) as [number, number, number, number]
  return right > left && bottom > top ? { left, top, right, bottom } : undefined
}

/** Bounded traversal of untrusted device data; no generated node is an automatic selector. */
export function parseUiTestLayout(source: string): ParsedLayout {
  if (Buffer.byteLength(source) > 2 * 1024 * 1024) throw new Error('opengui: UiTest layout exceeds 2 MiB')
  const root: unknown = JSON.parse(source)
  if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new Error('opengui: malformed UiTest layout')
  const queue = [{ value: root, bundle: '', window: '', dynamic: false }]
  const nodes: UiNode[] = []
  const signatures: unknown[] = []
  const bundles = new Set<string>()
  let visited = 0
  let hasAttributes = false
  while (queue.length) {
    if (++visited > 5000) throw new Error('opengui: UiTest layout exceeds 5000 nodes')
    const { value, bundle, window, dynamic } = queue.pop()!
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('opengui: malformed UiTest node')
    const n = value as Record<string, unknown>
    const attributes = n.attributes
    if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) throw new Error('opengui: missing UiTest attributes')
    hasAttributes = true
    const a = attributes as Record<string, unknown>
    const string = (key: string): string => typeof a[key] === 'string' ? a[key] as string : ''
    const nextBundle = string('bundleName') || bundle
    const nextWindow = string('hostWindowId') || window
    const dynamicContent = dynamic || /(?:^|\.)inputmethod(?:\.|$)/iu.test(nextBundle)
      || (nextBundle === 'com.ohos.sceneboard' && /status.?bar|text_clock|TextClock/iu.test(string('id') + ' ' + string('type')))
    if (nextBundle) bundles.add(nextBundle)
    const box = bounds(a.bounds)
    if (box && a.visible !== 'false' && a.visible !== false) {
      const node: UiNode = {
        text: string('text').slice(0, 1000), hint: string('hint').slice(0, 300),
        type: string('type').slice(0, 100), bounds: box,
        clickable: a.clickable === 'true' || a.clickable === true,
        focused: a.focused === 'true' || a.focused === true,
        bundleName: nextBundle, windowId: nextWindow,
      }
      // System clocks and input-method suggestions must not invalidate every app frame.
      // Include their window bounds to detect a keyboard opening or closing.
      if (!dynamicContent || string('type') === 'WindowScene') {
        signatures.push([nextBundle, nextWindow, node.type, box, node.text, node.hint, node.focused])
      }
      if (nodes.length < 250 && (node.text || node.hint || /input|edit/i.test(node.type) || node.clickable)) nodes.push(node)
    }
    if (n.children !== undefined && !Array.isArray(n.children)) throw new Error('opengui: malformed UiTest children')
    for (const child of [...(n.children as unknown[] | undefined ?? [])].reverse()) queue.push({ value: child as object, bundle: nextBundle, window: nextWindow, dynamic: dynamicContent })
  }
  if (!hasAttributes || !signatures.length) throw new Error('opengui: UiTest returned no usable window information')
  const foreground = [...bundles].filter(bundle => !SYSTEM_OVERLAYS.has(bundle))
  const warnings = [ADVISORY]
  if (foreground.length > 1) warnings.push('Several application windows are present; foreground package is ambiguous.')
  return {
    foregroundPackage: foreground.length === 1 ? foreground[0]! : foreground.length === 0 && bundles.has('com.ohos.sceneboard') ? 'com.ohos.sceneboard' : '',
    stateToken: createHash('sha256').update(JSON.stringify(signatures)).digest('hex'),
    layout: { nodes, warnings, stable: false, truncated: nodes.length >= 250 },
  }
}

export function clipboardPermissionPending(layout: UiLayout): boolean {
  return layout.nodes.some(node => /privacycenter|permission/i.test(node.bundleName))
    && layout.nodes.some(node => /剪贴板|clipboard|pasteboard/i.test(node.text))
}
