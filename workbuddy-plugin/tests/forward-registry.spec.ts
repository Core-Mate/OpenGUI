import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<object>(), spawnSync: vi.fn() }))
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return { ...original, open: vi.fn(original.open) }
})
import { OwnedForwardRegistry, parseAdbForwardList } from '../src/forward-registry.ts'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('plugin-owned ADB forward registry', () => {
  it('retries a transient lock sharing violation without removing another writer lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-sharing-'))
    temporary.push(root)
    const path = join(root, 'owned.json')
    vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('sharing violation'), { code: 'EPERM' }))
    const registry = new OwnedForwardRegistry(path)
    const record = { serial: 'phone-A', port: 27183, scid: 'sharing', kind: 'text-input' as const }
    await registry.track(record)
    await expect(registry.list()).resolves.toEqual([record])
  })
  it('parses only complete ADB forward rows', () => {
    expect(parseAdbForwardList('phone-A tcp:1001 localabstract:scrcpy_a\ninvalid\n')).toEqual([
      { serial: 'phone-A', local: 'tcp:1001', remote: 'localabstract:scrcpy_a' },
    ])
  })

  it('persists exact ownership and removes the record only after cleanup succeeds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-registry-'))
    temporary.push(root)
    const path = join(root, 'owned.json')
    const registry = new OwnedForwardRegistry(path)
    const record = { serial: 'phone-A', port: 27183, scid: '00abc123', kind: 'video-stream' as const }
    await registry.track(record)
    const failed = vi.fn(async () => { throw new Error('device offline') })
    await expect(registry.release(record, failed)).resolves.toBe(false)
    await expect(new OwnedForwardRegistry(path).list()).resolves.toEqual([record])

    const succeeded = vi.fn(async (args: readonly string[]) => args.includes('--list')
      ? 'phone-A tcp:27183 localabstract:scrcpy_00abc123\n'
      : undefined)
    await expect(registry.release(record, succeeded)).resolves.toBe(true)
    expect(succeeded).toHaveBeenNthCalledWith(2,
      ['-s', 'phone-A', 'forward', '--remove', 'tcp:27183'],
      expect.any(AbortSignal),
    )
    await expect(registry.list()).resolves.toEqual([])
  })

  it('serializes concurrent writers from separate registry instances', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-concurrent-'))
    temporary.push(root)
    const path = join(root, 'owned.json')
    const first = new OwnedForwardRegistry(path)
    const second = new OwnedForwardRegistry(path)
    const records = Array.from({ length: 20 }, (_, index) => ({
      serial: `phone-${index}`,
      port: 20_000 + index,
      scid: `scid-${index}`,
      kind: 'video-stream' as const,
    }))

    await Promise.all(records.map((record, index) => (index % 2 === 0 ? first : second).track(record)))

    await expect(new OwnedForwardRegistry(path).list()).resolves.toEqual(
      expect.arrayContaining(records),
    )
    await expect(new OwnedForwardRegistry(path).list()).resolves.toHaveLength(records.length)
  })

  it('does not recover forwards owned by another live plugin instance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-live-owner-'))
    temporary.push(root)
    const path = join(root, 'owned.json')
    const owner = new OwnedForwardRegistry(path)
    const recovering = new OwnedForwardRegistry(path)
    const record = { serial: 'phone-A', port: 27183, scid: 'live', kind: 'video-stream' as const }
    await owner.track(record)
    const run = vi.fn(async () => 'phone-A tcp:27183 localabstract:scrcpy_live\n')

    await expect(recovering.recover(run)).resolves.toEqual({ removed: 0, retained: 1 })
    expect(run).not.toHaveBeenCalled()
    await expect(recovering.list()).resolves.toEqual([record])
  })

  it('recovers only forwards recorded by this plugin and retains failures for the next start', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-recovery-'))
    temporary.push(root)
    const registry = new OwnedForwardRegistry(join(root, 'owned.json'))
    await registry.track({ serial: 'phone-A', port: 1001, scid: 'a', kind: 'text-input' })
    await registry.track({ serial: 'phone-B', port: 1002, scid: 'b', kind: 'video-stream' })
    const run = vi.fn(async (args: readonly string[]) => {
      const serial = args[1]
      if (args.includes('--list')) {
        const port = serial === 'phone-A' ? 1001 : 1002
        const scid = serial === 'phone-A' ? 'a' : 'b'
        return `${serial} tcp:${port} localabstract:scrcpy_${scid}\n`
      }
      if (serial === 'phone-B') throw new Error('offline')
    })

    await expect(registry.recover(run)).resolves.toEqual({ removed: 1, retained: 1 })
    await expect(registry.list()).resolves.toEqual([
      { serial: 'phone-B', port: 1002, scid: 'b', kind: 'video-stream' },
    ])
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('does not remove a port that has been remapped to another owner', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-remap-'))
    temporary.push(root)
    const registry = new OwnedForwardRegistry(join(root, 'owned.json'))
    const record = { serial: 'phone-A', port: 1001, scid: 'ours', kind: 'video-stream' as const }
    await registry.track(record)
    const run = vi.fn(async () => 'phone-A tcp:1001 localabstract:another_tool\n')

    await expect(registry.release(record, run)).resolves.toBe(true)
    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith(
      ['-s', 'phone-A', 'forward', '--list'],
      expect.any(AbortSignal),
    )
    await expect(registry.list()).resolves.toEqual([])
  })

  it('reports retained ownership when registry persistence fails after ADB cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-persist-'))
    temporary.push(root)
    const path = join(root, 'owned.json')
    const registry = new OwnedForwardRegistry(path)
    const record = { serial: 'phone-A', port: 1001, scid: 'ours', kind: 'video-stream' as const }
    await registry.track(record)
    await rm(root, { recursive: true, force: true })
    await writeFile(root, 'not-a-directory')
    const run = vi.fn(async (args: readonly string[]) => args.includes('--list')
      ? 'phone-A tcp:1001 localabstract:scrcpy_ours\n'
      : undefined)

    await expect(registry.release(record, run)).resolves.toBe(false)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('has a synchronous exact cleanup path for Host termination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-forward-signal-'))
    temporary.push(root)
    const registry = new OwnedForwardRegistry(join(root, 'owned.json'))
    await registry.track({ serial: 'phone-A', port: 1234, scid: 'signal', kind: 'video-stream' })
    const spawn = vi.mocked(spawnSync)
    spawn.mockReturnValueOnce({ status: 0, stdout: 'phone-A tcp:1234 localabstract:scrcpy_signal\n' } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
    expect(registry.releaseAllSync('synthetic-adb')).toEqual({ removed: 1, retained: 0 })
    expect(spawn).toHaveBeenNthCalledWith(1, 'synthetic-adb', ['-s', 'phone-A', 'forward', '--list'], expect.any(Object))
    expect(spawn).toHaveBeenNthCalledWith(2, 'synthetic-adb', ['-s', 'phone-A', 'forward', '--remove', 'tcp:1234'], expect.any(Object))
    await expect(registry.list()).resolves.toEqual([])
    await registry.track({ serial: 'phone-A', port: 1234, scid: 'signal', kind: 'video-stream' })
    spawn.mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>)
    expect(registry.releaseAllSync('synthetic-adb')).toEqual({ removed: 0, retained: 1 })
    expect(await registry.list()).toHaveLength(1)
    spawn.mockReset()
  })
})
