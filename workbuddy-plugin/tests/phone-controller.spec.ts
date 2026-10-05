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
    if (args.includes('resolve-activity')) return 'priority=0 isDefault=false\ncom.example.app/.MainActivity\n'
    return ''
  })
  const pasteUnicode = vi.fn(async () => undefined)
  const readFocusedText = vi.fn(async (): Promise<string | undefined> => 'Actual final 😀\n第二行'), replaceUnicode = vi.fn(async () => undefined)
  const value = new PhoneController({
    readFocusedText, replaceUnicode,
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
  return { value, actor, commands, pasteUnicode, runAdb, readFocusedText, replaceUnicode }
}

describe('shared OpenGUI phone controller', () => {
  it('reads foreground identity from the global window dump on Android 13', async () => {
    const f = await controller(), signal = AbortSignal.timeout(5000), original = f.runAdb.getMockImplementation()!
    f.runAdb.mockImplementation(async (args, abort, buffer) => args.includes('dumpsys') && args.includes('windows') ? 'WINDOW MANAGER WINDOWS\n' : original(args, abort, buffer))
    expect((await f.value.observe(f.actor, signal)).foregroundPackage).toBe('com.example.app')
  })

  it('launches an app without Monkey physical-key validation or random input events', async () => {
    const f = await controller(), signal = AbortSignal.timeout(5000)
    const before = await f.value.observe(f.actor, signal), original = f.runAdb.getMockImplementation()!
    f.runAdb.mockImplementation(async (args, abort, buffer) => {
      if (args.includes('monkey')) throw new Error('opengui: ADB command failed: ** SYS_KEYS has no physical keys but with factor 2.0%')
      if (args.includes('start') && !args.includes('-n')) throw new Error('opengui: Android could not start the requested application; check that it has an enabled launcher activity')
      return original(args, abort, buffer)
    })
    await expect(f.value.execute(f.actor, { action: 'launch', observationId: before.observationId, packageName: 'com.example.app' }, signal)).resolves.toMatchObject({ foregroundPackage: 'com.example.app' })
    expect(f.runAdb.mock.calls.filter(([args]) => args.includes('start'))).toHaveLength(1)
    expect(f.runAdb.mock.calls.find(([args]) => args.includes('start'))?.[0]).toContain('com.example.app/.MainActivity')
    expect(f.runAdb.mock.calls.some(([args]) => args.includes('monkey') || args.includes('input'))).toBe(false)
  })

  it.each(['No activity found', 'com.other.app/.MainActivity'])('refuses an unresolved or foreign launcher %s without dispatching a launch', async launcher => {
    const f = await controller(), signal = AbortSignal.timeout(5000), before = await f.value.observe(f.actor, signal), original = f.runAdb.getMockImplementation()!
    f.runAdb.mockImplementation(async (args, abort, buffer) => args.includes('resolve-activity') ? launcher : original(args, abort, buffer))
    await expect(f.value.execute(f.actor, { action: 'launch', observationId: before.observationId, packageName: 'com.example.app' }, signal)).rejects.toMatchObject({ executionState: 'not_executed' })
    expect(f.runAdb.mock.calls.some(([args]) => args.includes('start') || args.includes('monkey'))).toBe(false)
  })

  it('returns only the copied focused field with fresh evidence and never clicks its supplied bounds', async () => {
    const f = await controller(), signal = AbortSignal.timeout(5000), before = await f.value.observe(f.actor, signal)
    const result = await f.value.execute(f.actor, { action: 'read_text', observationId: before.observationId, targetBBox: { left: 1, top: 1, right: 90, bottom: 190 } }, signal)
    expect(result.inputRead).toEqual({ source: 'device_clipboard', text: 'Actual final 😀\n第二行' })
    expect(result.observationId).not.toBe(before.observationId)
    expect(f.commands.some(args => args.includes('input'))).toBe(false)
  })

  it.each(['changed', undefined])('blocks a submit when the live input becomes %s despite an earlier matching read', async text => {
    const f = await controller(), signal = AbortSignal.timeout(5000)
    let image = await f.value.observe(f.actor, signal)
    image = await f.value.execute(f.actor, { action: 'read_text', observationId: image.observationId, targetBBox: { left: 1, top: 1, right: 90, bottom: 190 } }, signal)
    f.readFocusedText.mockResolvedValue(text)
    await expect(f.value.execute(f.actor, { action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, observationId: image.observationId, expectedInputText: 'Actual final 😀\n第二行' }, signal)).rejects.toMatchObject({ code: 'comment_input_changed', executionState: 'not_executed' })
    expect(f.commands.some(args => args.includes('tap'))).toBe(false)
    expect(f.readFocusedText).toHaveBeenCalledTimes(2)
  })

  it('compares emoji and line breaks exactly before the single send dispatch', async () => {
    const f = await controller(), signal = AbortSignal.timeout(5000), image = await f.value.observe(f.actor, signal)
    await f.value.execute(f.actor, { action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, observationId: image.observationId, expectedInputText: 'Actual final 😀\n第二行' }, signal)
    expect(f.commands.filter(args => args.includes('tap'))).toHaveLength(1)
  })

  it('blocks a changed target during final readback without dispatching a send', async () => {
    const f = await controller(), signal = AbortSignal.timeout(5000), image = await f.value.observe(f.actor, signal), original = f.runAdb.getMockImplementation()!
    f.readFocusedText.mockImplementation(async () => {
      f.runAdb.mockImplementation(async (args, abort, buffer) => args.includes('dumpsys') ? 'mCurrentFocus=Window{ u0 com.other/.Main }' : original(args, abort, buffer))
      return 'Actual final 😀\n第二行'
    })
    await expect(f.value.execute(f.actor, { action: 'tap', targetBBox: { left: 10, top: 10, right: 20, bottom: 20 }, observationId: image.observationId, expectedInputText: 'Actual final 😀\n第二行' }, signal)).rejects.toMatchObject({ code: 'screen_changed', executionState: 'not_executed' })
    expect(f.commands.some(args => args.includes('tap'))).toBe(false)
  })

  it('refuses replacement after an original changes and uses the dedicated replacement callback when it matches', async () => {
    const f = await controller(), signal = AbortSignal.timeout(5000), image = await f.value.observe(f.actor, signal)
    await expect(f.value.execute(f.actor, { action: 'replace_text', text: 'New final', observationId: image.observationId, expectedOriginalText: 'Previous original' }, signal)).rejects.toMatchObject({ code: 'comment_input_changed', executionState: 'not_executed' })
    expect(f.replaceUnicode).not.toHaveBeenCalled()
    const fresh = await f.value.observe(f.actor, signal)
    await f.value.execute(f.actor, { action: 'replace_text', text: 'New final', observationId: fresh.observationId, expectedOriginalText: 'Actual final 😀\n第二行' }, signal)
    expect(f.replaceUnicode).toHaveBeenCalledWith('serial-a', 'New final', expect.any(AbortSignal)); expect(f.pasteUnicode).not.toHaveBeenCalled()
  })

  it('treats successful process output carrying an injection denial as unknown and revokes its observation', async () => {
    const { value, actor, runAdb, commands } = await controller(), signal = AbortSignal.timeout(5000)
    const frame = await value.observe(actor, signal), original = runAdb.getMockImplementation()!
    runAdb.mockImplementation(async (args, abort, buffer) => args.includes('tap') ? 'java.lang.SecurityException: Injecting input events requires INJECT_EVENTS permission' : original(args, abort, buffer))
    const action = { action: 'tap', observationId: frame.observationId, targetBBox: { left: 10, top: 10, right: 20, bottom: 20 } }
    await expect(value.execute(actor, action, signal)).rejects.toMatchObject({ code: 'input_permission_denied', executionState: 'outcome_unknown', recovery: 'wait' })
    await expect(value.execute(actor, action, signal)).rejects.toMatchObject({ executionState: 'not_executed' })
    expect(runAdb.mock.calls.filter(([args]) => args.includes('tap'))).toHaveLength(1)
  })
  it('normalizes Unicode injection permission failures without exposing input or raw stderr', async () => {
    const { value, actor, pasteUnicode } = await controller(), signal = AbortSignal.timeout(5000)
    const frame = await value.observe(actor, signal)
    pasteUnicode.mockRejectedValue(new Error('private raw user draft; java.lang.SecurityException: Injecting input events requires INJECT_EVENTS permission'))
    await expect(value.execute(actor, { action: 'text', text: '私有文字', observationId: frame.observationId }, signal)).rejects.toMatchObject({ code: 'input_permission_denied', executionState: 'outcome_unknown' })
    try { const next = await value.observe(actor, signal); await value.execute(actor, { action: 'text', text: '私有文字', observationId: next.observationId }, signal) } catch (error) { expect(String(error)).not.toContain('private raw'); expect(String(error)).not.toContain('私有文字') }
  })
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
