import { actionCommand, canUseAdbInputText, textInputCommands } from './adb.ts'
import type { PhoneCoordinateSpace } from './adb.ts'
import type { DeviceFrame, DeviceMutation, PhoneDriver, PreparedDeviceAction } from './device-driver.ts'

export interface AndroidDriverOptions {
  readonly runAdb: (args: readonly string[], signal: AbortSignal, buffer?: boolean) => Promise<string | Buffer>
  readonly pasteUnicode: (serial: string, text: string, signal: AbortSignal) => Promise<void>
}

export class AndroidPhoneDriver implements PhoneDriver {
  constructor(private readonly options: AndroidDriverOptions) {}

  async capture(serial: string, signal: AbortSignal): Promise<DeviceFrame> {
    const [focus, image] = await Promise.all([
      this.options.runAdb(['-s', serial, 'shell', 'dumpsys', 'window', 'windows'], signal),
      this.options.runAdb(['-s', serial, 'exec-out', 'screencap', '-p'], signal, true),
    ])
    const foregroundPackage = String(focus).match(/(?:mCurrentFocus|mFocusedApp)=[^\n]*?\bu\d+\s+([A-Za-z0-9._]+)\//u)?.[1]
      ?? String(focus).match(/(?:topResumedActivity|mResumedActivity)[^\n]*?\bu\d+\s+([A-Za-z0-9._]+)\//u)?.[1] ?? ''
    return { png: Buffer.isBuffer(image) ? image : Buffer.from(image), foregroundPackage }
  }

  prepare(action: DeviceMutation, screen: PhoneCoordinateSpace): PreparedDeviceAction {
    const unicode = action.action === 'text' && !canUseAdbInputText(action.text)
    if (action.action === 'text' && (!action.text.length || [...action.text].length > 500 || action.text.includes('\0'))) {
      throw new Error('opengui: text must contain 1-500 Unicode characters without NUL')
    }
    const commands = action.action === 'text'
      ? unicode ? [] : textInputCommands(action.text)
      : [actionCommand(action, screen)!]
    return {
      signature: JSON.stringify(unicode && action.action === 'text' ? ['scrcpy-text', action.text] : commands),
      execute: async (serial, signal) => {
        if (unicode && action.action === 'text') await this.options.pasteUnicode(serial, action.text, signal)
        else for (const command of commands) await this.options.runAdb(['-s', serial, ...command], signal)
      },
    }
  }
}
