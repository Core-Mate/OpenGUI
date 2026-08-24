import { describe, expect, it } from 'vitest'
import {
  actionCommand,
  normalizePhoneAction,
  ObservationId,
  parseDevices,
  parseScreenSize,
  selectAuthorizedSerial,
  textInputCommands,
} from '../src/adb.ts'
import { Config } from '../src/index.ts'

describe('coremate-mobile ADB policy', () => {
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

  it('does not impose a fixed delay after every device mutation', () => {
    expect(Config({})).not.toHaveProperty('settleDelayMs')
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
})
