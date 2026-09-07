import { chmod, mkdtemp, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brokerPort, brokerToken, ensurePrivateState, workbuddyStateDir } from '../src/state.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function root() { const value = await mkdtemp(join(tmpdir(), 'opengui-workbuddy-state-')); roots.push(value); return value }

describe('private WorkBuddy state', () => {
  it('uses its own state namespace and stable per-user port', () => {
    expect(workbuddyStateDir()).toContain(join('.workbuddy', 'opengui'))
    expect(brokerPort('/state/a')).toBe(brokerPort('/state/a'))
    expect(brokerPort('/state/a')).not.toBe(brokerPort('/state/b'))
  })

  it('creates a single private token even with concurrent starters', async () => {
    const directory = join(await root(), 'state')
    const tokens = await Promise.all(Array.from({ length: 8 }, () => brokerToken(directory)))
    expect(new Set(tokens).size).toBe(1)
    expect(tokens[0]).toMatch(/^[a-f0-9]{64}$/)
    if (process.platform !== 'win32') expect((await stat(join(directory, 'broker-token'))).mode & 0o077).toBe(0)
  })

  it.skipIf(process.platform === 'win32')('rejects broad permissions and symlink state roots', async () => {
    const directory = await root()
    await chmod(directory, 0o755)
    await expect(ensurePrivateState(directory)).rejects.toThrow('private')
    await chmod(directory, 0o700)
    const link = join(await root(), 'linked')
    await symlink(directory, link)
    await expect(ensurePrivateState(link)).rejects.toThrow('symlink')
  })
})
