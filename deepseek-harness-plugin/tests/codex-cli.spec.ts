import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { materializeCliResult, runCli } from '../src/codex-cli.ts'

const temporary: string[] = []
afterEach(async () => {
  delete process.env.OPENGUI_CODEX_HOME
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('OpenGUI Skills-only CLI', () => {
  it('documents the same seven public interfaces without starting the daemon', async () => {
    await expect(runCli(['--help'])).resolves.toMatchObject({
      interfaces: [
        'opengui_list_devices', 'opengui_open_session', 'opengui_observe', 'opengui_act',
        'opengui_status', 'opengui_cancel', 'opengui_close_session',
      ],
    })
  })

  it('materializes observed images as private local files instead of printing base64', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opengui-cli-test-'))
    temporary.push(directory)
    process.env.OPENGUI_CODEX_HOME = directory
    const value = await materializeCliResult({
      sessionId: 'session', deviceId: 'phone', observationId: 'observation',
      width: 1, height: 1, foregroundPackage: '',
      screenshot: { data: Buffer.from('jpeg').toString('base64'), mimeType: 'image/jpeg', bytes: 4, width: 1, height: 1, name: 'phone.jpg' },
    }) as { screenshot: { data?: string; path: string } }

    expect(value.screenshot.data).toBeUndefined()
    expect(await readFile(value.screenshot.path, 'utf8')).toBe('jpeg')
    expect((await statMode(value.screenshot.path)) & 0o077).toBe(0)
  })
})

async function statMode(path: string): Promise<number> {
  return (await import('node:fs/promises')).stat(path).then(value => value.mode)
}
