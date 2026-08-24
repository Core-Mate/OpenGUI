import { describe, expect, it } from 'vitest'
import type { MirrorDeviceStatus } from '../src/mirror-contract.ts'
import { buildDeviceWallItems } from '../src/client/CoremateView.tsx'

function device(id: string, connected = true): MirrorDeviceStatus {
  return {
    id,
    label: id,
    selected: true,
    connected,
    phase: 'idle',
  }
}

describe('OpenGUI device photo wall', () => {
  it('shows only the connection guide when no device is visible', () => {
    expect(buildDeviceWallItems([])).toEqual([{ kind: 'connect-more' }])
  })

  it.each([1, 3, 4, 5])('appends one connection guide after %i devices', count => {
    const devices = Array.from({ length: count }, (_, index) => device(`phone-${index + 1}`))
    const items = buildDeviceWallItems(devices)

    expect(items).toHaveLength(count + 1)
    expect(items.slice(0, count).map(item => item.kind)).toEqual(Array.from({ length: count }, () => 'device'))
    expect(items.at(-1)).toEqual({ kind: 'connect-more' })
    expect(items.filter(item => item.kind === 'connect-more')).toHaveLength(1)
  })

  it('preserves Host order and keeps a temporarily disconnected visible device', () => {
    const devices = [device('PKV110'), device('Pixel-8', false), device('SM-S9280')]
    const items = buildDeviceWallItems(devices)

    expect(items.flatMap(item => item.kind === 'device' ? [item.device.id] : [])).toEqual([
      'PKV110',
      'Pixel-8',
      'SM-S9280',
    ])
    expect(items.at(-1)?.kind).toBe('connect-more')
  })
})
