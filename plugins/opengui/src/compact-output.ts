import type { MaterializedObservation } from './state.ts'

/** Keep terminal results small while retaining the complete observation on disk. */
export function compactOutput(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const candidate = value as Partial<MaterializedObservation>
  if (typeof candidate.observationId !== 'string' || typeof candidate.observationPath !== 'string'
    || typeof candidate.screenshot?.path !== 'string' || !candidate.layout) return value
  const observation = value as MaterializedObservation
  const layout = observation.layout!
  const nodes = layout.nodes.filter(node => node.focused && /^(TextInput|TextArea|EditText)$/iu.test(node.type)).slice(0, 8)
  return {
    ...observation,
    layout: { ...layout, nodes, truncated: layout.truncated || nodes.length < layout.nodes.length,
      warnings: [...layout.warnings, 'Compact output includes only focused editable nodes. Read observationPath for the complete layout; verify action targets in the screenshot.'] },
  }
}
