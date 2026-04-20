# S2 A11y 优先 + GUI 兜底 Executor 改造设计

版本 v1.2 · 日期 2026-03-15

## 1. 目标

将 Executor subgraph 从纯 GUI Vision 模式改造为 **S2: A11y 优先 + GUI 兜底** 的双通道架构。在 Executor 内部通过 `sense` 感知节点动态路由，默认走 A11y 通道（低成本、高精度），失败时自动 fallback 到 GUI Vision 通道，并在 GUI 模式下每轮探测 a11y 可用性以尽快切回。

## 2. 改造范围

- **后端** `coremate/apps/backend/src/modules/graph-agent/graph/nodes/executor/` — 新增节点、修改图结构和状态
- **客户端** `haomai_v0.0.1/` — 新增 a11y tree 采集、序列化、WS 事件处理
- **协议层** `common/ws/types.ts` — 新增 `device:a11y_tree` 事件和 payload 类型

## 3. 改造后 Executor Subgraph 链路

```
                          +──→ action_summary ──────+
                          |    (第一轮跳过)           |
executor_entry → sense →  +                         +→ barrier → check_loop ──→ [loop] → sense
                          |                         |                            |
                          +──→ a11y_model ──┐       |                          [exit]
                          |                 ├→ parse_action → execute_action ──┤        → EXIT
                          +──→ vision_model ┘       |                         |
                                                    +─── (call_user) ─────────┘
```

**与现有链路的变化：**

| 现有 | 改造后 | 说明 |
|---|---|---|
| `screenshot` 节点 | `sense` 节点 | 路由决策 + 数据采集（替代固定截图） |
| — | `a11y_model` 节点 | 新增：A11y Tree 文本推理 |
| `vision_model` 节点 | 保留 | GUI 通道推理，无变化 |
| `parse_action` 节点 | 通道感知 | 区分 A11y 绝对坐标和 GUI 归一化坐标 |
| `execute_action` 节点 | 支持 ref 坐标 | A11y 通道的 ref→坐标转换 |

## 4. sense 节点设计

### 4.1 职责

1. **路由决策**：根据 S2 策略决定本轮走 A11y 还是 GUI
2. **数据采集**：向客户端下发对应的 WS 事件并接收响应
3. **探测机制**：GUI 模式下并行探测 a11y 可用性

### 4.2 S2 路由策略

```
当 currentChannel == "a11y":
  → 下发 device:a11y_tree
  → 成功（tree 非空且节点数 >= 3）→ 保持 "a11y"，路由到 a11y_model
  → 失败（tree 为空/节点过少/超时）→ a11yConsecutiveFailures++
    → 如果 a11yConsecutiveFailures >= 2 → 切换到 "gui"
    → 否则 → 重试 a11y

当 currentChannel == "gui":
  → 并行下发 device:screenshot + device:a11y_tree（探测）
  → a11y 探测成功 → 立即切回 "a11y"，重置 a11yConsecutiveFailures
    → 本轮走 a11y_model（使用探测到的 tree 数据）
  → a11y 探测失败 → 保持 "gui"，本轮走 vision_model
```

### 4.3 失败定义

A11y 通道判定为"失败"的条件：
- a11y tree 文本为空
- 解析后节点数 < 3（极端简化的 tree 通常不可用）
- WS 请求超时（客户端无响应）
- `a11y_model` 输出被 `parse_action` 判定为无效动作
- `execute_action` 执行后页面无变化（由 check_loop 检测，更新 a11yConsecutiveFailures）

## 5. 状态扩展

### 5.1 ExecutorInternalState 新增字段

```typescript
interface ExecutorInternalState {
  // === 现有字段（保留） ===
  screenshotUri: string;
  scaleFactor: number;
  screenWidth: number;
  screenHeight: number;
  currentAppName: string;
  currentPrediction: string;
  parsedPrediction: PredictionParsed | null;
  loopCount: number;
  maxLoopCount: number;
  needRemind: boolean;
  remindReason: string | null;
  status: ExecutorStatus;
  errorMessage: string;
  callUserThought: string;
  messages: BaseMessage[];         // GUI 通道消息历史
  totalTokens: number;
  actionSummaryDone: boolean;
  mainBranchDone: boolean;

  // === 新增：通道路由 ===
  /** 当前活跃通道 */
  currentChannel: "a11y" | "gui";
  /** A11y 连续失败次数 */
  a11yConsecutiveFailures: number;

  // === 新增：A11y 数据 ===
  /** A11y tree compact 文本 */
  a11yTreeText: string;
  /** ref → 坐标中心点和 bounds 映射 */
  a11yRefMap: Record<string, { x: number; y: number; bounds: [number, number, number, number] }>;
  /** A11y 通道消息历史（独立于 GUI 的 messages） */
  a11yMessages: BaseMessage[];
}
```

### 5.2 DEFAULT 值

```typescript
const DEFAULT_EXECUTOR_INTERNAL_STATE: ExecutorInternalState = {
  // ...现有默认值...

  // 通道路由
  currentChannel: "a11y",           // 默认 A11y 优先
  a11yConsecutiveFailures: 0,

  // A11y 数据
  a11yTreeText: "",
  a11yRefMap: {},
  a11yMessages: [],
};
```

### 5.3 Reducer 调整

executor reducer 的 reset 和 merge 逻辑需要扩展：

```typescript
// reset 时（loopCount 0→非0）
if (isReset) {
  return {
    ...DEFAULT_EXECUTOR_INTERNAL_STATE,
    ...update,
    messages: update.messages ?? [],
    a11yMessages: update.a11yMessages ?? [],  // 同步重置
    totalTokens: update.totalTokens ?? 0,
  };
}

// 正常 merge 时
const mergedA11yMessages =
  update.a11yMessages !== undefined
    ? messagesStateReducer(current.a11yMessages, update.a11yMessages)
    : current.a11yMessages;

// a11yMessages 也应用滑动窗口
let finalA11yMessages = mergedA11yMessages;
if (mergedA11yMessages.length > windowSize) {
  finalA11yMessages = [
    mergedA11yMessages[0],
    ...mergedA11yMessages.slice(-(windowSize - 1)),
  ];
}

return {
  ...current,
  ...update,
  messages: finalMessages,
  a11yMessages: finalA11yMessages,
  totalTokens: current.totalTokens + (update.totalTokens || 0),
};
```

### 5.4 Fork Resume 兼容

Fork resume 检测 `forkResume` 标志时保留 executor 状态继续执行。新增字段的处理：
- `currentChannel`: 保留（继续使用上次的通道）
- `a11yConsecutiveFailures`: 保留（维持失败计数器）
- `a11yMessages`: 保留（保持 A11y 通道上下文连续性）
- `a11yTreeText` / `a11yRefMap`: 清空（需要重新采集）

`entry.node.ts` 中 `createInitialExecutorState` 函数需要包含所有新字段的初始化。

## 6. a11y_model 节点设计

### 6.1 职责

接收 a11y tree compact 文本 + instruction，调用 LLM 输出结构化动作。

### 6.2 System Prompt

```
你是一个基于 Accessibility Tree 的移动端 GUI 自动化代理。

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
- 高风险动作（支付/删除/授权/订阅）必须 call_user
```

### 6.3 模型选择与依赖注入

**构造函数**: `createA11yModelNode(configProvider, workingMemoryToolService)`
- `AgentConfigProvider`: 动态获取 A11y 通道模型配置（模型名称、temperature 等）
- `WorkingMemoryToolService`: 支持 get/update/clear_working_memory 工具调用（与 vision_model 共享工具）

> 不需要 `ContentCreationToolService`（内容创作仅 GUI 通道使用）
> 不需要 `TosService`（A11y 通道不处理图片）

A11y 通道的 LLM 不需要视觉能力，可使用更小更快的模型：
- 首选：Claude Haiku（成本低、速度快、文本理解足够）
- 备选：与 GUI 通道相同的模型（统一管理）
- 通过 AgentConfigProvider 的新配置项 `AgentName.A11Y_EXECUTOR` 动态配置

### 6.4 消息窗口

A11y 通道使用独立的 `a11yMessages` 数组，与 GUI 的 `messages` 隔离。窗口大小与 GUI 相同（100 条），使用相同的滑动窗口策略。

## 7. 客户端改造 (haomai_v0.0.1)

### 7.1 新增 WS 事件: device:a11y_tree

在 `ExecutionSocketManager.kt` 新增事件监听：

```kotlin
socket.on(SocketEvents.DEVICE_A11Y_TREE) { args, ack ->
    scope.launch {
        try {
            val result = actionHandler.captureA11yTree()
            ack(JSONObject().apply {
                put("success", result != null)
                put("a11y_tree_text", result?.treeText ?: "")
                put("ref_map", result?.refMapJson ?: JSONObject())
                put("screen_width", result?.screenWidth ?: 0)
                put("screen_height", result?.screenHeight ?: 0)
                put("current_app_name", getCurrentAppName())
            })
        } catch (e: Exception) {
            ack(JSONObject().apply {
                put("success", false)
                put("error", e.message)
            })
        }
    }
}
```

### 7.2 ActionHandler 接口扩展

```kotlin
interface ActionHandler {
    suspend fun executeAction(actionType: String, inputs: ActionInputs): Boolean
    suspend fun captureScreenshot(): Map<String, Any?>?
    suspend fun captureA11yTree(): A11yTreeResult?  // 新增
}

data class A11yTreeResult(
    val treeText: String,          // compact 格式文本
    val refMapJson: JSONObject,    // ref → bounds JSON
    val screenWidth: Int,
    val screenHeight: Int,
)
```

### 7.3 A11yTreeSerializer — 核心序列化类

新增 `core_accessibility/.../a11y/A11yTreeSerializer.kt`

**从 Pinchtab 移植的优化策略：**

#### 7.3.1 多层过滤

| 过滤层 | Pinchtab 原版 | Android 实现 |
|---|---|---|
| Ignored 节点 | `n.Ignored` | `!node.isVisibleToUser()` |
| 结构性容器 | `role == "generic"` | className 为 View/FrameLayout/LinearLayout/RelativeLayout/ConstraintLayout 且无 text/desc/clickable，且 childCount > 0 |
| 空文本节点 | `StaticText` + empty name | `className == "TextView"` 且 text+contentDescription 均为空 |
| 深度限制 | `maxDepth` 参数 | 递归遍历计数 depth，默认 maxDepth=15 |
| 系统 UI | 无（web 不需要） | 过滤 `packageName` 为 systemui/launcher/statusbar 的窗口节点 |

#### 7.3.2 Compact 编码

```
格式: {indent}{ref}:{ShortClass} "{text}" desc="{contentDescription}" bounds=l,t,r,b [flags]

缩进: 2空格/层级
ShortClass 映射:
  android.widget.Button → Button
  android.widget.EditText → EditText
  android.widget.TextView → Text
  android.widget.ImageView → Image
  android.widget.ImageButton → ImageButton
  android.widget.CheckBox → CheckBox
  android.widget.RadioButton → Radio
  android.widget.Switch → Switch
  android.widget.SeekBar → SeekBar
  android.widget.Spinner → Spinner
  android.widget.ProgressBar → Progress
  android.view.View → View
  androidx.recyclerview.widget.RecyclerView → RecyclerView
  androidx.viewpager2.widget.ViewPager2 → ViewPager
  其他 → 取 className 最后一段

Flags:
  + = isClickable
  ~ = isScrollable
  # = isEditable
  * = isFocused
  - = !isEnabled
  √ = isChecked

省略规则:
  - text 为空时省略 "text" 部分
  - contentDescription 为空时省略 desc= 部分
  - 无 flag 时不输出 flag 区域
```

示例输出：
```
e0:FrameLayout bounds=0,0,1080,2340
  e1:Toolbar "搜索" bounds=0,88,1080,232 +
    e2:EditText "搜索关键词" bounds=24,100,900,220 +#*
    e3:ImageButton desc="返回" bounds=0,100,88,220 +
  e4:RecyclerView bounds=0,232,1080,2200 ~
    e5:Text "商品标题一" bounds=24,240,1056,320
    e6:Button "加入购物车" bounds=800,340,1056,400 +
    e7:Text "商品标题二" bounds=24,420,1056,500
    e8:Button "加入购物车" bounds=800,520,1056,580 +
```

#### 7.3.3 Ref → 坐标映射

序列化时同步构建 `refMap: Map<String, RefEntry>`：

```kotlin
data class RefEntry(
    val x: Int,                          // bounds 中心 x = (l+r)/2
    val y: Int,                          // bounds 中心 y = (t+b)/2
    val bounds: IntArray,                // [l, t, r, b] 完整 bounds
)
```

- key: ref 字符串 (e0, e1, ...)
- value: RefEntry 包含中心点坐标和完整 bounds

JSON 序列化为:
```json
{
  "e0": { "x": 540, "y": 164, "bounds": [0, 88, 1080, 232] },
  "e1": { "x": 462, "y": 160, "bounds": [24, 100, 900, 220] }
}
```

返回给后端，后端在 execute_action 时可从 refMap 查找坐标进行校验。

#### 7.3.4 Diff 支持（Phase 2）

客户端维护上一轮的节点列表，每轮采集后计算 diff：
- 复合键: `shortClassName + ":" + (text ?: desc ?: "") + ":" + viewIdResourceName`
- 变化字段: text, contentDescription, isFocused, isEnabled, isChecked
- 返回格式: `{ added: [...], changed: [...], removed: [...] }`

> Diff 模式作为 Phase 2 实现，Phase 1 先实现全量序列化。

### 7.4 SocketEvents 扩展

```kotlin
object SocketEvents {
    // ...现有事件...
    const val DEVICE_A11Y_TREE = "device:a11y_tree"  // 新增
}
```

## 8. 后端改造详细设计

### 8.1 WS 协议扩展

```typescript
// common/ws/types.ts

enum WsEvents {
  // ...现有事件...
  DEVICE_A11Y_TREE = "device:a11y_tree",  // 新增
}

interface A11yTreeRespPayload {
  success: boolean;
  a11y_tree_text: string;
  ref_map: Record<string, { x: number; y: number; bounds: [number, number, number, number] }>;
  screen_width: number;
  screen_height: number;
  current_app_name?: string;
  error?: string;
}
```

### 8.2 ExecutionGateway 扩展

新增 `requestA11yTree(executionId)` 方法，与 `requestScreenshot()` 对等：

```typescript
async requestA11yTree(executionId: number): Promise<A11yTreeRespPayload> {
  const socket = this.getSocket(executionId);
  return socket.emitWithAck(WsEvents.DEVICE_A11Y_TREE, {});
}
```

### 8.3 新增文件清单

| 文件 | 职责 |
|---|---|
| `sense.node.ts` | 感知节点：S2 路由决策 + 数据采集 |
| `a11y-model.node.ts` | A11y LLM 推理节点 |
| `channel-routing.ts` | 通道路由策略（S2 规则抽取） |

### 8.4 NODE_NAMES 扩展

```typescript
// executor-routing.ts
export const NODE_NAMES = {
  SENSE: "sense",                    // 新增，替代 SCREENSHOT
  A11Y_MODEL: "a11y_model",         // 新增
  VISION_MODEL: "vision_model",
  PARSE_ACTION: "parse_action",
  CALL_USER: "call_user",
  EXECUTE_ACTION: "execute_action",
  CHECK_LOOP: "check_loop",
  ACTION_SUMMARY: "action_summary",
  BARRIER: "barrier",
} as const;
```

注意：移除 `SCREENSHOT`，所有引用 `SCREENSHOT` 的地方改为 `SENSE`，包括：
- `ENTRY -> SCREENSHOT` 改为 `ENTRY -> SENSE`
- `CALL_USER -> SCREENSHOT` 改为 `CALL_USER -> SENSE`
- `routeByLoop` 返回 `"screenshot"` 改为 `"sense"`

### 8.5 修改文件清单

| 文件 | 改动 |
|---|---|
| `graph/state/state.types.ts` | 新增通道字段到 ExecutorInternalState、DEFAULT 值、reducer 逻辑（`executor-state.types.ts` 是其 re-export shim，无需改动） |
| `graph/executor.graph.ts` | 重构图：sense 替代 screenshot，新增 a11y_model 和路由边，删除 screenshot 节点引用 |
| `graph/edges/executor-routing.ts` | 新增 routeAfterSense，修改 routeByLoop 返回 `"sense"` 替代 `"screenshot"`，更新 NODE_NAMES |
| `nodes/executor/entry.node.ts` | `createInitialExecutorState` 初始化所有新字段，fork resume 保留通道状态 |
| `nodes/executor/parse-action.node.ts` | **关键改动**：读取 currentChannel，A11y 通道跳过坐标归一化 |
| `nodes/executor/check-loop.node.ts` | 通道失败计数更新逻辑 |
| `nodes/executor/index.ts` | 导出 sense 和 a11y_model 节点，移除 screenshot 导出 |
| `common/ws/types.ts` | 新增 DEVICE_A11Y_TREE 事件和 A11yTreeRespPayload 类型 |
| `common/ws/execution.gateway.ts` | 新增 requestA11yTree 方法 |

### 8.5 sense.node.ts 核心逻辑

**依赖注入**: `createSenseNode(executionGateway, tosService, configProvider)`
- `ExecutionGateway`: 下发 device:a11y_tree 和 device:screenshot 事件
- `TosService`: GUI fallback 路径需要上传截图生成签名 URL（复用现有 screenshot.node 逻辑）
- `AgentConfigProvider`: 读取通道配置（如是否强制 GUI 模式）

**重试策略**: `retryPolicy: { maxAttempts: 3, initialInterval: 1000 }`（比原 screenshot 的 5 次少，因为内部已有 fallback 机制）

**WS 超时**:
- `device:a11y_tree`: 10 秒超时（tree 采集比截图快）
- `device:screenshot`: 15 秒超时（与现有一致）
- GUI 模式下并行探测 a11y 时，a11y 使用 5 秒短超时（不应阻塞截图主路径）

```
输入: state.executor (上一轮状态)
输出: 更新 state.executor 的数据采集结果 + 通道决策

1. loopCount++, actionSummaryDone = false, mainBranchDone = false  // 重置并行分支同步标记
2. 路由决策:
   a. currentChannel == "a11y":
      - 下发 device:a11y_tree（10s 超时）
      - 成功 → 更新 a11yTreeText, a11yRefMap, screenWidth/Height, currentAppName
      - 失败 → a11yConsecutiveFailures++
        - >= 2 → currentChannel = "gui", 下发 device:screenshot
        - < 2 → 保持 a11y，返回错误让 parse_action 跳过
   b. currentChannel == "gui":
      - 并行下发 device:screenshot（15s）+ device:a11y_tree（5s 短超时探测）
      - a11y 探测成功 → currentChannel = "a11y", a11yConsecutiveFailures = 0
        → 使用 a11y 数据，本轮走 a11y_model（丢弃截图数据）
      - a11y 探测失败 → 保持 gui，使用 screenshot 数据（正常上传 TOS）

3. 发送 agent:event 通知前端当前通道 (channel_switch 事件)
```

### 8.6 路由函数

#### routeAfterSense

```typescript
function routeAfterSense(state: AgentState): string[] | typeof END {
  if (state.executor.status === "error") return END;

  const isFirstLoop = state.executor.loopCount === 1;
  const channel = state.executor.currentChannel;

  const modelNode = channel === "a11y" ? "a11y_model" : "vision_model";

  if (isFirstLoop) {
    return [modelNode];
  }

  return ["action_summary", modelNode];
}
```

> 注意：在 executor.graph.ts 中，`routeAfterSense` 返回 END 时必须用 wrapper 重定向到 EXIT，与现有 screenshot 边一致：
> ```typescript
> .addConditionalEdges(EXECUTOR_NODE_NAMES.SENSE, (state: AgentState) => {
>   const result = routeAfterSense(state);
>   if (result === END) {
>     return [EXECUTOR_NODE_NAMES.EXIT];
>   }
>   return result;
> })
> ```

#### routeAfterA11yModel

与 `routeAfterVisionModel` 逻辑完全相同：error 时路由到 BARRIER（与 action_summary 分支汇聚后统一走 EXIT），正常时路由到 PARSE_ACTION。

```typescript
function routeAfterA11yModel(state: AgentState): string | typeof END {
  if (state.executor.status === "error") {
    return END;  // 在 graph 中被 wrapper 重定向到 BARRIER
  }
  return NODE_NAMES.PARSE_ACTION;
}
```

> 在 executor.graph.ts 中同样需要 wrapper：
> ```typescript
> .addConditionalEdges(EXECUTOR_NODE_NAMES.A11Y_MODEL, (state: AgentState) => {
>   const result = routeAfterA11yModel(state);
>   if (result === END) {
>     return EXECUTOR_NODE_NAMES.BARRIER;
>   }
>   return result;
> })
> ```

#### routeByLoop 修改

```typescript
// 将返回值 "screenshot" 改为 "sense"
function routeByLoop(state: AgentState): 'sense' | typeof END {
  const { status, loopCount, maxLoopCount } = state.executor;
  if (status !== "running" || loopCount >= maxLoopCount) {
    return END;
  }
  return NODE_NAMES.SENSE;  // 原为 NODE_NAMES.SCREENSHOT
}
```

### 8.7 executor.graph.ts 完整图结构

```typescript
const subgraph = new StateGraph(AgentStateAnnotation)
  .addNode(EXECUTOR_NODE_NAMES.ENTRY, entryNode)
  .addNode(EXECUTOR_NODE_NAMES.SENSE, senseNode, {
    retryPolicy: { maxAttempts: 3, initialInterval: 1000 },
  })
  .addNode(EXECUTOR_NODE_NAMES.A11Y_MODEL, a11yModelNode)
  .addNode(EXECUTOR_NODE_NAMES.VISION_MODEL, visionModelNode)
  .addNode(EXECUTOR_NODE_NAMES.PARSE_ACTION, parseActionNode)
  .addNode(EXECUTOR_NODE_NAMES.EXECUTE_ACTION, executeActionNode, {
    retryPolicy: { maxAttempts: 3, initialInterval: 500 },
  })
  .addNode(EXECUTOR_NODE_NAMES.CALL_USER, callUserNode)
  .addNode(EXECUTOR_NODE_NAMES.CHECK_LOOP, checkLoopNode)
  .addNode(EXECUTOR_NODE_NAMES.ACTION_SUMMARY, actionSummaryNode)
  .addNode(EXECUTOR_NODE_NAMES.BARRIER, barrierNode, { defer: true })
  .addNode(EXECUTOR_NODE_NAMES.EXIT, exitNode)

  // START → entry → sense
  .addEdge(START, EXECUTOR_NODE_NAMES.ENTRY)
  .addEdge(EXECUTOR_NODE_NAMES.ENTRY, EXECUTOR_NODE_NAMES.SENSE)

  // sense → fan-out: [a11y_model | vision_model] + [action_summary]
  .addConditionalEdges(EXECUTOR_NODE_NAMES.SENSE, routeAfterSense)

  // a11y_model → parse_action | barrier (on error)
  .addConditionalEdges(EXECUTOR_NODE_NAMES.A11Y_MODEL, routeAfterA11yModel)

  // vision_model → parse_action | barrier (on error, 保留现有)
  .addConditionalEdges(EXECUTOR_NODE_NAMES.VISION_MODEL, routeAfterVisionModel)

  // action_summary → barrier
  .addEdge(EXECUTOR_NODE_NAMES.ACTION_SUMMARY, EXECUTOR_NODE_NAMES.BARRIER)

  // parse_action → execute_action | barrier (同现有)
  .addConditionalEdges(EXECUTOR_NODE_NAMES.PARSE_ACTION, routeByAction)

  // execute_action → call_user | barrier (同现有)
  .addConditionalEdges(EXECUTOR_NODE_NAMES.EXECUTE_ACTION, routeAfterExecuteAction)

  // call_user → sense（原为 screenshot，现改为 sense）
  .addEdge(EXECUTOR_NODE_NAMES.CALL_USER, EXECUTOR_NODE_NAMES.SENSE)

  // barrier → check_loop
  .addConditionalEdges(EXECUTOR_NODE_NAMES.BARRIER, routeAfterBarrier)

  // check_loop → sense | exit（原返回 "screenshot" 改为 "sense"）
  .addConditionalEdges(EXECUTOR_NODE_NAMES.CHECK_LOOP, routeByLoop)

  // exit → END
  .addEdge(EXECUTOR_NODE_NAMES.EXIT, END)
```

### 8.8 parse_action.node.ts 改造（关键）

**坐标系差异**：A11y 通道和 GUI 通道的坐标系不同，parse_action 必须感知通道来源：

| 通道 | 坐标系 | 示例 | parse 处理 |
|---|---|---|---|
| GUI (vision_model) | 归一化 0-1000 | `<point>500 640</point>` | `x = (500/1000) * screenWidth` |
| A11y (a11y_model) | 绝对像素 | `<point>540 1280</point>` | 直接使用，无需归一化 |

**关键实现细节**：当前 `parseVlmPrediction` 解析管道中，坐标经历以下步骤：
1. `parseAction` 将 `point='<point>x y</point>'` 重写为 `start_box='(x,y)'`（行 149-151）
2. `parseVlmPrediction` 中 `start_box` 分支对每个数值执行 `Number.parseFloat(num) / factors[factorIndex]`（行 85）
3. 步骤 2 中 `factors = [1000, 1000]`，所以 `540` 会变成 `0.54`

**A11y 通道的绝对像素坐标不能经过步骤 2 的 `/1000` 归一化**。

**改造方案**：通道感知的绕过必须发生在 `parseVlmPrediction` 函数 **内部** 的 `start_box`/`end_box` 处理分支中（即步骤 2），而不是在节点包装层：

```typescript
// parseVlmPrediction 内部
// 在处理 start_box/end_box 的 for 循环中
const nums = boxContent.match(/[\d.]+/g);
if (nums) {
  const coords = nums.map((num, idx) => {
    const val = Number.parseFloat(num);
    if (isA11yChannel) {
      return val;  // A11y: 绝对像素值，直接使用
    }
    return val / factors[idx % factors.length];  // GUI: 归一化处理
  });
}
```

**isA11yChannel 的传递方式**：
- 方案 1（推荐）：为 `parseVlmPrediction` 新增 `channel?: "a11y" | "gui"` 参数
- 方案 2：在 `parse-action.node.ts` 中从 `state.executor.currentChannel` 读取后传入

### 8.9 execute_action.node.ts 改造

当 `currentChannel == "a11y"` 时，动作中的坐标已经是绝对像素值（由 a11y_model 从 bounds 中心点计算），直接传给客户端执行。refMap 作为备选校验方案保留——如果 LLM 计算的坐标偏离了 refMap 中对应 ref 的中心点太远，可以用 refMap 的值替代。

## 9. Token 节省分析

| 策略 | 预估节省 | 阶段 |
|---|---|---|
| A11y compact 文本 vs VLM 截图推理 | 50-70% token | Phase 1 |
| 客户端多层过滤（invisible/generic/depth） | 减少 60-80% 节点数 | Phase 1 |
| A11y 通道使用小模型（Haiku） | 90%+ 成本降低 | Phase 1 |
| 无需图片上传到 TOS | 省去 upload 延迟 (~500ms) | Phase 1 |
| Diff 模式（仅传输变化） | 额外省 60-80% tree 大小 | Phase 2 |
| Token 预算截断（maxTokens） | 可控的上限 | Phase 2 |

## 10. IDPI 安全防护

在 sense.node.ts 接收 a11y tree 文本后，扫描注入模式：

**通用模式**（来自 Pinchtab）：
- "ignore previous instructions", "you are now a", "system prompt", "reveal your instructions" 等

**Android 特有模式**：
- "grant permission", "tap allow", "click allow"
- "install this app", "download this apk"
- "enable accessibility", "enable device admin"
- "enter your pin", "enter your password"

检测到威胁时标记日志，non-strict 模式下继续执行但用 `<untrusted_device_content>` 包裹。

## 11. 实施阶段

### Phase 1: 核心链路（本期）

1. 客户端: A11yTreeSerializer + device:a11y_tree 事件
2. 后端: sense.node + a11y_model.node + 状态扩展 + 图结构改造
3. 路由策略: S2 基础版（a11y 优先 + gui 兜底 + gui 下并行探测）

### Phase 2: 优化增强

1. Diff 模式（客户端增量传输）
2. Token 预算控制（maxTokens 截断）
3. IDPI 扫描
4. 语义恢复机制（stale ref 处理）
5. A11y 通道模型动态配置（Admin 后台可切换）

## 12. 关键文件索引

| 类型 | 路径 | 说明 |
|---|---|---|
| 新增 | `backend/.../executor/sense.node.ts` | 感知节点 |
| 新增 | `backend/.../executor/a11y-model.node.ts` | A11y LLM 推理 |
| 新增 | `backend/.../executor/channel-routing.ts` | 通道路由策略 |
| 新增 | `haomai/.../accessibility/a11y/A11yTreeSerializer.kt` | A11y 序列化 |
| 修改 | `backend/.../graph/state/state.types.ts` | 状态扩展 |
| 修改 | `backend/.../graph/executor.graph.ts` | 图结构重构 |
| 修改 | `backend/.../graph/edges/executor-routing.ts` | 路由函数 |
| 修改 | `backend/.../executor/entry.node.ts` | 初始化新字段 |
| 修改 | `backend/.../executor/parse-action.node.ts` | **关键**：通道感知坐标处理 |
| 修改 | `backend/.../executor/check-loop.node.ts` | 失败计数 |
| 修改 | `backend/.../executor/index.ts` | 导出新节点 |
| 修改 | `backend/src/common/ws/types.ts` | WS 事件扩展 |
| 修改 | `backend/src/common/ws/execution.gateway.ts` | requestA11yTree |
| 修改 | `haomai/.../network/websocket/ExecutionSocketManager.kt` | 新事件监听 |
| 修改 | `haomai/.../network/websocket/SocketEvents.kt` | 新事件常量 |
| 修改 | `haomai/.../common_jvm/interfaces/ActionHandler.kt` | 新接口方法 |
| 修改 | `haomai/.../accessibility/ActionExecutor.kt` | 实现 captureA11yTree |
