export const BASE_EXECUTION_BUDGET = 1000
export const MAX_INITIAL_EXECUTION_BUDGET = 10000
// Old archives without initialLimits used a default of 100; never expand their authority.
export const LEGACY_EXECUTION_BUDGET = 100
export const MAX_STORED_EXECUTION_BUDGET = MAX_INITIAL_EXECUTION_BUDGET + 100 * 100
export interface ExecutionBudgetInput { operationLimit?: number; inferenceLimit?: number }
export interface BudgetExtension {
  id: string
  grantedAt: string
  additional: number
  previousOperationLimit: number
  previousInferenceLimit: number
  operationLimit: number
  inferenceLimit: number
  previousResult: { outcome: string; summary?: string }
}
export interface ExecutionBudget {
  initialLimits?: { operationLimit: number; inferenceLimit: number }
  operationLimit: number
  inferenceLimit: number
  operations: Record<string, number>
  extensions: BudgetExtension[]
}
/** Recognize explicit total phone-operation ceilings, not click counts or report quantities. */
export function requestedOperationLimit(...values: unknown[]): number | undefined {
  const limits: number[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const text = value.normalize('NFKC')
    for (const pattern of [/(?:最多|不超过|至多)\s*([0-9]+)\s*次\s*(?:手机|设备)操作/gu, /(?:手机|设备)操作(?:总次数)?\s*(?:最多|不超过|上限(?:为|是|:)?|至多)\s*([0-9]+)\s*次/gu, /\b(?:at most|no more than|max(?:imum)?(?: of)?)\s+([0-9]+)\s+(?:phone|device)\s+operations?\b/giu]) {
      for (const match of text.matchAll(pattern)) {
        const limit = Number(match[1])
        if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_execution_budget_input')
        limits.push(Math.min(limit, MAX_INITIAL_EXECUTION_BUDGET))
      }
    }
  }
  return limits.length ? Math.min(...limits) : undefined
}
export function executionBudgetInput(value: unknown): ExecutionBudgetInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_execution_budget_input')
  const input = value as ExecutionBudgetInput
  const keys = Object.keys(input)
  if (!keys.length || keys.some(key => !['operationLimit', 'inferenceLimit'].includes(key)) ||
    keys.some(key => !Number.isInteger(input[key as keyof ExecutionBudgetInput]) || Number(input[key as keyof ExecutionBudgetInput]) < 1 || Number(input[key as keyof ExecutionBudgetInput]) > MAX_INITIAL_EXECUTION_BUDGET)) throw new Error('invalid_execution_budget_input')
  return { ...input }
}
export function validatedExecutionBudget(value: ExecutionBudget | undefined): ExecutionBudget | undefined {
  if (value === undefined) return undefined
  const limit = (n: unknown) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= MAX_STORED_EXECUTION_BUDGET
  if (!value || !limit(value.operationLimit) || !limit(value.inferenceLimit) || !value.operations || typeof value.operations !== 'object' || Array.isArray(value.operations) ||
    Object.values(value.operations).some(n => !Number.isInteger(n) || n < 0 || n > value.operationLimit) || !Array.isArray(value.extensions) || value.extensions.length > 100 ||
    value.extensions.some(e => !e || typeof e.id !== 'string' || !Number.isFinite(Date.parse(e.grantedAt)) || !Number.isInteger(e.additional) || e.additional < 1 || e.additional > 100 || !limit(e.previousOperationLimit) || !limit(e.previousInferenceLimit) || !limit(e.operationLimit) || !limit(e.inferenceLimit) || e.previousResult?.outcome !== 'blocked')) throw new Error('invalid_execution_budget')
  const initial = value.initialLimits ?? { operationLimit: LEGACY_EXECUTION_BUDGET, inferenceLimit: LEGACY_EXECUTION_BUDGET }
  executionBudgetInput(initial)
  if (Object.keys(initial).length !== 2) throw new Error('invalid_execution_budget')
  const latest = value.extensions.at(-1)
  if (value.operationLimit !== (latest?.operationLimit ?? initial.operationLimit) || value.inferenceLimit !== (latest?.inferenceLimit ?? initial.inferenceLimit) ||
    value.extensions.some((extension, index) => extension.previousOperationLimit !== (value.extensions[index - 1]?.operationLimit ?? initial.operationLimit) || extension.previousInferenceLimit !== (value.extensions[index - 1]?.inferenceLimit ?? initial.inferenceLimit))) throw new Error('invalid_execution_budget')
  return structuredClone(value)
}
