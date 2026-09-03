# OpenGUI 能力闭环实现方案

本文描述 `dsh-coremate-mobile` 当前这轮能力闭环的目标架构、实现边界与验收门禁。它面向实现者和审查者，不代表对应改动已经发布。

## 结论

采用“Session 级任务管理器 + 精确资源 lease”作为唯一任务所有权模型，统一 `/opengui`、`@OpenGUI`、`phone_agent` 和 `browser_agent`。`OpenGuiTaskManager` 以 `sessionId` 建表，每个根任务生成独立 `taskId` 和 `attemptId`；只有被完整身份绑定的嵌套 agent 才能复用本次任务。设备偏好按 Session 保存，任务开始时原子获取全部已选设备；托管浏览器继续使用全局单 owner lease。

这轮不采用只修单个 UI 症状的最小方案。只修 QA 路由、视频 fallback 或会话跳转，仍会留下多入口并发、设备漂移和资源泄漏，因此不能形成可信的完整任务闭环。

## 目标与成功标准

- 同一 Session 任意时刻只允许一个 root OpenGUI 任务；不同 Session 的根任务可同时等待或执行，同一任务内显式绑定的 `phone_agent` / `browser_agent` 可以继续执行。
- 设备租约按 `{sessionId, taskId, attemptId, deviceId}` 精确归属，多设备抢占全有或全无；旧 stop 与旧 attempt 释放都不能影响新任务。
- 托管浏览器保持全局单实例；第二个 Session 的浏览器任务明确报忙，但不阻塞该 Session 的独立手机任务。
- 路由、手机操作和浏览器操作始终使用任务开始时冻结的设备身份，不受运行期间 UI 选择变化影响。
- QA/手机类任务默认进入手机路径；只有明确的网页意图才进入浏览器路径。
- 直接命令、原生 `@OpenGUI` 和父 Agent 委派具有一致的模型能力检查、取消、错误恢复和结果归属。
- 新建会话不会抢走运行中任务的焦点；建议与推广卡只挂在真正拥有最终成功结果的 Turn 上。
- 内嵌视频失败后可确定性降级到 JPEG，隐藏或收起的卡片不继续轮询截图。
- 插件只回收自己创建的 ADB forward；崩溃或重启后可以依据持久登记恢复清理。
- 多设备执行与媒体工作都有明确并发上限，单设备失败会终止本批任务，不留下后台操作。

## 非目标

- 不修改 DeepSeek Harness 源码。
- 不替换 `dsh-coremate-mobile` 包名、settings namespace 或内部 HTTP 路由；仅把无用户数据的画面组件迁移为用户级共享缓存，并兼容读取旧缓存。
- 不引入托管网关、平台代付或预配置视觉模型。
- 不自动打开独立 scrcpy 窗口，也不增加显式“浏览器模式”选择器。
- 不在本轮迁移历史会话中的 `CoreMate` 标题。
- 不把本方案等同于 v0.1.6 发布完成；本地 HTTP/WebSocket 信任边界、实机验收、tag、Release 和安装包校验仍是独立发布门禁。

## 总体架构

```text
DSH scoped sessionId
        │
        ├── Client Map<sessionId, SessionSnapshot>
        │         └── 当前 Session 才投影到 UI
        │
        └── OpenGuiTaskManager Map<sessionId, ActiveTask>
                         │
                         ├── DeviceFleet preferenceBySession
                         ├── DeviceFleet leaseByDevice
                         └── 全局 BrowserLease

OpenGUI Tab ──> scrcpy install state ──> shared H.264 source ──> WebCodecs canvas
     │                                                     └─ failure ─> JPEG fallback
     └────────> owned-forward registry ──> teardown / startup recovery
```

## 关键设计

### 1. Session 级任务所有权

`OpenGuiTaskManager` 是插件实例内唯一 admission gate，内部保存 `Map<sessionId, ActiveTask>`。root 入口必须从 `parent.session.id` 取得明确归属；缺失时直接拒绝，不能回退到当前 UI Tab 或常驻 agent id。同一 Session 的第二个 root 任务必须在访问设备或启动模型前失败，不同 Session 可并行。路由器创建嵌套 agent 后用 `bindAgent()` 显式登记，只有仍属于当前完整任务身份的 agent 才能通过 `nestedLease()` 复用上下文。

模型设置仍是 Host 共享资源，准备阶段通过可取消的队列避免配置互相覆盖；第二个 Session 保持自己的等待状态，不因其他 Session 正在准备而被拒绝。

lease 统一保存：

- `sessionId`、`taskId`、`attemptId`：停止、嵌套重入和资源回收共同使用的完整身份。
- `phase`：`waiting-for-device`、`routing`、`running`、`stopping`。
- 冻结后的模型、`deviceIds[]`、设备和呈现上下文。
- capability failure：继承模型不支持图片或工具时，只产生一次安全恢复提示，不自动重跑有副作用的任务。
- 组合后的取消信号：用户停止、调用方取消和插件卸载任一发生时，都向下游传播。

### 2. 路由和设备快照

`DeviceFleet` 分离偏好与占用：`Map<sessionId, Set<deviceId>>` 保存选择偏好，`Map<deviceId, DeviceLease>` 保存实际租约。不同 Session 可以预选同一台手机；真正执行时才一次性校验并获取该 Session 选中的全部设备。任一设备冲突都会明确报忙且不留下部分租约。进入 `routing` 后只锁定所属 Session 的选择器；每个手机 worker 只拿到自己的固定目标，不在执行中重新读取选择。

完成、失败、停止、断连和 Session 删除最终都按完整 lease 身份释放。释放请求只有在四元组仍匹配时才删除当前租约，因此旧 attempt 的延迟清理是无副作用失败。偏好与租约均只保存在进程内；Host 重启后自然释放，不引入 Redis、数据库或持久化假锁。

路由提示词遵循以下顺序：

1. 明确手机、APP、手游或 QA 意图，调用 `phone_agent`。
2. 明确网页、URL 或浏览器意图，调用 `browser_agent`。
3. 跨端任务按需要顺序组合两者。
4. 不允许直接调用底层 `phone_control` / `browser_control` 绕过绑定。

多手机任务使用有界 worker pool，默认 `maxParallelDevices: 4`，配置范围 1–16。任一 worker 失败即取消本批剩余任务；结果仍按原始设备顺序汇总。

### 3. 会话与结果归属

提交 `@OpenGUI` 后 composer 立即释放，任务继续写入所属 Session。Client 将 `launching`、任务状态、launch/bridge error 和 consumed 标记存入 `Map<sessionId, SessionSnapshot>`；后台更新只写自己的缓存，只有当前 `coremateSessionId` 投影到错误、通知和停止按钮。缺少 `sessionId` 的异步记录直接丢弃。

session bridge 对异步创建使用递增 generation 检查：如果用户在创建完成前已经导航到其他会话，旧回调不再自动抢焦点或覆盖新 Session；同一 workspace 的重复请求合并，不同 workspace 的最新请求排队。切换、隐藏或视图卸载不停止任务；`agent/disposed` 只取消真正删除的所属 Session，插件卸载则取消并等待全部任务。

本地状态接口固定为批量 `GET /coremate-mobile/task/status -> { tasks: [...] }`，每条活动记录都带 `sessionId`、`taskId`、`attemptId`、`phase` 和 `deviceIds`。`POST /coremate-mobile/task/stop` 只接受 `{sessionId, taskId}`，过期身份返回 `409`。设备选择请求携带 `{sessionId, deviceIds}`，Mirror 状态读取也必须携带 `sessionId`。浏览器安装状态只向 owner Session 暴露，approve/decline 必须提交匹配的 `{sessionId, taskId}`。

建议块在进入父对话前从可见正文中清理并结构化保存。推广卡只由最终成功的直接 OpenGUI assistant message 产生；失败、取消、空命令、配置流程和普通聊天不展示。

### 4. 实时画面状态机

画面组件安装状态提升到 OpenGUI Tab，由全部设备卡共享。设备卡可见且在线时自动准备实时画面，不再要求普通用户理解或批准底层组件。

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

- 保留已有配置 `maxParallelDevices`，默认 4，允许 1–16；本轮不新增配置。
- `/opengui` 与 `@OpenGUI` 仍是主入口；`/coremate` 暂保留兼容并共享同一 admission gate。
- 不增加新的用户凭据、外部服务或长期运行进程。
- 现有 `$DSH_HOME/cache/coremate-mobile/owned-forwards.json` 继续记录插件自有 forward；本轮 Session 偏好与任务租约不新增持久文件、配置、依赖或数据迁移。

## 验证门禁

自动验证：

```sh
rtk pnpm run check
rtk npm pack --dry-run
rtk git diff --check
```

必须覆盖的回归：

- 四个入口在同一 Session 内争抢 root lease，不同 Session 可并行；仅绑定当前完整身份的 nested agent 可以重入。
- 多设备全有或全无抢占、设备冲突无部分租约、精确 stop、旧 stop 延迟、旧 attempt 释放无副作用。
- A/B 快速切换、新建 C、后台完成和错误隔离、当前 Session 缓存即时投影、批量 Host 状态对账、缺失身份丢弃。
- Session 删除与插件卸载清理；浏览器 owner 验证和全局串行。
- 等待设备、设备断开、选择锁定、多设备并发上限、批次失败取消。
- 当前模型兼容、明确不兼容、运行时 capability failure，且失败后不自动重放任务。
- session create 延迟期间手动导航、跨 workspace 排队、卸载恢复 wrapper。
- 建议块清理、消息序号归属、成功推广一次、失败/取消不推广。
- WebCodecs `configure` / `decode` / async error、坏包、socket 关闭后进入 JPEG。
- 页面隐藏、卡片收起、设备断开时停止流和截图轮询。
- scrcpy 多等待方取消、共享 source、慢消费者、关闭后重订阅。
- forward 只回收插件自有记录，正常退出、信号退出和下次启动都可清理。

实机验收必须使用受支持 DSH Web 与至少两台授权 Android 手机：

1. 从 `/opengui` 和 `@OpenGUI` 各完成一次手机任务，确认设备、owner session、停止和最终结果一致。
2. 运行中创建新会话、切换到其他会话再返回，确认不会抢焦点或丢失原任务。
3. 完成一次明确网页任务和一次 QA 手机任务，确认路由分别为 `browser_agent` 与 `phone_agent`。
4. 验证实时画面、收起/展开、隐藏/恢复、断开/重连及 WebCodecs 失败后的 JPEG 降级。
5. A/B 各占一台手机并行；反复切换不串消息、状态和错误；新建 C 不影响 A/B；停止 A 不影响 B。
6. A 开始下一任务后旧 stop 无效，旧 attempt 释放无效，后台错误不弹到前台；同一手机竞争明确报忙，单 Session 多手机仍能全量执行。
7. A 使用浏览器期间，B 的浏览器任务明确报忙，但 B 的独立手机任务仍可运行。
8. 任务结束后检查无遗留插件自有 ADB forward、scrcpy source 或 Chromium 操作。只有真实双设备门禁通过才宣称多 Tab 并行完成，模拟测试不能替代。

## 发布与回滚

本轮需要作为一个原子实现合并，因为任务所有权、设备快照、会话归属和资源回收共享同一生命周期；拆成互相依赖的半成品阶段会让旧入口绕过新 gate。

本 PR 不包含版本号、tag、GitHub Release 或发布动作。commit、push、CI、package archive 与真实 DSH/模型/双设备验收分别记录；只有实机门禁通过后才可合并，发布流程在合并后单独执行。

代码回滚可整体 revert 本轮提交；`maxParallelDevices` 有默认值，不要求配置迁移。回滚或异常退出后，先由 forward registry 清理插件登记的端口，再删除已经为空的登记文件；不得扫描并删除其他工具创建的 ADB forward。

## 最脆弱假设

本方案假设受支持 DSH 允许不同 Agent/Session 同时运行，并且一个 root 任务内的 parent/nested agent 对象身份稳定，可用于 lease 绑定；`sessions.create()` 完成时已把新会话投影到 Client store。如果 Host 实测仍全局串行，隔离能力仍成立，但双 Tab 真并行验收失败，PR 不应合并或发布。任何归属缺失都禁止退回“按当前全局状态猜归属”。
