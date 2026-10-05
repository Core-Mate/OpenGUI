import { describe, expect, it, vi } from 'vitest'
import { inflateSync } from 'node:zlib'
import { phoneExecutor, type AgentFactory, type Content } from '../../../packages/phone-agent/src/executor.ts'
import type { ModelProfile } from '../../../packages/phone-agent/src/contracts.ts'

const profile: ModelProfile = { id: 'probe', protocol: 'openai-completions', baseUrl: 'http://127.0.0.1:1/v1', model: 'fixture', credentialRef: 'fixture' }

describe('visual model probe', () => {
  it('sends a 64 by 64 PNG and accepts a correct image tool result', async () => {
    let image: Extract<Content, { type: 'image' }> | undefined
    const abort = vi.fn()
    const create: AgentFactory = options => ({
      prompt: async (_text, images) => {
        image = images?.find((item): item is Extract<Content, { type: 'image' }> => item.type === 'image')
        await options.tools.find(tool => tool.name === 'image_check')!.execute({ color: 'red' })
      },
      steer: () => {}, abort,
    })
    await expect(phoneExecutor(create).probe(profile, 'fixture-key', AbortSignal.timeout(5000))).resolves.toBeUndefined()
    const png = Buffer.from(image!.data, 'base64')
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(64)
    expect(png.readUInt32BE(20)).toBe(64)
    const chunks: Buffer[] = []
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset)
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
      offset += length + 12
    }
    const pixels = inflateSync(Buffer.concat(chunks))
    expect(pixels).toHaveLength(64 * (1 + 64 * 3))
    expect([...pixels.subarray(1, 4)]).toEqual([255, 0, 0])
    expect(abort).toHaveBeenCalledOnce()
  })

  it.each([
    { decision: 'blue', message: 'Image check failed' },
    { decision: null, message: 'Model must support image input and tool calls' },
  ])('rejects an unverified image result: $decision', async ({ decision, message }) => {
    const abort = vi.fn()
    const create: AgentFactory = options => ({
      prompt: async () => { if (decision) await options.tools.find(tool => tool.name === 'image_check')!.execute({ color: decision }) },
      steer: () => {}, abort,
    })
    await expect(phoneExecutor(create).probe(profile, 'fixture-key', AbortSignal.timeout(5000))).rejects.toThrow(message)
    expect(abort).toHaveBeenCalledOnce()
  })
})
