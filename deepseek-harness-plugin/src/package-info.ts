import { readFileSync } from 'node:fs'

interface PackageInfo {
  readonly name: string
  readonly version: string
}

/** Read package identity from the source tree or the installed bundle root. */
export function packageInfo(): PackageInfo {
  const value = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Partial<PackageInfo>
  if (typeof value.name !== 'string' || typeof value.version !== 'string') {
    throw new Error('opengui: package.json is missing its name or version')
  }
  return { name: value.name, version: value.version }
}
