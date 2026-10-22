import { access } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ObservationId, normalizePhoneAction } from '../src/adb.ts'
import { HarmonyPhoneDriver } from '../src/harmony-driver.ts'
import { PhoneController } from '../src/phone-controller.ts'
import type { DeviceMutation } from '../src/device-driver.ts'
import { fakeHdc, layout } from './harmony-fixtures.ts'

const screen = { width: 100, height: 200, screenshotWidth: 50, screenshotHeight: 100 }
const signal = () => new AbortController().signal
const action = (input: Record<string, unknown>) => normalizePhoneAction({ observationId: 'test', ...input }) as DeviceMutation

describe('HarmonyOS phone driver', () => {
  it('captures stable frames and removes every temporary host/device artifact', async () => {
    const mock = fakeHdc(), driver = new HarmonyPhoneDriver(mock.run)
    const frame = await driver.capture('device-a', signal())
    expect(frame).toMatchObject({ foregroundPackage: 'com.example.demo', layout: { stable: true } })
    expect(frame.layout?.nodes[0]?.hint).toBe('Search')
    expect(mock.files.size).toBe(0)
    for (const path of mock.localFiles) await expect(access(dirname(path))).rejects.toThrow()
  })
  it('waits for layout changes to settle and reports persistent animation', async () => {
    const mock = fakeHdc(), driver = new HarmonyPhoneDriver(mock.run)
    mock.state.layouts = [layout('before'), layout('after'), layout('after')]
    expect((await driver.capture('device-a', signal())).layout?.stable).toBe(true)
    expect(mock.commands.filter(value => value.includes("'screenCap'"))).toHaveLength(2)
    mock.state.layouts = [layout('1'), layout('2'), layout('3'), layout('4')]
    const frame = await driver.capture('device-a', signal())
    expect(frame.layout?.stable).toBe(false)
    expect(() => driver.prepare(action({ action: 'tap', targetBBox: { left: 5, top: 10, right: 10, bottom: 15 } }), screen, frame)).toThrow('unstable')
  })
  it('blocks stale live layouts before sending any input', async () => {
    const mock = fakeHdc(), driver = new HarmonyPhoneDriver(mock.run)
    const before = await driver.capture('device-a', signal())
    mock.state.layouts = [layout('', '[20,20][90,40]')]
    const prepared = driver.prepare(action({ action: 'tap', targetBBox: { left: 5, top: 10, right: 10, bottom: 15 } }), screen, before)
    await expect(prepared.execute('device-a', signal())).rejects.toThrow('changed since observation')
    expect(mock.commands.some(command => command.includes("'uiInput'"))).toBe(false)
  })
  it('converts image coordinates and swipe duration to UiTest velocity', async () => {
    const mock = fakeHdc(), driver = new HarmonyPhoneDriver(mock.run), abort = signal()
    const before = await driver.capture('device-a', abort)
    await driver.prepare(action({ action: 'long_press', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } }), screen, before).execute('device-a', abort)
    expect(mock.commands).toContain("'uitest' 'uiInput' 'longClick' '30' '30'")
    await driver.prepare(action({ action: 'swipe', x1: 25, y1: 80, x2: 25, y2: 20, durationMs: 300 }), screen, before).execute('device-a', abort)
    expect(mock.commands).toContain("'uitest' 'uiInput' 'swipe' '50' '160' '50' '40' '400'")
    expect(() => driver.prepare(action({ action: 'tap', targetBBox: { left: 0, top: 0, right: 51, bottom: 10 } }), screen, before)).toThrow('fit')
  })
  it.each([17, 24])('uses the supported Unicode input route on API %i', async api => {
    const mock = fakeHdc(); mock.state.api = api
    const driver = new HarmonyPhoneDriver(mock.run), before = await driver.capture('device-a', signal())
    await driver.prepare(action({ action: 'text', text: '你好🙂' }), screen, before).execute('device-a', signal())
    expect(mock.commands).toContain(api === 17 ? "'uitest' 'uiInput' 'inputText' '50' '30' '你好🙂'" : "'uitest' 'uiInput' 'text' '你好🙂'")
    const permission = layout('允许来自剪贴板的内容？'); permission.attributes.bundleName = 'com.huawei.hmos.security.privacycenter'
    mock.state.layouts = [permission]
    expect(driver.assess(action({ action: 'text', text: '你好🙂' }), await driver.capture('device-a', signal())).status).toBe('permission_required')
    mock.state.layouts = [layout('你好🙂')]
    expect(driver.assess(action({ action: 'text', text: '你好🙂' }), await driver.capture('device-a', signal())).status).toBe('text_present')
    mock.state.layouts = [layout('different')]
    expect(driver.assess(action({ action: 'text', text: '你好🙂' }), await driver.capture('device-a', signal())).status).toBe('text_unconfirmed')
  })
  it('requires explicit ability identity and rejects unsupported or malformed actions', async () => {
    const mock = fakeHdc(), driver = new HarmonyPhoneDriver(mock.run), before = await driver.capture('device-a', signal())
    expect(() => driver.prepare(action({ action: 'launch', packageName: 'com.example.demo' }), screen, before)).toThrow('abilityName')
    await driver.prepare(action({ action: 'launch', packageName: 'com.example.demo', abilityName: 'EntryAbility' }), screen, before).execute('device-a', signal())
    expect(mock.commands).toContain("'aa' 'start' '-b' 'com.example.demo' '-a' 'EntryAbility'")
    expect(() => driver.prepare(action({ action: 'key', key: 'AppSwitch' }), screen, before)).toThrow('not supported')
    expect(() => driver.prepare(action({ action: 'text', text: 'x'.repeat(501) }), screen, before)).toThrow('1-500')
    expect(() => driver.prepare(action({ action: 'text', text: 'abc' }), screen, { ...before, layout: { ...before.layout!, nodes: [] } })).toThrow('editable')
  })
  it('rejects old APIs and incomplete transfers, cleaning artifacts on failure', async () => {
    const old = fakeHdc(); old.state.api = 16
    await expect(new HarmonyPhoneDriver(old.run).capture('device-a', signal())).rejects.toThrow('API 17')
    const mock = fakeHdc(); mock.state.transferFails = true
    await expect(new HarmonyPhoneDriver(mock.run).capture('device-a', signal())).rejects.toThrow('incomplete')
    expect(mock.files.size).toBe(0)
    for (const file of mock.localFiles) await expect(access(dirname(file))).rejects.toThrow()
  })
  it('shares observation consumption and metadata with the existing execution kernel', async () => {
    const mock = fakeHdc(), driver = new HarmonyPhoneDriver(mock.run)
    const controller = new PhoneController({ driver, discoverTarget: async () => 'device-a', maxOperations: () => 100,
      encodeScreenshot: async () => ({ data: Buffer.from('jpeg'), width: 50, height: 100 }) })
    const actor = {}, before = await controller.observe(actor, signal())
    expect(before.layout?.nodes[0]?.bounds).toEqual({ left: 5, right: 45, top: 10, bottom: 20 })
    mock.state.failAction = true
    const input = { action: 'tap', observationId: before.observationId, targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } }
    await expect(controller.execute(actor, input, signal())).rejects.toThrow('not acknowledged')
    await expect(controller.execute(actor, input, signal())).rejects.toThrow('observe the phone')
    const next = await controller.observe(actor, signal())
    expect(next.observationId).not.toBe(ObservationId(before.observationId))
    const aborted = new AbortController(); aborted.abort(new Error('cancelled'))
    await expect(controller.observe(actor, aborted.signal)).rejects.toThrow('cancelled')
  })
})
