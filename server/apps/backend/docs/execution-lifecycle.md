# Execution 生命周期

本文档详细说明任务执行（Task Execution）的完整生命周期，包括状态机、租约心跳机制、中止分发策略、以及各场景下的详细流程。

## 目录

- [核心概念](#核心概念)
- [状态机](#状态机)
- [服务分层](#服务分层)
- [租约心跳机制](#租约心跳机制)
- [AbortReason 中止分发机制](#abortreason-中止分发机制)
- [执行流程详解](#执行流程详解)
  - [新建执行](#1-新建执行-executetask)
  - [用户取消](#2-用户取消-cancelexecution)
  - [用户暂停](#3-用户暂停-pauseexecution)
  - [恢复执行（暂停/HITL）](#4-恢复执行-resumeexecution)
  - [Fork 执行](#5-fork-执行-forkexecution)
  - [租约过期自动终止](#6-租约过期自动终止)
  - [心跳续租](#7-心跳续租-heartbeat)
  - [防抖取消](#8-防抖取消-cancelexecutioninternal)
- [内存映射表管理](#内存映射表管理)
- [并发安全保障](#并发安全保障)

---

## 核心概念

| 概念 | 说明 |
|------|------|
| **Execution** | 一次任务执行实例，对应 `task_execution` 表的一行记录 |
| **Lease（租约）** | 基于 Redis TTL 的客户端存活检测机制 |
| **Lease Monitor** | 服务端定时器，周期性检查租约是否过期 |
| **AbortController** | 用于向 LangGraph 图执行发送中止信号 |
| **AbortReason** | 区分中止来源的标识：`cancel` / `pause` / `lease_expired` |
| **HITL** | Human-In-The-Loop，图执行中遇到需要人工介入的节点时触发的中断 |
| **Checkpoint** | LangGraph 图执行的状态快照，保存在 PostgreSQL 中 |

---

## 状态机

```
INITIAL ──→ RUNNING ──→ FINISHED (SUCCEED / FAILED / CANCELLED)
               │
               ├──→ SUSPENDED (HITL 中断，等待用户响应)
               │       └──→ RUNNING (用户提供响应后恢复)
               │
               ├──→ USER_PAUSED (用户主动暂停)
               │       └──→ RUNNING (用户恢复)
               │
               └──→ SUMMARIZING (取消时生成总结)
                       └──→ FINISHED (CANCELLED)
```

### 状态说明

| 状态 | 含义 | 可转换到 |
|------|------|---------|
| `INITIAL` | 执行记录已创建，尚未开始 | `RUNNING`, `FINISHED` |
| `RUNNING` | 正在执行 LangGraph 图 | `SUSPENDED`, `USER_PAUSED`, `SUMMARIZING`, `FINISHED` |
| `SUSPENDED` | HITL 中断，等待用户提供反馈 | `RUNNING`, `FINISHED` |
| `USER_PAUSED` | 用户主动暂停 | `RUNNING`, `FINISHED` |
| `SUMMARIZING` | 取消时正在生成总结 | `FINISHED` |
| `FINISHED` | 终态 | - |

### 执行结果（仅 FINISHED 状态）

| 结果 | 含义 |
|------|------|
| `SUCCEED` | 正常完成 |
| `FAILED` | 执行出错 |
| `CANCELLED` | 被取消（用户取消 / 租约过期） |

---

## 服务分层

执行生命周期由三层服务协作管理：

```
┌─────────────────────────────────────────────────────────┐
│  TaskExecutionService  (task-execution.service.ts)       │
│  - 业务编排层：状态管理、权限校验、结果分发               │
│  - 负责数据库 CRUD、状态转换、统计更新                    │
│  - cancelled handler 根据 abortReason 决定清理策略        │
└────────────────────┬────────────────────────────────────┘
                     │ 调用
┌────────────────────▼────────────────────────────────────┐
│  GraphRunnerService  (graph-runner.service.ts)            │
│  - 图执行层：LangGraph 图的 invoke/abort/resume           │
│  - 管理 AbortController、threadIdMap、leaseMonitors       │
│  - 设置 abortReason 并通过返回值传播                      │
└────────────────────┬────────────────────────────────────┘
                     │ 调用
┌────────────────────▼────────────────────────────────────┐
│  LeaseService  (lease.service.ts)                        │
│  - 基础设施层：Redis 租约 CRUD                            │
│  - createLease / renewLease / isLeaseValid / releaseLease │
└─────────────────────────────────────────────────────────┘
```

---

## 租约心跳机制

### 设计目的

当客户端（移动 App）意外退出或网络断开时，服务端需要及时检测并终止正在执行的任务，避免浪费 AI Token。

### 工作原理

```
客户端                         服务端 (Redis)                    服务端 (LeaseMonitor)
  │                              │                                  │
  │── createLease ──────────────→│  SET key TTL=60s                 │
  │                              │                                  │
  │── heartbeat (每30s) ────────→│  EXPIRE key 60s                  │
  │                              │                                  │
  │── heartbeat (每30s) ────────→│  EXPIRE key 60s                  │
  │                              │                                  │
  │  💀 客户端崩溃               │                                  │
  │                              │                                  │
  │                              │  (60s 后 key 自动删除)           │
  │                              │                                  │
  │                              │←── isLeaseValid ────────────────│ (每3s检查)
  │                              │  返回 false                      │
  │                              │                                  │── abort(reason='lease_expired')
```

### 核心参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `DEFAULT_TTL_SECONDS` | 60s | 租约有效期 |
| `LEASE_CHECK_INTERVAL_MS` | 3000ms | Lease Monitor 检查间隔 |
| 推荐心跳间隔 | 30s (TTL/2) | 客户端发送心跳的建议频率 |

### Redis Key 格式

```
lease:execution:{executionId}
```

Value 为 JSON：`{ executionId, userId, taskId, createdAt }`

### renewLease 原子性

续租使用单步 `EXPIRE` 命令（原子操作）。如果 key 不存在（已过期），`EXPIRE` 直接返回 `false`，避免了 `exists()` + `expire()` 两步操作之间的 TOCTOU 竞态。

---

## AbortReason 中止分发机制

### 问题背景

系统中有三种场景会触发 `AbortController.abort()`：
1. 用户主动取消
2. 用户暂停
3. 租约过期

这三种场景的后续处理逻辑完全不同，但 LangGraph 只能看到一个统一的 `AbortError`。需要一种机制将 abort 的**来源**传递到上层 handler。

### 设计

`GraphRunnerService` 维护一个内存 Map：

```typescript
private readonly abortReasons = new Map<number, 'cancel' | 'pause' | 'lease_expired'>();
```

**写入时机**：在调用 `abortController.abort()` 之前设置 reason。

**读取时机**：在 catch 块中检测到 `AbortError` 时，从 Map 中取出 reason 并附加到 `ExecuteTaskResult.abortReason` 字段。

**清理时机**：所有退出路径（正常完成、中断、取消、失败）都会 `delete` 对应条目。

### 分发逻辑

`TaskExecutionService` 中的 cancelled handler 根据 `abortReason` 分发：

```
result.cancelled == true
  │
  ├── abortReason === 'lease_expired'
  │     → completeExecution(CANCELLED, 'Lease expired')
  │     （没有其他流程负责清理，必须自行完成）
  │
  ├── abortReason === 'cancel'
  │     → 不处理，由 cancelExecution 流程负责 summarizer + FINISHED
  │
  └── abortReason === 'pause'
        → 不处理，由 pauseExecution 流程负责 USER_PAUSED
```

---

## 执行流程详解

### 1. 新建执行 (executeTask)

```
TaskExecutionService.executeTask()
  │
  ├── [防抖] 取消用户所有活动执行 (cancelExecutionInternal)
  ├── 创建 task_execution 记录 (INITIAL)
  ├── 创建租约 (LeaseService.createLease)
  ├── 更新状态 → RUNNING
  └── setImmediate (异步):
        │
        GraphRunnerService.executeTask()
          ├── 创建 AbortController
          ├── 存储 activeExecutions / threadIdMap
          ├── 启动 LeaseMonitor
          └── graph.invoke(initialState, { signal })
                │
                ├── 正常完成 → { success: true, summary }
                │     → completeExecution(SUCCEED)
                │
                ├── HITL 中断 → { success: true, hitl_reason }
                │     → updateStatus(SUSPENDED)
                │
                ├── AbortError → { cancelled: true, abortReason }
                │     → cancelled handler 分发
                │
                └── 其他错误 → { success: false, error }
                      → completeExecution(FAILED)
```

### 2. 用户取消 (cancelExecution)

```
TaskExecutionService.cancelExecution()
  │
  ├── 验证权限和状态 (RUNNING / SUSPENDED / USER_PAUSED)
  │
  └── GraphRunnerService.cancelExecution()
        │
        GraphRunnerService.doCancelExecution()
          ├── abortReasons.set(id, 'cancel')
          ├── abortController.abort()  ← 触发图执行 catch
          ├── await 1000ms (等待 checkpoint 保存)
          ├── 检查 executorEntered
          │     ├── false → 跳过 summarizer
          │     └── true → graph.invoke(Command goto:'summarizer')
          └── 返回 { success, summary }
        │
        ├── 使用原子 updateMany 设置 FINISHED + CANCELLED
        ├── 释放租约
        └── 同步任务统计

  [同时] cancelled handler 收到 abortReason='cancel'
         → 不处理（由上述流程负责）
```

### 3. 用户暂停 (pauseExecution)

```
TaskExecutionService.pauseExecution()
  │
  ├── 验证权限和状态 (RUNNING)
  │
  └── GraphRunnerService.pauseExecution()
        ├── abortReasons.set(id, 'pause')
        ├── abortController.abort()  ← 触发图执行 catch
        ├── stopLeaseMonitor()  ← 暂停后停止监控
        ├── await 500ms (等待 checkpoint 保存)
        └── 移除 activeExecutions（保留 threadIdMap）
  │
  └── updateStatus(USER_PAUSED)

  [同时] cancelled handler 收到 abortReason='pause'
         → 不处理（由上述流程负责）
```

### 4. 恢复执行 (resumeExecution)

#### 4a. 从 USER_PAUSED 恢复

```
TaskExecutionService.resumeExecution() [USER_PAUSED]
  │
  ├── 重建租约 (LeaseService.createLease)  ← 暂停期间租约可能已过期
  ├── 更新状态 → RUNNING
  └── setImmediate (异步):
        │
        GraphRunnerService.resumeFromPause()
          │
          GraphRunnerService.doResumeFromPause()
            ├── 创建新的 AbortController
            ├── 重建租约 (LeaseService.createLease)
            ├── 启动 LeaseMonitor
            └── graph.invoke(null, { signal })  ← 从 checkpoint 恢复
                  │
                  ├── 正常完成 → completeExecution(SUCCEED)
                  ├── HITL 中断 → updateStatus(SUSPENDED)
                  ├── AbortError → cancelled handler 分发
                  └── 其他错误 → completeExecution(FAILED)
```

#### 4b. 从 SUSPENDED (HITL) 恢复

```
TaskExecutionService.resumeExecution() [SUSPENDED]
  │
  ├── 存储 feedback 到长期记忆（异步）
  ├── 重建租约 (LeaseService.createLease)  ← 中断期间租约可能已过期
  ├── 更新状态 → RUNNING
  └── setImmediate (异步):
        │
        GraphRunnerService.resumeExecution()
          │
          GraphRunnerService.doResumeExecution()
            ├── 创建新的 AbortController
            ├── 启动 LeaseMonitor
            └── graph.invoke(Command { resume: response }, { signal })
                  │
                  ├── 正常完成 → completeExecution(SUCCEED)
                  ├── 再次 HITL → updateStatus(SUSPENDED)
                  ├── AbortError → cancelled handler 分发
                  └── 其他错误 → completeExecution(FAILED)
```

### 5. Fork 执行 (forkExecution)

```
TaskExecutionService.forkExecution()
  │
  ├── 验证原执行（存在、属于用户、状态为 FINISHED）
  ├── 创建新的 task_execution 记录 (INITIAL)
  ├── 创建租约
  ├── 存储 instruction 到长期记忆（异步）
  ├── 更新状态 → RUNNING
  └── setImmediate (异步):
        │
        GraphRunnerService.forkExecution()
          ├── 获取原 thread 状态
          ├── 构建 forkedState（保留核心状态，重置控制字段）
          ├── updateState 跳转到 plan_supervisor 节点
          ├── 创建 AbortController + 启动 LeaseMonitor
          └── graph.invoke(null, { signal })
                │
                ├── 正常完成 → completeExecution(SUCCEED)
                ├── HITL 中断 → updateStatus(SUSPENDED)
                ├── AbortError → cancelled handler 分发
                └── 其他错误 → completeExecution(FAILED)
```

### 6. 租约过期自动终止

```
LeaseMonitor (setInterval 每3s)
  │
  ├── isLeaseValid(executionId) → true → 继续监控
  │
  └── isLeaseValid(executionId) → false
        ├── abortReasons.set(id, 'lease_expired')
        ├── abortController.abort()
        └── stopLeaseMonitor()
              │
              [图执行 catch 块]
                └── return { cancelled: true, abortReason: 'lease_expired' }
                      │
                      [cancelled handler]
                        └── completeExecution(CANCELLED, 'Lease expired')
                              ├── 原子更新状态 → FINISHED
                              ├── 释放租约
                              └── 同步任务统计
```

### 7. 心跳续租 (heartbeat)

```
TaskExecutionService.heartbeat()
  │
  ├── 验证权限
  ├── 检查状态是否需要心跳 (RUNNING / SUSPENDED / USER_PAUSED / SUMMARIZING)
  │
  └── LeaseService.renewLease(executionId)
        │
        ├── 成功 → 返回 TTL
        │
        └── 失败 (租约已过期)
              │
              ├── 状态 = USER_PAUSED / SUSPENDED
              │     → 重建租约 (暂停期间过期是正常的)
              │
              └── 状态 = RUNNING
                    → 不重建 (lease monitor 会处理)
                    → 记录警告日志
```

**关键设计**：RUNNING 状态下心跳失败不重建租约，避免与 lease monitor 的过期判定产生冲突。如果盲目重建，等于让 lease monitor 已经判定过期的执行"起死回生"。

### 8. 防抖取消 (cancelExecutionInternal)

新建任务时自动取消用户所有活动执行：

```
cancelExecutionInternal()
  │
  ├── 原子更新 → FINISHED + CANCELLED (防止重复取消)
  ├── 释放租约
  ├── 同步任务统计
  └── GraphRunner.cancelExecution(skipSummary=true)
        └── abort + 清理（不生成总结）
```

---

## 内存映射表管理

`GraphRunnerService` 维护四个内存 Map：

| Map | Key | Value | 用途 |
|-----|-----|-------|------|
| `activeExecutions` | executionId | AbortController | 追踪运行中的执行，用于发送 abort 信号 |
| `threadIdMap` | executionId | threadId | 映射执行 ID 到 LangGraph thread ID |
| `leaseMonitors` | executionId | NodeJS.Timeout | 租约监控定时器引用 |
| `abortReasons` | executionId | `'cancel'` / `'pause'` / `'lease_expired'` | abort 来源标识 |

### 生命周期

```
executeTask / resumeFromPause / resumeExecution / forkExecution
  │
  ├── 入口：set activeExecutions, threadIdMap, 启动 leaseMonitor
  │
  ├── 正常完成：delete activeExecutions, threadIdMap, abortReasons, 停止 leaseMonitor
  │
  ├── HITL 中断：delete activeExecutions, abortReasons (保留 threadIdMap)，停止 leaseMonitor
  │
  ├── AbortError：delete activeExecutions, threadIdMap, abortReasons, 停止 leaseMonitor
  │
  └── 其他错误：delete activeExecutions, threadIdMap, abortReasons, 停止 leaseMonitor

pauseExecution
  ├── 停止 leaseMonitor
  └── delete activeExecutions (保留 threadIdMap)

cancelExecution
  └── delete activeExecutions, threadIdMap
```

---

## 并发安全保障

### 1. 数据库级 CAS (Compare-And-Swap)

`completeExecution` 使用 `updateMany` + 条件过滤实现原子状态转换：

```sql
UPDATE task_execution
SET execution_status = 'FINISHED', ...
WHERE id = :id AND execution_status != 'FINISHED'
```

如果 `count === 0`，说明已被其他流程完成，直接跳过。

### 2. 租约续租原子性

`renewLease` 使用 Redis 单步 `EXPIRE` 命令，避免 `EXISTS` + `EXPIRE` 之间的 TOCTOU 竞态。

### 3. AbortReason 无竞态

`abortReasons` 的写入和读取在同一个服务实例内，写入发生在 `abort()` 之前，读取发生在 `catch` 块中。由于 Node.js 单线程特性，不存在竞态。

### 4. 防抖取消原子性

`cancelExecutionInternal` 先用 `updateMany` 原子设置 FINISHED，再调用 GraphRunner 清理。即使 GraphRunner 清理失败，数据库状态已经正确。

---

## 相关文件

| 文件 | 职责 |
|------|------|
| `src/modules/task/task-execution.service.ts` | 执行业务编排、状态管理、心跳处理 |
| `src/modules/graph-agent/graph-runner.service.ts` | LangGraph 图执行、abort 管理、lease monitor |
| `src/common/lease/lease.service.ts` | Redis 租约 CRUD |
| `src/modules/task/enums/task.enums.ts` | ExecutionStatus / ExecutionResult 枚举定义 |
