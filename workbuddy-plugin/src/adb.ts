import { execFile } from 'node:child_process'
import { access, chmod, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { inputPermissionDenied, inputPermissionError } from './input-diagnostics.ts'

/** Opaque identity of one completed phone observation. */
export type ObservationId = string & { readonly __observationId: unique symbol }

/**
 * Brand a validated or generated observation identifier.
 * @param value Raw observation identifier.
 * @returns The same string with its observation-id brand.
 */
export function ObservationId(value: string): ObservationId {
  return value as ObservationId
}

/** One row returned by `adb devices -l`. */
export interface AdbDevice {
  serial: string
  state: string
  model?: string
  product?: string
  device?: string
}

/** The logical Android display coordinate space. */
export interface ScreenSize {
  width: number
  height: number
}

/** Device input dimensions plus the screenshot pixel space shown to the model. */
export interface PhoneCoordinateSpace extends ScreenSize {
  screenshotWidth: number
  screenshotHeight: number
}

/** Tight visible bounds of one target in the current screenshot. */
export interface TargetBoundingBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** The closed set of operations exposed to the phone subagent. */
export type PhoneAction =
  | { action: 'observe' }
  | { action: 'tap'; observationId: ObservationId; targetBBox: TargetBoundingBox }
  | { action: 'swipe'; observationId: ObservationId; x1: number; y1: number; x2: number; y2: number; durationMs?: number }
  | { action: 'text'; observationId: ObservationId; text: string }
  | { action: 'replace_text'; observationId: ObservationId; text: string }
  | { action: 'read_text'; observationId: ObservationId; targetBBox: TargetBoundingBox }
  | { action: 'key'; observationId: ObservationId; key: 'Back' | 'Home' | 'Enter' | 'AppSwitch' }
  | { action: 'launch'; observationId: ObservationId; packageName: string }
  | { action: 'wait'; observationId: ObservationId; waitMs: number }

const KEY_CODES = {
  Back: 'KEYCODE_BACK',
  Home: 'KEYCODE_HOME',
  Enter: 'KEYCODE_ENTER',
  AppSwitch: 'KEYCODE_APP_SWITCH',
} as const

const ADB_INPUT_TEXT = /^[A-Za-z0-9 .,_@:/+=!?-]*$/u

/** Whether Android's shell input-text command can preserve this value exactly. */
export function canUseAdbInputText(text: string): boolean {
  return ADB_INPUT_TEXT.test(text)
}

function requiredNumber(value: unknown, action: string, fields: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`opengui: ${action} requires ${fields}`)
  }
  return value
}

function requiredObservationId(value: unknown, action: string): ObservationId {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`opengui: ${action} requires the current observationId`)
  }
  return ObservationId(value)
}

function assertNever(value: never): never {
  throw new Error(`opengui: unsupported validated action ${JSON.stringify(value)}`)
}

function requiredTargetBBox(value: unknown): TargetBoundingBox {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('opengui: tap requires targetBBox from the current screenshot')
  }
  const input = value as Record<string, unknown>
  return {
    left: requiredNumber(input.left, 'tap', 'targetBBox.left, top, right, and bottom'),
    top: requiredNumber(input.top, 'tap', 'targetBBox.left, top, right, and bottom'),
    right: requiredNumber(input.right, 'tap', 'targetBBox.left, top, right, and bottom'),
    bottom: requiredNumber(input.bottom, 'tap', 'targetBBox.left, top, right, and bottom'),
  }
}

/**
 * Convert untrusted tool arguments into the closed phone-action union.
 * @param input Raw arguments supplied to the phone tool.
 * @returns A validated action containing every required field.
 */
export function normalizePhoneAction(input: Record<string, unknown>): PhoneAction {
  switch (input.action) {
    case 'observe': return { action: 'observe' }
    case 'tap':
      return {
        action: 'tap',
        observationId: requiredObservationId(input.observationId, 'tap'),
        targetBBox: requiredTargetBBox(input.targetBBox),
      }
    case 'swipe': {
      const action: Extract<PhoneAction, { action: 'swipe' }> = {
        action: 'swipe',
        observationId: requiredObservationId(input.observationId, 'swipe'),
        x1: requiredNumber(input.x1, 'swipe', 'x1, y1, x2, and y2'),
        y1: requiredNumber(input.y1, 'swipe', 'x1, y1, x2, and y2'),
        x2: requiredNumber(input.x2, 'swipe', 'x1, y1, x2, and y2'),
        y2: requiredNumber(input.y2, 'swipe', 'x1, y1, x2, and y2'),
      }
      if (input.durationMs !== undefined) {
        action.durationMs = requiredNumber(input.durationMs, 'swipe', 'an integer durationMs')
      }
      return action
    }
    case 'read_text': return { action: 'read_text', observationId: requiredObservationId(input.observationId, 'read_text'), targetBBox: requiredTargetBBox(input.targetBBox) }
    case 'replace_text':
    case 'text':
      if (typeof input.text !== 'string') throw new Error('opengui: text requires text as a string')
      return { action: input.action, observationId: requiredObservationId(input.observationId, input.action), text: input.text }
    case 'key':
      if (input.key !== 'Back' && input.key !== 'Home' && input.key !== 'Enter' && input.key !== 'AppSwitch') {
        throw new Error('opengui: key requires one of Back, Home, Enter, or AppSwitch')
      }
      return { action: 'key', observationId: requiredObservationId(input.observationId, 'key'), key: input.key }
    case 'launch':
      if (typeof input.packageName !== 'string') throw new Error('opengui: launch requires packageName as a string')
      return { action: 'launch', observationId: requiredObservationId(input.observationId, 'launch'), packageName: input.packageName }
    case 'wait':
      return {
        action: 'wait',
        observationId: requiredObservationId(input.observationId, 'wait'),
        waitMs: requiredNumber(input.waitMs, 'wait', 'an integer waitMs'),
      }
    default:
      throw new Error('opengui: unsupported action')
  }
}

/**
 * Parse `adb devices -l` without treating offline/unauthorized rows as usable.
 * @param output Standard output from `adb devices -l`.
 * @returns Parsed device rows in their original order.
 */
export function parseDevices(output: string): AdbDevice[] {
  return output.split(/\r?\n/u).slice(1).map(line => line.trim()).filter(Boolean).map((line) => {
    const [serial = '', state = 'unknown', ...fields] = line.split(/\s+/u)
    const attributes = new Map<string, string>()
    for (const field of fields) {
      const separator = field.indexOf(':')
      if (separator > 0) attributes.set(field.slice(0, separator), field.slice(separator + 1))
    }
    const model = attributes.get('model')
    const product = attributes.get('product')
    const device = attributes.get('device')
    return {
      serial,
      state,
      ...(model === undefined ? {} : { model }),
      ...(product === undefined ? {} : { product }),
      ...(device === undefined ? {} : { device }),
    }
  }).filter(device => device.serial.length > 0)
}

/**
 * Pick one deterministic target for compatibility with single-device callers.
 * @param devices Device rows returned by {@link parseDevices}.
 * @returns The lexicographically first authorized serial.
 */
export function selectAuthorizedSerial(devices: readonly AdbDevice[]): string {
  const serial = devices.filter(device => device.state === 'device')
    .map(device => device.serial).sort((a, b) => a.localeCompare(b))[0]
  if (serial === undefined) {
    throw new Error('opengui: no authorized Android device is connected; connect at least one phone and accept its USB debugging prompt')
  }
  return serial
}

/**
 * Parse the logical display size used by screenshots and input.
 * @param output Standard output from `adb shell wm size`.
 * @returns The effective logical width and height.
 */
export function parseScreenSize(output: string): ScreenSize {
  const match = output.match(/Override size:\s*(\d+)x(\d+)/iu)
    ?? output.match(/Physical size:\s*(\d+)x(\d+)/iu)
    ?? output.match(/(\d+)x(\d+)/u)
  const width = Number(match?.[1] ?? 0)
  const height = Number(match?.[2] ?? 0)
  if (!(width > 0 && height > 0)) throw new Error('opengui: ADB did not report a valid display size')
  return { width, height }
}

function screenshotCoordinate(value: number, modelTotal: number, inputTotal: number, name: string): string {
  if (!Number.isFinite(value) || value < 0 || value > modelTotal) {
    throw new Error(`opengui: ${name} must be inside the current screenshot's ${modelTotal}px axis`)
  }
  return String(Math.round((value * inputTotal) / modelTotal))
}

function targetCenter(box: TargetBoundingBox, screen: PhoneCoordinateSpace): { x: string; y: string } {
  if (!(box.right > box.left) || !(box.bottom > box.top)) {
    throw new Error('opengui: targetBBox must have positive width and height')
  }
  if (box.left < 0 || box.top < 0 || box.right > screen.screenshotWidth || box.bottom > screen.screenshotHeight) {
    throw new Error(`opengui: targetBBox must fit the current ${screen.screenshotWidth}x${screen.screenshotHeight} screenshot`)
  }
  return {
    x: screenshotCoordinate((box.left + box.right) / 2, screen.screenshotWidth, screen.width, 'targetBBox center x'),
    y: screenshotCoordinate((box.top + box.bottom) / 2, screen.screenshotHeight, screen.height, 'targetBBox center y'),
  }
}

function validatePackageName(packageName: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/u.test(packageName)) throw new Error('opengui: packageName must be a valid Android application id')
}

/** Resolve only the requested application's launcher without starting it. */
export function launcherQueryCommand(packageName: string): string[] {
  validatePackageName(packageName)
  return ['shell', 'pm', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', packageName]
}

/** Accept one explicit activity owned by the requested application. */
export function parseLauncherActivity(output: string, packageName: string): string {
  validatePackageName(packageName)
  const activities = output.split(/\r?\n/u).map(line => line.trim()).filter(line => /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+\/\.?[A-Za-z_$][A-Za-z0-9_.$]*$/u.test(line))
  if (activities.length !== 1 || !activities[0]!.startsWith(`${packageName}/`)) throw new Error('opengui: requested application has no unambiguous launcher activity; no launch was dispatched')
  return activities[0]!
}

/**
 * Build the allowlisted device-side command for one validated operation.
 * @param action A validated phone action.
 * @param screen Device input dimensions and the screenshot pixel space shown to the model.
 * @returns ADB arguments, or no arguments for a pure observation.
 */
export function actionCommand(action: PhoneAction, screen: PhoneCoordinateSpace, launcherActivity?: string): string[] | undefined {
  switch (action.action) {
    case 'observe': return undefined
    case 'tap': {
      const center = targetCenter(action.targetBBox, screen)
      return ['shell', 'input', 'tap', center.x, center.y]
    }
    case 'swipe': {
      const duration = action.durationMs ?? 300
      if (!Number.isInteger(duration) || duration < 50 || duration > 2_000) {
        throw new Error('opengui: durationMs must be an integer from 50 through 2000')
      }
      return [
        'shell', 'input', 'swipe',
        screenshotCoordinate(action.x1, screen.screenshotWidth, screen.width, 'x1'),
        screenshotCoordinate(action.y1, screen.screenshotHeight, screen.height, 'y1'),
        screenshotCoordinate(action.x2, screen.screenshotWidth, screen.width, 'x2'),
        screenshotCoordinate(action.y2, screen.screenshotHeight, screen.height, 'y2'),
        String(duration),
      ]
    }
    case 'read_text':
    case 'replace_text': return undefined
    case 'text': {
      if (action.text.length < 1 || action.text.length > 500 || !/^[A-Za-z0-9 .,!?_@+:'"()-]+$/u.test(action.text)) {
        throw new Error('opengui: text must be 1-500 characters supported by Android adb input text')
      }
      return ['shell', 'input', 'text', action.text.replaceAll(' ', '%s')]
    }
    case 'key': return ['shell', 'input', 'keyevent', KEY_CODES[action.key]]
    case 'launch':
      validatePackageName(action.packageName)
      return ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', parseLauncherActivity(launcherActivity ?? '', action.packageName)]
    case 'wait': {
      if (!Number.isInteger(action.waitMs) || action.waitMs < 100 || action.waitMs > 10_000) {
        throw new Error('opengui: waitMs must be an integer from 100 through 10000')
      }
      return undefined
    }
    default: return assertNever(action)
  }
}

/**
 * Build the bounded ADB text-input sequence for Android's safe ASCII set.
 * Unicode is intentionally rejected here so callers cannot mistake an
 * unacknowledged shell clipboard attempt for successful input; it is handled
 * by the acknowledged scrcpy control channel instead.
 * @param text Text to enter in the focused Android field.
 * @returns One allowlisted ADB argument array.
 */
export function textInputCommands(text: string): string[][] {
  if (text.length < 1 || [...text].length > 500 || text.includes('\0')) {
    throw new Error('opengui: text must contain 1-500 Unicode characters without NUL')
  }
  if (canUseAdbInputText(text)) {
    return [['shell', 'input', 'text', text.replaceAll(' ', '%s')]]
  }
  throw new Error('opengui: Unicode text requires acknowledged scrcpy clipboard input')
}

/**
 * Resolve the ADB executable installed inside this plugin.
 * @param override Optional development-only executable path.
 * @returns An absolute path to the selected ADB executable.
 */
export function managedAdbPath(override?: string): string {
  if (override !== undefined && override.trim().length > 0) return override
  const root = dirname(fileURLToPath(import.meta.url))
  if (process.platform === 'darwin' && (process.arch === 'arm64' || process.arch === 'x64')) {
    return join(root, '..', 'assets', 'platform-tools', 'darwin', 'adb')
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return join(root, '..', 'assets', 'platform-tools', 'linux-x64', 'adb')
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return join(root, '..', 'assets', 'platform-tools', 'win32-x64', 'adb.exe')
  }
  throw new Error(`opengui: no bundled ADB runtime for ${process.platform}/${process.arch}`)
}

/**
 * Fail before device discovery if the packaged runtime is missing or unusable.
 * @param path Absolute ADB executable path.
 */
export async function assertAdbReady(path: string, options: { readonly repairPermissions?: boolean } = {}): Promise<void> {
  const info = await stat(path).catch(() => undefined)
  if (info?.isFile() !== true) throw new Error(`opengui: bundled ADB runtime is missing at ${path}; reinstall the plugin`)
  if (process.platform === 'win32') {
    await access(path, constants.F_OK)
    return
  }
  try {
    await access(path, constants.X_OK)
  } catch (error) {
    if (options.repairPermissions === true) {
      try {
        await chmod(path, info.mode | 0o111)
        await access(path, constants.X_OK)
        return
      } catch (repairError) {
        throw new Error('opengui: bundled ADB is not executable and automatic permission repair failed; reinstall the plugin', { cause: repairError })
      }
    }
    throw new Error('opengui: configured ADB executable is not executable; check adbPath or OPENGUI_ADB_PATH and its file permissions', { cause: error })
  }
}

/** Process limits applied to every ADB invocation. */
export interface AdbRunOptions {
  signal?: AbortSignal
  timeoutMs: number
  maxBuffer?: number
  encoding?: BufferEncoding | 'buffer'
}

/**
 * Execute ADB directly (never through a shell) with cancellation and bounded output.
 * @param path Absolute ADB executable path.
 * @param args Fixed allowlisted argument array.
 * @param options Cancellation, timeout, output, and encoding limits.
 * @returns Captured standard output in the requested representation.
 */
export function runAdb(path: string, args: readonly string[], options: AdbRunOptions): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    execFile(path, [...args], {
      shell: false,
      windowsHide: true,
      timeout: options.timeoutMs,
      signal: options.signal,
      maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      encoding: options.encoding === 'buffer' ? 'buffer' : options.encoding ?? 'utf8',
    }, (error, stdout, stderr) => {
      const diagnostic = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : stderr
      const shell = args.indexOf('shell')
      if (shell >= 0 && args[shell + 1] === 'input' && inputPermissionDenied(`${String(stdout)}\n${diagnostic}`)) {
        reject(inputPermissionError()); return
      }
      if (shell >= 0 && args[shell + 1] === 'am' && args[shell + 2] === 'start' && /(?:^|\n)\s*(?:Error:|Error type \d+|Exception occurred while executing)/u.test(`${String(stdout)}\n${diagnostic}`)) {
        reject(new Error('opengui: Android could not start the requested application; check that it has an enabled launcher activity')); return
      }
      if (error !== null) {
        reject(new Error(`opengui: ADB command failed: ${(diagnostic || error.message).trim().slice(0, 2_000)}`, { cause: error }))
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * The focused editor's selection as tracked by the app's input method client. After select-all,
 * a zero-length selection at 0 proves the field is empty even when copy leaves the clipboard
 * untouched; anything else (or a missing editor) stays unknown.
 */
export function parseFocusedEditorSelection(output: string): { packageName: string; start: number; end: number } | undefined {
  const box = /mCurrentTextBoxAttribute:\n([\s\S]*?)\n  m[A-Z]/u.exec(output)?.[1]
  const packageName = box && /\bpackageName=([A-Za-z][\w.]*)/u.exec(box)?.[1]
  if (!packageName || !/^ {2}mServedView=(?!null)\S/mu.test(output)) return undefined
  const selection = /mCursorSelStart=(-?\d+) mCursorSelEnd=(-?\d+)/u.exec(output)
  if (!selection) return undefined
  return { packageName, start: Number(selection[1]), end: Number(selection[2]) }
}

