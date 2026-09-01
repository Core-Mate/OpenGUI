import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { RuntimeInfo } from './mirror-contract.ts'

interface PackageInfo {
  readonly name: string
  readonly version: string
}

const runtimeRequire = createRequire(import.meta.url)

function installedPackageVersion(name: string): string | undefined {
  try {
    const path = runtimeRequire.resolve(`${name}/package.json`)
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<PackageInfo>
    return value.name === name && typeof value.version === 'string' ? value.version : undefined
  } catch {
    return undefined
  }
}

/** Read package identity from the source tree or the installed bundle root. */
export function packageInfo(): PackageInfo {
  const value = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Partial<PackageInfo>
  if (typeof value.name !== 'string' || typeof value.version !== 'string') {
    throw new Error('opengui: package.json is missing its name or version')
  }
  return { name: value.name, version: value.version }
}

/** Report the OpenGUI package and the DSH web Host package loaded in this process. */
export function runtimeInfo(): RuntimeInfo {
  return {
    dshVersion: installedPackageVersion('@deepseek-ai/dsh-host-webserver') ?? 'unknown',
    openGuiVersion: packageInfo().version,
  }
}
