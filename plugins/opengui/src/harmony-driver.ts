import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { screenshotCoordinate, targetCenter } from './adb.ts'
import type { PhoneCoordinateSpace } from './adb.ts'
import type { ActionAssessment, DeviceFrame, DeviceMutation, PhoneDriver, PreparedDeviceAction } from './device-driver.ts'
import { hdcShell } from './hdc.ts'
import type { HdcRunner } from './hdc.ts'
import { pngDimensions } from './image.ts'
import { PhoneOperationQueue } from './phone-execution.ts'
import { clipboardPermissionPending, parseUiTestLayout } from './uitest-layout.ts'
import type { ParsedLayout } from './uitest-layout.ts'

export interface HarmonyCapabilities { readonly apiLevel: number; readonly uiTestVersion: string }

/** HDC/UiTest driver. Every file and operation is scoped to one explicit device. */
export class HarmonyPhoneDriver implements PhoneDriver {
  private readonly queue = new PhoneOperationQueue()
  private readonly actors = new Map<string, object>()
  private readonly capabilities = new Map<string, HarmonyCapabilities>()

  constructor(private readonly run: HdcRunner) {}

  private serialized<T>(serial: string, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    let actor = this.actors.get(serial)
    if (!actor) { actor = {}; this.actors.set(serial, actor) }
    return this.queue.run(actor, () => { signal.throwIfAborted(); return operation() })
  }

  async probe(serial: string, signal: AbortSignal): Promise<HarmonyCapabilities> {
    const cached = this.capabilities.get(serial)
    if (cached) return cached
    const apiLevel = Number(await hdcShell(this.run, serial, ['param', 'get', 'const.ohos.apiversion'], signal))
    if (!Number.isInteger(apiLevel) || apiLevel < 17) throw new Error('opengui: HarmonyOS driver requires API 17 or newer')
    const uiTestVersion = await hdcShell(this.run, serial, ['uitest', '--version'], signal)
    if (!/^\d+(?:\.\d+)+$/u.test(uiTestVersion)) throw new Error('opengui: UiTest is unavailable or reported an unsupported version response')
    const value = { apiLevel, uiTestVersion }
    this.capabilities.set(serial, value)
    return value
  }

  invalidate(serial: string): void { this.capabilities.delete(serial) }

  capture(serial: string, signal: AbortSignal): Promise<DeviceFrame> {
    return this.serialized(serial, signal, async () => {
      await this.probe(serial, signal)
      let before = await this.readLayout(serial, signal)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const png = await this.readScreenshot(serial, signal)
        const after = await this.readLayout(serial, signal)
        const size = pngDimensions(png)
        const stable = before.stateToken === after.stateToken
        if (stable || attempt === 2) {
          const nodes = after.layout.nodes.map(node => ({ ...node, bounds: {
            left: Math.max(0, node.bounds.left), top: Math.max(0, node.bounds.top),
            right: Math.min(size.width, node.bounds.right), bottom: Math.min(size.height, node.bounds.bottom),
          } })).filter(node => node.bounds.right > node.bounds.left && node.bounds.bottom > node.bounds.top)
          return { png, foregroundPackage: after.foregroundPackage, stateToken: after.stateToken,
            layout: { ...after.layout, nodes, stable,
              warnings: [...after.layout.warnings, ...(stable ? [] : ['Layout changed during capture; observe again before a coordinate or text action.'])] } }
        }
        before = after
      }
      throw new Error('opengui: failed to capture a HarmonyOS frame')
    })
  }

  /** Device-wall previews share the transport queue but do not consume observations. */
  preview(serial: string, signal: AbortSignal): Promise<Buffer> {
    return this.serialized(serial, signal, () => this.readScreenshot(serial, signal))
  }

  prepare(action: DeviceMutation, screen: PhoneCoordinateSpace, before: DeviceFrame): PreparedDeviceAction {
    let command: string[]
    switch (action.action) {
      case 'tap':
      case 'long_press': {
        const center = targetCenter(action.targetBBox, screen)
        command = ['uitest', 'uiInput', action.action === 'tap' ? 'click' : 'longClick', center.x, center.y]
        break
      }
      case 'swipe': {
        const duration = action.durationMs ?? 300
        if (!Number.isInteger(duration) || duration < 50 || duration > 2000) throw new Error('opengui: durationMs must be 50-2000')
        const x1 = screenshotCoordinate(action.x1, screen.screenshotWidth, screen.width, 'x1')
        const y1 = screenshotCoordinate(action.y1, screen.screenshotHeight, screen.height, 'y1')
        const x2 = screenshotCoordinate(action.x2, screen.screenshotWidth, screen.width, 'x2')
        const y2 = screenshotCoordinate(action.y2, screen.screenshotHeight, screen.height, 'y2')
        const distance = Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1))
        if (distance < 1) throw new Error('opengui: swipe endpoints must differ')
        // UiTest accepts pixels/second, while the public tool accepts milliseconds.
        const velocity = Math.max(200, Math.min(40000, Math.round(distance * 1000 / duration)))
        command = ['uitest', 'uiInput', 'swipe', x1, y1, x2, y2, String(velocity)]
        break
      }
      case 'text': {
        if (!action.text.length || [...action.text].length > 500 || action.text.includes('\0')) throw new Error('opengui: text must contain 1-500 Unicode characters without NUL')
        const inputs = before.layout?.nodes.filter(node => node.focused && /^(TextInput|TextArea|EditText)$/iu.test(node.type)) ?? []
        if (inputs.length !== 1) throw new Error('opengui: focus one visible editable field and observe before entering text')
        const input = inputs[0]!
        command = ['uitest', 'uiInput', 'inputText',
          String(Math.floor((input.bounds.left + input.bounds.right) / 2)),
          String(Math.floor((input.bounds.top + input.bounds.bottom) / 2)), action.text]
        break
      }
      case 'key': {
        if (action.key === 'AppSwitch') throw new Error('opengui: AppSwitch is not supported by this HarmonyOS driver')
        command = ['uitest', 'uiInput', 'keyEvent', action.key === 'Enter' ? '2054' : action.key]
        break
      }
      case 'launch': {
        if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/u.test(action.packageName)) throw new Error('opengui: invalid HarmonyOS bundle name')
        if (!action.abilityName || !/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(action.abilityName)) throw new Error('opengui: HarmonyOS launch requires the explicit abilityName, for example EntryAbility')
        command = ['aa', 'start', '-b', action.packageName, '-a', action.abilityName]
        break
      }
    }
    const needsStableTarget = ['tap', 'long_press', 'swipe', 'text'].includes(action.action)
    if (needsStableTarget && (!before.layout?.stable || !before.stateToken)) throw new Error('opengui: layout is unstable; observe again before acting')
    return {
      signature: JSON.stringify(command),
      execute: (serial, signal) => this.serialized(serial, signal, async () => {
        const capabilities = await this.probe(serial, signal)
        if (needsStableTarget && (await this.readLayout(serial, signal)).stateToken !== before.stateToken) {
          throw new Error('opengui: device layout changed since observation; observe again before acting')
        }
        const actual = action.action === 'text' && capabilities.apiLevel >= 18
          ? ['uitest', 'uiInput', 'text', action.text] : command
        const output = await hdcShell(this.run, serial, actual, signal)
        if (action.action === 'launch' ? !/start ability successfully/i.test(output) : !/^No Error\s*$/u.test(output)) {
          throw new Error(`opengui: HarmonyOS action was not acknowledged: ${output.slice(0, 500)}; observe again before retrying`)
        }
      }),
    }
  }

  assess(action: DeviceMutation, after: DeviceFrame): ActionAssessment {
    if (after.layout && clipboardPermissionPending(after.layout)) return {
      status: 'permission_required', detail: 'A system clipboard permission dialog is present. Text is not confirmed; inspect the screenshot and obtain authorization before selecting an option. Do not repeat text input blindly.',
    }
    if (action.action === 'text') {
      const present = after.layout?.nodes.some(node => node.focused && /^(TextInput|TextArea|EditText)$/iu.test(node.type) && node.text.includes(action.text))
      return present ? { status: 'text_present', detail: 'The focused editable node contains the requested text. Check its full value for append/replacement semantics; no submit action was performed.' }
        : { status: 'text_unconfirmed', detail: 'The requested text was not confirmed in a focused editable node. Inspect the new screenshot before retrying.' }
    }
    return { status: 'performed', detail: 'UiTest acknowledged the action. Verify the resulting screen before continuing.' }
  }

  private async readLayout(serial: string, signal: AbortSignal): Promise<ParsedLayout> {
    return parseUiTestLayout((await this.artifact(serial, 'json', ['uitest', 'dumpLayout'], signal)).toString('utf8'))
  }

  private async readScreenshot(serial: string, signal: AbortSignal): Promise<Buffer> {
    const png = await this.artifact(serial, 'png', ['uitest', 'screenCap'], signal)
    pngDimensions(png)
    return png
  }

  private async artifact(serial: string, extension: 'json' | 'png', command: readonly string[], signal: AbortSignal): Promise<Buffer> {
    const directory = await mkdtemp(join(tmpdir(), 'opengui-hdc-'))
    await chmod(directory, 0o700)
    const name = `opengui-${randomUUID()}.${extension}`
    const remote = `/data/local/tmp/${name}`
    const local = join(directory, name)
    let failed = false
    try {
      const output = await hdcShell(this.run, serial, [...command, '-p', remote], signal)
      if (!/saved to/i.test(output)) throw new Error('opengui: UiTest did not save the requested artifact')
      const received = await this.run(['-t', serial, 'file', 'recv', remote, local], signal)
      if (!/FileTransfer finish/i.test(received)) throw new Error('opengui: incomplete HDC file transfer')
      const info = await stat(local)
      if (!info.isFile() || info.size > (extension === 'json' ? 2 : 20) * 1024 * 1024) throw new Error('opengui: invalid or oversized UiTest artifact')
      return await readFile(local)
    } catch (error) { failed = true; throw error }
    finally {
      try { await hdcShell(this.run, serial, ['rm', '-f', remote], AbortSignal.timeout(3000)) }
      catch (error) { if (!failed) throw new Error('opengui: failed to remove the temporary device artifact', { cause: error }) }
      finally { await rm(directory, { recursive: true, force: true }) }
    }
  }
}
