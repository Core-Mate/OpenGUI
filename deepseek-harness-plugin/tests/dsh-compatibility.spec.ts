import { describe, expect, it } from 'vitest'
import {
  classifyDshCompatibility,
  dshCompatibilityManifest,
  parseDshCompatibilityManifest,
} from '../src/dsh-compatibility.ts'

const SUPPORTED = ['0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2']

describe('DSH compatibility policy', () => {
  it('keeps one exact supported-version matrix with the newest verified default', () => {
    expect(dshCompatibilityManifest()).toEqual({
      schemaVersion: 1,
      preferredVersion: '0.1.1-rc.2',
      supportedVersions: SUPPORTED,
    })
    for (const version of SUPPORTED) expect(classifyDshCompatibility(version)).toBe('supported')
    expect(classifyDshCompatibility('0.1.2-alpha.4')).toBe('unsupported')
    expect(classifyDshCompatibility('unknown')).toBe('unknown')
  })

  it('rejects alpha versions, duplicates, and unsupported preferred versions', () => {
    expect(() => parseDshCompatibilityManifest({
      schemaVersion: 1,
      preferredVersion: '0.1.2-alpha.4',
      supportedVersions: ['0.1.2-alpha.4'],
    })).toThrow('exact release candidate')
    expect(() => parseDshCompatibilityManifest({
      schemaVersion: 1,
      preferredVersion: '0.1.1-rc.2',
      supportedVersions: ['0.1.1-rc.2', '0.1.1-rc.2'],
    })).toThrow('must be unique')
    expect(() => parseDshCompatibilityManifest({
      schemaVersion: 1,
      preferredVersion: '0.1.1-rc.2',
      supportedVersions: ['0.1.0-rc.7'],
    })).toThrow('must be supported')
  })
})
