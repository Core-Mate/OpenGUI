import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertHdcSerial, createHdcRunner, hdcPath, hdcShell, parseHdcDevices, quoteDeviceArgument } from '../src/hdc.ts'
import { devicePlatform } from '../src/platform.ts'
import { daemonEndpoint } from '../src/state.ts'

afterEach(() => vi.unstubAllEnvs())
describe('HDC transport', () => {
  it('distinguishes connected, unauthorized and offline devices', () => {
    expect(parseHdcDevices('[Empty]\r\n')).toEqual([])
    expect(parseHdcDevices('a\tUSB\tConnected\tlocalhost\r\nb\tUSB\tUnauthorized\tlocalhost\r\n192.0.2.1:1234 TCP Offline device\n')).toMatchObject([
      { serial: 'a', state: 'device', model: 'HarmonyOS' }, { serial: 'b', state: 'unauthorized' }, { state: 'offline' },
    ])
    expect(parseHdcDevices('a USB Ready localhost')[0]?.state).toBe('offline')
    expect(() => parseHdcDevices('transport failed')).toThrow('unrecognized')
  })
  it.each(['--help', 'device;whoami', 'a\nb', 'a\0b', ''])('rejects a malformed target identity %j', value => {
    expect(() => assertHdcSerial(value)).toThrow('identity')
  })
  it('preserves Unicode, newlines and shell metacharacters as literal data', async () => {
    const text = "你好🙂 ' $(printf INJECTED) `printf INJECTED` ; & |\nnext"
    const result = await promisify(execFile)('/bin/sh', ['-c', `printf '%s' ${quoteDeviceArgument(text)}`])
    expect(result.stdout).toBe(text)
    expect(() => quoteDeviceArgument('x\0')).toThrow('NUL')
  })
  it('requires a remote success marker, even when HDC itself exits successfully', async () => {
    const signal = new AbortController().signal
    await expect(hdcShell(async () => 'No Error', 'a', ['uitest'], signal)).rejects.toThrow('acknowledgement')
    await expect(hdcShell(async args => '\n' + args[3]!.match(/__opengui_[a-f0-9]+__/)![0] + '127\n', 'a', ['missing'], signal)).rejects.toThrow('failed')
    await expect(hdcShell(async args => 'ok\n' + args[3]!.match(/__opengui_[a-f0-9]+__/)![0] + '0\n', 'a', ['true'], signal)).resolves.toBe('ok')
  })
  it('rejects zero-exit HDC failures and honors process cancellation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-hdc-test-'))
    try {
      const path = join(root, 'fake-hdc')
      await writeFile(path, '#!/bin/sh\nprintf "[Fail] device unavailable\\n"\n', { mode: 0o700 })
      await expect(createHdcRunner(path)(['list'], new AbortController().signal)).rejects.toThrow('unavailable')
      const abort = new AbortController(); abort.abort(new Error('cancelled'))
      await expect(createHdcRunner(path)([], abort.signal)).rejects.toThrow('cancelled')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('validates executable overrides without silently falling back', async () => {
    vi.stubEnv('OPENGUI_HDC_PATH', 'relative/hdc')
    await expect(hdcPath()).rejects.toThrow('absolute')
    vi.stubEnv('OPENGUI_HDC_PATH', '/nonexistent/opengui-hdc')
    await expect(hdcPath()).rejects.toThrow('unavailable')
  })
  it('isolates HarmonyOS and Android daemons even with an identical cache override', () => {
    vi.stubEnv('OPENGUI_PLATFORM', 'android')
    const android = daemonEndpoint('/tmp/opengui-platform-test')
    vi.stubEnv('OPENGUI_PLATFORM', 'harmonyos')
    expect(devicePlatform()).toBe('harmonyos')
    expect(daemonEndpoint('/tmp/opengui-platform-test')).not.toBe(android)
    vi.stubEnv('OPENGUI_PLATFORM', 'invalid')
    expect(() => devicePlatform()).toThrow('must be')
  })
})
