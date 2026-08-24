# OpenGUI 能力闭环实现方案

本文描述 `dsh-coremate-mobile` 当前这轮能力闭环的目标架构、实现边界与验收门禁。它面向实现者和审查者，不代表对应改动已经发布。

## 结论

采用“插件级任务管理器 + root-task lease”作为唯一任务所有权模型，统一 `/opengui`、`@OpenGUI`、`phone_agent` 和 `browser_agent`。任务在进入模型前冻结设备快照；只有被 root lease 显式绑定的嵌套 agent 才能复用本次任务；会话、建议卡、推广卡、视频流和 ADB forward 都按同一个任务生命周期归属和回收。

这轮不采用只修单个 UI 症状的最小方案。只修 QA 路由、视频 fallback 或会话跳转，仍会留下多入口并发、设备漂移和资源泄漏，因此不能形成可信的完整任务闭环。

## 目标与成功标准

- 任意时刻一个插件实例只允许一个 root OpenGUI 任务；同一任务内显式绑定的 `phone_agent` / `browser_agent` 可以继续执行。
- 路由、手机操作和浏览器操作始终使用任务开始时冻结的设备身份，不受运行期间 UI 选择变化影响。
- QA/手机类任务默认进入手机路径；只有明确的网页意图才进入浏览器路径。
- 直接命令、原生 `@OpenGUI` 和父 Agent 委派具有一致的模型能力检查、取消、错误恢复和结果归属。
- 新建会话不会抢走运行中任务的焦点；建议与推广卡只挂在真正拥有最终成功结果的 Turn 上。
- 内嵌视频失败后可确定性降级到 JPEG，隐藏或收起的卡片不继续轮询截图。
- 插件只回收自己创建的 ADB forward；崩溃或重启后可以依据持久登记恢复清理。
- 多设备执行与媒体工作都有明确并发上限，单设备失败会终止本批任务，不留下后台操作。

## 非目标

- 不修改 DeepSeek Harness 源码。
- 不替换 `dsh-coremate-mobile` 包名、settings namespace、缓存目录或内部 HTTP 路由。
- 不引入托管网关、平台代付或预配置视觉模型。
- 不自动打开独立 scrcpy 窗口，也不增加显式“浏览器模式”选择器。
- 不在本轮迁移历史会话中的 `CoreMate` 标题。
- 不把本方案等同于 v0.1.5 发布完成；本地 HTTP/WebSocket 信任边界、实机验收、tag、Release 和安装包校验仍是独立发布门禁。

## 总体架构

```text
/opengui ───────┐
@OpenGUI ───────┼──> OpenGuiTaskManager ──> root-task lease
phone_agent ────┤            │                    │
browser_agent ──┘            │                    ├─ 冻结模型与设备上下文
                              │                    ├─ 绑定允许重入的嵌套 agent
                              │                    ├─ 统一取消与 capability failure
                              │                    └─ 记录 owner session / result owner
                              │
                              ├──> phone workers ──> phone_control ──> ADB
                              ├──> browser worker ─> browser_control ─> managed Chromium
                              └──> task state ─────> OpenGUI Tab / Chat / Turn tail

OpenGUI Tab ──> scrcpy install state ──> shared H.264 source ──> WebCodecs canvas
     │                                                     └─ failure ─> JPEG fallback
     └────────> owned-forward registry ──> teardown / startup recovery
```

## 关键设计

### 1. 单一任务所有权

`OpenGuiTaskManager` 是插件实例内唯一 admission gate。root 入口通过 `runRoot()` 获取 lease；第二个 root 任务必须在访问设备或启动模型前失败。路由器创建嵌套 agent 后用 `bindAgent()` 显式登记，只有登记过的 agent 才能通过 `nestedLease()` 复用当前上下文。

lease 统一保存：

- `ownerSessionId`：使用真实 session id，不以常驻 agent id 代替。
- `phase`：`waiting-for-device`、`routing`、`running`、`stopping`。
- 冻结后的模型、设备和呈现上下文。
- capability failure：继承模型不支持图片或工具时，只产生一次安全恢复提示，不自动重跑有副作用的任务。
- 组合后的取消信号：用户停止、调用方取消和插件卸载任一发生时，都向下游传播。

### 2. 路由和设备快照

非空直接任务先等待至少一台已授权手机，再把 UI 中选中的 opaque device id 解析为当前已连接设备并冻结。进入 `routing` 后选择器锁定；每个手机 worker 只拿到自己的固定目标，不在执行中重新读取全局选择。

路由提示词遵循以下顺序：

1. 明确手机、APP、手游或 QA 意图，调用 `phone_agent`。
2. 明确网页、URL 或浏览器意图，调用 `browser_agent`。
3. 跨端任务按需要顺序组合两者。
4. 不允许直接调用底层 `phone_control` / `browser_control` 绕过绑定。

多手机任务使用有界 worker pool，默认 `maxParallelDevices: 4`，配置范围 1–16。任一 worker 失败即取消本批剩余任务；结果仍按原始设备顺序汇总。

### 3. 会话与结果归属

提交 `@OpenGUI` 后 composer 立即释放，任务继续写入 owner session。运行中从 blank owner session 新建会话时，Client 使用 DSH 的 `sessions.create({ workspaceId })` 和 `sessions.open(id)`，不直接调用 Host RPC。

session bridge 对异步创建使用 generation 检查：如果用户在创建完成前已经导航到其他会话，不再自动抢焦点；同一 workspace 的重复请求合并，不同 workspace 的最新请求排队。卸载时只恢复自己安装的 wrapper。

建议块在进入父对话前从可见正文中清理并结构化保存。推广卡只由最终成功的直接 OpenGUI assistant message 产生；失败、取消、空命令、配置流程和普通聊天不展示。

### 4. 实时画面状态机

scrcpy 安装/批准状态提升到 OpenGUI Tab，由全部设备卡共享；用户批准一次后统一刷新 generation，避免每张卡各自持有过期状态。

设备卡只有同时满足“已展开、在 viewport 内、页面可见、设备在线”时才保持 H.264 WebSocket。WebCodecs 的配置检查、同步异常、异步 decoder error、坏包、WebSocket error 和服务端 error 都进入同一个 fatal 路径：关闭 decoder 与 socket，显示错误，并启动 JPEG fallback。

JPEG fallback 只在同一组可见性条件成立时轮询；切换设备、收到 404 或组件卸载时撤销旧 object URL，避免展示上一台设备的陈旧画面。失败时保留最后成功帧并显示“上次更新”时间。

### 5. scrcpy、ADB 与并发资源

- scrcpy 安装使用单一共享 job、原子落盘和调用方引用计数；最后一个等待方取消时才中止下载。
- 视频源按设备共享，慢消费者执行有界背压；关闭中的 source 不再接受新订阅。
- `OwnedForwardRegistry` 仅登记本插件创建的 `text-input` / `video-stream` forward，成功删除后再移除登记。
- 正常 teardown 异步回收；进程信号路径做尽力同步回收；下次启动对残留登记执行恢复清理。
- 昂贵的 Host/设备媒体工作由公平、可取消的 semaphore 限流。

## 主要代码落点

| 范围 | 文件 | 职责 |
| --- | --- | --- |
| 任务所有权 | `src/phone-task.ts` | task manager、lease、phase、owner session、取消 |
| 路由与执行 | `src/index.ts` | root/nested 入口、模型能力、设备冻结、多设备 worker pool |
| 并发限制 | `src/concurrency.ts` | 公平且支持 AbortSignal 的 semaphore |
| 设备与预览 | `src/device-fleet.ts`、`src/preview.ts` | 设备解析、状态快照、有限缓存 |
| scrcpy 生命周期 | `src/scrcpy.ts`、`src/scrcpy-stream.ts` | 安装、共享视频源、teardown、背压 |
| ADB forward | `src/forward-registry.ts` | 所有权登记、正常回收、崩溃恢复 |
| Tab 与流 | `src/client/CoremateView.tsx`、`src/client/PhoneStream.tsx`、`src/client/video-decoder.ts` | 共享安装状态、可见性、WebCodecs、JPEG fallback |
| 会话与状态 | `src/client/session-bridge.ts`、`src/client/task-status-store.ts` | 新会话竞争、任务状态投影 |
| 结果呈现 | `src/suggestions.ts`、`src/client/promotion-data.ts` | 建议解析、最终 Turn 归属、推广门禁 |

## 对外变化

- 新增配置 `maxParallelDevices`，默认 4，允许 1–16。
- `/opengui` 与 `@OpenGUI` 仍是主入口；`/coremate` 暂保留兼容并共享同一 admission gate。
- 不增加新的用户凭据、外部服务或长期运行进程。
- 新增的持久文件仅为 `$DSH_HOME/cache/coremate-mobile/owned-forwards.json`，权限为 `0600`，只记录设备 serial、端口、scid 和用途，不包含密钥或屏幕内容。

## 验证门禁

自动验证：

```sh
pnpm run check
git diff --check
npm pack --dry-run
```

必须覆盖的回归：

- 四个入口争抢同一 root lease；仅绑定的 nested agent 可以重入。
- 等待设备、设备断开、选择锁定、多设备并发上限、批次失败取消。
- 当前模型兼容、明确不兼容、运行时 capability failure，且失败后不自动重放任务。
- session create 延迟期间手动导航、跨 workspace 排队、卸载恢复 wrapper。
- 建议块清理、消息序号归属、成功推广一次、失败/取消不推广。
- WebCodecs `configure` / `decode` / async error、坏包、socket 关闭后进入 JPEG。
- 页面隐藏、卡片收起、设备断开时停止流和截图轮询。
- scrcpy 多等待方取消、共享 source、慢消费者、关闭后重订阅。
- forward 只回收插件自有记录，正常退出、信号退出和下次启动都可清理。

实机验收使用当前 DSH Web 与至少一台授权 Android 手机：

1. 从 `/opengui` 和 `@OpenGUI` 各完成一次手机任务，确认设备、owner session、停止和最终结果一致。
2. 运行中创建新会话、切换到其他会话再返回，确认不会抢焦点或丢失原任务。
3. 完成一次明确网页任务和一次 QA 手机任务，确认路由分别为 `browser_agent` 与 `phone_agent`。
4. 验证实时画面、收起/展开、隐藏/恢复、断开/重连及 WebCodecs 失败后的 JPEG 降级。
5. 验证至少两台真实设备的选择冻结、并发执行、逐设备结果和资源回收；只有一台实机时，不能把模拟布局当作多机验收。
6. 任务结束后检查无遗留插件自有 ADB forward、scrcpy source 或 Chromium 操作。

## 发布与回滚

本轮需要作为一个原子实现合并，因为任务所有权、设备快照、会话归属和资源回收共享同一生命周期；拆成互相依赖的半成品阶段会让旧入口绕过新 gate。

合并后仍需分别确认：commit、push、CI、package archive、真实 DSH/模型/设备验收、tag、GitHub Release。任何一项通过都不能替代下一项。

代码回滚可整体 revert 本轮提交；`maxParallelDevices` 有默认值，不要求配置迁移。回滚或异常退出后，先由 forward registry 清理插件登记的端口，再删除已经为空的登记文件；不得扫描并删除其他工具创建的 ADB forward。

## 最脆弱假设

本方案假设 DSH 在一个 root 任务内传递的 parent/nested agent 对象身份稳定，可用于 lease 绑定，同时 `sessions.create()` 完成时已把新会话投影到 Client store。如果任一假设不成立，禁止退回“按当前全局状态猜归属”；应把稳定 task/session identity 提升为 DSH 提供的显式上下文字段，再由插件消费。
