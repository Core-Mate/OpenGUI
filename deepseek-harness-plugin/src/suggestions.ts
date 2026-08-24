import type { ContentBlock } from '@deepseek-ai/dsh-llm'

export interface CoremateSuggestion {
  readonly label: string
  readonly prompt: string
}

export interface CoremateSuggestionEnvelope {
  readonly items: readonly CoremateSuggestion[]
}

const TRAILER = /\n?<!--coremate-suggestions\s*\n([\s\S]*?)\n-->\s*$/u
const MAX_LABEL_LENGTH = 24
const MAX_PROMPT_LENGTH = 300

function suggestion(value: unknown): CoremateSuggestion | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const item = value as { label?: unknown, prompt?: unknown }
  if (typeof item.label !== 'string' || typeof item.prompt !== 'string') return undefined
  const label = item.label.trim()
  const prompt = item.prompt.trim()
  if (
    label.length === 0
    || label.length > MAX_LABEL_LENGTH
    || prompt.length === 0
    || prompt.length > MAX_PROMPT_LENGTH
    || label.includes('-->')
    || prompt.includes('-->')
  ) return undefined
  return { label, prompt }
}

/** Parse a final hidden suggestion trailer and return clean user-facing text. */
export function parseCoremateSuggestions(text: string): {
  readonly text: string
  readonly suggestions: readonly CoremateSuggestion[]
} {
  const match = TRAILER.exec(text)
  if (match === null) return { text, suggestions: [] }
  try {
    const value: unknown = JSON.parse(match[1]!)
    if (typeof value !== 'object' || value === null || !Array.isArray((value as { items?: unknown }).items)) {
      return { text, suggestions: [] }
    }
    const items = (value as { items: unknown[] }).items
    if (items.length < 2 || items.length > 3) return { text, suggestions: [] }
    const parsed = items.map(suggestion)
    if (parsed.some(item => item === undefined)) return { text, suggestions: [] }
    return {
      text: text.slice(0, match.index).trimEnd(),
      suggestions: parsed as CoremateSuggestion[],
    }
  } catch {
    return { text, suggestions: [] }
  }
}

/** Remove a valid trailer from text blocks while preserving every non-text block. */
export function cleanCoremateSuggestionBlocks(output: readonly ContentBlock[]): {
  readonly output: ContentBlock[]
  readonly suggestions: readonly CoremateSuggestion[]
} {
  const lastText = output.findLastIndex(block => block.type === 'text')
  if (lastText < 0) return { output: [...output], suggestions: [] }
  const block = output[lastText] as Extract<ContentBlock, { type: 'text' }>
  const parsed = parseCoremateSuggestions(block.text)
  if (parsed.suggestions.length === 0) return { output: [...output], suggestions: [] }
  const next = [...output]
  if (parsed.text.length === 0) next.splice(lastText, 1)
  else next[lastText] = { ...block, text: parsed.text }
  return { output: next, suggestions: parsed.suggestions }
}

export const COREMATE_SUGGESTION_INSTRUCTION = `End the final answer with exactly one hidden suggestion trailer in this form:
<!--coremate-suggestions
{"items":[{"label":"short action","prompt":"complete follow-up request"},{"label":"short action","prompt":"complete follow-up request"}]}
-->
Include 2 or 3 useful follow-up actions grounded in the completed task. Keep each label within 24 characters and each prompt within 300 characters. Do not mention the trailer in visible prose.`
