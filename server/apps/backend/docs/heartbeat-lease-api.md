# 心跳租约机制 - 客户端对接文档

## 概述

心跳租约机制用于检测客户端是否存活。当用户杀掉 APP 进程后，服务端能够及时终止正在执行的任务，节省 token 消耗。

### 核心原理

```
┌─────────────┐                      ┌─────────────┐
│   客户端    │                      │   服务端    │
└──────┬──────┘                      └──────┬──────┘
       │                                    │
       │  1. 执行任务                        │
       │ ─────────────────────────────────> │
       │                                    │  创建任务 + 租约(TTL=10s)
       │  返回 executionId                  │
       │ <───────────────────────────────── │
       │                                    │
       │  2. 心跳续租 (每5s)                 │
       │ ─────────────────────────────────> │
       │                                    │  重置 TTL=10s
       │  { success, ttl, heartbeatInterval }│
       │ <───────────────────────────────── │
       │                                    │
       │  3. 用户杀掉进程                    │
       │       ╳                            │
       │                                    │
       │                                    │  10s 后租约过期
       │                                    │  → 自动终止任务
       │                                    │
```

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| TTL | 10 秒 | 租约有效期 |
| 心跳间隔 | 5 秒 | 建议的心跳发送频率（TTL / 2） |
| 检查间隔 | 3 秒 | 服务端检查租约有效性的频率 |

---

## API 接口

### 1. 发送心跳

**请求**

```http
POST /executions/{executionId}/heartbeat
Authorization: Bearer {token}
```

**响应**

```json
{
  "success": true,
  "ttl": 10,
  "heartbeatInterval": 5,
  "executionStatus": "RUNNING",
  "message": null
}
```

**响应字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 心跳是否成功 |
| `ttl` | number | 租约剩余时间（秒） |
| `heartbeatInterval` | number | 建议的心跳间隔（秒） |
| `executionStatus` | string | 当前执行状态：`RUNNING`、`SUSPENDED`、`USER_PAUSED`、`FINISHED` |
| `message` | string \| null | 附加消息（如心跳不需要时的原因） |

**错误码**

| 状态码 | 说明 |
|--------|------|
| 404 | 执行记录不存在 |
| 403 | 无权限发送心跳 |

---

### 2. 批量心跳

用于同时续租多个执行任务，减少网络请求次数。

**请求**

```http
POST /executions/heartbeat/batch
Authorization: Bearer {token}
Content-Type: application/json

{
  "executionIds": [1, 2, 3]
}
```

**响应**

```json
{
  "success": true,
  "renewedExecutionIds": [1, 2],
  "failedExecutionIds": [3],
  "heartbeatInterval": 5
}
```

**响应字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否有任何续租成功 |
| `renewedExecutionIds` | number[] | 成功续租的执行 ID |
| `failedExecutionIds` | number[] | 续租失败的执行 ID（不存在或无权限） |
| `heartbeatInterval` | number | 建议的心跳间隔（秒） |

---

## 客户端实现指南

### 基本流程

1. **执行任务后立即启动心跳**
2. **按 `heartbeatInterval` 间隔定期发送心跳**
3. **任务完成或取消后停止心跳**
4. **页面/应用退出时清理定时器**

### 心跳管理器示例 (TypeScript)

```typescript
class TaskHeartbeat {
  private intervalId: number | null = null
  private executionId: number
  private failCount = 0
  private readonly maxFailures = 3

  constructor(executionId: number) {
    this.executionId = executionId
  }

  /**
   * 启动心跳
   * @param intervalMs 心跳间隔（毫秒），默认 5000ms
   */
  start(intervalMs = 5000) {
    // 防止重复启动
    if (this.intervalId) {
      this.stop()
    }

    // 立即发送第一次心跳
    this.sendHeartbeat()

    // 定期发送心跳
    this.intervalId = window.setInterval(() => {
      this.sendHeartbeat()
    }, intervalMs)
  }

  /**
   * 停止心跳
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async sendHeartbeat() {
    try {
      const response = await fetch(`/api/executions/${this.executionId}/heartbeat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        },
      })

      if (!response.ok) {
        this.handleFailure()
        return
      }

      const data = await response.json()
      this.failCount = 0 // 重置失败计数

      // 检查执行状态，已完成则停止心跳
      if (data.executionStatus === 'FINISHED' || !data.success) {
        this.stop()
        this.onTaskCompleted?.()
      }
    } catch (error) {
      this.handleFailure()
    }
  }

  private handleFailure() {
    this.failCount++
    if (this.failCount >= this.maxFailures) {
      console.error(`心跳连续失败 ${this.maxFailures} 次，停止心跳`)
      this.stop()
      this.onTaskTerminated?.()
    }
  }

  // 回调函数
  onTaskCompleted?: () => void
  onTaskTerminated?: () => void
}
```

### 使用示例

```typescript
// 执行任务
const { executionId } = await executeTask(taskId, { deviceId })

// 启动心跳
const heartbeat = new TaskHeartbeat(executionId)
heartbeat.onTaskCompleted = () => {
  console.log('任务已完成')
  refreshTaskList()
}
heartbeat.onTaskTerminated = () => {
  console.log('任务被终止（可能是网络问题或服务端异常）')
  showErrorMessage('任务执行异常')
}
heartbeat.start(5000) // 每 5 秒发送一次

// 用户主动取消时
function cancelTask() {
  heartbeat.stop()
  await api.cancelExecution(executionId)
}

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  heartbeat.stop()
})
```

### React Hook 示例

```typescript
function useTaskHeartbeat(executionId: number | null) {
  const [isAlive, setIsAlive] = useState(true)

  useEffect(() => {
    if (!executionId) return

    const heartbeat = new TaskHeartbeat(executionId)
    heartbeat.onTaskCompleted = () => setIsAlive(false)
    heartbeat.onTaskTerminated = () => setIsAlive(false)
    heartbeat.start()

    return () => {
      heartbeat.stop()
    }
  }, [executionId])

  return { isAlive }
}

// 使用
function TaskExecutionPage({ taskId }) {
  const [executionId, setExecutionId] = useState(null)
  const { isAlive } = useTaskHeartbeat(executionId)

  const handleExecute = async () => {
    const result = await executeTask(taskId)
    setExecutionId(result.executionId)
  }

  return (
    <div>
      <button onClick={handleExecute}>执行任务</button>
      {executionId && isAlive && <span>任务执行中...</span>}
    </div>
  )
}
```

---

## 执行状态说明

| 状态 | 是否需要心跳 | 说明 |
|------|-------------|------|
| `INITIAL` | 否 | 任务初始化中，尚未开始 |
| `RUNNING` | **是** | 任务正在执行 |
| `SUSPENDED` | **是** | HITL 暂停（等待用户介入） |
| `USER_PAUSED` | **是** | 用户主动暂停 |
| `FINISHED` | 否 | 任务已完成，停止心跳 |

---

## 最佳实践

### 1. 心跳间隔选择

- **建议值**：使用服务端返回的 `heartbeatInterval`（默认 5 秒）
- **最小值**：不低于 2 秒，避免请求过于频繁
- **最大值**：不超过 8 秒，确保在 TTL(10s) 内至少有一次成功续租

### 2. 失败重试策略

```typescript
// 连续失败 2-3 次后才判定为真正断连
// 避免因网络抖动误判
private readonly maxFailures = 3
```

### 3. 页面生命周期处理

```typescript
// 页面隐藏时（如切到后台）继续心跳
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // 可以降低心跳频率，但不要停止
    heartbeat.setInterval(8000)
  } else {
    // 恢复正常频率
    heartbeat.setInterval(5000)
  }
})
```

### 4. 批量心跳优化

如果用户可能同时有多个任务在执行：

```typescript
class MultiTaskHeartbeat {
  private executionIds: Set<number> = new Set()
  private intervalId: number | null = null

  add(executionId: number) {
    this.executionIds.add(executionId)
    if (!this.intervalId) {
      this.start()
    }
  }

  remove(executionId: number) {
    this.executionIds.delete(executionId)
    if (this.executionIds.size === 0) {
      this.stop()
    }
  }

  private async sendBatchHeartbeat() {
    if (this.executionIds.size === 0) return

    const { renewedExecutionIds, failedExecutionIds } = await fetch(
      '/api/executions/heartbeat/batch',
      {
        method: 'POST',
        body: JSON.stringify({ executionIds: [...this.executionIds] }),
      }
    ).then(r => r.json())

    // 移除失败的执行（已完成或不存在）
    failedExecutionIds.forEach(id => this.executionIds.delete(id))
  }

  // ...
}
```

---

## 常见问题

### Q: 如果心跳失败，任务会立即终止吗？

A: 不会。租约有 10 秒的 TTL，即使一次心跳失败，只要在 10 秒内有成功的心跳，任务就不会被终止。

### Q: 用户切换到其他 APP 后回来，任务还在吗？

A: 取决于离开时间：
- 离开 < 10 秒：任务继续执行
- 离开 > 10 秒：任务已被终止

建议在页面可见性变化时检查任务状态。

### Q: 网络不稳定时如何处理？

A:
1. 设置合理的失败重试次数（建议 3 次）
2. 在心跳失败时不立即认为任务终止
3. 在恢复连接后检查任务状态并更新 UI

### Q: 需要在 beforeunload 时发送取消请求吗？

A: 不需要。心跳机制会自动处理：用户关闭页面 → 心跳停止 → 租约过期 → 任务终止。

如果想要更快响应，可以使用 `navigator.sendBeacon()`：

```typescript
window.addEventListener('beforeunload', () => {
  navigator.sendBeacon(
    `/api/executions/${executionId}/cancel`,
    JSON.stringify({ reason: 'Page closed' })
  )
})
```

---

## 时序图

### 正常执行流程

```
客户端                             服务端
   │                                 │
   │  POST /tasks/:id/execute        │
   │ ──────────────────────────────> │
   │                                 │  创建 execution
   │                                 │  创建租约 (TTL=10s)
   │  { executionId: 123 }           │  启动租约监控
   │ <────────────────────────────── │
   │                                 │
   │  [启动心跳定时器]                │
   │                                 │
   │  POST /executions/123/heartbeat │
   │ ──────────────────────────────> │  续租 (TTL=10s)
   │  { success: true, ttl: 10 }     │
   │ <────────────────────────────── │
   │                                 │
   │         ... 每 5 秒 ...          │
   │                                 │
   │  POST /executions/123/heartbeat │
   │ ──────────────────────────────> │
   │  { executionStatus: "FINISHED" }│  任务完成
   │ <────────────────────────────── │
   │                                 │
   │  [停止心跳定时器]                │
   │                                 │
```

### 用户杀掉进程

```
客户端                             服务端
   │                                 │
   │  [任务执行中，心跳正常]          │
   │                                 │
   │  POST /executions/123/heartbeat │
   │ ──────────────────────────────> │  续租 (TTL=10s)
   │  { success: true, ttl: 10 }     │
   │ <────────────────────────────── │
   │                                 │
   ╳  [用户杀掉 APP]                  │
                                     │
                                     │  [等待心跳...]
                                     │
                                     │  +3s: 检查租约 ✓
                                     │  +6s: 检查租约 ✓
                                     │  +9s: 检查租约 ✓
                                     │  +10s: 租约过期 ✗
                                     │
                                     │  → 终止任务执行
                                     │  → 释放 AI 资源
                                     │  → 节省 token
```
