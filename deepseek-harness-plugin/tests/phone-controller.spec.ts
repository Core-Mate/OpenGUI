import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { PhoneController } from '../src/phone-controller.ts'
import { encodePhoneScreenshotFrame } from '../src/image.ts'

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
  })
  const actor = {}
  value.assignTarget(actor, 'serial-a')
  return { value, actor, commands, pasteUnicode }
}

describe('shared OpenGUI phone controller', () => {
  it('returns bounded image coordinates and foreground package metadata', async () => {
    const { value, actor } = await controller()
    const observed = await value.observe(actor, new AbortController().signal)

    expect(observed).toMatchObject({
      observationId: 'phone-observation-1', serial: 'serial-a', width: 100, height: 200,
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
