import { readFileSync } from 'node:fs'

export type DshCompatibility = 'supported' | 'unsupported' | 'unknown'

export interface DshCompatibilityManifest {
  readonly schemaVersion: 1
  readonly preferredVersion: string
  readonly supportedVersions: readonly string[]
}

const RELEASE_CANDIDATE_VERSION = /^\d+\.\d+\.\d+-rc\.\d+$/u

export function parseDshCompatibilityManifest(value: unknown): DshCompatibilityManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('opengui: DSH compatibility manifest must be an object')
  }
  const manifest = value as Partial<DshCompatibilityManifest>
  if (manifest.schemaVersion !== 1) {
    throw new Error('opengui: unsupported DSH compatibility manifest schema')
  }
  if (typeof manifest.preferredVersion !== 'string' || !RELEASE_CANDIDATE_VERSION.test(manifest.preferredVersion)) {
    throw new Error('opengui: preferred DSH version must be an exact release candidate')
  }
  if (!Array.isArray(manifest.supportedVersions)
    || manifest.supportedVersions.length === 0
    || manifest.supportedVersions.some(version => typeof version !== 'string' || !RELEASE_CANDIDATE_VERSION.test(version))) {
    throw new Error('opengui: supported DSH versions must be exact release candidates')
  }
  const supportedVersions = [...manifest.supportedVersions]
  if (new Set(supportedVersions).size !== supportedVersions.length) {
    throw new Error('opengui: supported DSH versions must be unique')
  }
  if (!supportedVersions.includes(manifest.preferredVersion)) {
    throw new Error('opengui: preferred DSH version must be supported')
  }
  return {
    schemaVersion: 1,
    preferredVersion: manifest.preferredVersion,
    supportedVersions,
  }
}

/** Read the version policy shared by the installer, runtime diagnostics, and release checks. */
export function dshCompatibilityManifest(): DshCompatibilityManifest {
  const value = JSON.parse(readFileSync(
    new URL('../skills/opengui-coremate-install/dsh-compatibility.json', import.meta.url),
    'utf8',
  )) as unknown
  return parseDshCompatibilityManifest(value)
}

/** Classify the exact DSH version loaded in this Host process. */
export function classifyDshCompatibility(version: string): DshCompatibility {
  if (version === 'unknown') return 'unknown'
  return dshCompatibilityManifest().supportedVersions.includes(version) ? 'supported' : 'unsupported'
}
