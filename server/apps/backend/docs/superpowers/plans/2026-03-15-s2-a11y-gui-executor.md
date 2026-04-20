# S2 A11y 优先 + GUI 兜底 Executor 改造 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Executor subgraph from pure GUI Vision mode to S2 dual-channel (A11y priority + GUI fallback) with dynamic routing via a `sense` perception node.

**Architecture:** Replace `screenshot` node with `sense` node that routes to either `a11y_model` (text LLM) or `vision_model` (VLM). When in GUI fallback mode, each round probes a11y availability in parallel and switches back immediately when available. Two model nodes converge into shared `parse_action → execute_action` pipeline with channel-aware coordinate handling.

**Tech Stack:** NestJS 11, LangGraph.js, TypeScript (backend); Kotlin, Android AccessibilityService (client); Socket.IO WebSocket (protocol)

**Spec:** `docs/superpowers/specs/2026-03-15-s2-a11y-gui-executor-design.md` (v1.2)

---

## Chunk 1: Backend Protocol & State Foundation

### Task 1: WS Protocol — Add `device:a11y_tree` event and payload types

**Files:**
- Modify: `coremate/apps/backend/src/common/ws/types.ts`

- [ ] **Step 1: Add DEVICE_A11Y_TREE to WsEvents enum**

In `src/common/ws/types.ts`, add the new event to the `WsEvents` enum (after line 50):

```typescript
// Inside WsEvents enum, after DEVICE_ACTION:
DEVICE_A11Y_TREE = "device:a11y_tree",
```

- [ ] **Step 2: Add A11yTreeRespPayload interface**

After the `ScreenshotRespPayload` interface (after line 100), add:

```typescript
/**
 * A11y Tree 响应（客户端 ACK 回传）
 */
export interface A11yTreeRespPayload {
	success: boolean;
	a11y_tree_text: string;
	ref_map: Record<
		string,
		{ x: number; y: number; bounds: [number, number, number, number] }
	>;
	screen_width: number;
	screen_height: number;
	current_app_name?: string;
	error?: string;
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/common/ws/types.ts
git commit -m "feat(ws): add device:a11y_tree event and A11yTreeRespPayload type"
```

---

### Task 2: ExecutionGateway — Add `sendA11yTreeReq` method

**Files:**
- Modify: `coremate/apps/backend/src/common/ws/execution.gateway.ts`

- [ ] **Step 1: Add sendA11yTreeReq method**

Model it after `sendScreenshotReq` (lines 537-591). Add near that method:

```typescript
/**
 * 请求客户端采集 A11y Tree
 * @param executionId 执行 ID
 * @param timeoutMs 超时时间（毫秒），默认 10000
 */
async sendA11yTreeReq(
	executionId: number,
	timeoutMs = 10000,
): Promise<{
	success: boolean;
	a11yTreeText: string;
	refMap: Record<string, { x: number; y: number; bounds: [number, number, number, number] }>;
	screenWidth: number;
	screenHeight: number;
	currentAppName: string;
	error?: string;
}> {
	const socket = this.executionSocketService.getSocket(executionId);
	if (!socket) {
		throw new Error(
			`No active connection for execution ${executionId}`,
		);
	}

	try {
		const resp = await socket
			.timeout(timeoutMs)
			.emitWithAck(WsEvents.DEVICE_A11Y_TREE, { executionId });

		if (!resp?.success) {
			return {
				success: false,
				a11yTreeText: "",
				refMap: {},
				screenWidth: 0,
				screenHeight: 0,
				currentAppName: "",
				error: resp?.error || "A11y tree capture failed",
			};
		}

		return {
			success: true,
			a11yTreeText: resp.a11y_tree_text || "",
			refMap: resp.ref_map || {},
			screenWidth: resp.screen_width || 0,
			screenHeight: resp.screen_height || 0,
			currentAppName: resp.current_app_name || "",
		};
	} catch (error) {
		this.logger.error(
			`A11y tree request failed for execution ${executionId}: ${(error as Error).message}`,
		);
		throw error;
	}
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/common/ws/execution.gateway.ts
git commit -m "feat(ws): add sendA11yTreeReq method to ExecutionGateway"
```

---

### Task 3: State Types — Extend ExecutorInternalState with channel fields

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/graph/state/state.types.ts`

- [ ] **Step 1: Add new fields to ExecutorInternalState interface**

In `state.types.ts`, inside the `ExecutorInternalState` interface (after `mainBranchDone` at line 137), add:

```typescript
	// === 通道路由 ===
	/** 当前活跃通道: a11y 优先，gui 兜底 */
	currentChannel: "a11y" | "gui";
	/** A11y 连续失败次数（>= 2 时切换到 gui） */
	a11yConsecutiveFailures: number;

	// === A11y 数据 ===
	/** A11y tree compact 格式文本 */
	a11yTreeText: string;
	/** ref → 坐标中心点和 bounds 映射 */
	a11yRefMap: Record<
		string,
		{ x: number; y: number; bounds: [number, number, number, number] }
	>;
	/** A11y 通道消息历史（独立于 GUI 的 messages） */
	a11yMessages: BaseMessage[];
```

- [ ] **Step 2: Update DEFAULT_EXECUTOR_INTERNAL_STATE**

In `DEFAULT_EXECUTOR_INTERNAL_STATE` (around line 145), add defaults after `mainBranchDone: false`:

```typescript
	// 通道路由
	currentChannel: "a11y" as const,
	a11yConsecutiveFailures: 0,
	// A11y 数据
	a11yTreeText: "",
	a11yRefMap: {},
	a11yMessages: [],
```

- [ ] **Step 3: Update executor reducer — reset path**

In the executor reducer's `isReset` branch (around line 190-199), add `a11yMessages` reset:

```typescript
if (isReset) {
	return {
		...DEFAULT_EXECUTOR_INTERNAL_STATE,
		...update,
		messages: update.messages ?? [],
		a11yMessages: update.a11yMessages ?? [],
		totalTokens: update.totalTokens ?? 0,
	};
}
```

- [ ] **Step 4: Update executor reducer — merge path**

In the normal merge path (after the existing `finalMessages` logic, around line 209-217), add `a11yMessages` merging with sliding window:

```typescript
// a11yMessages merging (same pattern as messages)
const mergedA11yMessages =
	update.a11yMessages !== undefined
		? messagesStateReducer(current.a11yMessages, update.a11yMessages)
		: current.a11yMessages;

let finalA11yMessages = mergedA11yMessages;
if (mergedA11yMessages.length > windowSize) {
	finalA11yMessages = [
		mergedA11yMessages[0],
		...mergedA11yMessages.slice(-(windowSize - 1)),
	];
}
```

Then in the return statement, replace `messages: finalMessages` with both:

```typescript
return {
	...current,
	...update,
	messages: finalMessages,
	a11yMessages: finalA11yMessages,
	totalTokens: current.totalTokens + (update.totalTokens || 0),
};
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/state/state.types.ts
git commit -m "feat(state): add channel routing and a11y data fields to ExecutorInternalState"
```

---

### Task 4: AgentConfig + Prisma — Add A11Y_EXECUTOR agent name and DB migration

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/config/types.ts`
- Modify: `coremate/packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add A11Y_EXECUTOR to AgentName enum**

In `config/types.ts`, in the `AgentName` enum (line 10-16), add:

```typescript
A11Y_EXECUTOR = "a11y-executor",
```

- [ ] **Step 2: Add "a11y_executor" to DbAgentName type union**

In `config/types.ts`, in the `DbAgentName` type (around line 22-27), add `"a11y_executor"` to the union:

```typescript
export type DbAgentName =
	| "executor_vlm"
	| "plan_supervisor"
	| "summarizer"
	| "action_summarizer"
	| "creator_agent"
	| "a11y_executor";  // 新增
```

- [ ] **Step 3: Update toDbAgentName and fromDbAgentName**

Add the new mapping in `toDbAgentName` (around line 138-147) and `fromDbAgentName` (around line 152-161):

```typescript
// In toDbAgentName switch:
case AgentName.A11Y_EXECUTOR:
	return "a11y_executor";

// In fromDbAgentName switch:
case "a11y_executor":
	return AgentName.A11Y_EXECUTOR;
```

- [ ] **Step 4: Add a11y_executor to Prisma agentname enum**

In `packages/database/prisma/schema.prisma`, find the `agentname` enum (around line 506) and add:

```prisma
enum agentname {
  executor_vlm      @map("executor-vlm")
  planner
  summarizer        @map("summarizer")
  intent_analyzer   @map("intent-analyzer")
  action_summarizer @map("action-summarizer")
  plan_generator    @map("plan-generator")
  plan_supervisor   @map("plan-supervisor")
  creator_agent     @map("creator-agent")
  a11y_executor     @map("a11y-executor")
}
```

- [ ] **Step 5: Generate Prisma client and create migration**

Run:
```bash
cd /Users/ben/Project/coremate-fullstack/coremate
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db db:migrate --name add_a11y_executor_agent
```

Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 6: Seed a11y_executor config in DB**

Insert a default configuration record. Run via Prisma seed or direct SQL:

```sql
INSERT INTO system_prompt_config (agent_name, model_name, system_prompt, is_active, region)
VALUES (
  'a11y-executor',
  'claude-haiku-4-5-20251001',
  '',
  true,
  'CN'
);
```

> Note: The a11y_model node defines its own system prompt constant internally, so `system_prompt` in DB can be empty. The DB record is needed so `getConfig()` doesn't throw "No active config found". Model name can be adjusted via Admin.

- [ ] **Step 7: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/graph-agent/config/types.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/
git commit -m "feat(config): add A11Y_EXECUTOR agent name with Prisma migration"
```

---

## Chunk 2: Backend New Nodes

### Task 5: Create channel-routing.ts — S2 routing strategy

**Files:**
- Create: `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/channel-routing.ts`

- [ ] **Step 1: Create the channel routing module**

```typescript
import { Logger } from "@nestjs/common";

const logger = new Logger("ChannelRouting");

/** A11y tree 有效性验证的最小节点数 */
const MIN_A11Y_NODES = 3;

/** A11y 连续失败多少次后切 GUI */
const A11Y_FAILURE_THRESHOLD = 2;

/**
 * 判断 a11y tree 是否可用
 * @param treeText compact 格式文本
 * @returns 是否可用
 */
export function isA11yTreeValid(treeText: string): boolean {
	if (!treeText || treeText.trim().length === 0) {
		return false;
	}
	// 每行一个节点，统计非空行数
	const nodeCount = treeText
		.split("\n")
		.filter((line) => line.trim().length > 0).length;
	return nodeCount >= MIN_A11Y_NODES;
}

/**
 * S2 路由决策：根据当前通道和失败计数决定下一步
 * @returns 决策后的通道和是否需要 fallback 到 screenshot
 */
export function resolveChannel(
	currentChannel: "a11y" | "gui",
	a11yConsecutiveFailures: number,
	a11yTreeText: string,
): {
	channel: "a11y" | "gui";
	shouldFallbackToScreenshot: boolean;
	updatedFailures: number;
} {
	if (currentChannel === "a11y") {
		if (isA11yTreeValid(a11yTreeText)) {
			return {
				channel: "a11y",
				shouldFallbackToScreenshot: false,
				updatedFailures: 0,
			};
		}

		const newFailures = a11yConsecutiveFailures + 1;
		if (newFailures >= A11Y_FAILURE_THRESHOLD) {
			logger.warn(
				`A11y failed ${newFailures} times consecutively, switching to GUI`,
			);
			return {
				channel: "gui",
				shouldFallbackToScreenshot: true,
				updatedFailures: newFailures,
			};
		}

		logger.warn(
			`A11y failed (${newFailures}/${A11Y_FAILURE_THRESHOLD}), retrying`,
		);
		return {
			channel: "a11y",
			shouldFallbackToScreenshot: false,
			updatedFailures: newFailures,
		};
	}

	// currentChannel === "gui": a11y 探测结果在 sense 节点中处理
	// 这里只处理 gui 模式的默认返回
	return {
		channel: "gui",
		shouldFallbackToScreenshot: false,
		updatedFailures: a11yConsecutiveFailures,
	};
}

/**
 * GUI 模式下 a11y 探测成功时调用
 */
export function handleA11yProbeSuccess(): {
	channel: "a11y";
	updatedFailures: 0;
} {
	logger.log("A11y probe succeeded in GUI mode, switching back to a11y");
	return { channel: "a11y", updatedFailures: 0 };
}

export { A11Y_FAILURE_THRESHOLD, MIN_A11Y_NODES };
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/channel-routing.ts
git commit -m "feat(executor): add S2 channel routing strategy module"
```

---

### Task 6: Create sense.node.ts — Perception node replacing screenshot

**Files:**
- Create: `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/sense.node.ts`
- Reference: `screenshot.node.ts` (being replaced)

- [ ] **Step 1: Create the sense node**

This node subsumes `screenshot.node.ts` functionality and adds a11y routing. Full implementation:

```typescript
import { HumanMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@nestjs/common";
import { AgentEventSource, AgentEventType } from "../../../../../common/base/enum";
import { ExecutionGateway } from "../../../../../common/ws";
import { TosService } from "../../../../tos/tos.service";
import type { AgentConfigProvider } from "../../../config/agent-config.provider";
import type { AgentState } from "../../state/executor-state.types";
import {
	handleA11yProbeSuccess,
	isA11yTreeValid,
	resolveChannel,
} from "./channel-routing";

const logger = new Logger("SenseNode");

/** A11y tree 请求超时 (ms) */
const A11Y_TIMEOUT = 10_000;
/** A11y 探测超时 (ms) — GUI 模式下并行探测用，更短 */
const A11Y_PROBE_TIMEOUT = 5_000;
/** Screenshot 请求超时 (ms) */
const SCREENSHOT_TIMEOUT = 15_000;

/**
 * 创建感知节点 — 替代原 screenshot 节点
 *
 * 职责:
 * 1. S2 路由决策 (a11y 优先, gui 兜底)
 * 2. 向客户端下发 device:a11y_tree 或 device:screenshot
 * 3. GUI 模式下并行探测 a11y 可用性
 */
export function createSenseNode(
	executionGateway: ExecutionGateway,
	tosService: TosService,
	_configProvider: AgentConfigProvider,
) {
	return async (state: AgentState, config?: RunnableConfig) => {
		// 检查取消信号
		if (config?.signal?.aborted) {
			throw new Error(config.signal.reason || "Aborted");
		}

		const executionId = state.taskExecutionId;
		const loopCount = state.executor.loopCount + 1;
		let currentChannel = state.executor.currentChannel;
		let a11yConsecutiveFailures = state.executor.a11yConsecutiveFailures;

		logger.log(
			`[Execution ${executionId}] Sense loop=${loopCount} channel=${currentChannel}`,
		);

		try {
			if (currentChannel === "a11y") {
				return await handleA11yChannel(
					state,
					executionId,
					loopCount,
					a11yConsecutiveFailures,
					executionGateway,
					tosService,
				);
			}

			// GUI 模式：并行下发 screenshot + a11y 探测
			return await handleGuiChannelWithProbe(
				state,
				executionId,
				loopCount,
				executionGateway,
				tosService,
			);
		} catch (error) {
			if (config?.signal?.aborted) {
				throw error;
			}
			logger.error(
				`[Execution ${executionId}] Sense error: ${(error as Error).message}`,
			);
			return {
				executor: {
					status: "error" as const,
					errorMessage: `Sense failed: ${(error as Error).message}`,
					loopCount,
					actionSummaryDone: false,
					mainBranchDone: false,
				},
			};
		}
	};
}

/**
 * A11y 通道处理
 */
async function handleA11yChannel(
	state: AgentState,
	executionId: number,
	loopCount: number,
	a11yConsecutiveFailures: number,
	executionGateway: ExecutionGateway,
	tosService: TosService,
) {
	let a11yTreeText = "";
	let a11yRefMap: AgentState["executor"]["a11yRefMap"] = {};
	let screenWidth = state.executor.screenWidth;
	let screenHeight = state.executor.screenHeight;
	let currentAppName = state.executor.currentAppName;

	try {
		const resp = await executionGateway.sendA11yTreeReq(
			executionId,
			A11Y_TIMEOUT,
		);
		if (resp.success) {
			a11yTreeText = resp.a11yTreeText;
			a11yRefMap = resp.refMap;
			screenWidth = resp.screenWidth || screenWidth;
			screenHeight = resp.screenHeight || screenHeight;
			currentAppName = resp.currentAppName || currentAppName;
		}
	} catch {
		logger.warn(`[Execution ${executionId}] A11y tree request timed out`);
	}

	const decision = resolveChannel(
		"a11y",
		a11yConsecutiveFailures,
		a11yTreeText,
	);

	// A11y 成功
	if (decision.channel === "a11y" && !decision.shouldFallbackToScreenshot) {
		emitChannelEvent(executionGateway, executionId, "a11y");
		return {
			executor: {
				loopCount,
				currentChannel: "a11y" as const,
				a11yConsecutiveFailures: decision.updatedFailures,
				a11yTreeText,
				a11yRefMap,
				screenWidth,
				screenHeight,
				currentAppName,
				// 重置并行分支同步标记
				actionSummaryDone: false,
				mainBranchDone: false,
			},
		};
	}

	// A11y 失败但未达阈值 — 保持 a11y，返回空数据让 a11y_model 跳过
	if (decision.channel === "a11y" && decision.updatedFailures > 0) {
		return {
			executor: {
				loopCount,
				currentChannel: "a11y" as const,
				a11yConsecutiveFailures: decision.updatedFailures,
				a11yTreeText: "",
				a11yRefMap: {},
				screenWidth,
				screenHeight,
				currentAppName,
				actionSummaryDone: false,
				mainBranchDone: false,
			},
		};
	}

	// Fallback 到 GUI — 立即请求截图
	emitChannelEvent(executionGateway, executionId, "gui");
	return await captureScreenshot(
		state,
		executionId,
		loopCount,
		decision.updatedFailures,
		"gui",
		executionGateway,
		tosService,
	);
}

/**
 * GUI 通道处理（含 a11y 并行探测）
 */
async function handleGuiChannelWithProbe(
	state: AgentState,
	executionId: number,
	loopCount: number,
	executionGateway: ExecutionGateway,
	tosService: TosService,
) {
	// 并行下发 screenshot + a11y 探测
	const [screenshotResult, a11yProbeResult] = await Promise.allSettled([
		executionGateway.sendScreenshotReq(executionId),
		executionGateway
			.sendA11yTreeReq(executionId, A11Y_PROBE_TIMEOUT)
			.catch(() => null),
	]);

	// 检查 a11y 探测是否成功
	const a11yResp =
		a11yProbeResult.status === "fulfilled" ? a11yProbeResult.value : null;
	if (a11yResp?.success && isA11yTreeValid(a11yResp.a11yTreeText)) {
		// A11y 探测成功 — 切回 a11y 通道
		const { updatedFailures } = handleA11yProbeSuccess();
		emitChannelEvent(executionGateway, executionId, "a11y");

		return {
			executor: {
				loopCount,
				currentChannel: "a11y" as const,
				a11yConsecutiveFailures: updatedFailures,
				a11yTreeText: a11yResp.a11yTreeText,
				a11yRefMap: a11yResp.refMap,
				screenWidth: a11yResp.screenWidth || state.executor.screenWidth,
				screenHeight:
					a11yResp.screenHeight || state.executor.screenHeight,
				currentAppName:
					a11yResp.currentAppName || state.executor.currentAppName,
				actionSummaryDone: false,
				mainBranchDone: false,
			},
		};
	}

	// A11y 探测失败 — 继续 GUI 模式，使用截图数据
	if (screenshotResult.status === "rejected") {
		throw screenshotResult.reason;
	}

	const resp = screenshotResult.value;
	if (!resp.success) {
		return {
			executor: {
				status: "error" as const,
				errorMessage: `Screenshot failed: ${resp.error || "unknown"}`,
				loopCount,
				actionSummaryDone: false,
				mainBranchDone: false,
			},
		};
	}

	// 生成签名 URL 并构建图片消息
	const signedUrl = await tosService.getSignedUrl(resp.screenshotUri);
	const imageMessage = new HumanMessage({
		content: [
			{
				type: "image_url",
				image_url: signedUrl,
			},
			{
				type: "text",
				text: `当前正在运行的应用：${resp.currentAppName}`,
			},
		],
		additional_kwargs: {
			created_at: new Date().toISOString(),
			screenshotKey: resp.screenshotUri,
		},
	});

	return {
		executor: {
			screenshotUri: resp.screenshotUri,
			scaleFactor: 1,
			screenWidth: resp.screenWidth,
			screenHeight: resp.screenHeight,
			currentAppName: resp.currentAppName,
			loopCount,
			messages: [imageMessage],
			currentChannel: "gui" as const,
			a11yConsecutiveFailures:
				state.executor.a11yConsecutiveFailures,
			actionSummaryDone: false,
			mainBranchDone: false,
		},
	};
}

/**
 * 截图采集（A11y fallback 到 GUI 时使用）
 */
async function captureScreenshot(
	state: AgentState,
	executionId: number,
	loopCount: number,
	a11yFailures: number,
	channel: "a11y" | "gui",
	executionGateway: ExecutionGateway,
	tosService: TosService,
) {
	const resp = await executionGateway.sendScreenshotReq(executionId);
	if (!resp.success) {
		return {
			executor: {
				status: "error" as const,
				errorMessage: `Screenshot failed: ${resp.error || "unknown"}`,
				loopCount,
				actionSummaryDone: false,
				mainBranchDone: false,
			},
		};
	}

	const signedUrl = await tosService.getSignedUrl(resp.screenshotUri);
	const imageMessage = new HumanMessage({
		content: [
			{
				type: "image_url",
				image_url: signedUrl,
			},
			{
				type: "text",
				text: `当前正在运行的应用：${resp.currentAppName}`,
			},
		],
		additional_kwargs: {
			created_at: new Date().toISOString(),
			screenshotKey: resp.screenshotUri,
		},
	});

	return {
		executor: {
			screenshotUri: resp.screenshotUri,
			scaleFactor: 1,
			screenWidth: resp.screenWidth,
			screenHeight: resp.screenHeight,
			currentAppName: resp.currentAppName,
			loopCount,
			messages: [imageMessage],
			currentChannel: channel,
			a11yConsecutiveFailures: a11yFailures,
			actionSummaryDone: false,
			mainBranchDone: false,
		},
	};
}

/**
 * 发送通道切换事件到前端
 */
function emitChannelEvent(
	executionGateway: ExecutionGateway,
	executionId: number,
	channel: "a11y" | "gui",
) {
	try {
		executionGateway.sendAgentEvent(executionId, {
			type: AgentEventType.STATUS,
			from: AgentEventSource.EXECUTOR,
			content: `channel:${channel}`,
		});
	} catch {
		// 非关键事件，静默失败
	}
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/sense.node.ts
git commit -m "feat(executor): create sense perception node with S2 a11y/gui routing"
```

---

### Task 7: Create a11y-model.node.ts — A11y LLM inference node

**Files:**
- Create: `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/a11y-model.node.ts`
- Reference: `vision-model.node.ts` for structural patterns

- [ ] **Step 1: Create the a11y model node**

```typescript
import {
	AIMessage,
	type BaseMessage,
	HumanMessage,
	SystemMessage,
} from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { Logger } from "@nestjs/common";
import type { AgentConfigProvider } from "../../../config/agent-config.provider";
import { AgentName } from "../../../config/types";
import type { WorkingMemoryToolService } from "../../../tools/working-memory.tool";
import type { AgentState } from "../../state/executor-state.types";

const logger = new Logger("A11yModelNode");

const A11Y_SYSTEM_PROMPT = `你是一个基于 Accessibility Tree 的移动端 GUI 自动化代理。

你会收到：
1) instruction（用户任务）
2) accessibility_tree_text（compact 格式节点树）
3) action_history（历史动作）

【accessibility_tree_text 格式】
- 每行一个节点: ref:ShortClass "text" desc="contentDescription" bounds=l,t,r,b [flags]
- ref 是唯一标识(e0, e1, e2...)
- ShortClass 是简化 Android 类名(Button, EditText, Text, Image, CheckBox...)
- bounds=l,t,r,b 坐标中心: x=(l+r)/2, y=(t+b)/2 (取整数)
- flags: + = clickable, ~ = scrollable, # = editable, * = focused, - = disabled, √ = checked
- 缩进表示层级关系（2空格为一级）

【严格输出格式】
必须且只能输出两行：
Thought: <中文一句话>
Action: <单个动作>

【动作空间】
click(point='<point>x y</point>')
long_press(point='<point>x y</point>')
type(content='')
scroll(point='<point>x y</point>', direction='down|up|left|right')
open_app(app_name='')
drag(start_point='<point>x1 y1</point>', end_point='<point>x2 y2</point>')
press_home()
press_back()
finished(content='xxx')
call_user(content='xxx')

【硬性规则】
- Thought 必须中文且仅一句话
- 每次只输出 1 个 Action
- 禁止输出额外文本、JSON、代码块
- 优先依赖 tree 定位目标
- 坐标由 bounds 中心点计算
- 下发 type 前必须先点击输入框确保聚焦
- 搜索必须严格使用用户关键词
- 高风险动作（支付/删除/授权/订阅）必须 call_user`;

/**
 * 创建 A11y Model 推理节点
 *
 * 与 vision_model 平行，但使用纯文本（无图片）进行推理。
 * 使用 ChatOpenAI 调用 LLM（与 vision_model 模式一致）。
 * 输入: a11yTreeText (compact 格式) + instruction
 * 输出: currentPrediction (与 vision_model 格式相同)
 */
export function createA11yModelNode(
	configProvider: AgentConfigProvider,
	_workingMemoryToolService: WorkingMemoryToolService,
) {
	return async (state: AgentState, config?: RunnableConfig) => {
		if (config?.signal?.aborted) {
			throw new Error(config.signal.reason || "Aborted");
		}

		const executionId = state.taskExecutionId;
		const { a11yTreeText, loopCount } = state.executor;

		// A11y tree 为空时（sense 节点 a11y 重试失败但未达阈值），跳过推理
		if (!a11yTreeText || a11yTreeText.trim().length === 0) {
			logger.warn(
				`[Execution ${executionId}] Empty a11y tree, skipping inference`,
			);
			return {
				executor: {
					currentPrediction: "",
					mainBranchDone: true,
				},
			};
		}

		logger.log(
			`[Execution ${executionId}] A11y model inference loop=${loopCount}`,
		);

		try {
			// 获取模型配置（使用 A11Y_EXECUTOR，走 CLAUDE_API_KEY 环境变量）
			const modelConfig = await configProvider.getModelConfig(
				AgentName.A11Y_EXECUTOR,
			);

			// 创建 ChatOpenAI 实例（与 vision-model.node.ts 模式一致）
			const model = new ChatOpenAI({
				model: modelConfig.model,
				temperature: modelConfig.temperature ?? 0,
				topP: modelConfig.topP,
				apiKey: modelConfig.apiKey,
				...(modelConfig.baseURL && {
					configuration: { baseURL: modelConfig.baseURL },
				}),
				timeout: 30000,
				maxRetries: 2,
			});

			// 构建用户消息：a11y tree + instruction
			const instruction = state.executorInput?.instruction || "";
			const userMessage = new HumanMessage({
				content: `instruction:\n${instruction}\n\naccessibility_tree_text:\n${a11yTreeText}`,
			});

			// 获取历史消息（a11y 通道独立消息链）
			const a11yMessages = state.executor.a11yMessages || [];
			const callMessages: BaseMessage[] =
				a11yMessages.length > 0
					? [...a11yMessages, userMessage]
					: [new SystemMessage(A11Y_SYSTEM_PROMPT), userMessage];

			// 调用 LLM（与 vision_model 一致使用 model.invoke）
			const response = await model.invoke(callMessages, {
				signal: config?.signal,
			});

			const prediction =
				typeof response.content === "string"
					? response.content
					: JSON.stringify(response.content);

			// 计算 token 使用
			const tokenUsage = response.usage_metadata?.total_tokens || 0;

			// 更新消息历史
			const updatedMessages: BaseMessage[] = [
				...(a11yMessages.length > 0
					? a11yMessages
					: [new SystemMessage(A11Y_SYSTEM_PROMPT)]),
				userMessage,
				new AIMessage(prediction),
			];

			return {
				executor: {
					currentPrediction: prediction,
					a11yMessages: updatedMessages,
					totalTokens: tokenUsage,
					mainBranchDone: true,
				},
			};
		} catch (error) {
			if (config?.signal?.aborted) {
				throw error;
			}
			logger.error(
				`[Execution ${executionId}] A11y model error: ${(error as Error).message}`,
			);
			return {
				executor: {
					status: "error" as const,
					errorMessage: `A11y model failed: ${(error as Error).message}`,
					mainBranchDone: true,
				},
			};
		}
	};
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/a11y-model.node.ts
git commit -m "feat(executor): create a11y-model inference node for text-based LLM reasoning"
```

---

## Chunk 3: Backend Graph Rewiring

### Task 8: Update executor-routing.ts — New routes and NODE_NAMES

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/graph/edges/executor-routing.ts`

- [ ] **Step 1: Update NODE_NAMES**

Replace the existing `NODE_NAMES` (lines 7-16) with:

```typescript
export const NODE_NAMES = {
	SENSE: "sense",
	A11Y_MODEL: "a11y_model",
	VISION_MODEL: "vision_model",
	PARSE_ACTION: "parse_action",
	CALL_USER: "call_user",
	EXECUTE_ACTION: "execute_action",
	CHECK_LOOP: "check_loop",
	ACTION_SUMMARY: "action_summary",
	BARRIER: "barrier",
} as const;
```

- [ ] **Step 2: Replace routeAfterScreenshot with routeAfterSense**

Replace `routeAfterScreenshot` function (lines 45-59) with:

```typescript
/**
 * Sense 后的 Fan-out 路由
 *
 * 根据 currentChannel 决定走 a11y_model 还是 vision_model
 * 第一轮跳过 action_summary
 */
export function routeAfterSense(state: AgentState): string[] | typeof END {
	if (state.executor.status === "error") {
		return END;
	}

	const isFirstLoop = state.executor.loopCount === 1;
	const channel = state.executor.currentChannel;
	const modelNode =
		channel === "a11y" ? NODE_NAMES.A11Y_MODEL : NODE_NAMES.VISION_MODEL;

	if (isFirstLoop) {
		return [modelNode];
	}

	return [NODE_NAMES.ACTION_SUMMARY, modelNode];
}
```

- [ ] **Step 3: Add routeAfterA11yModel function**

After the new `routeAfterSense`, add:

```typescript
/**
 * A11y Model 后的路由
 *
 * 与 routeAfterVisionModel 逻辑相同
 */
export function routeAfterA11yModel(
	state: AgentState,
): string | typeof END {
	if (state.executor.status === "error") {
		return END;
	}
	return NODE_NAMES.PARSE_ACTION;
}
```

- [ ] **Step 4: Update routeByLoop — screenshot → sense**

In `routeByLoop` (line 141-149), change the return type and return value:

```typescript
export function routeByLoop(state: AgentState): "sense" | typeof END {
	const { status, loopCount, maxLoopCount } = state.executor;

	if (status !== "running" || loopCount >= maxLoopCount) {
		return END;
	}

	return NODE_NAMES.SENSE;
}
```

- [ ] **Step 5: Remove routeAfterScreenshot and update ROUTING_PATHS**

Delete the old `routeAfterScreenshot` function entirely. Also update the `ROUTING_PATHS` constant — replace `SCREENSHOT` reference in the `CHECK_LOOP` path:

```typescript
export const ROUTING_PATHS = {
	PARSE_ACTION: {
		[NODE_NAMES.EXECUTE_ACTION]: NODE_NAMES.EXECUTE_ACTION,
		[NODE_NAMES.BARRIER]: NODE_NAMES.BARRIER,
		[END]: END,
	},
	BARRIER: {
		[NODE_NAMES.CHECK_LOOP]: NODE_NAMES.CHECK_LOOP,
		[END]: END,
	},
	CHECK_LOOP: {
		[NODE_NAMES.SENSE]: NODE_NAMES.SENSE,  // was: SCREENSHOT
		[END]: END,
	},
} as const;
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: May fail due to executor.graph.ts still referencing old names — that's expected and will be fixed in Task 9.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/edges/executor-routing.ts
git commit -m "feat(routing): replace screenshot routes with sense/a11y_model routes"
```

---

### Task 9: Rewrite executor.graph.ts — New graph structure

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/graph/executor.graph.ts`

- [ ] **Step 1: Update imports**

Replace the `screenshot` import with `sense` and add `a11y_model`:

```typescript
import {
	NODE_NAMES,
	routeAfterBarrier,
	routeAfterExecuteAction,
	routeAfterSense,         // was: routeAfterScreenshot
	routeAfterVisionModel,
	routeAfterA11yModel,     // new
	routeByAction,
	routeByLoop,
} from "./edges/executor-routing";
import {
	createActionSummaryNode,
	createBarrierNode,
	createCheckLoopNode,
	createExecuteActionNode,
	createExecutorEntryNode,
	createExecutorExitNode,
	createParseActionNode,
	createSenseNode,         // was: createScreenshotNode
	createVisionModelNode,
	createA11yModelNode,     // new
} from "./nodes/executor";
```

- [ ] **Step 2: Update EXECUTOR_NODE_NAMES**

```typescript
const EXECUTOR_NODE_NAMES = {
	...NODE_NAMES,
	ENTRY: "executor_entry",
	EXIT: "executor_exit",
} as const;
```

(BARRIER is already in NODE_NAMES now, so no need to add it here)

- [ ] **Step 3: Update node creation in buildGraph**

Replace `createScreenshotNode` with `createSenseNode`, add `createA11yModelNode`:

```typescript
const senseNode = createSenseNode(
	this.executionGateway,
	this.tosService,
	this.configProvider,
);
const a11yModelNode = createA11yModelNode(
	this.configProvider,
	this.workingMemoryToolService,
);
```

Remove the `screenshotNode` creation.

- [ ] **Step 4: Replace the entire graph wiring**

Replace all `.addNode` and `.addEdge` / `.addConditionalEdges` calls with the new structure per spec Section 8.7. Key changes:
- `SCREENSHOT` → `SENSE` everywhere
- Add `A11Y_MODEL` node
- `CALL_USER -> SCREENSHOT` → `CALL_USER -> SENSE`
- `routeAfterScreenshot` → `routeAfterSense` with EXIT wrapper
- Add `routeAfterA11yModel` with BARRIER wrapper
- `routeByLoop` now returns `"sense"`

- [ ] **Step 5: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: May fail if index.ts hasn't been updated yet.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/executor.graph.ts
git commit -m "feat(graph): rewire executor subgraph with sense/a11y_model dual-channel"
```

---

### Task 10: Update entry.node.ts — Initialize new state fields

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/entry.node.ts`

- [ ] **Step 1: Update createInitialExecutorState**

In `createInitialExecutorState` (around lines 23-46), add the new fields:

```typescript
// After existing fields in the returned object:
currentChannel: "a11y" as const,
a11yConsecutiveFailures: 0,
a11yTreeText: "",
a11yRefMap: {},
a11yMessages: [],
```

- [ ] **Step 2: Update fork resume path**

In the fork resume branch (around lines 120-133), clear transient a11y data but preserve channel state:

```typescript
// Inside the fork resume return, add:
a11yTreeText: "",
a11yRefMap: {},
// Keep currentChannel, a11yConsecutiveFailures, a11yMessages from existing state
```

- [ ] **Step 3: Build system prompt for A11Y_EXECUTOR config**

In `buildSystemPrompt` (around line 65), note that the existing code fetches `AgentName.EXECUTOR_VLM`. The a11y_model node handles its own system prompt internally, so no changes needed here — this function is only used for the GUI vision model path.

- [ ] **Step 4: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/entry.node.ts
git commit -m "feat(entry): initialize a11y channel state fields and fork resume compat"
```

---

### Task 11: Update parse-action.node.ts — Channel-aware coordinate handling

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/parse-action.node.ts`

This is the **most critical** modification. The `parseVlmPrediction` function must skip `/1000` normalization when the channel is A11y.

- [ ] **Step 1: Add channel parameter to parseVlmPrediction**

Update the function signature (line 9):

```typescript
export function parseVlmPrediction(
	text: string,
	scaleFactor: number,
	screenWidth: number,
	screenHeight: number,
	channel: "a11y" | "gui" = "gui",  // new parameter
)
```

- [ ] **Step 2: Add channel-aware coordinate processing**

Inside `parseVlmPrediction`, find the coordinate processing loop where `Number.parseFloat(num) / factors[factorIndex]` happens (around line 85). Replace the normalization with:

```typescript
// Inside the start_box/end_box for loop:
const val = Number.parseFloat(num);
if (channel === "a11y") {
	// A11y 通道: 坐标是绝对像素值，直接使用
	coords.push(val);
} else {
	// GUI 通道: 坐标是归一化 0-1000 值，需要除以 1000
	coords.push(val / factors[factorIndex]);
}
```

- [ ] **Step 3: Update the node to pass channel from state**

In `createParseActionNode` (around line 220-225 where `parseVlmPrediction` is called):

```typescript
const predictions = parseVlmPrediction(
	currentPrediction,
	scaleFactor,
	screenWidth,
	screenHeight,
	state.executor.currentChannel,  // pass channel
);
```

- [ ] **Step 4: Update parse-action.node.spec.ts test**

Read the existing test file and add a test case for A11y channel:

```typescript
it("should not normalize coordinates for a11y channel", () => {
	const text = 'Thought: 点击搜索按钮\nAction: click(point=\'<point>540 1280</point>\')';
	const result = parseVlmPrediction(text, 1, 1080, 2340, "a11y");
	expect(result[0].action_inputs.start_coords).toEqual([540, 1280]);
});

it("should normalize coordinates for gui channel", () => {
	const text = 'Thought: 点击搜索按钮\nAction: click(point=\'<point>500 640</point>\')';
	const result = parseVlmPrediction(text, 1, 1080, 2340, "gui");
	expect(result[0].action_inputs.start_coords).toEqual([0.5, 0.64]);
});
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend test -- parse-action`
Expected: ALL PASS

- [ ] **Step 6: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/parse-action.node.ts
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/parse-action.node.spec.ts
git commit -m "feat(parse-action): add channel-aware coordinate handling for a11y absolute pixels"
```

---

### Task 12: Update check-loop.node.ts — Channel failure tracking

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/check-loop.node.ts`

- [ ] **Step 1: Add a11y failure increment on stuck loops**

After the existing cancel check (around line 28-35), add logic to increment a11y failures when the loop appears stuck (same action repeated):

```typescript
// After existing status checks, before max loop check:
// If a11y channel and no effective action was taken, increment failure counter
if (
	state.executor.currentChannel === "a11y" &&
	!state.executor.parsedPrediction?.action_type
) {
	return {
		executor: {
			a11yConsecutiveFailures:
				state.executor.a11yConsecutiveFailures + 1,
		},
	};
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/check-loop.node.ts
git commit -m "feat(check-loop): track a11y consecutive failures on empty predictions"
```

---

### Task 13: Update index.ts — Export new nodes, remove screenshot

**Files:**
- Modify: `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/index.ts`

- [ ] **Step 1: Update exports**

Replace the entire file:

```typescript
export { createSenseNode } from "./sense.node";
export { createA11yModelNode } from "./a11y-model.node";
export { createVisionModelNode, type VLMConfig } from "./vision-model.node";
export { createParseActionNode } from "./parse-action.node";
export { createExecuteActionNode } from "./execute-action.node";
export { createCheckLoopNode } from "./check-loop.node";
export { createActionSummaryNode } from "./action-summary.node";
export { createExecutorEntryNode } from "./entry.node";
export { createExecutorExitNode } from "./exit.node";
export { createBarrierNode } from "./barrier.node";
```

- [ ] **Step 2: Full build verification**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS — this is the first complete build with all backend changes.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/graph-agent/graph/nodes/executor/index.ts
git commit -m "feat(executor): export sense and a11y-model nodes, remove screenshot export"
```

---

## Chunk 4: Android Client

### Task 14: Android — A11yTreeSerializer core class

**Files:**
- Create: `haomai_v0.0.1/core_accessibility/src/main/java/com/haomai/promotor/accessibility/a11y/A11yTreeSerializer.kt`

- [ ] **Step 1: Create the serializer class**

```kotlin
package com.haomai.promotor.accessibility.a11y

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/**
 * A11y Tree 序列化器 — 将 Android AccessibilityNodeInfo 树转换为 Pinchtab 风格的 compact 文本格式
 *
 * 格式: {indent}{ref}:{ShortClass} "text" desc="desc" bounds=l,t,r,b [flags]
 * Flags: + = clickable, ~ = scrollable, # = editable, * = focused, - = disabled, √ = checked
 */
class A11yTreeSerializer(
    private val maxDepth: Int = 15,
) {
    private var refCounter = 0
    private val refMap = mutableMapOf<String, RefEntry>()
    private val builder = StringBuilder()

    data class RefEntry(
        val x: Int,
        val y: Int,
        val bounds: IntArray,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is RefEntry) return false
            return x == other.x && y == other.y && bounds.contentEquals(other.bounds)
        }

        override fun hashCode(): Int {
            var result = x
            result = 31 * result + y
            result = 31 * result + bounds.contentHashCode()
            return result
        }
    }

    data class SerializationResult(
        val treeText: String,
        val refMap: Map<String, RefEntry>,
    )

    fun serialize(rootNode: AccessibilityNodeInfo?): SerializationResult {
        refCounter = 0
        refMap.clear()
        builder.clear()

        if (rootNode != null) {
            walkNode(rootNode, 0)
        }

        return SerializationResult(
            treeText = builder.toString(),
            refMap = refMap.toMap(),
        )
    }

    fun refMapToJson(): JSONObject {
        val json = JSONObject()
        for ((ref, entry) in refMap) {
            json.put(ref, JSONObject().apply {
                put("x", entry.x)
                put("y", entry.y)
                put("bounds", org.json.JSONArray(entry.bounds.toList()))
            })
        }
        return json
    }

    private fun walkNode(node: AccessibilityNodeInfo, depth: Int) {
        if (depth > maxDepth) return

        // Filter 1: 不可见节点
        if (!node.isVisibleToUser) return

        // Filter 2: 系统 UI 包
        val pkg = node.packageName?.toString() ?: ""
        if (pkg == "com.android.systemui" || pkg == "com.android.launcher") return

        val className = node.className?.toString() ?: ""
        val text = node.text?.toString()?.trim() ?: ""
        val desc = node.contentDescription?.toString()?.trim() ?: ""
        val isClickable = node.isClickable
        val isLongClickable = node.isLongClickable
        val isScrollable = node.isScrollable
        val isEditable = node.isEditable
        val isFocused = node.isFocused
        val isEnabled = node.isEnabled
        val isCheckable = node.isCheckable
        val isChecked = node.isChecked

        // Filter 3: 空的结构性容器
        if (isGenericContainer(className) && text.isEmpty() && desc.isEmpty()
            && !isClickable && !isLongClickable && !isEditable && node.childCount > 0
        ) {
            // 跳过容器本身，但继续遍历子节点
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                walkNode(child, depth) // 不增加深度
                child.recycle()
            }
            return
        }

        // Filter 4: 空 TextView
        if (className.endsWith("TextView") && text.isEmpty() && desc.isEmpty()) {
            return
        }

        // 通过所有过滤器 — 序列化此节点
        val ref = "e$refCounter"
        refCounter++

        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val centerX = (bounds.left + bounds.right) / 2
        val centerY = (bounds.top + bounds.bottom) / 2

        refMap[ref] = RefEntry(
            x = centerX,
            y = centerY,
            bounds = intArrayOf(bounds.left, bounds.top, bounds.right, bounds.bottom),
        )

        // 构建紧凑格式行
        val indent = "  ".repeat(depth)
        val shortClass = shortenClassName(className)

        builder.append(indent).append(ref).append(':').append(shortClass)

        if (text.isNotEmpty()) {
            builder.append(" \"").append(truncate(text, 80)).append('"')
        }
        if (desc.isNotEmpty()) {
            builder.append(" desc=\"").append(truncate(desc, 80)).append('"')
        }

        builder.append(" bounds=")
            .append(bounds.left).append(',')
            .append(bounds.top).append(',')
            .append(bounds.right).append(',')
            .append(bounds.bottom)

        // Flags
        val flags = buildString {
            if (isClickable || isLongClickable) append('+')
            if (isScrollable) append('~')
            if (isEditable) append('#')
            if (isFocused) append('*')
            if (!isEnabled) append('-')
            if (isCheckable && isChecked) append('√')
        }
        if (flags.isNotEmpty()) {
            builder.append(' ').append(flags)
        }

        builder.append('\n')

        // 递归子节点
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            walkNode(child, depth + 1)
            child.recycle()
        }
    }

    private fun isGenericContainer(className: String): Boolean {
        return className in setOf(
            "android.view.View",
            "android.view.ViewGroup",
            "android.widget.FrameLayout",
            "android.widget.LinearLayout",
            "android.widget.RelativeLayout",
            "androidx.constraintlayout.widget.ConstraintLayout",
            "androidx.coordinatorlayout.widget.CoordinatorLayout",
            "android.widget.ScrollView",
            "android.widget.HorizontalScrollView",
        )
    }

    private fun shortenClassName(className: String): String {
        return when (className) {
            "android.widget.Button" -> "Button"
            "android.widget.EditText" -> "EditText"
            "android.widget.TextView" -> "Text"
            "android.widget.ImageView" -> "Image"
            "android.widget.ImageButton" -> "ImageButton"
            "android.widget.CheckBox" -> "CheckBox"
            "android.widget.RadioButton" -> "Radio"
            "android.widget.Switch" -> "Switch"
            "android.widget.ToggleButton" -> "Toggle"
            "android.widget.SeekBar" -> "SeekBar"
            "android.widget.Spinner" -> "Spinner"
            "android.widget.ProgressBar" -> "Progress"
            "android.view.View" -> "View"
            "android.view.ViewGroup" -> "ViewGroup"
            "androidx.recyclerview.widget.RecyclerView" -> "RecyclerView"
            "androidx.viewpager2.widget.ViewPager2" -> "ViewPager"
            "androidx.appcompat.widget.Toolbar" -> "Toolbar"
            "com.google.android.material.bottomnavigation.BottomNavigationView" -> "BottomNav"
            "com.google.android.material.tabs.TabLayout" -> "TabLayout"
            else -> className.substringAfterLast('.')
        }
    }

    private fun truncate(text: String, maxLen: Int): String {
        val singleLine = text.replace('\n', ' ')
        return if (singleLine.length > maxLen) singleLine.take(maxLen) + "..." else singleLine
    }
}
```

- [ ] **Step 2: Verify Kotlin compilation**

Run: `cd /Users/ben/Project/coremate-fullstack/haomai_v0.0.1 && ./gradlew :core_accessibility:compileDebugKotlin`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add core_accessibility/src/main/java/com/haomai/promotor/accessibility/a11y/A11yTreeSerializer.kt
git commit -m "feat(a11y): create A11yTreeSerializer with Pinchtab-style compact encoding"
```

---

### Task 15: Android — ActionHandler interface + ActionExecutor implementation

**Files:**
- Modify: `haomai_v0.0.1/core_common_jvm/src/main/java/com/haomai/promotor/common_jvm/interfaces/ActionHandler.kt`
- Modify: `haomai_v0.0.1/core_accessibility/src/main/java/com/haomai/promotor/accessibility/ActionExecutor.kt`

- [ ] **Step 1: Add A11yTreeResult data class and captureA11yTree to ActionHandler**

In `ActionHandler.kt`, add:

```kotlin
import org.json.JSONObject

data class A11yTreeResult(
    val treeText: String,
    val refMapJson: JSONObject,
    val screenWidth: Int,
    val screenHeight: Int,
)

interface ActionHandler {
    suspend fun executeAction(actionType: String, inputs: ActionInputs): Boolean
    suspend fun captureScreenshot(): Map<String, Any?>?
    suspend fun captureA11yTree(): A11yTreeResult?
}
```

- [ ] **Step 2: Implement captureA11yTree in ActionExecutor**

In `ActionExecutor.kt`, add the implementation (after `captureScreenshot` method around line 549):

```kotlin
override suspend fun captureA11yTree(): A11yTreeResult? {
    val service = GestureService.instance ?: return null
    val rootNode = service.rootInActiveWindow ?: return null

    return try {
        val serializer = A11yTreeSerializer()
        val result = serializer.serialize(rootNode)
        rootNode.recycle()

        val displayMetrics = service.resources.displayMetrics
        A11yTreeResult(
            treeText = result.treeText,
            refMapJson = serializer.refMapToJson(),
            screenWidth = displayMetrics.widthPixels,
            screenHeight = displayMetrics.heightPixels,
        )
    } catch (e: Exception) {
        Log.e(TAG, "Failed to capture a11y tree", e)
        null
    }
}
```

Add the import at the top of `ActionExecutor.kt`:
```kotlin
import com.haomai.promotor.accessibility.a11y.A11yTreeSerializer
```

- [ ] **Step 3: Verify Kotlin compilation**

Run: `cd /Users/ben/Project/coremate-fullstack/haomai_v0.0.1 && ./gradlew :core_accessibility:compileDebugKotlin`

- [ ] **Step 4: Commit**

```bash
git add core_common_jvm/src/main/java/com/haomai/promotor/common_jvm/interfaces/ActionHandler.kt
git add core_accessibility/src/main/java/com/haomai/promotor/accessibility/ActionExecutor.kt
git commit -m "feat(a11y): add captureA11yTree to ActionHandler and implement in ActionExecutor"
```

---

### Task 16: Android — WS event handling for device:a11y_tree

**Files:**
- Modify: `haomai_v0.0.1/core_network/src/main/java/com/haomai/promotor/network/websocket/SocketEvents.kt`
- Modify: `haomai_v0.0.1/core_network/src/main/java/com/haomai/promotor/network/websocket/ExecutionSocketManager.kt`

- [ ] **Step 1: Add DEVICE_A11Y_TREE to SocketEvents**

In `SocketEvents.kt`, add:

```kotlin
const val DEVICE_A11Y_TREE = "device:a11y_tree"
```

- [ ] **Step 2: Add device:a11y_tree listener in ExecutionSocketManager**

In `ExecutionSocketManager.kt`, inside the `setupDeviceEventListeners()` method (or wherever `device:screenshot` is set up, around line 230), add the a11y tree listener:

```kotlin
socket.on(SocketEvents.DEVICE_A11Y_TREE) { args ->
    val ack = if (args.size > 1) args[1] as? io.socket.client.Ack else
        if (args.isNotEmpty()) args[0] as? io.socket.client.Ack else null

    scope.launch {
        try {
            val result = actionHandler.captureA11yTree()
            val response = JSONObject().apply {
                put("success", result != null)
                put("a11y_tree_text", result?.treeText ?: "")
                put("ref_map", result?.refMapJson ?: JSONObject())
                put("screen_width", result?.screenWidth ?: 0)
                put("screen_height", result?.screenHeight ?: 0)
                put("current_app_name", getCurrentAppName())
            }
            ack?.call(response)
        } catch (e: Exception) {
            Log.e(TAG, "A11y tree capture failed", e)
            val response = JSONObject().apply {
                put("success", false)
                put("error", e.message ?: "A11y tree capture failed")
            }
            ack?.call(response)
        }
    }
}
```

Note: Adapt the ACK pattern to match how `device:screenshot` is handled in the existing code (around line 230-277). The exact ACK extraction pattern should match the existing `device:screenshot` handler.

- [ ] **Step 3: Verify Kotlin compilation**

Run: `cd /Users/ben/Project/coremate-fullstack/haomai_v0.0.1 && ./gradlew :core_network:compileDebugKotlin`

- [ ] **Step 4: Commit**

```bash
git add core_network/src/main/java/com/haomai/promotor/network/websocket/SocketEvents.kt
git add core_network/src/main/java/com/haomai/promotor/network/websocket/ExecutionSocketManager.kt
git commit -m "feat(ws): add device:a11y_tree event listener in Android client"
```

---

### Task 17: Final verification — Full build both projects

- [ ] **Step 1: Backend full build**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend build`
Expected: BUILD SUCCESS

- [ ] **Step 2: Backend tests**

Run: `cd /Users/ben/Project/coremate-fullstack/coremate && pnpm --filter backend test -- parse-action`
Expected: ALL PASS (especially the new channel-aware coordinate tests)

- [ ] **Step 3: Android full build**

Run: `cd /Users/ben/Project/coremate-fullstack/haomai_v0.0.1 && ./gradlew assembleDebug`
Expected: BUILD SUCCESS

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final verification — all builds passing for S2 a11y+gui executor"
```
