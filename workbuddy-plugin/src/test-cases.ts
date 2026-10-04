import { Ajv } from 'ajv'

export interface TestContext { app: string; version: string; environment: string; account: string; startPage: string }
export interface TestCaseDefinition {
  title: string
  kind: 'flow' | 'reproduction' | 'retest'
  stepId?: string
  context: TestContext
  prerequisites: string[]
  testData: { source: 'user' | 'generated' | 'none'; description: string }
  steps: string[]
  expected: string
  expectedSource: { kind: 'user' | 'prd' | 'case' | 'unknown'; reference: string }
  stoppingCondition: string
  dependencies: string[]
}
export interface TestCaseResult {
  status: 'passed' | 'failed' | 'unverified' | 'not_checked'
  actual: string
  page?: string
  executedSteps: string[]
  checkedStepIndexes?: number[]
  evidenceObservationIds: string[]
  reason?: string
  reproduction?: 'reproduced' | 'not_reproduced' | 'unknown'
  recordedAt: string
}
export type TestCaseResultInput = Omit<TestCaseResult, 'recordedAt'>
export type TestCaseCommand =
  | { command: 'define'; definition: TestCaseDefinition }
  | { command: 'begin'; caseId: string }
  | { command: 'result'; caseId: string; result: TestCaseResultInput }
  | { command: 'retest'; sourceTaskId: string; sourceCaseId: string; context: TestContext; stepId?: string }
  | { command: 'read'; caseId?: string }
export interface TestCase {
  id: string
  definition: TestCaseDefinition
  createdAt: string
  result?: TestCaseResult
  origin?: { taskId: string; caseId: string; context: TestContext; result?: TestCaseResult }
}
const text = { type: 'string', minLength: 1, maxLength: 4000 }
const list = { type: 'array', maxItems: 30, items: text }
export const testContextSchema = { type: 'object', additionalProperties: false, properties: { app: text, version: text, environment: text, account: text, startPage: text }, required: ['app', 'version', 'environment', 'account', 'startPage'] }
export const testCaseDefinitionSchema = { type: 'object', additionalProperties: false, properties: {
  title: { ...text, maxLength: 200 }, kind: { enum: ['flow', 'reproduction', 'retest'] }, stepId: { type: 'string', minLength: 1, maxLength: 128 },
  context: testContextSchema, prerequisites: list, steps: { ...list, minItems: 1 },
  testData: { type: 'object', additionalProperties: false, properties: { source: { enum: ['user', 'generated', 'none'] }, description: text }, required: ['source', 'description'] },
  expected: text, expectedSource: { type: 'object', additionalProperties: false, properties: { kind: { enum: ['user', 'prd', 'case', 'unknown'] }, reference: text }, required: ['kind', 'reference'] },
  stoppingCondition: text, dependencies: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 128 } },
}, required: ['title', 'kind', 'context', 'prerequisites', 'testData', 'steps', 'expected', 'expectedSource', 'stoppingCondition', 'dependencies'] }
export const testCaseResultSchema = { type: 'object', additionalProperties: false, properties: {
  status: { enum: ['passed', 'failed', 'unverified', 'not_checked'] }, actual: text,
  page: text,
  executedSteps: list, checkedStepIndexes: { type: 'array', maxItems: 30, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 29 }, description: 'Zero-based definition.steps indexes actually verified against evidence. A passed result must cover every planned step.' }, evidenceObservationIds: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 128 } }, reason: text,
  reproduction: { enum: ['reproduced', 'not_reproduced', 'unknown'] },
}, required: ['status', 'actual', 'executedSteps', 'evidenceObservationIds'] }
const ajv = new Ajv(), definitionGuard = ajv.compile<TestCaseDefinition>(testCaseDefinitionSchema), resultGuard = ajv.compile<TestCaseResultInput>(testCaseResultSchema)
export function validateTestDefinition(input: unknown): TestCaseDefinition {
  if (!definitionGuard(input)) throw new Error('invalid_test_case: provide the bounded case definition, unknown context explicitly, and redacted test data')
  return structuredClone(input)
}
export function validateTestResult(test: TestCase, input: unknown): TestCaseResultInput {
  if (!resultGuard(input)) throw new Error('invalid_test_result')
  if (input.status === 'passed' || input.status === 'failed') {
    if (test.definition.expectedSource.kind === 'unknown') throw new Error('test_expectation_unknown: record unverified rather than inventing a passing or failing expectation')
    if (!input.executedSteps.length || !input.evidenceObservationIds.length) throw new Error('test_evidence_required')
  }
  const checked = input.checkedStepIndexes ?? []
  if (checked.some(index => index >= test.definition.steps.length)) throw new Error('test_step_index_invalid')
  if (input.status === 'passed' && test.definition.steps.some((_, index) => !checked.includes(index))) throw new Error('test_step_coverage_required: provide checkedStepIndexes for every planned step actually verified; partial execution must remain unverified or failed')
  if ((input.status === 'not_checked' || input.status === 'unverified') && !input.reason?.trim()) throw new Error('test_reason_required')
  if (input.status === 'failed' && !input.page?.trim()) throw new Error('test_failure_page_required: record the actual page where the defect was observed')
  if (input.status === 'not_checked' && (input.executedSteps.length || input.evidenceObservationIds.length)) throw new Error('test_not_checked_has_execution: use unverified for an executed but uncertain check')
  if (test.definition.kind === 'reproduction' && input.status !== 'not_checked' && !input.reproduction) throw new Error('test_reproduction_result_required')
  return structuredClone(input)
}
export function testSummary(cases: readonly TestCase[]) {
  const count = (status: TestCaseResult['status']) => cases.filter(test => test.result?.status === status).length
  return { total: cases.length, planned: cases.filter(test => !test.result).length, passed: count('passed'), failed: count('failed'), unverified: count('unverified'), notChecked: count('not_checked') }
}
export function retestComparison(test: TestCase) {
  if (!test.origin) return undefined
  const { origin, definition } = test
  const differences = (['app', 'version', 'environment', 'account', 'startPage'] as const).filter(key => origin.context[key] !== definition.context[key])
  const known = (value: string) => !/^(unknown|未知|未提供|待确认)$/iu.test(value.trim())
  const comparable = (['app', 'environment', 'account', 'startPage'] as const).every(key => known(origin.context[key]) && known(definition.context[key]) && origin.context[key] === definition.context[key])
  return { previous: origin.result?.status ?? 'not_checked', current: test.result?.status ?? 'not_checked', differences, comparable,
    ...(comparable && origin.result?.status === 'failed' && test.result?.status === 'passed' ? { conclusion: '本次相同检查点已通过' } : { conclusion: comparable ? '保留两次实际结果，不能据此宣称问题已修复' : '业务条件未知或不一致，暂不能直接判定修复' }) }
}
