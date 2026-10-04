import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseFocusedEditorSelection,
  actionCommand,
  assertAdbReady,
  normalizePhoneAction,
  ObservationId,
  parseDevices,
  parseScreenSize,
  selectAuthorizedSerial,
  textInputCommands,
  runAdb,
} from '../src/adb.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('coremate-mobile ADB policy', () => {
  it.skipIf(process.platform === 'win32')('rejects Android launch errors even when am exits successfully', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-adb-launch-')); temporaryRoots.push(root)
    const adb = join(root, 'adb'), args = actionCommand({ action: 'launch', observationId: ObservationId('launch-frame'), packageName: 'com.example.app' }, { width: 100, height: 200, screenshotWidth: 100, screenshotHeight: 200 }, 'com.example.app/.MainActivity')!
    for (const message of ['Error: Activity not started, unable to resolve Intent', 'Error type 3\nError: Activity class does not exist.']) {
      await writeFile(adb, `#!/bin/sh\nprintf '%s\\n' '${message}'\nexit 0\n`, { mode: 0o700 })
      await expect(runAdb(adb, args, { timeoutMs: 5000 })).rejects.toThrow('could not start')
    }
    await writeFile(adb, '#!/bin/sh\nprintf "Warning: Activity not started, its current task has been brought to the front\\nStatus: ok\\n"\nexit 0\n', { mode: 0o700 })
    await expect(runAdb(adb, args, { timeoutMs: 5000 })).resolves.toContain('Status: ok')
  })

  it.skipIf(process.platform === 'win32')('recognizes input permission denials on stderr and stdout even when the process exits successfully', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-adb-input-')); temporaryRoots.push(root)
    const adb = join(root, 'adb'), signal = AbortSignal.timeout(5000)
    const denial = 'java.lang.SecurityException: Injecting to another application requires INJECT_EVENTS permission'
    for (const stream of ['stdout', 'stderr']) {
      await writeFile(adb, `#!/bin/sh\nprintf '%s\\n' '${denial}' ${stream === 'stderr' ? '>&2' : ''}\nexit 0\n`, { mode: 0o700 })
      await expect(runAdb(adb, ['-s', 'original', 'shell', 'input', 'tap', '1', '2'], { signal })).rejects.toMatchObject({ code: 'input_permission_denied', executionState: 'outcome_unknown' })
      await expect(runAdb(adb, ['-s', 'original', 'shell', 'dumpsys', 'window'], { signal })).resolves.toBeDefined()
    }
    await writeFile(adb, `#!/bin/sh\nprintf '%s\\n' '${denial}' >&2\nexit 1\n`, { mode: 0o700 })
    await expect(runAdb(adb, ['shell', 'input', 'keyevent', '3'], { signal })).rejects.toMatchObject({ code: 'input_permission_denied' })
  })
  it.skipIf(process.platform === 'win32')('repairs execute bits stripped from the packaged ADB runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-adb-mode-'))
    temporaryRoots.push(root)
    const adb = join(root, 'adb')
    await writeFile(adb, '#!/bin/sh\nexit 0\n')
    await chmod(adb, 0o644)

    await expect(assertAdbReady(adb, { repairPermissions: true })).resolves.toBeUndefined()
    expect((await stat(adb)).mode & 0o111).toBe(0o111)
  })

  it.skipIf(process.platform === 'win32')('does not change permissions on a user-configured ADB path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-custom-adb-mode-'))
    temporaryRoots.push(root)
    const adb = join(root, 'adb')
    await writeFile(adb, '#!/bin/sh\nexit 0\n')
    await chmod(adb, 0o644)

    await expect(assertAdbReady(adb)).rejects.toThrow('configured ADB executable')
    expect((await stat(adb)).mode & 0o111).toBe(0)
  })

  it('accepts one or more authorized devices and deterministically picks the first serial', () => {
    const devices = parseDevices('List of devices attached\nzed device product:p model:Z\nignored unauthorized usb:1\nalpha device product:p model:A\noffline offline\n')
    expect(selectAuthorizedSerial(devices)).toBe('alpha')
  })

  it('fails only when no authorized device exists', () => {
    const devices = parseDevices('List of devices attached\nlocked unauthorized\nslow offline\n')
    expect(() => selectAuthorizedSerial(devices)).toThrow('no authorized Android device')
  })

  it('uses the logical override display size when Android reports one', () => {
    expect(parseScreenSize('Physical size: 1440x3120\nOverride size: 1080x2340\n'))
      .toEqual({ width: 1080, height: 2340 })
  })

  it('builds only allowlisted shell argument arrays', () => {
    const screen = { width: 1000, height: 2000, screenshotWidth: 1000, screenshotHeight: 2000 }
    expect(actionCommand({
      action: 'tap',
      observationId: ObservationId('phone-observation-1'),
      targetBBox: { left: 490, top: 490, right: 510, bottom: 510 },
    }, screen))
      .toEqual(['shell', 'input', 'tap', '500', '500'])
    expect(actionCommand({ action: 'key', observationId: ObservationId('phone-observation-1'), key: 'Back' }, screen))
      .toEqual(['shell', 'input', 'keyevent', 'KEYCODE_BACK'])
    expect(() => actionCommand({ action: 'launch', observationId: ObservationId('phone-observation-1'), packageName: 'bad;name' }, screen))
      .toThrow('packageName')
  })

  it('maps a screenshot-pixel target box into the device input space', () => {
    expect(actionCommand({
      action: 'tap',
      observationId: ObservationId('observation-1'),
      targetBBox: { left: 1_080, top: 120, right: 1_120, bottom: 190 },
    }, {
      width: 1_080,
      height: 2_400,
      screenshotWidth: 1_200,
      screenshotHeight: 2_400,
    })).toEqual(['shell', 'input', 'tap', '990', '155'])
  })

  it('maps M153 model coordinates from the bounded screenshot back to the device', () => {
    expect(actionCommand({
      action: 'tap',
      observationId: ObservationId('m153-observation'),
      targetBBox: { left: 440, top: 990, right: 484, bottom: 1_058 },
    }, {
      width: 1_264,
      height: 2_800,
      screenshotWidth: 925,
      screenshotHeight: 2_048,
    })).toEqual(['shell', 'input', 'tap', '631', '1400'])

    expect(actionCommand({
      action: 'swipe',
      observationId: ObservationId('m153-observation'),
      x1: 462,
      y1: 1_536,
      x2: 462,
      y2: 512,
      durationMs: 300,
    }, {
      width: 1_264,
      height: 2_800,
      screenshotWidth: 925,
      screenshotHeight: 2_048,
    })).toEqual(['shell', 'input', 'swipe', '631', '2100', '631', '700', '300'])
  })

  it('keeps safe ASCII on adb input text and rejects unacknowledged Unicode injection', () => {
    expect(textInputCommands('hello world')).toEqual([
      ['shell', 'input', 'text', 'hello%sworld'],
    ])
    expect(() => textInputCommands('你好，世界')).toThrow('acknowledged scrcpy')
    expect(() => textInputCommands('\0')).toThrow('without NUL')
    expect(() => textInputCommands('😀'.repeat(501))).toThrow('1-500 Unicode characters')
  })

  it('rejects missing or mismatched action fields before building ADB arguments', () => {
    expect(() => normalizePhoneAction({ action: 'tap', targetBBox: {} })).toThrow('current observationId')
    expect(() => normalizePhoneAction({ action: 'tap', observationId: 'phone-observation-1' })).toThrow('targetBBox')
    expect(() => normalizePhoneAction({ action: 'key' })).toThrow('key requires one of')
    expect(() => normalizePhoneAction({ action: 'text', text: 42 })).toThrow('text requires text')
    expect(() => normalizePhoneAction({ action: 'shell', command: 'id' })).toThrow('unsupported action')
    expect(normalizePhoneAction({ action: 'observe' })).toEqual({ action: 'observe' })
  })
  it('reads the focused editor selection from the input method dump and stays unknown without an editor', () => {
    const dump = ['  mServedView=android.widget.EditText{d1593dd VFED..CL. .F...... 32,588-1048,834 aid=1073741824}', '  mServedConnecting=false', '  mCurrentTextBoxAttribute:', '    inputType=0x20001 imeOptions=0x40000006 privateImeOptions=null', '    hintText=本地评论输入框 label=null', '    packageName=com.opengui.qa autofillId=1073741824 fieldId=-1 fieldName=null', '  mServedInputConnection=RemoteInputConnectionImpl{}', '  mCursorSelStart=0 mCursorSelEnd=3 mCursorCandStart=-1 mCursorCandEnd=-1'].join('\n')
    expect(parseFocusedEditorSelection(dump)).toEqual({ packageName: 'com.opengui.qa', start: 0, end: 3 })
    expect(parseFocusedEditorSelection(dump.replace('mCursorSelEnd=3', 'mCursorSelEnd=0'))).toEqual({ packageName: 'com.opengui.qa', start: 0, end: 0 })
    expect(parseFocusedEditorSelection(dump.replace('  mServedView=android.widget.EditText{d1593dd VFED..CL. .F...... 32,588-1048,834 aid=1073741824}', '  mServedView=null'))).toBeUndefined()
    expect(parseFocusedEditorSelection('  mServedView=null\n  mCurrentTextBoxAttribute: null\n  mCursorSelStart=0 mCursorSelEnd=0')).toBeUndefined()
  })
})
