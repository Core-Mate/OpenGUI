import { describe, expect, it } from 'vitest'
import { LocalHarmonyPhoneHost } from '../src/harmony-host.ts'
import { validateToolArguments } from '../src/codex/tools.ts'
import { fakeHdc } from './harmony-fixtures.ts'

describe('HarmonyOS session host', () => {
  it('resolves only authorized devices, hides serials and preserves reconnect identities', async () => {
    const mock = fakeHdc(), host = new LocalHarmonyPhoneHost(mock.run)
    const signal = new AbortController().signal
    const devices = await host.listDevices(signal)
    expect(devices[0]).toMatchObject({ name: 'TEST-PHONE', connected: true, authorized: true })
    expect(devices[0]).not.toHaveProperty('serial')
    expect((await host.resolveDevices(undefined, signal))[0]?.serial).toBe('device-a')
    const original = mock.run.getMockImplementation()!
    mock.run.mockImplementation(async (args, abort) => args[0] === 'list' ? '[Empty]' : original(args, abort))
    await expect(host.resolveDevices(undefined, signal)).rejects.toThrow('no authorized HarmonyOS')
    mock.run.mockImplementation(original)
    expect((await host.listDevices(signal))[0]?.id).toBe(devices[0]?.id)
    await host.dispose()
  })
  it('requires explicit selection when multiple devices are attached and rejects offline targets', async () => {
    const host = new LocalHarmonyPhoneHost(async args => {
      if (args[0] === 'list') return 'a USB Unauthorized localhost\nb TCP Offline localhost'
      throw new Error('must not query an unauthorized phone')
    })
    const devices = await host.listDevices(new AbortController().signal)
    expect(devices.map(device => device.authorized)).toEqual([false, false])
    expect(devices[1]?.connected).toBe(false)
    await expect(host.resolveDevices([devices[0]!.id], new AbortController().signal)).rejects.toThrow()
    const mock = fakeHdc(), original = mock.run.getMockImplementation()!
    mock.run.mockImplementation(async (args, abort) => args[0] === 'list' ? 'a USB Connected localhost\nb USB Connected localhost' : original(args, abort))
    await expect(new LocalHarmonyPhoneHost(mock.run).resolveDevices(undefined, new AbortController().signal)).rejects.toThrow('multiple HarmonyOS')
  })
  it('exposes long press and explicit abilities through the public CLI schema', () => {
    const base = { sessionId: 'session', observationId: 'frame', externalSideEffect: 'none' }
    expect(() => validateToolArguments('opengui_act', { ...base, action: 'long_press', targetBBox: { left: 1, top: 1, right: 10, bottom: 10 } })).not.toThrow()
    expect(() => validateToolArguments('opengui_act', { ...base, action: 'launch', packageName: 'com.example.app', abilityName: 'EntryAbility' })).not.toThrow()
    expect(() => validateToolArguments('opengui_act', { ...base, action: 'shell', command: 'anything' })).toThrow()
  })
})
