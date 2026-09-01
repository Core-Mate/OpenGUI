import { describe, expect, it } from 'vitest'
import type { MirrorDeviceStatus } from '../src/mirror-contract.ts'
import { buildDeviceWallItems, runtimeVersionLabel, runtimeVersionTitle } from '../src/client/CoremateView.tsx'
import { preparationMessage, streamFallbackMessage } from '../src/client/PhoneStream.tsx'
import { WECHAT_GROUP_QR_DATA_URL } from '../src/client/wechat-group-qr.ts'

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
  it('keeps the compact runtime version label complete in every state', () => {
    expect(runtimeVersionLabel()).toBe('DSH … · OpenGUI …')
    expect(runtimeVersionLabel(undefined, true)).toBe('DSH 未知 · OpenGUI 未知')
    const shared = {
      preferredDshVersion: '0.1.1-rc.2',
      supportedDshVersions: ['0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2'],
    }
    expect(runtimeVersionLabel({ ...shared, dshVersion: 'unknown', openGuiVersion: 'unknown', dshCompatibility: 'unknown' }))
      .toBe('DSH 未知 · OpenGUI 未知')
    expect(runtimeVersionLabel({ ...shared, dshVersion: '0.1.0-rc.7', openGuiVersion: '0.1.12', dshCompatibility: 'supported' }))
      .toBe('DSH 0.1.0-rc.7 · OpenGUI 0.1.12')
    const unsupported = { ...shared, dshVersion: '0.1.2-alpha.4', openGuiVersion: '0.1.12', dshCompatibility: 'unsupported' as const }
    expect(runtimeVersionLabel(unsupported)).toBe('DSH 0.1.2-alpha.4（未验证） · OpenGUI 0.1.12')
    expect(runtimeVersionTitle(unsupported)).toContain('已支持：0.1.0-rc.7、0.1.0-rc.8、0.1.1-rc.1、0.1.1-rc.2')
  })

  it('falls back deterministically when stream status cannot be read and hides implementation details', () => {
    expect(streamFallbackMessage(undefined, 'HTTP 503')).toBe('实时画面服务暂时不可用，当前使用截图预览。')
    expect(streamFallbackMessage({
      supported: true, cached: false, approved: true, phase: 'error', version: '4.1', activeSources: 0, maxSources: 4,
    }, undefined)).toBe('实时画面准备失败，当前使用截图预览。')
    expect(preparationMessage({
      supported: true, cached: false, approved: true, phase: 'downloading', version: '4.1',
      downloadedBytes: 5, totalBytes: 10, activeSources: 0, maxSources: 4,
    })).toBe('正在准备实时画面… 50%')
  })

  it('embeds the maintainer-provided WeChat group QR in the client bundle', () => {
    expect(WECHAT_GROUP_QR_DATA_URL).toMatch(/^data:image\/png;base64,/)
    expect(WECHAT_GROUP_QR_DATA_URL.length).toBeGreaterThan(1_000)
  })

  it('shows only the connection guide when no device is visible', () => {
    expect(buildDeviceWallItems([])).toEqual([{ kind: 'connect-more' }])
  })

  it.each([1, 3, 4, 5, 10])('appends one connection guide after %i devices', count => {
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
