import type { ExecFileException, ExecFileOptions } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmAction, confirmLocalSetup } from '../src/confirmation.ts'

const { run } = vi.hoisted(() => ({
  run: vi.fn<(file: string, args: string[], options: ExecFileOptions,
    callback: (error: ExecFileException | null, stdout: string, stderr: string) => void) => void>(),
}))
vi.mock('node:child_process', () => ({ execFile: run }))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
const signal = () => new AbortController().signal
function complete(output: string, error: ExecFileException | null = null) {
  run.mockImplementation((_file, _args, _options, callback) => callback(error, output, 'private stderr'))
}

beforeEach(() => {
  run.mockReset()
  Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' })
})
afterEach(() => Object.defineProperty(process, 'platform', platform))

describe('native confirmation', () => {
  it('foregrounds the dialog and passes untrusted descriptions only as argv', async () => {
    complete('Allow once\n')
    const description = 'Private " text\n$(touch injected) `whoami` ; display dialog "injected"'
    const requestSignal = signal()
    await expect(confirmLocalSetup(description, requestSignal)).resolves.toBe(true)
    expect(run).toHaveBeenCalledOnce()
    const [file, args, options] = run.mock.calls[0]!
    expect(file).toBe('/usr/bin/osascript')
    expect(args).toHaveLength(3)
    expect(args[0]).toBe('-e')
    expect(args[2]).toBe(description)
    const script = args[1]!
    expect(script).not.toContain(description)
    expect(script).toContain('activate\nset dialogReply to display dialog')
    expect(script).toContain('default button "Cancel" cancel button "Cancel"')
    expect(script).toContain('if errorNumber is -128 then return "cancel"')
    expect(script).toContain('if gave up of dialogReply then return "timeout"')
    expect(script).toContain('if errorNumber is -1712 then return "timeout"')
    expect(options).toMatchObject({ shell: false, signal: requestSignal, timeout: 65_000, maxBuffer: 8192 })
  })

  it('preserves the action context in the confirmation request', async () => {
    complete('Allow once')
    await expect(confirmAction('send', { text: 'Hello' }, signal())).resolves.toBe(true)
    const args = run.mock.calls[0]![1]
    expect(args[1]).toContain('Confirm Android action')
    expect(args[2]).toContain('Allow one send action on the selected Android phone?')
    expect(args[2]).toContain('"text": "Hello"')
  })

  it.each(['cancel', 'Cancel\n'])('returns false for explicit cancellation %j', async output => {
    complete(output)
    await expect(confirmLocalSetup('request', signal())).resolves.toBe(false)
  })

  it('reports a dialog timeout separately from user cancellation', async () => {
    complete('timeout\n')
    await expect(confirmLocalSetup('request', signal())).rejects.toThrow('opengui: confirmation timed out')
    expect(run).toHaveBeenCalledOnce()
  })

  it('reports the child process timeout without exposing command arguments', async () => {
    complete('', Object.assign(new Error('private command arguments'), { killed: true, signal: 'SIGTERM' as const }))
    await expect(confirmLocalSetup('private request', signal())).rejects.toThrow(/^opengui: confirmation timed out$/)
  })

  it.each(['unavailable', '', 'Allow', 'true', 'Allow once\nprivate output'])('rejects unexpected or unavailable UI output %j', async output => {
    complete(output)
    await expect(confirmLocalSetup('private request', signal())).rejects.toThrow(/^opengui: confirmation UI unavailable$/)
  })

  it('redacts subprocess failures even when stdout claims approval', async () => {
    complete('Allow once', Object.assign(new Error('private command arguments'), { code: 1 }))
    await expect(confirmLocalSetup('private request', signal())).rejects.toThrow(/^opengui: confirmation UI unavailable$/)
    expect(run).toHaveBeenCalledOnce()
  })

  it('redacts synchronous subprocess launch failures', async () => {
    run.mockImplementation(() => { throw new Error('private invalid arguments') })
    await expect(confirmLocalSetup('private request', signal())).rejects.toThrow(/^opengui: confirmation UI unavailable$/)
  })

  it('preserves an existing abort reason without opening a dialog', async () => {
    const controller = new AbortController()
    const reason = new Error('caller cancelled')
    controller.abort(reason)
    await expect(confirmLocalSetup('request', controller.signal)).rejects.toBe(reason)
    expect(run).not.toHaveBeenCalled()
  })

  it.each([null, new Error('process aborted')])('preserves an in-flight abort over a process result %j', async error => {
    const controller = new AbortController()
    const reason = new Error('caller cancelled')
    run.mockImplementation((_file, _args, _options, callback) => {
      controller.abort(reason)
      callback(error, 'Allow once', '')
    })
    await expect(confirmLocalSetup('request', controller.signal)).rejects.toBe(reason)
  })

  it('reports unsupported UI hosts without presenting them as cancellation', async () => {
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' })
    await expect(confirmLocalSetup('request', signal())).rejects.toThrow(/^opengui: confirmation UI unavailable$/)
    expect(run).not.toHaveBeenCalled()
  })
})
