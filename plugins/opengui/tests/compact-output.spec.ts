import { describe, expect, it } from 'vitest'
import { compactOutput } from '../src/compact-output.ts'
import { ObservationId } from '../src/adb.ts'
import type { MaterializedObservation } from '../src/state.ts'

describe('compact CLI observation output', () => {
  it('keeps current coordinates, permission status and focused text without flooding the terminal', () => {
    const nodes = Array.from({ length: 250 }, (_, index) => ({
      text: index === 249 ? '输入🙂' : 'long background text '.repeat(40), hint: '',
      type: index === 249 ? 'TextInput' : 'Text', focused: index === 249, clickable: false,
      windowId: '1', bundleName: 'com.example.app', bounds: { left: 10, top: 20, right: 40, bottom: 50 },
    }))
    const value: MaterializedObservation = {
      sessionId: 'session', deviceId: 'phone', observationId: ObservationId('frame'),
      width: 1080, height: 2400, foregroundPackage: 'com.example.app', observationPath: '/private/frame.json',
      screenshot: { path: '/private/frame.jpg', mimeType: 'image/jpeg', width: 920, height: 2048, bytes: 10000, name: 'frame.jpg' },
      layout: { nodes, warnings: ['Advisory nodes'], stable: true, truncated: false },
      actionAssessment: { status: 'permission_required', detail: 'Clipboard prompt' },
    }
    const result = compactOutput(value) as MaterializedObservation
    expect(result.layout?.nodes).toEqual([nodes[249]])
    expect(result.layout?.truncated).toBe(true)
    expect(result.layout?.stable).toBe(true)
    expect(result.actionAssessment).toEqual(value.actionAssessment)
    expect(result.screenshot).toEqual(value.screenshot)
    expect(result.observationPath).toBe(value.observationPath)
    expect(JSON.stringify(result).length).toBeLessThan(2000)
    expect(value.layout?.nodes).toHaveLength(250)
    expect(value.layout?.truncated).toBe(false)
  })
  it('leaves non-observation results and results without complete saved evidence unchanged', () => {
    for (const value of [null, { devices: [] }, { state: 'closed' }, { observationId: 'frame', screenshot: { path: 'file' } }]) {
      expect(compactOutput(value)).toBe(value)
    }
  })
})
