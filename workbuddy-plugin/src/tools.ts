import { environmentSpecSchema } from './environment.ts'
import type { WorkBuddyOpenGuiService, WorkBuddyObservation, OpenSessionOptions, SessionResult } from './service.ts'
import { Ajv } from 'ajv'
import { testCaseDefinitionSchema, testCaseResultSchema, testContextSchema, type TestCaseCommand } from './test-cases.ts'
import { handoffCategories, type HumanHandoff } from './workbench.ts'
import { commentBudgetSchema } from './comments.ts'
import { MAX_INITIAL_EXECUTION_BUDGET } from './execution-budget.ts'
import { HUMAN_CONTROL_WAIT_MS } from './state.ts'

export interface WorkBuddyToolDefinition {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly outputSchema: Record<string, unknown>
  readonly annotations: {
    readonly readOnlyHint: boolean
    readonly destructiveHint: boolean
    readonly idempotentHint: boolean
    readonly openWorldHint: boolean
  }
}

const sessionId = { type: 'string', minLength: 1, description: 'Session id returned by opengui_open_session.' }
const executionBudgetSchema = { type: 'object', additionalProperties: false, minProperties: 1, properties: {
  operationLimit: { type: 'integer', minimum: 1, maximum: MAX_INITIAL_EXECUTION_BUDGET, description: 'Agreed total phone operations, including every observe and act. Not a click-only limit.' },
  inferenceLimit: { type: 'integer', minimum: 1, maximum: MAX_INITIAL_EXECUTION_BUDGET, description: 'Agreed plugin-owned inference calls; host model calls cannot be counted here.' },
}, description: 'Declare explicit user operation/inference ceilings before any operation. Only initial limits can be lowered; this never grants an extension. Saved limits and counts survive recovery. Explicit total-operation clauses in the saved objective/criteria also constrain the budget. Read executionBudget from the returned session and verify it matches the user request.' }
const waitMs = { type: 'integer', minimum: 0, maximum: 30000, description: 'Bounded wait for a human decision or handback. Timeout preserves task state; do not loop repeatedly.' }
const controlWaitMs = { type: 'integer', minimum: 0, maximum: HUMAN_CONTROL_WAIT_MS, description: 'Wait while the person controls the phone (接管). Returns as soon as they click 恢复控制; nothing is captured and no model is called meanwhile. Use 600000 after task_paused.' }
const deviceId = { type: 'string', minLength: 1, description: 'Required when the session contains more than one phone.' }

const stepId = { type: 'string', minLength: 1, maxLength: 128, description: 'Stable step identifier returned by todo_write or progress. Required with a plan; prefer this over the legacy index. Reuse within the step; select the next returned stepId only after verifying the current result.' }
const taskNodeIndex = { type: 'integer', minimum: 0, maximum: 99, description: 'Legacy compatibility alternative to stepId, only while the plan order stays unchanged. Zero-based current node; keep it during this step, advance by one only after verifying the previous result. Advancing act reuses observationId as evidence.' }
const progressSchema = { type: 'object', additionalProperties: false, properties: {
  completed: { type: 'integer' }, total: { type: 'integer' }, inProgress: { type: 'integer' }, pending: { type: 'integer' },
  awaitingUser: { type: 'integer' }, failed: { type: 'integer' }, skipped: { type: 'integer' },
  currentNodeIndex: { type: 'integer' }, currentNode: { type: 'string' }, currentStepId: { type: 'string' }, nextStepId: { type: 'string' }, message: { type: 'string' },
}, required: ['completed', 'total', 'inProgress', 'pending', 'message'] }

const deviceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' },
    manufacturer: { type: 'string' }, os: { enum: ['android', 'ios'] }, osVersion: { type: 'string' }, sdk: { type: 'integer' }, serialSuffix: { type: 'string' }, connection: { enum: ['usb', 'network', 'local_simulator'] },
    state: { type: 'string' }, connected: { type: 'boolean' }, authorized: { type: 'boolean' },
    mirror: { type: 'object' },
    displayError: { type: 'object' },
  },
  required: ['id', 'name', 'state', 'connected', 'authorized'],
}
const displaySchema = { type: 'object', properties: { devices: { type: 'array', items: deviceSchema } }, required: ['devices'] }

const sessionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    replacementPending: { type: 'boolean' },
    inputDiagnostic: { type: 'object' },
    connectionRecovery: { type: 'object' },
    sessionId: { type: 'string' },
    purpose: { type: 'string', enum: ['control', 'mirror'] },
    mirrorResumeToken: { type: 'string' },
    state: { type: 'string', enum: ['active', 'cancelled', 'closed'] },
    activity: { type: 'string' },
    executor: { type: 'object', additionalProperties: false, properties: { mode: { enum: ['workbuddy', 'configured'] }, model: { type: 'string' }, started: { type: 'boolean' } }, required: ['mode', 'started'] },
    stopBeforeSubmit: { const: true }, controlMode: { type: 'string' }, reviews: { type: 'array', items: { type: 'object' } },
    apk: { type: 'object' },
    environment: { type: 'object' },
    handoff: { type: 'object' },
    tests: { type: 'object' },
    comments: { type: 'object' },
    reportExports: { type: 'object' }, executionBudget: { type: 'object' },
    leaseExpiresAt: { type: 'string' }, objective: { type: 'string' }, successCriteria: { type: 'string' },
    result: { type: 'object' }, automation: { type: 'object' }, progress: progressSchema,
    createdAt: { type: 'string' }, closedAt: { type: 'string' }, lastError: { type: 'string' },
    deviceWallUrl: { type: 'string' },
    devices: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' },
          connected: { type: 'boolean' }, authorized: { type: 'boolean' },
          operationCount: { type: 'integer' }, remainingOperations: { type: 'integer' }, observationId: { type: 'string' },
          mirror: { type: 'object', additionalProperties: false, properties: {
            phase: { type: 'string', enum: ['idle', 'downloading', 'extracting', 'launching', 'running', 'error'] },
            downloadedBytes: { type: 'number' }, totalBytes: { type: 'number' }, message: { type: 'string' },
            visible: { type: 'boolean' }, rendererReady: { type: 'boolean' }, ready: { type: 'boolean' },
          }, required: ['phase'] },
        },
        required: ['id', 'name', 'connected', 'authorized', 'operationCount'],
      },
    },
  },
  required: ['sessionId', 'state', 'createdAt', 'deviceWallUrl', 'devices'],
}

const observationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    inputRead: { type: 'object' },
    sessionId: { type: 'string' }, deviceId: { type: 'string' }, observationId: { type: 'string' },
    unchangedFromObservationId: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' },
    foregroundPackage: { type: 'string' },
    capturedAt: { type: 'string' }, connectionEpoch: { type: 'integer' }, settled: { type: 'boolean' },
    automation: { type: 'object' }, progress: progressSchema,
    screenshot: {
      type: 'object', additionalProperties: false,
      properties: {
        mimeType: { type: 'string', const: 'image/jpeg' }, bytes: { type: 'integer' },
        width: { type: 'integer' }, height: { type: 'integer' }, name: { type: 'string' },
      },
      required: ['mimeType', 'bytes', 'width', 'height', 'name'],
    },
  },
  required: ['sessionId', 'deviceId', 'observationId', 'width', 'height', 'foregroundPackage', 'screenshot'],
}

export const OPENGUI_WORKBUDDY_TOOLS: readonly WorkBuddyToolDefinition[] = [
  {
    name: 'opengui_handoff', title: 'Request Human Phone Handling',
    description: 'Pause phone execution and inference immediately for passwords, OTPs, payment, login, verification or security prompts. Give a short redacted reason and stopping point, never secret values. The workbench enters manual control and saves the request. Only the human can hand control back in the workbench; you cannot resume yourself. After handback, observe a fresh screenshot before any action. Optional waitMs is bounded to 30000; timeout keeps the same task paused and does not renew its lease.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, category: { type: 'string', enum: handoffCategories }, reason: { type: 'string', minLength: 1, maxLength: 1000 }, waitMs }, required: ['sessionId', 'category', 'reason'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_prepare_apk', title: 'Prepare User-Requested Android APK',
    description: 'Only for an explicit user-requested local APK installation/test task. Inspect a user-provided absolute .apk path before phone actions; do not invent paths or download remote files. Reads bounded binary AndroidManifest metadata and stages the exact bytes privately. Package/version must match this task original environment; otherwise rejected. It freezes APK hash/options for this task. Existing apps display an update warning and require the actual human workbench confirmation bound to the exact APK/hash and observed existing version. You cannot approve updates yourself; read with waitMs may wait for that decision. Install uses the returned artifactId once on the original locked phone, retains data (-r), targets the current Android user, and checks SDK compatibility. No downgrade, uninstall, runtime permission grant or security bypass. Set allowTestApk at inspect only when the user requested a test-only APK; -t is used only for a manifest-declared testOnly app. Failed/interrupted/unknown/installed attempts cannot be replayed. Reconnect, inspect actual app state, and report uncertainty. Success triggers fresh environment checks and requires a fresh screenshot before actions. Read returns saved metadata/status; raw APK bytes and staging paths never enter model output/reports. Standalone local APKs up to 512 MiB; split bundles and unresolved SDK metadata are unsupported.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, command: { enum: ['read', 'inspect', 'install'] }, waitMs, path: { type: 'string', minLength: 1, maxLength: 4096 }, artifactId: { type: 'string', minLength: 1, maxLength: 128 }, allowTestApk: { type: 'boolean' } }, required: ['sessionId', 'command'], allOf: [
      { if: { properties: { command: { const: 'read' } } }, then: { properties: { path: false, artifactId: false, allowTestApk: false } } },
      { if: { properties: { command: { const: 'inspect' } } }, then: { required: ['path'], properties: { path: {}, artifactId: false, waitMs: false } } },
      { if: { properties: { command: { const: 'install' } } }, then: { required: ['artifactId'], properties: { artifactId: {}, path: false, allowTestApk: false, waitMs: false } } },
    ] },
    outputSchema: { type: 'object', properties: { apk: { type: 'object' }, environment: { type: 'object' } } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'opengui_environment', title: 'Check OpenGUI Task Environment',
    description: 'Read or check the frozen original app and declared prerequisites. Before any phone action, command check may set spec; open_session may declare it too. Recheck resets visual account/service claims. ADB reads current-user installation, exact version, explicit permissions, Android SDK and USB mode only; it never grants permissions or changes settings. Required failed/unknown checks block actions and completion. Only launch of the original installed compatible app or wait is allowed to obtain account/service evidence. Use verify for a declared account/service check based on the latest screenshot of that app, with redacted detail and evidenceObservationId. The source is model_observation, not independent verification. Use human handoff for login/security/configuration. Restoration, reconnect and handback invalidate readiness. Omitted prerequisites are not claimed verified. For an explicitly requested local APK use opengui_prepare_apk before business actions; this environment tool itself never installs.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      sessionId, deviceId, command: { enum: ['read', 'check', 'verify'] }, spec: environmentSpecSchema,
      verification: { type: 'object', additionalProperties: false, properties: { check: { enum: ['account', 'service'] }, status: { enum: ['passed', 'failed', 'unknown'] }, detail: { type: 'string', minLength: 1, maxLength: 500 }, evidenceObservationId: { type: 'string', minLength: 1 } }, required: ['check', 'status', 'detail', 'evidenceObservationId'] },
    }, required: ['sessionId', 'command'], allOf: [
      { if: { properties: { command: { const: 'read' } } }, then: { properties: { spec: false, verification: false } } },
      { if: { properties: { command: { const: 'check' } } }, then: { properties: { verification: false } } },
      { if: { properties: { command: { const: 'verify' } } }, then: { required: ['verification'], properties: { verification: {}, spec: false } } },
    ] },
    outputSchema: { type: 'object', properties: { environment: { type: 'object' }, ready: { type: 'boolean' } }, required: ['ready'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_test_case', title: 'Record OpenGUI Test Cases and Results',
    description: 'Define bounded checks before testing; bind to an unfinished plan step. Preserve user/PRD expectations, input source, context and stopping condition. Bind each check to definition.stepId, not a top-level stepId. Begin activates its plan step and advances only after all previous-step checks have recorded results and a valid latest image exists, consuming no phone operation. Begin a case before its actions; passed/failed require executed steps and the latest screenshot on the same step. Passed requires checkedStepIndexes covering every zero-based definition.steps index actually verified; partial execution cannot pass the full case. Unknown expectations must remain unverified. Dependencies must pass before dependent checks begin. Mark omitted checks not_checked with a reason and no invented execution. Results are immutable. Retest copies a same-account archived case into a new task, preserving original expectations/data/stopping conditions and linking old results; changed/unknown conditions cannot establish a fix. Store redacted descriptions, never passwords, OTPs or keys.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId,
      command: { enum: ['define', 'begin', 'result', 'retest', 'read'] }, definition: testCaseDefinitionSchema,
      caseId: { type: 'string', minLength: 1, maxLength: 128 }, result: testCaseResultSchema,
      sourceTaskId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' }, sourceCaseId: { type: 'string', minLength: 1, maxLength: 128 }, context: testContextSchema, stepId,
    }, required: ['sessionId', 'command'], oneOf: [
      { properties: { command: { const: 'define' }, definition: {} }, required: ['definition'], not: { anyOf: ['caseId', 'result', 'sourceTaskId', 'sourceCaseId', 'context', 'stepId'].map(key => ({ properties: { [key]: {} }, required: [key] })) } },
      { properties: { command: { const: 'begin' }, caseId: {} }, required: ['caseId'], not: { anyOf: ['definition', 'result', 'sourceTaskId', 'sourceCaseId', 'context', 'stepId'].map(key => ({ properties: { [key]: {} }, required: [key] })) } },
      { properties: { command: { const: 'result' }, caseId: {}, result: {} }, required: ['caseId', 'result'], not: { anyOf: ['definition', 'sourceTaskId', 'sourceCaseId', 'context', 'stepId'].map(key => ({ properties: { [key]: {} }, required: [key] })) } },
      { properties: { command: { const: 'retest' }, sourceTaskId: {}, sourceCaseId: {}, context: {} }, required: ['sourceTaskId', 'sourceCaseId', 'context'], not: { anyOf: ['definition', 'result', 'caseId'].map(key => ({ properties: { [key]: {} }, required: [key] })) } },
      { properties: { command: { const: 'read' } }, not: { anyOf: ['definition', 'result', 'sourceTaskId', 'sourceCaseId', 'context', 'stepId'].map(key => ({ properties: { [key]: {} }, required: [key] })) } },
    ] }, outputSchema: { type: 'object' },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'opengui_execute', title: 'Execute With Configured Phone Model',
    description: 'Run the model selected from the published admin catalog on this existing authorized session and plan. The runtime handles the scoped screenshot/action loop and human review waiting. The host remains conversational. Follow WorkBuddy mode uses normal observe/act instead. Use waitMs up to 30000 for progress; repeated calls reuse the same runner, never start another. While it runs, use status/cancel rather than parallel phone actions.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, waitMs }, required: ['sessionId'] }, outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'opengui_history', title: 'Read OpenGUI Task History',
    description: 'Read durable local task history or one saved task. Recovery uses its original device and objective: open_viewer with resumeTaskId, wait for a new visible frame, then open a fresh session and observe. Old observations and approvals never restore control. Inspect unknown historical sends before any new send. Finished/cancelled tasks require a new run.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } } },
    outputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_open_guide', title: 'Open OpenGUI Connection Guide',
    description: 'Open a workbench with connection instructions and two copyable task templates, without preparing video, observing or controlling a phone. Use for a bare @opengui mention or when no authorized device is available. Present workbenchUrl in the current host panel. It does not grant first-display readiness for a later task.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { objective: { type: 'string', minLength: 1, maxLength: 4000 }, successCriteria: { type: 'string', minLength: 1, maxLength: 4000 } } }, outputSchema: { type: 'object' },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_review_comment', title: 'Review OpenGUI Comment',
    description: 'Save an exact account, stable target, source context and candidate draft for human review. Omit draft fields to read decisions. The agent cannot approve or save a human edit. Later candidates are separate versions and never overwrite the saved human final text. To record an observed phone original, supply only platformDraft {reviewId,text,evidenceObservationId} against the latest screen; it does not change the local final or authorize replacement. Approval binds this task/account/target/saved contentVersion and exact text; use the returned human-approved draft. Historical sends/unknown submissions are blocked. Declare user-agreed commentBudget at open_session; only verified sent counts as success, and time/target limits stop this run.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, waitMs, account: { type: 'string', minLength: 1, maxLength: 2000 }, target: { type: 'string', minLength: 1, maxLength: 2000 }, context: { type: 'string', minLength: 1, maxLength: 4000 }, draft: { type: 'string', minLength: 1, maxLength: 2000 }, platformDraft: { type: 'object', additionalProperties: false, properties: { reviewId: { type: 'string', minLength: 1 }, text: { type: 'string', maxLength: 2000 }, evidenceObservationId: { type: 'string', minLength: 1 } }, required: ['reviewId', 'text', 'evidenceObservationId'] } }, required: ['sessionId'], allOf: [{ not: { properties: { platformDraft: {}, draft: {} }, required: ['platformDraft', 'draft'] } }], dependencies: { account: ['target', 'context', 'draft'], target: ['account', 'context', 'draft'], context: ['account', 'target', 'draft'], draft: ['account', 'target', 'context'] } },
    outputSchema: { type: 'object' },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_comment_input', title: 'Read Focused Comment Input',
    description: 'For one saved pending/approved comment only, identify its currently focused editable field by bounds on the latest image. Copy/read the focused text through the device control channel, collapse selection and restore the original text clipboard; unrelated clipboard content never enters output or storage. No UI tree is read. Never use for passwords, OTPs, payments or another field; hand off when the comment field cannot be identified. An unsupported/empty/non-copyable field remains unreadable rather than returning stale clipboard text. Screenshot-based platformDraft may describe a visibly empty field before filling, but sending requires this exact device read to match the approved final including Chinese/emoji/newlines. A different original needs a human keep/replace choice; the agent cannot grant replacement. After filling, read again before send. Clipboard failures/cancellation do not authorize retries or sends.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, reviewId: { type: 'string', minLength: 1 }, observationId: { type: 'string', minLength: 1 }, targetBBox: { type: 'object', additionalProperties: false, properties: { left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' } }, required: ['left', 'top', 'right', 'bottom'] } }, required: ['sessionId', 'reviewId', 'observationId', 'targetBBox'] },
    outputSchema: { type: 'object' }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'opengui_verify_comment', title: 'Verify OpenGUI Comment',
    description: 'After observing a new comment matching the approved account, target and exact text, record its verified success using the latest observationId. A send receipt or cleared input alone is not evidence. Unknown submissions are never replayed. This records the model conclusion; it does not independently interpret the screenshot.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, reviewId: { type: 'string', minLength: 1 }, evidenceObservationId: { type: 'string', minLength: 1 } }, required: ['sessionId', 'reviewId', 'evidenceObservationId'] },
    outputSchema: { type: 'object' },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  ...(['open', 'status', 'close'] as const).map(action => ({
    name: action === 'status' ? 'opengui_viewer_status' : `opengui_${action}_viewer`,
    title: 'OpenGUI Real-time Viewer',
    description: action === 'open' ? 'Open this task’s workbench with present_files. A new task waits there until the user signs in, confirms request, model and device and clicks 开始执行; nothing is bound before that. Then wait for a visible decoded first frame before observing or acting.' : action === 'status' ? 'Wait at most 30 seconds per call. While startRequired is true, call again with waitMs 30000 and do not open control. After the start, it waits for verified first video frames; first-frame timeout is terminal, never recreate sessions to bypass it.' : 'Close watching only; established control continues.',
    inputSchema: { type: 'object', additionalProperties: false, properties: action === 'open'
      ? { deviceIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 1, items: { type: 'string', minLength: 1 } }, resumeTaskId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' }, objective: { type: 'string', minLength: 1, maxLength: 4000 }, successCriteria: { type: 'string', minLength: 1, maxLength: 4000 } }
      : { viewerId: { type: 'string', minLength: 1 }, ...(action === 'status' ? { waitMs: { type: 'integer', minimum: 0, maximum: 30000 } } : {}) },
      ...(action === 'open' ? {} : { required: ['viewerId'] }) },
    outputSchema: { type: 'object' },
    annotations: { readOnlyHint: action === 'status', destructiveHint: false, idempotentHint: true, openWorldHint: false },
  })),

  {
    name: 'opengui_todo_write', title: 'Update OpenGUI Task Plan',
    description: 'Replace this task viewer’s complete TODO list. Initialize outcome-based nodes as pending before control. Use returned stepId in observe/act to synchronize progress with existing operations. After node synchronization starts, preserve completed/active nodes; only pending nodes may be renamed, reordered, inserted or removed. Retain their stepIds to preserve identity. Keep incomplete steps pending or in_progress on interruption. This updates the read-only task board and never operates the phone or grants completion evidence.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      viewerId: { type: 'string', minLength: 1 },
      todos: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false,
        properties: { stepId: { type: 'string', minLength: 1, maxLength: 128, description: 'Reuse the returned ID for an existing step; omit for a new step.' }, content: { type: 'string', minLength: 1, maxLength: 2000 }, status: { type: 'string', enum: ['pending', 'in_progress', 'awaiting_user', 'completed', 'failed', 'skipped'] }, reason: { type: 'string', minLength: 1, maxLength: 2000 } },
        required: ['content', 'status'] } },
    }, required: ['viewerId', 'todos'] },
    outputSchema: { type: 'object', properties: { viewerId: { type: 'string' }, todos: { type: 'array', items: { type: 'object' } }, progress: progressSchema }, required: ['viewerId', 'todos'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },

  {
    name: 'opengui_start', title: 'Start OpenGUI',
    description: 'Legacy separate-window display, only on explicit user request. Use opengui_open_viewer for normal tasks. Show persistent local read-only windows for all authorized phones, without taking control locks or returning phone images. Windows survive task completion and transport recycling. Verify initial display once per task; later minimization or closure does not stop screenshot-driven control.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }, outputSchema: displaySchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_resume_mirror', title: 'Resume OpenGUI Mirror',
    description: 'Recover a standalone mirror after WorkBuddy recycled the previous turn connection. Requires sessionId and the private mirrorResumeToken from open_session. Never recover control sessions.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, mirrorResumeToken: { type: 'string', minLength: 1 } }, required: ['sessionId', 'mirrorResumeToken'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ...(['open', 'close'] as const).map(action => ({
    name: `opengui_${action}_mirror`, title: `${action === 'open' ? 'Open' : 'Close'} OpenGUI Mirror`,
    description: action === 'open'
      ? 'Open a local read-only silent scrcpy window by deviceId (or legacy sessionId). Returns launch progress, never images. Poll opengui_status for display readiness. Use opengui_start for standalone viewing of all authorized phones.'
      : 'Close a phone mirror only on explicit user request. Closing the final window ends a legacy mirror-only session; established control tasks continue. Use opengui_cancel to stop a task.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, deviceId }, anyOf: [{ properties: { sessionId }, required: ['sessionId'] }, { properties: { deviceId }, required: ['deviceId'] }] },
    outputSchema: { type: 'object', anyOf: [sessionSchema, displaySchema] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  })),
  {
    name: 'opengui_list_devices',
    title: 'List OpenGUI Devices',
    description: 'List local Android devices and available macOS iOS simulators with opaque ids, platform, display names, connection and authorization state.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: { type: 'object', additionalProperties: false, properties: { devices: { type: 'array', items: deviceSchema } }, required: ['devices'] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_open_session',
    title: 'Open OpenGUI Session',
    description: 'Freeze and exclusively lock one task phone. Declare executionBudget when the user specifies a total operation or plugin inference ceiling; verify the returned hard limits before operating. Requires this task’s matching viewerId; only decoded browser video establishes first-display readiness. Initial display must be verified once per task; subsequent minimization, occlusion or closure does not pause control. Finishing a task never closes windows. Omit deviceIds only with one authorized phone. Legacy purpose mirror takes no control lock.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { executionBudget: executionBudgetSchema, stopBeforeSubmit: { const: true, description: 'Latch an explicit user pre-submit endpoint for this entire task, including recovery. Cannot be disabled inside the task. Declare final actions with externalSideEffect; unclassified submit controls require human handling.' }, environment: { ...environmentSpecSchema, description: 'Declare the user-requested app, exact optional version, required permissions and explicit account/service prerequisites before actions. Read-only Android preflight runs on open; unresolved required items block actions. App/account/service values must not be invented.' }, commentBudget: { ...commentBudgetSchema, description: 'For comments only: declare the user-agreed targetCount of verified successful sends and/or maxDurationSeconds before drafting. Waiting and manual handling count toward wall-clock duration. Limits persist across recovery and cannot silently extend. Sent/submitted/unknown occupy target slots; only sent counts as success. The runtime stops at the target or deadline and preserves unfinished steps.' }, viewerId: { type: 'string', minLength: 1 }, scenario: { enum: ['general', 'testing', 'comments'], description: 'Use testing for test/reproduction/retest tasks; completed requires all structured checks to have recorded results.' }, purpose: { type: 'string', enum: ['control', 'mirror'], default: 'control' }, deviceId, deviceIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 1, items: { type: 'string', minLength: 1 } }, objective: { type: 'string', minLength: 1, maxLength: 2000 }, successCriteria: { type: 'string', minLength: 1, maxLength: 2000 } },
      not: { properties: { deviceId: {}, deviceIds: {} }, required: ['deviceId', 'deviceIds'] },
    },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'opengui_observe',
    title: 'Observe OpenGUI Phone',
    description: 'Capture the current bounded phone screenshot, logical dimensions, foreground app, and a new observationId. Use the returned image as the only coordinate space for the next action. With TODOs, pass returned stepId; when advancing, provide evidenceObservationId from the latest verified prior image. Quote progress.message unchanged in status messages.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, deviceId, stepId, taskNodeIndex, evidenceObservationId: { type: 'string', minLength: 1, description: 'Latest observation proving the previous node; required only when observe advances taskNodeIndex.' } }, required: ['sessionId'] },
    outputSchema: observationSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'opengui_act',
    title: 'Act on OpenGUI Phone',
    description: 'Perform one allowlisted action within the user-authorized task against the latest real image. No redundant plugin approval is requested. Respect host restrictions and task scope. With TODOs, pass returned stepId on every action. Keep it within a node; selecting the next pending stepId completes the previous node using observationId as evidence. Quote progress.message unchanged in status messages. Comment text requires an empty current input receipt; replace_text additionally requires the saved human original-draft replacement choice and native original readback. Sending requires opengui_comment_input to match the final draft and live execution readback; never append identical text. Inspect the returned image before deciding another action; never replay an uncertain mutation.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        sessionId, deviceId, stepId, taskNodeIndex,
        reviewId: { type: 'string', minLength: 1, description: 'Saved human-approved comment id. Required for comment text and sending after a review has been created. Use externalSideEffect send for the final send action; the runtime records a single submission intent.' },
        confirmationRequestId: { type: 'string', minLength: 1, description: 'Deprecated compatibility field; ignored, never grants permission.' },
        action: { type: 'string', enum: ['tap', 'swipe', 'text', 'replace_text', 'key', 'launch', 'wait'] },
        observationId: { type: 'string', minLength: 1 },
        targetBBox: {
          type: 'object', additionalProperties: false,
          properties: { left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' } },
          required: ['left', 'top', 'right', 'bottom'],
        },
        x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' },
        durationMs: { type: 'integer', minimum: 50, maximum: 2000 },
        text: { type: 'string', minLength: 1, maxLength: 500 },
        key: { type: 'string', enum: ['Back', 'Home', 'Enter', 'AppSwitch'] },
        packageName: { type: 'string' }, waitMs: { type: 'integer', minimum: 100, maximum: 10000 },
        externalSideEffect: {
          type: 'string', enum: ['none', 'submit', 'send', 'publish', 'purchase', 'delete'],
          description: 'For stopBeforeSubmit tasks every tap and swipe requires an explicit marker; omission is rejected before execution. Use none only after identifying preparation/navigation on the current image, never for an unknown control. Declare every final external mutation, including ordinary form submission with submit. The endpoint rejects final mutations and Enter; an ambiguous control requires handoff. Comment sending requires send plus a saved human-approved reviewId. This field never grants permission or independently verifies visual semantics.',
        },
      },
      required: ['sessionId', 'action', 'observationId'],
    },
    outputSchema: observationSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'opengui_status',
    title: 'Get OpenGUI Status',
    description: 'Read session state, frozen devices, operation counts, current observation ids, device-wall URL, and the latest error. After task_paused, call with waitMs 600000: it blocks until the person clicks 恢复控制, then observe before acting.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId, waitMs: controlWaitMs } },
    outputSchema: { type: 'object', anyOf: [sessionSchema, displaySchema] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_cancel',
    title: 'Cancel OpenGUI Session',
    description: 'Immediately abort in-flight device work, release all phone locks, and begin resource cleanup.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId }, required: ['sessionId'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'opengui_close_session',
    title: 'Close OpenGUI Session',
    description: 'Finish control and release its phone locks, never persistent displays. Report outcome and final observation evidence. With completed outcome and verified final evidence, completes only the last active TODO node; earlier nodes must already be completed. Resource cleanup alone does not prove task completion. Afterwards do not call present_files (it would switch the side panel away from the workbench); end the chat reply with a short conclusion and reportExports.chatMarkdown verbatim.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { sessionId,
      outcome: { type: 'string', enum: ['completed', 'blocked', 'unknown', 'cancelled'] },
      summary: { type: 'string', maxLength: 2000 },
      evidenceObservationIds: { type: 'array', maxItems: 4, items: { type: 'string', minLength: 1 } },
    }, required: ['sessionId'] },
    outputSchema: sessionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
].map(tool => ({ ...tool, inputSchema: { ...tool.inputSchema, properties: {
  ...tool.inputSchema.properties,
  hostContext: { type: 'string', minLength: 1, description: 'Internal single-use WorkBuddy hook context. Automatically injected by the installed hook; never invent or reuse it.' },
} } })) as readonly WorkBuddyToolDefinition[]

const ajv = new Ajv({ allErrors: true, strict: true })
const validators = new Map(OPENGUI_WORKBUDDY_TOOLS.map(tool => [tool.name, ajv.compile(tool.inputSchema)]))

export function validateToolArguments(name: string, args: unknown): asserts args is Record<string, unknown> {
  const validate = validators.get(name)
  if (!validate) throw new Error(`opengui: unknown tool ${name}`)
  if (!validate(args)) throw new Error(`opengui: invalid arguments: ${ajv.errorsText(validate.errors)}`)
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`opengui: ${name} must be a non-empty string`)
  return value.trim()
}

function optionalString(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, name)
}

function deviceIds(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error('opengui: deviceIds must be an array of strings')
  }
  return value as string[]
}

/** Dispatch one normalized public interface to the shared service. */
export async function callOpenGuiTool(
  service: WorkBuddyOpenGuiService,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  options: OpenSessionOptions = {},
): Promise<unknown> {
  validateToolArguments(name, args)
  if (typeof args.sessionId === 'string') service.assertExecutionOwner(args.sessionId, options.configuredRunner === true, name, args)
  switch (name) {
    case 'opengui_prepare_apk':
      if (args.command === 'read' && args.waitMs) await service.waitForApkUpdate(requiredString(args.sessionId, 'sessionId'), Number(args.waitMs), signal)
      return service.apk(requiredString(args.sessionId, 'sessionId'), args.command as 'read' | 'inspect' | 'install', signal, optionalString(args.path, 'path'), optionalString(args.artifactId, 'artifactId'), args.allowTestApk === true)
    case 'opengui_environment': return service.environment(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'), args.command as 'read' | 'check' | 'verify', signal, args.spec, args.verification as Parameters<WorkBuddyOpenGuiService['environment']>[5])
    case 'opengui_handoff': return service.requestHandoff(requiredString(args.sessionId, 'sessionId'), args.category as HumanHandoff['category'], requiredString(args.reason, 'reason'), Number(args.waitMs ?? 0), signal)
    case 'opengui_test_case': return service.testCase(requiredString(args.sessionId, 'sessionId'), args as unknown as TestCaseCommand)
    case 'opengui_execute': return service.executeConfigured(requiredString(args.sessionId, 'sessionId'), Number(args.waitMs ?? 0), signal)
    case 'opengui_history': return { history: service.viewers.history(optionalString(args.taskId, 'taskId')) }
    case 'opengui_review_comment': {
      if (args.platformDraft) { const input = args.platformDraft as { reviewId: string; text: string; evidenceObservationId: string }; return service.platformDraft(requiredString(args.sessionId, 'sessionId'), input.reviewId, input.text, input.evidenceObservationId) }
      return args.draft === undefined && args.waitMs ? service.waitForUser(requiredString(args.sessionId, 'sessionId'), Number(args.waitMs), signal, true) : service.reviewComment(requiredString(args.sessionId, 'sessionId'), args.draft === undefined ? undefined : { account: requiredString(args.account, 'account'), target: requiredString(args.target, 'target'), context: args.context as string, draft: args.draft as string })
    }
    case 'opengui_comment_input': return service.commentInput(requiredString(args.sessionId, 'sessionId'), requiredString(args.reviewId, 'reviewId'), requiredString(args.observationId, 'observationId'), args.targetBBox as Record<string, unknown>, signal)
    case 'opengui_verify_comment': return service.verifyComment(requiredString(args.sessionId, 'sessionId'), requiredString(args.reviewId, 'reviewId'), requiredString(args.evidenceObservationId, 'evidenceObservationId'))
    case 'opengui_open_viewer': return service.openViewer(deviceIds(args.deviceIds), signal, { ...options, objective: optionalString(args.objective, 'objective') ?? options.objective, successCriteria: optionalString(args.successCriteria, 'successCriteria') ?? options.successCriteria, resumeTaskId: optionalString(args.resumeTaskId, 'resumeTaskId') })
    case 'opengui_open_guide': return service.openGuide(signal, { ...options, objective: optionalString(args.objective, 'objective') ?? options.objective, successCriteria: optionalString(args.successCriteria, 'successCriteria') ?? options.successCriteria })
    case 'opengui_viewer_status': return service.viewers.status(requiredString(args.viewerId, 'viewerId'), options.owner ?? options.task?.viewerOwner ?? 'local', Number(args.waitMs ?? 0), signal)
    case 'opengui_close_viewer': return service.viewers.closeViewer(requiredString(args.viewerId, 'viewerId'), options.owner ?? options.task?.viewerOwner ?? 'local')
    case 'opengui_todo_write': return service.viewers.writeTodos(requiredString(args.viewerId, 'viewerId'), options.owner ?? options.task?.viewerOwner ?? 'local', args.todos)

    case 'opengui_start': return service.start(signal)
    case 'opengui_list_devices':
      return { devices: await service.listDevices(signal) }
    case 'opengui_open_session':
      return service.openSession(args.deviceId ? [requiredString(args.deviceId, 'deviceId')] : deviceIds(args.deviceIds), signal, args.purpose as 'control' | 'mirror' | undefined, { ...options, executionBudget: args.executionBudget as OpenSessionOptions['executionBudget'], stopBeforeSubmit: args.stopBeforeSubmit as true | undefined, environment: args.environment, commentBudget: args.commentBudget as OpenSessionOptions['commentBudget'], scenario: args.scenario as OpenSessionOptions['scenario'], viewerId: optionalString(args.viewerId, 'viewerId'), objective: optionalString(args.objective, 'objective'), successCriteria: optionalString(args.successCriteria, 'successCriteria') })
    case 'opengui_open_mirror':
      if (!args.sessionId) return service.deviceMirror(requiredString(args.deviceId, 'deviceId'), false, signal)
      return service.openMirror(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'), signal)
    case 'opengui_close_mirror':
      if (!args.sessionId) return service.deviceMirror(requiredString(args.deviceId, 'deviceId'), true, signal)
      return service.closeMirror(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'))
    case 'opengui_observe':
      return service.observe(requiredString(args.sessionId, 'sessionId'), optionalString(args.deviceId, 'deviceId'), signal, args.taskNodeIndex as number | undefined, optionalString(args.evidenceObservationId, 'evidenceObservationId'), optionalString(args.stepId, 'stepId'))
    case 'opengui_act':
      return service.act(
        requiredString(args.sessionId, 'sessionId'),
        optionalString(args.deviceId, 'deviceId'),
        args,
        signal,
      )
    case 'opengui_status':
      if (!args.sessionId) return service.displayStatus(signal)
      return args.waitMs ? service.waitForUser(requiredString(args.sessionId, 'sessionId'), Number(args.waitMs), signal) : service.status(requiredString(args.sessionId, 'sessionId'), signal)
    case 'opengui_cancel':
      return service.cancel(requiredString(args.sessionId, 'sessionId'))
    case 'opengui_close_session':
      return service.closeSession(requiredString(args.sessionId, 'sessionId'), args.outcome ? {
        outcome: args.outcome as SessionResult['outcome'],
        ...(typeof args.summary === 'string' ? { summary: args.summary } : {}),
        ...(Array.isArray(args.evidenceObservationIds) ? { evidenceObservationIds: args.evidenceObservationIds as string[] } : {}),
      } : undefined)
    default:
      throw new Error(`opengui: unknown tool ${name}`)
  }
}

export function isWorkBuddyObservation(value: unknown): value is WorkBuddyObservation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<WorkBuddyObservation>
  return typeof candidate.observationId === 'string' && typeof candidate.screenshot?.data === 'string'
}
