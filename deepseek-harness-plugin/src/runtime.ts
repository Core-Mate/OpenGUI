import { freezeMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'

export { PhoneExecutionState, PhoneOperationQueue, waitForPhoneUi } from './phone-execution.ts'
export type { PhoneExecutionSnapshot, PhoneFrameState } from './phone-execution.ts'

const OMITTED_SCREENSHOT = '[older OpenGUI screenshot omitted; use the latest observed frame]'

function phoneScreenshotCount(messages: readonly Message[]): number {
  let count = 0
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'tool-result') continue
      count += block.content.filter(candidate => candidate.type === 'image').length
    }
  }
  return count
}

/**
 * Project durable phone history to one model-facing screenshot without changing the session log.
 * @param messages Complete derived child-session history.
 * @returns The original array when it has at most one phone screenshot, otherwise frozen messages with older phone images replaced by text.
 */
export function latestPhoneScreenshotMessages(messages: readonly Message[]): Message[] {
  const total = phoneScreenshotCount(messages)
  if (total <= 1) return messages as Message[]
  let seen = 0
  return messages.map((message) => {
    const content = message.content.map((block): ContentBlock => {
      if (block.type !== 'tool-result') return block
      const nested = block.content.map((candidate): ContentBlock => {
        if (candidate.type !== 'image') return candidate
        seen += 1
        if (seen === total) return candidate
        return { type: 'text', text: OMITTED_SCREENSHOT }
      })
      return nested.some((candidate, index) => candidate !== block.content[index])
        ? { ...block, content: nested }
        : block
    })
    const changed = content.some((block, index) => block !== message.content[index])
    return changed ? freezeMessage({ ...message, content }) : message
  })
}
