import { describe, expect, it, vi } from 'vitest'
import type { Message } from '@deepseek-ai/dsh-llm'
import { ObservationId } from '../src/adb.ts'
import {
  PhoneExecutionState,
  PhoneOperationQueue,
  latestPhoneScreenshotMessages,
  waitForPhoneUi,
} from '../src/runtime.ts'

function phoneResult(index: number): Message {
  return {
    id: `message-${index}`,
    role: 'user',
    source: { kind: 'tool', callId: `call-${index}` },
    content: [{
      type: 'tool-result',
      toolCallId: `call-${index}`,
      content: [
        { type: 'text', text: `observation ${index}` },
        {
          type: 'image',
          attachment: {
            attachmentId: `image-${index}`,
            mediaType: 'image/jpeg',
            bytes: index,
            width: 100,
            height: 200,
          },
        },
      ],
    }],
  } as unknown as Message
}

function imageIds(messages: readonly Message[]): string[] {
  return messages.flatMap(message => message.content.flatMap(block => block.type === 'tool-result'
    ? block.content.flatMap(candidate => candidate.type === 'image' ? [String(candidate.attachment.attachmentId)] : [])
    : []))
}

describe('coremate-mobile bounded phone runtime', () => {
  it('keeps only the latest phone screenshot in the provider-facing view', () => {
    const history = [phoneResult(1), phoneResult(2), phoneResult(3)]
    const projected = latestPhoneScreenshotMessages(history)

    expect(imageIds(history)).toEqual(['image-1', 'image-2', 'image-3'])
    expect(imageIds(projected)).toEqual(['image-3'])
    expect(JSON.stringify(projected)).toContain('older OpenGUI screenshot omitted')
    const single = [history[0]!]
    expect(latestPhoneScreenshotMessages(single)).toBe(single)
  })

  it('binds actions to the current observation and bounds the child operation count', () => {
    const state = new PhoneExecutionState()
    const agent = {}
    state.beginOperation(agent, 2)
    state.recordObservation(agent, { observationId: state.nextObservationId(agent), screenshotFingerprint: 'frame-a' })

    expect(state.current(agent, ObservationId('phone-observation-1')).screenshotFingerprint).toBe('frame-a')
    expect(() => state.current(agent, ObservationId('old'))).toThrow('stale observationId')
    state.beginOperation(agent, 2)
    expect(() => { state.beginOperation(agent, 2) }).toThrow('2-operation limit')
  })

  it('discovers one target serial and reuses it for the rest of the child task', async () => {
    const state = new PhoneExecutionState()
    const agent = {}
    const discover = vi.fn().mockResolvedValue('serial-a')

    await expect(state.resolveTarget(agent, discover)).resolves.toBe('serial-a')
    await expect(state.resolveTarget(agent, discover)).resolves.toBe('serial-a')

    expect(discover).toHaveBeenCalledTimes(1)
  })

  it('pre-binds each child agent to exactly one phone', async () => {
    const state = new PhoneExecutionState()
    const first = {}
    const second = {}
    state.assignTarget(first, 'serial-a')
    state.assignTarget(second, 'serial-b')

    await expect(state.resolveTarget(first, async () => 'wrong')).resolves.toBe('serial-a')
    await expect(state.resolveTarget(second, async () => 'wrong')).resolves.toBe('serial-b')
    expect(() => { state.assignTarget(first, 'serial-b') }).toThrow('already bound to another device')
  })

  it('blocks a fourth identical action when three resulting frames are unchanged', () => {
    const state = new PhoneExecutionState()
    const agent = {}
    state.recordObservation(agent, { observationId: ObservationId('frame-1'), screenshotFingerprint: 'same' })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      state.assertActionAllowed(agent, 'tap:100,200')
      state.recordActionResult(agent, 'tap:100,200', 'same', 'same')
    }
    expect(() => { state.assertActionAllowed(agent, 'tap:100,200') }).toThrow('no screen progress three times')
    expect(() => { state.assertActionAllowed(agent, 'tap:300,400') }).not.toThrow()
    state.recordActionResult(agent, 'tap:300,400', 'same', 'changed')
    expect(() => { state.assertActionAllowed(agent, 'tap:100,200') }).not.toThrow()
  })

  it('clears repeated-action history whenever a later observation changes frame', () => {
    const state = new PhoneExecutionState()
    const agent = {}
    state.recordObservation(agent, { observationId: ObservationId('frame-1'), screenshotFingerprint: 'same' })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state.recordActionResult(agent, 'tap:100,200', 'same', 'same')
    }

    state.recordObservation(agent, { observationId: ObservationId('frame-2'), screenshotFingerprint: 'changed' })
    state.recordObservation(agent, { observationId: ObservationId('frame-3'), screenshotFingerprint: 'same' })

    expect(() => { state.assertActionAllowed(agent, 'tap:100,200') }).not.toThrow()
  })

  it('waits only on an explicit wait operation and aborts promptly', async () => {
    vi.useFakeTimers()
    try {
      const signal = new AbortController()
      const settled = waitForPhoneUi(500, signal.signal)
      await vi.advanceTimersByTimeAsync(500)
      await expect(settled).resolves.toBeUndefined()

      const cancelled = new AbortController()
      const waiting = waitForPhoneUi(500, cancelled.signal)
      cancelled.abort(new Error('cancel wait'))
      await expect(waiting).rejects.toThrow('cancel wait')

      const alreadyCancelled = new AbortController()
      alreadyCancelled.abort(new Error('already cancelled'))
      expect(() => waitForPhoneUi(500, alreadyCancelled.signal)).toThrow('already cancelled')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('per-phone operation queue', () => {
  it('serializes one child but lets a different phone child proceed', async () => {
    const queue = new PhoneOperationQueue()
    const phoneA = {}
    const phoneB = {}
    const events: string[] = []
    let releaseA!: () => void
    const holdA = new Promise<void>((resolve) => { releaseA = resolve })

    const firstA = queue.run(phoneA, async () => {
      events.push('a1-start')
      await holdA
      events.push('a1-end')
    })
    const secondA = queue.run(phoneA, async () => { events.push('a2') })
    const firstB = queue.run(phoneB, async () => { events.push('b1') })
    await firstB

    expect(events).toEqual(['a1-start', 'b1'])
    releaseA()
    await Promise.all([firstA, secondA])
    expect(events).toEqual(['a1-start', 'b1', 'a1-end', 'a2'])
  })
})
