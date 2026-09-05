import { afterEach, describe, expect, it, vi } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { dataDirectory } from '../src/state.ts'

afterEach(() => vi.unstubAllEnvs())
describe('runtime directory boundary', () => {
  it.each(['/', homedir(), join(homedir(), '.codex'), join(homedir(), '.codex/opengui'),
    join(homedir(), '.dsh/plugins/test'), '/tmp/../', 'relative-cache'])('rejects unsafe override %s before creating files', path => {
    vi.stubEnv('OPENGUI_CODEX_DATA_DIR', path)
    expect(() => dataDirectory()).toThrow('unsafe or legacy')
  })
  it('accepts a dedicated absolute cache', () => {
    vi.stubEnv('OPENGUI_CODEX_DATA_DIR', '/tmp/opengui-test-cache')
    expect(dataDirectory()).toBe('/tmp/opengui-test-cache')
  })
})
