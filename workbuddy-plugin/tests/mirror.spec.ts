import { EventEmitter } from 'node:events'
import type { ChildProcess, spawn } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { NativeMirror } from '../src/mirror.ts'
import { ScrcpyInstaller } from '../src/scrcpy.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'

function setup() {
  const installer = new ScrcpyInstaller()
  vi.spyOn(installer, 'ensure').mockResolvedValue({ root: '/cache', executable: '/cache/scrcpy', server: '/cache/server' })
  const children: any[] = []
  const launch = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null as string | null, stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() })
    child.kill.mockImplementation((signal: string) => { child.signalCode = signal; child.emit('exit', null, signal); return true })
    children.push(child)
    queueMicrotask(() => child.emit('spawn'))
    return child as unknown as ChildProcess
  })
  const onEnded = vi.fn()
  return { installer, children, launch, onEnded, mirror: new NativeMirror({ installer, adbPath: '/bundled/adb', spawn: launch as unknown as typeof spawn, onEnded }) }
}

describe('WorkBuddy native mirror', () => {
  it('retains an already spawned child after an error until its exit is confirmed', async () => {
    const { mirror, children, launch } = setup()
    try {
      await mirror.open('a', 'Phone', new AbortController().signal)
      await vi.waitFor(() => expect(mirror.status('a').phase).toBe('running'))
      children[0].pid = 123
      children[0].emit('error', new Error('kill permission denied'))
      await mirror.open('a', 'Phone', new AbortController().signal)
      expect(launch).toHaveBeenCalledTimes(1)
      await mirror.stop('a')
      expect(children[0].kill).toHaveBeenCalledWith('SIGTERM')
    } finally { await mirror.dispose() }
  })
  it('requires renderer and window evidence, and rejects stale process-only readiness', async () => {
    const { installer, launch, children } = setup()
    const probe = vi.fn(async () => ({ visible: false, identity: 'owned-start' }))
    const mirror = new NativeMirror({ installer, adbPath: '/adb', spawn: launch as unknown as typeof spawn, probe, onEnded() {} })
    try {
      await mirror.open('a', 'Phone', AbortSignal.timeout(5000))
      await vi.waitFor(() => expect(mirror.status('a').phase).toBe('running'))
      children[0].pid = 123
      children[0].stdout.emit('data', 'OPENGUI_CHILD_PID=124\n')
      expect((await mirror.inspect('a')).ready).toBe(false)
      children[0].stdout.emit('data', 'INFO: Texture: 1280x720\n')
      await vi.waitFor(() => expect(probe).toHaveBeenCalled())
      expect((await mirror.inspect('a')).ready).toBe(false)
      probe.mockResolvedValue({ visible: true, identity: 'owned-start' })
      expect((await mirror.inspect('a')).ready).toBe(true)
      probe.mockResolvedValue({ visible: false, identity: 'owned-start' })
      expect((await mirror.inspect('a')).ready).toBe(false)
    } finally { await mirror.dispose() }
  })
  it('opens one read-only silent child per phone and closes only owned children', async () => {
    const { mirror, launch, children, onEnded } = setup()
    await mirror.open('a', 'Phone', new AbortController().signal)
    await mirror.open('a', 'Phone', new AbortController().signal)
    await vi.waitFor(() => expect(mirror.status('a').phase).toBe('running'))
    expect(launch).toHaveBeenCalledOnce()
    expect((launch.mock.calls[0] as unknown as any[])[1]).toEqual(expect.arrayContaining(['--no-control', '--no-audio', '--serial', 'a']))
    await mirror.open('b', 'Other', new AbortController().signal)
    await vi.waitFor(() => expect(mirror.status('b').phase).toBe('running'))
    await mirror.stop('a')
    expect(children[1].kill).not.toHaveBeenCalled()
    children[1].exitCode = 0
    children[1].emit('exit', 0, null)
    expect(onEnded).toHaveBeenCalledWith('b')
    await mirror.dispose()
  })

  it('cancels installation without a late window and can reopen', async () => {
    const { mirror, installer, launch } = setup()
    vi.mocked(installer.ensure).mockImplementationOnce((_asset, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    await mirror.open('a', 'Phone', new AbortController().signal)
    await mirror.stop('a')
    expect(launch).not.toHaveBeenCalled()
    await mirror.open('a', 'Phone', new AbortController().signal)
    await vi.waitFor(() => expect(mirror.status('a').phase).toBe('running'))
    await mirror.dispose()
  })

  it('reports installation failure without retrying', async () => {
    const { mirror, installer, onEnded, launch } = setup()
    vi.mocked(installer.ensure).mockRejectedValueOnce(new Error('checksum mismatch'))
    await mirror.open('a', 'Phone', new AbortController().signal)
    await vi.waitFor(() => expect(onEnded).toHaveBeenCalledWith('a'))
    expect(mirror.status('a')).toMatchObject({ phase: 'error', message: 'checksum mismatch' })
    expect(launch).not.toHaveBeenCalled()
    await mirror.dispose()
  })

  it('ends mirror-only sessions after manual closure and prevents model image capture', async () => {
    const host = new FakeHost()
    let phase: 'running' | 'idle' = 'idle'
    const adapter = Object.assign(host, {
      onMirrorEnded: undefined as ((serial: string) => void) | undefined,
      openMirror: async () => { phase = 'running' }, closeMirror: async () => { phase = 'idle' },
      mirrorStatus: () => ({ phase }),
    })
    const service = new WorkBuddyOpenGuiService({ host: adapter })
    try {
      const session = await service.openSession(['phone-a'], AbortSignal.timeout(5000), 'mirror')
      await service.openMirror(session.sessionId, undefined, AbortSignal.timeout(5000))
      await expect(service.observe(session.sessionId, undefined, AbortSignal.timeout(5000))).rejects.toThrow('mirror-only')
      phase = 'idle'
      adapter.onMirrorEnded?.('serial-a')
      await vi.waitFor(async () => expect((await service.status(session.sessionId, AbortSignal.timeout(5000))).state).toBe('closed'))
      expect(host.released).toEqual([])
      const control = await service.openSession(['phone-a'], AbortSignal.timeout(5000))
      await service.openMirror(control.sessionId, undefined, AbortSignal.timeout(5000))
      expect((await service.closeMirror(control.sessionId, undefined)).state).toBe('active')
    } finally { await service.dispose() }
  })
})
