# 任务执行架构审计报告（校正版）

> 审计范围：`graph-agent/` 主循环 + Executor 子循环 + `task-execution.service` + `execution.gateway` + Android 客户端
> 审计日期：2026-03-19 ｜ 校正日期：2026-03-19

---

## 目录

- [P0 — 严重 BUG（影响核心功能）](#p0--严重-bug影响核心功能)
- [P1 — 中等 BUG（边界场景异常）](#p1--中等-bug边界场景异常)
- [P2 — 低风险 / 改进建议](#p2--低风险--改进建议)
- [LLM 上下文拼接分析](#llm-上下文拼接分析)

---

## P0 — 严重 BUG（影响核心功能）

### P0-1: Billing Interrupt 补扣逻辑存在双重漏洞 — Token 漏扣 + 模型重复调用

**文件**:
- `vision-model.node.ts:425-468`
- `a11y-model.node.ts:237-280`
- `plan-supervisor.node.ts:456-499`（同一模式，需一起修）

**现状代码**（三处一致）:

```typescript
// 首次扣费 → 余额不足
interrupt("insufficient_balance");
// 用户充值后恢复执行，补扣本次 token
try {
  const retryBilling = await billingService.deductByTokens(
    state.userId, totalTokens, ...
  );
  if (retryBilling.insufficientBalance) {
    interrupt("insufficient_balance");  // ← 第二次 interrupt
  }
} catch (retryErr) {
  logger.warn(`Retry billing after resume failed`);
  // ← catch 后直接 fall through
}
```

**根因分析**:

**LangGraph JS 的 `interrupt()` 实际行为**：`interrupt()` 抛出 `GraphInterrupt` 异常，节点执行中断，checkpoint 保存在节点执行 **之前** 的状态。当用户 resume 时，**整个节点函数从头重新执行**，`interrupt()` 在重入时返回 resume 传入的值（而非再次抛出）。

基于此行为，存在 **两个漏洞**：

**漏洞 1 — 每次 resume 都重新调用 LLM**：

```
第 1 次进入节点: model.invoke() → 消耗 1000 tokens → billing 失败 → interrupt()
                                                                      checkpoint 保存
用户充值 → resume
第 2 次进入节点: model.invoke() → 又消耗 1000 tokens → billing 扣第 2 次的费
                 ↑ 整个节点重跑，第 1 次的 1000 tokens 的 LLM provider 成本已烧掉
```

每次 resume 都重新调用 LLM，烧掉 provider 端的计算成本（即使第 1 次的结果没被使用）。如果用户反复充值最小金额 → resume → 余额又不足 → interrupt，每轮都会白烧一次 LLM 调用。

**漏洞 2 — 第二次 interrupt 后 retry 代码变成死代码**：

节点重入时，第一个 `interrupt()` 返回 resume 值（不阻塞）。代码继续执行到 retry 块。如果 retry 成功，正常 fall through。但如果 retry 的 `interrupt()` 触发，再次 resume 后 **节点又从头执行**，之前的 retry 代码永远不会在第三次进入时被执行到（因为第一个 interrupt 先返回、第二个 interrupt 也先返回，直接走 retry 成功路径或 catch 吞掉异常）。

更严重的是：在节点重入第 2 次时，`response`/`totalTokens` 是 **新的** LLM 调用结果，但 billing 只扣了第 2 次的费用。第 1 次调用的 tokens 永远不会被追回。

**影响**:
1. LLM provider 成本浪费（每次 resume 重调模型）
2. 用户通过反复触发余额不足可以不断消耗 LLM 而只付最后一次的费用

**修复方案 — 允许余额为负 + 前置拦截**:

**核心思路**：扣费永远成功（允许余额扣为负数），在下一次 LLM 调用入口拦截余额 ≤ 0 的用户。

这比 state 缓存 / pendingBillingTokens 方案简洁一个量级，且一次性解决所有子问题：

| 子问题 | 解决方式 |
|--------|---------|
| Token 漏扣费 | 扣费允许负值 → 永远成功 → 不可能漏扣 |
| Resume 重调 LLM | Interrupt 发生在 LLM 调用 **之前** → resume 重入只做余额检查，不调模型 |
| 双 interrupt + retry 死代码 | 整块删除 |
| pendingBillingTokens 状态 | 不需要 |

**改动分 3 步**：

**Step 1 — 积分服务允许余额为负**

`credits.service.ts` 的 `deductCredits()` 当前在 `balance.remaining < amount` 时抛出 `BadRequestException("积分余额不足")`。需要增加一个 `allowNegative` 参数：

```typescript
// credits.service.ts — deductCredits
async deductCredits(userId: number, dto: DeductCreditsDto, allowNegative = false) {
  // ... 查询 balance + version ...
  if (!allowNegative && balance.remaining < dto.amount) {
    throw new BadRequestException("积分余额不足");
  }
  // 允许 remaining 变为负数
  const updated = await tx.user_balance.updateMany({
    where: { user_id: userId, version: balance.version },
    data: { remaining: { decrement: dto.amount }, version: { increment: 1 } },
  });
  // ...
}
```

`billing.service.ts` 调用时传入 `allowNegative: true`：

```typescript
// billing.service.ts — deductByTokens
const result = await this.creditsService.deductCredits(userId, {
  amount: creditsToDeduct,
  taskId: String(taskExecutionId),
  taskTitle: `task_exec_${taskExecutionId}`,
}, /* allowNegative */ true);
```

这样 `deductByTokens` 永远返回 `{ success: true, insufficientBalance: false }`（除非发生技术异常）。

**Step 2 — 删除三处 interrupt + retry 块**

从 `vision-model.node.ts`、`a11y-model.node.ts`、`plan-supervisor.node.ts` 中删除整个"余额不足 → interrupt → 补扣"块。扣费代码简化为：

```typescript
// 扣费（允许负值，永远成功）
if (totalTokens > 0) {
  const billing = await billingService.deductByTokens(
    state.userId, totalTokens, state.taskId, state.taskExecutionId
  );
  if (!billing.success) {
    // 非余额不足的技术异常（DB/Redis 故障）→ 记录，继续执行，后台对账补扣
    logger.error(
      `Billing failed (non-balance): user=${state.userId}, tokens=${totalTokens}, unpaid`
    );
  }
}
```

**Step 3 — 在模型节点入口添加余额前置检查**

在 `vision-model.node.ts`、`a11y-model.node.ts`、`plan-supervisor.node.ts` 的节点函数开头（abort 检查之后、模型调用之前）添加：

```typescript
// === 余额前置拦截 ===
// 如果上一轮扣费将余额扣为负数，在调 LLM 之前拦截
const balance = await creditsService.getBalance(state.userId);
if (balance.remaining <= 0) {
  logger.warn(
    `Insufficient balance for user ${state.userId} (${balance.remaining}), suspending before LLM call`
  );
  try {
    await prismaService.task_execution.update({
      where: { id: state.taskExecutionId },
      data: {
        execution_status: "SUSPENDED",
        status_message: "积分不足，请充值后再试",
        updated_at: new Date(),
      },
    });
  } catch (dbErr) {
    logger.error(`Failed to update execution status: ${(dbErr as Error).message}`);
  }
  interrupt("insufficient_balance");
  // 用户充值后 resume → 节点重入 → 再次检查余额
  // 如果已充值 → balance > 0 → 通过检查 → 正常调模型
  // 如果仍不足 → balance ≤ 0 → 再次 interrupt（自然循环，无需 while）
}
```

**流程示例**：

```
Loop N:
  sense → 截图成功
  vision_model:
    余额检查: remaining=10 > 0 ✓ → 继续
    model.invoke() → 消耗 tokens
    billing.deductByTokens(tokens) → remaining=-5（允许负值）→ success=true
    返回 prediction → 正常 checkpoint
  parse_action → execute_action → post_execute → 继续

Loop N+1:
  sense → 截图成功
  vision_model:
    余额检查: remaining=-5 ≤ 0 ✗ → interrupt("insufficient_balance")
    节点挂起，不调 LLM

用户充值 20 → remaining=15 → resume:
  vision_model 重入:
    余额检查: remaining=15 > 0 ✓ → 继续
    model.invoke() → 正常调用 → 正常扣费
```

**注意事项**：

1. `startExecution` 和 `startForkExecution` 的入口余额检查（remaining ≤ 0 → 拒绝启动）保持不变。负余额只发生在 **执行过程中** 耗尽的场景。
2. 负余额的最大幅度等于单次 LLM 调用的成本（因为下一次调用前会被拦截），风险可控。
3. `creditsService.deductCredits` 的批次扣减（FIFO from credit_batch）在余额不足时可能没有可扣的批次。需要确保批次扣减逻辑在 `remaining < 0` 时不出错（可以跳过批次扣减，只记录 credit_flow）。
4. Summarizer 节点当前已经不对余额不足做 interrupt（只 warn 并继续），无需改动。

**修改文件**:
- `credits.service.ts`（新增 `allowNegative` 参数）
- `billing.service.ts`（传入 `allowNegative: true`）
- `vision-model.node.ts`（删除 interrupt 块 + 添加入口检查）
- `a11y-model.node.ts`（同上）
- `plan-supervisor.node.ts`（同上）

---

### P0-2: A11y 失败计数双倍递增 — 单次无效即触发 GUI 回退

**文件**:
- `sense.node.ts:188-231`（路径 1：sense 递增）
- `post-execute.node.ts:365-371`（路径 2：post_execute 递增）
- `channel-routing.ts:50`（阈值定义）

**现状代码**:

**sense 节点** — A11y Tree 无效但未达阈值：
```typescript
return {
  executor: {
    a11yConsecutiveFailures: routing.updatedFailures, // ← 递增 1
    a11yTreeText: "",  // ← 设为空
  },
};
```

**post_execute 节点** — a11y 通道 + 无有效 action_type：
```typescript
} else if (
  exec.currentChannel === "a11y" &&
  !exec.parsedPrediction?.action_type
) {
  loopUpdate = {
    a11yConsecutiveFailures: exec.a11yConsecutiveFailures + 1, // ← 再递增 1
  };
}
```

**根因分析**:

一轮完整路径中，当 A11y Tree 无效：

```
sense: resolveChannel → failures 0→1（Tree 无效，递增）
  → a11y_model: a11yTreeText="" → 提前返回空 prediction
  → parse_action: 空 prediction → action_type=""
  → post_execute: a11y + 无 action → failures 1→2（再递增）
```

但 `post_execute` 的这段逻辑 **不仅仅** 处理"Tree 无效"，它还承担了"Tree 有效、模型却输出空动作"这种独立失败场景的计数。所以不能简单删掉。

**问题本质**: sense 和 post_execute 都在递增同一个计数器，但触发条件有重叠。当 sense 已经因为"Tree 无效"递增了一次，post_execute 不应该再为同一个根因重复递增。

**修复方案**:

**在 post_execute 中，仅当本轮 a11yTreeText 非空（Tree 有效）时才递增**。这样：
- Tree 无效 → sense 负责递增（1 次/轮）
- Tree 有效但模型返回空动作 → post_execute 负责递增（1 次/轮）
- 两者不重叠

```diff
 } else if (
   exec.currentChannel === "a11y" &&
-  !exec.parsedPrediction?.action_type
+  !exec.parsedPrediction?.action_type &&
+  exec.a11yTreeText  // 仅当本轮 Tree 有效时才递增（Tree 无效的递增由 sense 负责）
 ) {
   loopUpdate = {
     a11yConsecutiveFailures: exec.a11yConsecutiveFailures + 1,
   };
 }
```

**修改文件**: `post-execute.node.ts`

---

### P0-3: Pause 与 LeaseMonitor 的 abortReason 竞态 — 暂停后可能无法恢复

**文件**:
- `graph-runner.service.ts:467-501`（pauseExecution）
- `graph-runner.service.ts:1137-1189`（startLeaseMonitor）

**根因分析**:

`pauseExecution` 的当前执行顺序：

```typescript
// Step 1: 设置 "pause"
this.abortReasons.set(taskExecutionId, "pause");
// Step 2: abort
abortController.abort();
// Step 3: 停止监控
this.stopLeaseMonitor(taskExecutionId);
```

LeaseMonitor 是 `setInterval` 异步回调。即使把 `stopLeaseMonitor` 提前到 Step 1 之前，**已经在执行中的 interval 回调** 仍然可以跑完并覆写 abortReason：

```
T=0ms:   stopLeaseMonitor → clearInterval（但当前正在执行的回调不受影响）
T=0ms:   正在执行的 monitor 回调: isLeaseValid() → false
T=1ms:   monitor 回调: abortReasons.set("lease_expired") ← 覆写！
T=2ms:   pauseExecution: abortReasons.set("pause") ← 被覆写回来
```

不，更准确地说，JS 是单线程的。`setInterval` 回调不会在同步代码执行中途插入。但如果 `isLeaseValid()` 返回了一个已 resolved 的 promise，那么 monitor 回调中的 `await` 之后的代码会在微任务队列中排队。关键竞态发生在：

```
T=0:  pause: abortReasons.set("pause")
T=0:  pause: abort()
T=0:  // 当前同步代码执行完毕
T=0:  // 微任务队列：monitor 回调的 await 后续代码被调度
T=0:  monitor: consecutiveFailures >= 2 → abortReasons.set("lease_expired") ← 覆写！
T=0:  pause: sleep(500ms) 开始...
```

**核心问题**: monitor 回调在写 `lease_expired` 前，不检查是否已有其他原因。

**修复方案（双重保护）**:

**第 1 层：调整 pauseExecution 顺序 — 缩小窗口**

```typescript
async pauseExecution(taskExecutionId: number): Promise<boolean> {
  const abortController = this.activeExecutions.get(taskExecutionId);
  if (!abortController) return false;

  // Step 1: 先停止租约监控 — 防止新的 interval 回调被调度
  this.stopLeaseMonitor(taskExecutionId);
  // Step 2: 设置原因
  this.abortReasons.set(taskExecutionId, "pause");
  // Step 3: abort
  abortController.abort();

  await new Promise((resolve) => setTimeout(resolve, 500));
  this.activeExecutions.delete(taskExecutionId);
  return true;
}
```

**第 2 层：monitor 回调中加守卫 — 防止覆写已有原因**

```diff
 // startLeaseMonitor 的 setInterval 回调
 if (consecutiveFailures >= ABORT_THRESHOLD) {
+  // 不覆写已有的 abort 原因（pause/cancel 优先级高于 lease_expired）
+  if (!this.abortReasons.has(taskExecutionId)) {
     this.abortReasons.set(taskExecutionId, "lease_expired");
+  }
+  // 如果 controller 已被 abort（如 pause 先触发），不重复 abort
+  if (!abortController.signal.aborted) {
     abortController.abort();
+  }
   this.stopLeaseMonitor(taskExecutionId);
 }
```

**修改文件**: `graph-runner.service.ts`（两处）

---

### P0-4: Fork 执行缺少余额预检

**文件**: `task-execution.service.ts` — `startForkExecution()` 方法（line 385+）

**根因**: `startForkExecution` 是后来添加的方法，遗漏了 `startExecution`（line 251-275）中的余额检查。

**修复方案**:

在 CAS 操作前添加余额检查（与 `startExecution` 一致）：

```typescript
async startForkExecution(executionId: number): Promise<void> {
  const execution = await this.prismaService.task_execution.findUnique({ ... });
  // ... 验证 ...

  // === 积分余额预检（与 startExecution 一致） ===
  try {
    const balance = await this.creditsService.getBalance(execution.user_id);
    if (balance.remaining <= 0) {
      await this.completeExecution(executionId, ExecutionResult.FAILED, "积分不足，请充值后再试");
      this.logger.warn(`[START FORK] Execution ${executionId} rejected: insufficient balance`);
      return;
    }
    if (balance.remaining < 450) {
      this.logger.warn(`[START FORK] Low balance warning: ${balance.remaining} credits`);
    }
  } catch (balanceError) {
    this.logger.warn(`[START FORK] Balance check failed: ${(balanceError as Error).message}`);
  }

  // CAS: PENDING → RUNNING ...
}
```

**修改文件**: `task-execution.service.ts`

---

## P1 — 中等 BUG（边界场景异常）

### P1-1: 设备动作缺少协议级幂等 — Pause/断连可能导致动作重复执行

**文件**:
- `execute-action.node.ts:108`（发送动作）
- `execution.gateway.ts:651-693`（sendActionReq，10s ACK 超时）
- `ExecutionSocketManager.kt:361-432`（客户端 action 处理）
- `types.ts:76`（ActionReqPayload 无唯一 ID）

**根因分析**:

当前的 device:action 协议没有 request ID。以下两种场景会导致重复执行：

**场景 A — Pause 时序**：abort 在 `sendActionReq` 之后到达，动作已被客户端执行。但 checkpoint 在 parse_action 之后。resume 后 execute_action 重入，发送相同动作。

**场景 B — 网络超时**：动作发送后客户端执行成功，但 ACK 因网络超时未送达。服务端 throw，VLM 看到"执行失败"决定重试。

两种场景的根源都是：**服务端无法区分"动作未执行"和"动作已执行但确认丢失"**。

**影响**: `type`（输入文本）重复会导致双倍文字；`click`（点击切换按钮）重复会撤销第一次操作。

**修复方案**:

**协议级幂等（长期方案）：**

1. **服务端**：每个 action request 附带唯一 `requestId`（如 `${executionId}-${loopCount}-${actionType}`）

```diff
// types.ts — ActionReqPayload
 interface ActionReqPayload {
   executionId: number;
+  requestId: string;   // 幂等 ID
   actionType: string;
   actionInputs: any;
 }
```

2. **客户端**：维护已执行的 `requestId` 集合。如果收到重复 requestId，返回 ACK（success=true）但跳过执行：

```kotlin
// ExecutionSocketManager.kt
private val executedRequestIds = mutableSetOf<String>()

// action 处理
val requestId = actionReq.requestId
if (requestId in executedRequestIds) {
    // 已执行过，直接返回成功 ACK
    ack.call(JSONObject().put("success", true))
    return
}
executedRequestIds.add(requestId)
// ... 执行动作 ...
```

3. **服务端**：如果 ACK 超时，区分"可能已执行"和"确认未执行"，调整 VLM 提示

**短期缓解措施：** 修改 execute_action 的错误消息，引导 VLM 先观察再决定：

```diff
// execute-action.node.ts catch 块
- content: `执行操作${actionType}失败: ${error.message}`,
+ content: `操作${actionType}执行结果未确认（可能已执行但网络超时）。请先观察当前页面状态，确认操作是否已生效后再决定下一步。`,
```

**修改文件**: `types.ts`、`execute-action.node.ts`、`execution.gateway.ts`、`ExecutionSocketManager.kt`

---

### P1-2: Cancel 成功路径及其他早退路径未清理 completedSummaries

**文件**: `graph-runner.service.ts:426-434`（doCancelExecution 成功路径）

**现状**: 成功路径缺少 `clearCompletedSummaries()`，而超时路径（line 446）和错误路径（line 457）都有。

**修复方案**:

对 `doCancelExecution` 所有退出路径做一致化清理。在方法开头提取一个 `cleanup()` 函数，确保每条路径都调用：

```diff
 // doCancelExecution 成功路径（line ~430）
 this.activeExecutions.delete(taskExecutionId);
 this.threadIdMap.delete(taskExecutionId);
+clearCompletedSummaries(taskExecutionId);
 return { success: true, summary: result?.finalSummary || undefined };
```

同时检查 `resumeFromPause`、`resumeExecution`、`forkExecution` 的 catch 路径是否也调用了 `clearCompletedSummaries`，做一致化。

**修改文件**: `graph-runner.service.ts`

---

### P1-3: 客户端断连后动作可能重复 — 缺少协议级幂等

**文件**: 与 P1-1 相同

**根因**: 与 P1-1 本质是同一问题（缺少 requestId），只是触发路径不同（P1-1 是 pause/resume，P1-3 是网络断连重连）。

**修复方案**: 与 P1-1 合并为统一的协议级幂等方案。短期用 VLM 提示词缓解。

---

### P1-4: resumeFromPause 的用户 feedback 应同时注入双通道

**文件**: `graph-runner.service.ts:572-607`（doResumeFromPause 中 feedback 注入）

**现状代码**:

```typescript
await graph.updateState(config, {
  userInput: newUserInput,
  executor: {
    guiMessages: [new HumanMessage({ content: `用户暂停后补充指令：${trimmedFeedback}` })],
    // ← 只注入了 guiMessages，没有 a11yMessages
  },
});
```

**根因分析**:

GUI 和 A11y 维护独立的消息历史。即使检查 `currentChannel` 只注入当前通道，仍有风险：resume 后如果通道切换（如 A11y 失败回退到 GUI，或 VLM 调用 `downgrade_to_a11y`），补充指令在新通道中不可见。

更根本的问题：`executorInput.instruction` 是由 Plan Supervisor 下发的，`userInput` 的修改对 Executor 子图内的 A11y 模型不可见（a11y-model 每轮用 `state.executorInput.instruction` 构建 userContent）。

**修复方案**:

同时写入两个通道，确保无论 resume 后走哪条路径都能看到：

```typescript
if (trimmedFeedback) {
  const feedbackMsg = new HumanMessage({
    content: `用户暂停后补充指令：${trimmedFeedback}`,
    additional_kwargs: { created_at: new Date().toISOString() },
  });

  await graph.updateState(config, {
    userInput: newUserInput,
    executor: {
      guiMessages: [feedbackMsg],    // GUI 通道可见
      a11yMessages: [feedbackMsg],   // A11y 通道可见
    },
  });
}
```

**修改文件**: `graph-runner.service.ts`

---

### P1-5: Fork Resume 时异常检测状态处理不当

**文件**:
- `entry.node.ts:176`（fork resume 保留全部 executor 状态）
- `post-execute.node.ts:212-219`（anomaly 从 semanticHistory 衍生）

**根因分析**:

报告初版建议清空 `recentActions` / `recentScreenshotHashes`，但实际上 post_execute 的异常检测是从 `semanticHistory` **重新衍生** `recentActions` 的（line 212-219）：

```typescript
const semanticActions = (exec.semanticHistory || [])
  .filter((r) => r.parsedAction != null)
  .map((r) => r.parsedAction!);
const updatedRecentActions = [
  ...semanticActions.slice(-(ACTION_WINDOW_SIZE - 1)),
  ...(currentAction.action_type ? [currentAction] : []),
].slice(-ACTION_WINDOW_SIZE);
```

所以只清 `recentActions` 没用——下一轮 post_execute 会从 `semanticHistory` 重新构建它。

**判断**: 这更像是一个 **产品定义问题** 而非明确的 bug。如果产品认为"fork 应该像新执行一样，不受原执行尾部数据影响"，那需要在 fork 边界做分段。

**修复方案（如果确认需要修）**:

在 fork resume 时给 semanticHistory 插入一个 **边界标记**，anomaly detection 在计算时只看边界之后的记录：

```typescript
// entry.node.ts — fork resume 路径
return {
  executor: {
    ...state.executor,
    status: "running",
    // 清除即时状态
    needRemind: false,
    remindReason: null,
    recentActions: [],
    recentScreenshotHashes: [],
    // 在 semanticHistory 中插入分隔标记
    semanticHistory: [
      ...state.executor.semanticHistory,
      {
        channel: state.executor.currentChannel,
        loopIndex: state.executor.loopCount,
        timestamp: new Date().toISOString(),
        summary: "[FORK_BOUNDARY]",
        thought: "",
        action: "",
        parsedAction: null,  // null → 不参与 anomaly detection 衍生
        appName: "",
      },
    ],
  },
};
```

然后在 `post-execute.node.ts` 的 semanticActions 衍生逻辑中，只取 FORK_BOUNDARY 之后的记录：

```typescript
const forkBoundaryIdx = (exec.semanticHistory || []).findLastIndex(
  (r) => r.summary === "[FORK_BOUNDARY]"
);
const relevantHistory = forkBoundaryIdx >= 0
  ? exec.semanticHistory.slice(forkBoundaryIdx + 1)
  : exec.semanticHistory;
const semanticActions = relevantHistory
  .filter((r) => r.parsedAction != null)
  .map((r) => r.parsedAction!);
```

**修改文件**: `entry.node.ts`、`post-execute.node.ts`

> ⚠️ 建议先确认产品预期再决定是否实施。

---

## P2 — 低风险 / 改进建议

### P2-1: pHash 计算通过 HTTP 下载截图 — 不必要的延迟和带宽

**文件**:
- `sense.node.ts:394-403`（服务端下载计算）
- `ExecutionSocketManager.kt`（客户端截图处理）
- `ActionHandler.kt`（接口定义）
- `types.ts:93`（ScreenshotRespPayload）

**改动范围**: 需要同时修改服务端 DTO、客户端 SocketManager、客户端 ActionHandler 接口和实现。比初版报告评估的范围大。

**建议**: 客户端在截图压缩后、上传前本地计算 pHash，在 ACK 中增加 `phash` 字段返回。服务端直接使用，跳过 HTTP 下载。

---

### P2-2: Executor 子图缺少总时间限制

**注意点**: 如果用 `Date.now() - state.startTime` 计算，**暂停期间的时间也会被算进去**。需要明确是限制"总墙钟时间"（包含暂停）还是"实际运行时间"（不含暂停）。

如果限制实际运行时间，需要在 pause 时记录暂停时刻，resume 时补偿 `startTime`。

**建议**: 先以总墙钟时间为准（实现简单），设置合理上限如 45 分钟。在 `post-execute.node.ts` 中检查：

```typescript
const MAX_WALL_CLOCK_MS = 45 * 60 * 1000;
if (Date.now() - state.startTime > MAX_WALL_CLOCK_MS) {
  loopUpdate = { status: "error", errorMessage: "执行超时" };
}
```

---

### P2-3: History Summary 异步写入时序问题

**文件**: `post-execute.node.ts:298-347`

**问题**: fire-and-forget 异步摘要任务写入模块级 `completedSummaries` Map。resume 后旧任务仍在运行，可能写回过时数据。在 resume 开头 `clearCompletedSummaries()` 不够——旧异步任务随后还会写入。

**修复方案**: 使用 generation 标记。每次 entry 节点执行时递增一个 `summaryGeneration` 计数器，异步摘要写入时检查 generation 是否匹配：

```typescript
// 异步摘要任务
const generation = exec.summaryGeneration; // 捕获当前 generation
void (async () => {
  // ... 生成摘要 ...
  // 写入前检查 generation 是否仍然有效
  const currentGen = completedSummaryGenerations.get(execId);
  if (currentGen !== generation) {
    logger.log(`Discarding stale summary (gen ${generation} vs current ${currentGen})`);
    return;
  }
  existing.push(summary);
})();
```

---

### P2-4: Billing 扣费失败（非余额不足）被静默忽略 — 严重程度应升级

**文件**:
- `billing.service.ts:108-118`（非余额不足的失败返回 `success:false, insufficientBalance:false`）
- `vision-model.node.ts:425-468`（调用方只检查 `insufficientBalance`）
- `a11y-model.node.ts:237-280`（同上）
- `plan-supervisor.node.ts:456-499`（同上）

**根因分析**:

`billingService.deductByTokens` 在以下非余额不足场景返回 `{ success: false, insufficientBalance: false }`：
- 乐观锁冲突重试耗尽（line 104-108）
- 其他未预期异常（line 110-118）

但所有调用方只检查 `insufficientBalance`：

```typescript
if (billing.insufficientBalance) { /* interrupt */ }
// ← success=false 但 insufficientBalance=false 的情况被完全忽略
```

这意味着：数据库异常、Redis 故障等导致的扣费失败 → 静默放行 → Token 永不扣费。

**影响**: 不仅限于空响应重试场景，**主扣费路径** 也受影响。任何非余额不足的计费异常都会导致免费使用。

**修复方案**:

P0-1 的"允许负余额"方案已经消除了 `insufficientBalance` 路径，扣费代码简化后只需检查 `success`：

```typescript
if (totalTokens > 0) {
  const billing = await billingService.deductByTokens(...);
  if (!billing.success) {
    // 技术异常（DB/Redis 故障等）— 记录并继续执行，后台对账补扣
    logger.error(
      `Billing failed (non-balance): user=${state.userId}, tokens=${totalTokens}, unpaid`
    );
  }
}
```

长期建议：增加后台对账 job，定期检查 `token_usage` 与 `credit_flow` 的差异，补扣遗漏。

**修改文件**: 与 P0-1 同步修改 `vision-model.node.ts`、`a11y-model.node.ts`、`plan-supervisor.node.ts`

---

## LLM 上下文拼接分析

### 总体评价

| 维度 | GUI (Vision) | A11y | 评价 |
|------|-------------|------|------|
| System Prompt | 配置中心 + 指令替换 + Skills 注入 | 配置中心或内置默认 | ✅ 良好 |
| 每轮输入 | 截图(image_url) + 当前 App 名 | A11y Tree + 指令 + 操作历史 | ✅ 良好 |
| 消息历史存储 | MESSAGE_WINDOW_SIZE=100 | 同 | ✅ 合理 |
| 模型调用窗口 | MODEL_MESSAGE_WINDOW_SIZE=25 | 同 | ⚠️ 长任务可能丢失关键上下文 |
| 图片窗口 | IMAGE_WINDOW_SIZE=5 | N/A | ✅ 合理 |
| 异常提醒注入 | 截图前插入 | 最后消息前插入 | ✅ 良好 |
| 跨通道上下文 | pendingVisualQuery(a11y→gui) | semanticHistory 操作摘要 | ⚠️ 单向且粗糙 |
| 历史摘要回注 | 不注入模型 | 不注入模型 | ❌ 缺失 |
| SystemMessage 去重 | reducer + model 节点双重防御 | 同 | ✅ 已修复 |

### 改进建议 1: actionSummaryList 应回注到模型上下文

`actionSummaryList` 每 50 轮生成一次操作摘要，当前只供 summarizer 最终使用。在 50+ 轮的长任务中，模型因 `MODEL_MESSAGE_WINDOW_SIZE=25` 只能看到最近 ~12 轮，丢失了早期关键操作的记忆。

建议在 VLM/A11y 模型调用时，将最近的 `actionSummaryList` 条目以精简形式注入到 system prompt 补充段或最近消息前：

```
[历史操作摘要（第 1-50 轮）]
Agent 打开微信 → 进入聊天列表 → 搜索"张三" → 进入对话 → 发送消息...
```

### 改进建议 2: GUI → A11y 通道切换时上下文不足

当前 VLM 的推理细节（截图上看到了什么、为什么做出某个决策）不传递给 A11y 模型。A11y 只看到 semanticHistory 中的操作摘要字符串（如 `"[GUI] 点击搜索按钮"`）。

建议在通道切换时，将最后一轮 semanticRecord 的 `thought` 字段注入新通道消息：

```
[通道切换上下文] 上一个通道（GUI）的推理：
"看到搜索结果列表中有 3 个匹配项，第一个是目标联系人"
```

---

## 修复优先级总结

| ID | 严重度 | 问题 | 修复复杂度 | 建议 |
|----|--------|------|-----------|------|
| P0-1 | 🔴 | Billing interrupt 双重漏洞（漏扣+重复调模型） | **中**（积分服务加 allowNegative + 三处节点改动） | 允许余额为负 + 入口拦截（同时解决 P2-4） |
| P0-2 | 🔴 | A11y 失败计数双倍递增 | **低**（加 1 个条件判断） | 直接修 |
| P0-3 | 🔴 | Pause 与 LeaseMonitor abortReason 竞态 | **低**（调整顺序 + 加守卫） | 直接修 |
| P0-4 | 🔴 | Fork 缺少余额预检 | **低**（复制已有逻辑） | 直接修 |
| P1-1/3 | 🟡 | 设备动作缺少协议级幂等 | **高**（协议变更 + 双端改动） | 短期：改 VLM 提示词；长期：requestId 方案 |
| P1-2 | 🟡 | Cancel 成功路径及早退路径内存泄漏 | **低**（一致化清理） | 直接修 |
| P1-4 | 🟡 | Feedback 未注入双通道 | **低**（改 1 处，同时写双通道） | 直接修 |
| P1-5 | 🟡 | Fork 异常检测状态（产品定义待确认） | **中**（semanticHistory 边界标记 + 衍生逻辑） | 先确认产品预期 |
| P2-4 | 🟡⬆️ | Billing success=false 被静默忽略 | **低** | 与 P0-1 一起修 |
| P2-1 | 🟢 | pHash 网络下载（性能） | **中**（需改客户端协议 + 多文件） | 排期优化 |
| P2-2 | 🟢 | 无总时间限制（需区分墙钟/运行时间） | **低** | 排期优化 |
| P2-3 | 🟢 | 异步摘要时序问题 | **中**（需 generation 标记或可取消任务） | 排期优化 |

**建议修复顺序**:
1. **第一批（直接修）**: P0-2、P0-3、P0-4、P1-2、P1-4
2. **第二批（核心计费修复）**: P0-1 + P2-4（允许负余额 + 入口拦截，统一修）
3. **第三批（需双端协同）**: P1-1/P1-3（协议级幂等）
4. **待确认**: P1-5（产品定义）
5. **排期优化**: P2-1、P2-2、P2-3
