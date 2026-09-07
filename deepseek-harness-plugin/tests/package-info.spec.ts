import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { runtimeInfo } from '../src/package-info.ts'

describe('OpenGUI runtime package information', () => {
  it('reports the versions resolved by the running plugin package', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string
      devDependencies: Record<string, string>
    }

    expect(runtimeInfo()).toEqual({
      dshVersion: manifest.devDependencies['@deepseek-ai/dsh-host-webserver'],
      openGuiVersion: manifest.version,
      dshCompatibility: 'supported',
      preferredDshVersion: '0.1.1-rc.2',
      supportedDshVersions: ['0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2'],
    })
  })
})
