import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { PhoneController } from '../src/phone-controller.ts'
import { encodeWorkBuddyPhoneScreenshot as encodePhoneScreenshotFrame } from '../src/screenshot.ts'

async function screenshot(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 200, channels: 3, background: '#334155' } }).png().toBuffer()
}

async function controller(maxOperations = 100) {
  const image = await screenshot()
  const commands: readonly string[][] = []
  const runAdb = vi.fn(async (args: readonly string[], _signal: AbortSignal, buffer = false): Promise<string | Buffer> => {
    ;(commands as string[][]).push([...args])
    if (args.includes('screencap')) return buffer ? image : image.toString('binary')
    if (args.includes('wm')) return 'Physical size: 100x200\n'
    if (args.includes('dumpsys')) return 'mCurrentFocus=Window{ u0 com.example.app/.MainActivity }\n'
    return ''
  })
  const pasteUnicode = vi.fn(async () => undefined)
  const value = new PhoneController({
    runAdb,
    discoverTarget: async () => 'serial-a',
    pasteUnicode,
    encodeScreenshot: encodePhoneScreenshotFrame,
    maxOperations: () => maxOperations,
    settleIntervalMs: 1,
    settleTimeoutMs: 5,
  })
  const actor = {}
  value.assignTarget(actor, 'serial-a')
  return { value, actor, commands, pasteUnicode, runAdb }
}

describe('shared OpenGUI phone controller', () => {
  it('never replays a dispatched action whose result screenshot failed', async () => {
    const { value, actor, runAdb, commands } = await controller()
    const before = await value.observe(actor, new AbortController().signal)
    const original = runAdb.getMockImplementation()!
    let sent = false
    runAdb.mockImplementation(async (args, abort, buffer) => {
      if (args.includes('screencap') && sent) throw new Error('capture failed')
      if (args.includes('keyevent')) sent = true
      return original(args, abort, buffer)
    })
    const action = { action: 'key', key: 'Enter', observationId: before.observationId }
    await expect(value.execute(actor, action, new AbortController().signal)).rejects.toMatchObject({ executionState: 'outcome_unknown' })
    await expect(value.execute(actor, action, new AbortController().signal)).rejects.toMatchObject({ executionState: 'not_executed' })
    expect(commands.filter(args => args.includes('keyevent'))).toHaveLength(1)
  })
  it('invalidates the old observation when refresh fails', async () => {
    const { value, actor, runAdb, commands } = await controller()
    const signal = AbortSignal.timeout(5000)
    const frame = await value.observe(actor, signal)
    runAdb.mockRejectedValueOnce(new Error('capture failed'))
    await expect(value.observe(actor, signal)).rejects.toThrow('capture failed')
    await expect(value.execute(actor, { action: 'key', key: 'Home', observationId: frame.observationId }, signal)).rejects.toThrow('observe the phone')
    expect(commands.some(args => args.includes('keyevent'))).toBe(false)
    const fresh = await value.observe(actor, signal)
    await value.execute(actor, { action: 'key', key: 'Home', observationId: fresh.observationId }, signal)
    expect(commands.some(args => args.includes('keyevent'))).toBe(true)
  })

  it('refuses an action before dispatch if the phone frame has changed', async () => {
    const { value, actor, runAdb, commands } = await controller()
    const signal = AbortSignal.timeout(5000)
    const frame = await value.observe(actor, signal)
    const changed = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer()
    const original = runAdb.getMockImplementation()!
    runAdb.mockImplementation(async (args, abort, buffer) => args.includes('screencap') ? changed : original(args, abort, buffer))
    await expect(value.execute(actor, { action: 'key', key: 'Enter', observationId: frame.observationId }, signal)).rejects.toMatchObject({ code: 'screen_changed', executionState: 'not_executed' })
    expect(commands.some(args => args.includes('keyevent'))).toBe(false)
    const fresh = await value.observe(actor, signal)
    await value.execute(actor, { action: 'key', key: 'Enter', observationId: fresh.observationId }, signal)
    expect(commands.some(args => args.includes('keyevent'))).toBe(true)
  })
  it('returns bounded image coordinates and foreground package metadata', async () => {
    const { value, actor } = await controller()
    const observed = await value.observe(actor, new AbortController().signal)

    expect(observed).toMatchObject({
      observationId: expect.stringMatching(/^phone-observation-/), serial: 'serial-a', width: 100, height: 200,
      foregroundPackage: 'com.example.app', image: { width: 100, height: 200, mediaType: 'image/jpeg' },
    })
    expect(observed.image.data.subarray(0, 2).toString('hex')).toBe('ffd8')
  })

  it('rejects stale coordinates before issuing a mutation', async () => {
    const { value, actor, commands } = await controller()
    await value.observe(actor, new AbortController().signal)
    const before = commands.length

    await expect(value.execute(actor, {
      action: 'tap', observationId: 'old', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 },
    }, new AbortController().signal)).rejects.toThrow('stale observationId')
    expect(commands.slice(before).some(command => command.includes('tap'))).toBe(false)
  })

  it('blocks a fourth identical action after three unchanged results', async () => {
    const { value, actor } = await controller()
    let frame = await value.observe(actor, new AbortController().signal)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      frame = await value.execute(actor, {
        action: 'tap', observationId: frame.observationId,
        targetBBox: { left: 10, top: 10, right: 20, bottom: 20 },
      }, new AbortController().signal)
    }
    await expect(value.execute(actor, {
      action: 'tap', observationId: frame.observationId,
      targetBBox: { left: 10, top: 10, right: 20, bottom: 20 },
    }, new AbortController().signal)).rejects.toThrow('no screen progress three times')
  })

  it('shares Unicode input and the operation budget across Host adapters', async () => {
    const { value, actor, pasteUnicode } = await controller(2)
    const frame = await value.observe(actor, new AbortController().signal)
    await value.execute(actor, { action: 'text', observationId: frame.observationId, text: '你好' }, new AbortController().signal)

    expect(pasteUnicode).toHaveBeenCalledWith('serial-a', '你好', expect.any(AbortSignal))
    await expect(value.observe(actor, new AbortController().signal)).rejects.toThrow('2-operation limit')
  })
})
