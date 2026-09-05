import { describe, expect, it, vi } from 'vitest'
import { PhoneController } from '../src/phone-controller.ts'

async function screenshot(width = 100, height = 200): Promise<Buffer> {
  const header = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(header)
  header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20)
  return header
}

async function controller(maxOperations = 100, landscape = false) {
  const image = await screenshot(landscape ? 200 : 100, landscape ? 100 : 200)
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
    encodeScreenshot: async () => ({ data: Buffer.from('ffd8ffd9', 'hex'), width: landscape ? 200 : 100, height: landscape ? 100 : 200 }),
    maxOperations: () => maxOperations,
  })
  const actor = {}
  value.assignTarget(actor, 'serial-a')
  return { value, actor, commands, pasteUnicode, runAdb }
}

describe('standalone OpenGUI phone controller', () => {
  it('consumes the observation even when post-action capture fails', async () => {
    const { value, actor, commands, runAdb } = await controller()
    const signal = new AbortController().signal
    const frame = await value.observe(actor, signal)
    const original = runAdb.getMockImplementation()!
    runAdb.mockImplementation(async (args, abort, buffer) => {
      if (args.includes('screencap')) throw new Error('capture failed')
      return original(args, abort, buffer)
    })
    const action = { action: 'tap', observationId: frame.observationId, targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } }
    await expect(value.execute(actor, action, signal)).rejects.toThrow('capture failed')
    await expect(value.execute(actor, action, signal)).rejects.toThrow('observe the phone')
    expect(commands.filter(command => command.includes('tap'))).toHaveLength(1)
    runAdb.mockImplementation(original)
    const next = await value.observe(actor, signal)
    await expect(value.execute(actor, { ...action, observationId: next.observationId }, signal)).resolves.toBeDefined()
  })
  it('uses captured landscape coordinates instead of the natural portrait display size', async () => {
    const { value, actor, commands } = await controller(100, true)
    const frame = await value.observe(actor, new AbortController().signal)
    expect(frame).toMatchObject({ width: 200, height: 100 })
    await value.execute(actor, { action: 'tap', observationId: frame.observationId,
      targetBBox: { left: 140, top: 40, right: 160, bottom: 60 } }, new AbortController().signal)
    expect(commands).toContainEqual(['-s', 'serial-a', 'shell', 'input', 'tap', '150', '50'])
  })
  it('rejects another device actor observation even at the same sequence number', async () => {
    const { value, actor, commands } = await controller()
    const other = {}; value.assignTarget(other, 'serial-b')
    const first = await value.observe(actor, new AbortController().signal)
    const second = await value.observe(other, new AbortController().signal)
    expect(first.observationId).not.toBe(second.observationId)
    const before = commands.length
    await expect(value.execute(other, { action: 'tap', observationId: first.observationId,
      targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } }, new AbortController().signal)).rejects.toThrow('stale observationId')
    expect(commands.slice(before).some(command => command.includes('tap'))).toBe(false)
  })
  it('returns bounded image coordinates and foreground package metadata', async () => {
    const { value, actor } = await controller()
    const observed = await value.observe(actor, new AbortController().signal)

    expect(observed).toMatchObject({
      observationId: expect.stringMatching(/^phone-observation-.+-1$/), serial: 'serial-a', width: 100, height: 200,
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
