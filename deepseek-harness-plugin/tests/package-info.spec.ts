import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { runtimeInfo } from '../src/package-info.ts'

describe('OpenGUI runtime package information', () => {
  it('reports the versions resolved by the running plugin package', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string
      peerDependencies: Record<string, string>
    }

    expect(runtimeInfo()).toEqual({
      dshVersion: manifest.peerDependencies['@deepseek-ai/dsh-host-webserver'],
      openGuiVersion: manifest.version,
    })
  })
})
