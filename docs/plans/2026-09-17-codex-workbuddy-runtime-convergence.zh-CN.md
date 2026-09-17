# Codex / WorkBuddy 执行内核收敛方案

日期：2026-09-17；更新：2026-09-18。状态：四阶段源码、构建及 Skill 改动已实现，候选包已通过本地回归；实际宿主与设备验收尚未完成，未发布。详见 [实施验收记录](2026-09-18-runtime-convergence-acceptance.zh-CN.md)。下文现状表保留设计基线，不能当作候选版现状。

## 1. 决策与交付目标

采用 **一份设备执行内核源码、两个宿主适配层、两个独立安装包和运行实例**。

Codex、WorkBuddy 都保留“聊天提出任务 → 展示手机 → 宿主模型看图决策 → OpenGUI 执行一个动作 → 返回新截图 → 验证结果”的使用方式。共享设备发现、动作约束、执行队列、会话资源管理、实时画面和错误语义。安装、权限、模型调用、任务生命周期、图片呈现由各宿主负责。

用户只安装对应宿主的插件；不增加公共服务安装步骤、模型 API Key、账号或配置项。两端可各自升级和回滚。本轮不把两个后台进程合成一个全局后台服务。

完成标准：

1. 两端的共用设备执行代码只有一个人工维护来源；修复公共规则时，同一套契约测试验证两个消费者。
2. 两端现有入口和安装方式继续可用；安装包脱离源码仓库仍能独立运行。
3. 实际宿主中完成设备展示、看图执行、停止、清理及重新开始；分别保留可核验的验收证据。
4. WorkBuddy 新版安装无需默认退出宿主；能区分配置写入、MCP 工具可见、Hook 生效、设备可用四个状态。
5. 共用代码有可追溯的来源版本；不会因升级某一端而改写另一端或 DSH 的配置、进程、安装目录。

### 范围

纳入：Codex 独立插件、WorkBuddy MCP + Skill + Hook、本地 Android ADB/scrcpy 执行与实时查看器、构建发布和验收。

本轮不纳入：DSH 迁移，豆包工作/千问工作的接入实现，新的 Web 工作台，独立模型规划服务，Artemis 集成，UIAutomator2/A11y 树推理，云设备调度，全量录屏回放和跨宿主任务接力。它们不能成为本轮完成的前置条件。

**一个明确的支持边界：本轮不支持两个宿主同时控制同一台手机。** 当前设备锁在各自进程内；共享源码不会自动提供跨进程互斥。两端同时使用的验收场景是各控不同设备；切换同一设备时先结束原宿主任务。DSH 或其他 ADB 客户端同样不受该进程内锁约束。若必须支持同机并发争用，应另立跨宿主设备仲裁方案，不能给当前方案补一句“共享锁”就宣称解决。

## 2. 代码依据与现状

本方案按已刷新远端的 `origin/main` 编写，审阅基线为 `737c6255c893a2c6a5779866f60f2bfee6efca3c`。当前本地工作分支不是该基线；实施应从最新 main 建立 `codex/` 工作分支，保留现有未提交研究文件。

| 项目 | Codex | WorkBuddy | 收敛处理 |
|---|---|---|---|
| 包版本 / IPC 协议 | 0.2.0 / 3 | 0.3.1 / 8 | 继续分别版本化，禁止强行统一数字 |
| 宿主入口 | Skill → CLI → Unix socket daemon | Skill/MCP stdio → 本地 TCP broker，Hook 提供任务上下文 | 保留 |
| 模型与任务推进 | Codex 宿主 | WorkBuddy 宿主，自动续跑由 Hook 协作 | 不新增模型客户端或自己的第二套 Agent 循环 |
| 图片交付 | 本地受限权限 JPEG 文件 | MCP image 内容 + 结构化元数据 | 适配器转换，同一内部观察结构 |
| 生命周期 | thread owner，短命 CLI 请求，daemon 常驻 | MCP 连接归属 + root task / agent 上下文 | 共用资源机制，保留宿主事件解释 |
| 观察/会话默认时限 | `SESSION_IDLE_MS` 为 30 分钟 | 控制租约默认 10 分钟 | 先保留实际语义，用明确策略参数注入 |
| 图片实现 | macOS `sips` | `sharp`，含像素采样 | 留在适配器；公共模块不依赖 sharp |
| 构建 | tsc 检查 + tsdown 0.22.2 打包 | tsc 从 src 发射 lib | WorkBuddy 改为检查 + 打包，保持现有 lib 入口 |

依据：[Codex 源码目录](https://github.com/Core-Mate/OpenGUI/tree/737c6255c893a2c6a5779866f60f2bfee6efca3c/plugins/opengui/src)、[WorkBuddy 源码目录](https://github.com/Core-Mate/OpenGUI/tree/737c6255c893a2c6a5779866f60f2bfee6efca3c/workbuddy-plugin/src)、两端的 `package.json`、`scripts/validate.mjs`、CI 和发布工作流。

两端有 12 个同名基础模块，其中 `viewer.ts`、`viewer-page.ts`、`websocket.ts` 三个文件在该基线逐字节相同，适合首先提取。`phone-controller.ts`、`forward-registry.ts` 和会话服务已有行为差异，不能选择一端直接覆盖另一端。

需要保留的现有差异：

- WorkBuddy 已有执行前画面重采样、目标区域变化检查、执行后稳定帧等待、断连 epoch 和完成证据检查。Codex 不具备完全相同的像素保护，不能宣称已等价。
- Codex 对部分外部副作用有既有显式确认流程；WorkBuddy 遵循宿主授权，并且 Hook 上下文只证明任务归属，不代表用户授权。
- WorkBuddy 没收到 Hook 上下文时会报告 `automation.available=false`；这不等于所有基础 MCP 工具都不可用。已经绑定 Hook 的任务调用缺少上下文则必须拒绝。
- Codex 当前部分显式 status 调用会更新活动时间；WorkBuddy 的状态轮询不续租。第一轮提取必须通过策略保留，不能在重构中悄悄改变。

### 与旧规则的关系

`docs/plans/simple-plugin-install.md` 的“不共享运行时、配置、版本或设备服务”和 `plugins/opengui/SOURCE.md` 的独立维护边界需同步澄清：本方案引入**构建时共享源码**，因此调整原先“源码只在宿主目录内”的约束；继续保留运行时、配置、版本、设备服务的实例隔离及独立安装要求。

现有验证器禁止越出宿主源码树的 import，CI 也只复制一个宿主目录；这两处需要改为允许且仅允许 `packages/device-runtime` 构建输入，同时加强成品脱仓运行验证。不得直接删除隔离检查。

根 `CLAUDE.md` 的公共发布边界、GUI/vision-first 和禁止恢复旧 A11y 推理路径继续有效；`server/`、`client/`、`deepseek-harness-plugin/` 不在修改范围。

## 3. 目标架构与职责

```text
                    同一份 packages/device-runtime 源码
                         / 构建打入             \ 构建打入
                        v                       v
Codex 宿主模型/任务                         WorkBuddy 宿主模型/任务
        |                                          |
Skill + CLI + 图片文件适配                    Skill + MCP + Hook 适配
        |                                          |
Codex daemon                               WorkBuddy broker
  内核实例 A                                  内核实例 B
  独立状态/租约/资源                           独立状态/租约/资源
        |                                          |
ADB / scrcpy + 只读 Viewer                  ADB / scrcpy + 只读 Viewer
        |                                          |
    设备 A                                      设备 B
```

模型调用发生在宿主里。公共内核不读取模型配置、不保存 Key、不自行向远程模型发送截图。截图如何进入模型上下文仍由宿主决定；“本地执行器”不代表宿主模型离线运行。

### 公共内核

目录：`packages/device-runtime/`，作为仓库内部源码组件，不发布 npm 包，不给用户增加第三个安装件。保留提取文件的版权和已有 MIT/VIDEO-NOTICE 来源说明，在公共目录记录来源；两端成品继续携带原有声明。

| 模块 | 内容 | 不接管的内容 |
|---|---|---|
| `src/viewer.ts`、`viewer-page.ts`、`websocket.ts` | 只读页面、解码首帧凭证、token、流量边界 | 宿主打开面板的方法 |
| `src/actions.ts`、`device-fleet.ts` | 动作校验、坐标映射、发现结果解析、固定目标 | 宿主安装目录和 ADB 二进制定位 |
| `src/concurrency.ts`、`phone-execution.ts`、`phone-controller.ts` | 单设备动作队列、观察凭证、预算、防止重复执行 | 宿主模型判断和权限弹窗 |
| `src/errors.ts`、`frame-comparison.ts` | 有类型的执行结果、像素样本比较规则 | 图片解码库、MCP/CLI 序列化 |
| `src/scrcpy-stream.ts`、`forward-registry.ts` | 视频协议、订阅生命周期、精确资源清理 | 下载器、安装路径、宿主私有缓存 |
| `src/session-runtime.ts`、`contracts.ts` | owner、session、actor、任务资源归属与释放 | WorkBuddy Hook token 与续跑决策、Codex thread 识别 |

不为每个类再包装一个接口。只有实际存在宿主差异的边界才注入：ADB 执行与二进制定位、截图编码/可选像素采样、Unicode 通道、scrcpy 资源准备、宿主会话策略。目录中不得 import 任一宿主目录、MCP SDK、sharp 或 DSH。

设备端 scrcpy 文件名继续区分 `opengui-codex-*` 与 `opengui-workbuddy-*`；通过资源配置传入公共流实现。forward 注册和删除必须精确到本实例拥有的设备与端口，禁止 `adb kill-server` 或全局移除转发。

### 宿主适配层

Codex 保留 `cli.ts`、`daemon.ts`、`state.ts`、`confirmation.ts`、`codex/screenshot.ts`、安装器和 Skill。`codex/service.ts` 逐步缩为参数映射、策略注入、图片交付及旧接口兼容。

WorkBuddy 保留 `mcp.ts`、`mcp-server.ts`、`broker*.ts`、`wire.ts`、`host-hook.ts`、`automation.ts`、`installation.ts`、`state.ts`、图片编码、原生窗口与旧 mirror 入口。`service.ts` 逐步缩为策略和兼容层。

旧的同名共用文件迁移后可短期保留纯 re-export，以兼容脚本和测试；不能继续保留第二份业务实现。适配器不能复制预算、观察有效性或资源所有权算法。

## 4. 契约与兼容决策

### 4.1 内部数据

所有公共类型只在 `contracts.ts` 定义；这里描述字段约束，不改变宿主已有工具名。

| 对象 | 必需内容和约束 |
|---|---|
| 执行归属 | 宿主类型、宿主 owner、任务归属、session、actor、固定 device；由适配器从可信通道构造，不能相信模型自由填写的 owner |
| 观察 | `observationId`、设备/actor 归属、尺寸、时间、foreground、JPEG 字节与元数据；可携带像素样本与 settled 状态 |
| 动作 | 沿用现有 tap/swipe/text/key/launch/wait 的校验规则；修改动作必须引用当前观察，禁止裸 shell 或任意 ADB 命令 |
| 执行结果 | `not_executed`、`executed`、`outcome_unknown`；一次动作成功不等于任务完成 |
| 错误 | `code`、`message`、`executionState`、`recovery`；恢复建议限 observe/reconnect/wait/replan/stop |
| 会话关闭 | 资源状态与任务结果分离；兼容 Codex 普通 close 和 WorkBuddy 带 outcome/evidence 的 close |

保持 WorkBuddy 的现有 `screen_changed`、`completion_unverified` 等错误。Codex 可以获得公共内核的类型化错误；其原有外层返回格式继续存在，不要求旧消费者改名。适配器外的逻辑不得依赖解析错误文案。

MCP 继续返回真正的 image 内容、结构化元数据，并通过 `isError` 表示工具执行失败；不要把图片降为模型不可见的路径字符串。Codex 继续生成本地图片文件，并使用其现有呈现方式。这样符合 [MCP 内容与错误结构](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/schema.mdx)；本项目不因此升级已锁定的 SDK 1.29.0。

### 4.2 不可退化的规则

1. **归属**：owner/session/device 精确匹配；不同 thread/task 的调用、晚到取消和清理不得影响新的持有者。
2. **顺序**：同 actor 的动作串行；不同设备允许并行；停止后不再下发排队动作，已发出的动作不能伪装成未执行。
3. **观察**：旧观察、跨设备观察、断连后的旧观察都不能驱动动作。发生不确定结果后先观察，不自动重放点击、文本等修改动作。
4. **预算**：保留单设备操作预算和无进展限制；WorkBuddy 重开同一任务的 session 不重置任务预算，Hook 续跑最多 10 次。
5. **观看与控制**：观看不给控制权限；首次控制前必须收到用户可见的真实解码首帧。准备视频依赖完成后至多等一次 30 秒；`display_timeout` 对当前任务为终止失败，不能重建会话绕过。
6. **首帧之后**：用户最小化/关闭观看页面不自动停止已建立的任务；任务结束不替用户关闭查看器；新任务不能继承旧任务的首帧授权。
7. **释放**：先标记终止、阻止新动作并 abort，再等待本任务在途操作结束，最后释放精确匹配的锁和资源。状态查询不应意外执行动作。
8. **未知状态**：断连、超时发生在 dispatch 后时返回 `outcome_unknown`；没有后续观察证据不能宣称执行失败或完成。

### 4.3 有意保留的策略差异

| 策略 | Codex | WorkBuddy |
|---|---|---|
| owner 来源 | 既有 `CODEX_THREAD_ID` 与 daemon 请求校验 | 连接 owner；有 Hook 时绑定 root task / agent |
| 短连接结束 | 正常 CLI 结束不取消已建立任务；请求中断按原行为取消 | MCP 长连接退出清理它拥有的任务资源 |
| 租约与续期 | 保留 30 分钟与既有显式 status 活动语义 | 保留 10 分钟，状态/Viewer 轮询不续租 |
| 外部副作用 | 保留现有确认路径 | 保留宿主授权边界；Hook 不能代替授权 |
| 图像重采样 | 本轮保留现有能力；不新增 sharp/原生 helper | 保留 sharp 像素检查、目标区域复核、稳定帧等待 |
| 任务完成证据 | close 不自动提升为“完成”；最终图由宿主核验 | completed 必须引用各设备最新有效观察 |
| 旧只读入口 | `mode=observe` | `purpose=mirror` 与镜像恢复能力 |

公共控制器提供像素样本/执行前检查的策略注入点，WorkBuddy 现有保护搬入共用算法并保持启用；Codex 不支持的像素采样明确标记为无此能力，不能返回伪造的“画面未变化”。基础契约两端通测，增强视觉契约对 WorkBuddy 单独验收。本轮的“收敛”是消除重复实现和统一基础语义，不是抹掉这些行为差异。

## 5. 构建、隔离与来源追溯

**选用构建时打包共享 TS 源码。** Codex 沿用 tsdown；WorkBuddy 增加与 Codex 相同且锁定版本的 tsdown 0.22.2 开发依赖。运行时依赖集合不增加。保留各自的 pnpm/npm，不做根目录 monorepo 包管理迁移。

WorkBuddy 的 `rootDir: src` 与直接导入共享源码冲突，不能只增加一个 TS alias。[TypeScript rootDir 文档](https://www.typescriptlang.org/tsconfig/rootDir.html)解释了发射路径约束；[project references](https://www.typescriptlang.org/docs/handbook/project-references)解决项目构建关系，也不自动让发布包包含公共源码。具体调整如下：

1. 两端源码通过明确相对路径导入 `packages/device-runtime/src`。公共目录只依赖 Node 内置模块及内部文件。
2. WorkBuddy tsc 改为 `--noEmit` 检查，移除发射用 rootDir/outDir/declaration 设置，允许 TypeScript 扩展导入；由 tsdown 产出 lib，再执行已有 finalize。
3. WorkBuddy 现有顶层 src 模块全部作为具名构建入口，维持 `lib/mcp.js`、`broker-main.js`、`host-hook.js`、`automation.js`、`installation.js`、`tools.js`、`state.js` 等现有路径和导出；公共部分由 ESM shared chunks 复用，避免多个 OpenGuiError 类副本影响 instanceof。
4. MCP SDK、sharp、ajv、tar、yauzl 继续作为外部 npm 依赖，保留 sharp 原生资源的安装方式。shebang、可执行位、Skill 复制、macOS helper 输出和相对 URL 资源定位分别验证。内核不使用 `import.meta.url` 推断宿主资源位置。
5. Codex 保持单入口、无运行时 npm 安装依赖的现有成品形态。共同代码打入 `lib/cli.js`，不把 WorkBuddy 依赖带进去。
6. WorkBuddy 本轮不再把 tsc 附带的 `.d.ts` 当作发布契约；该包是 MCP 可执行分发，并非公开 TS SDK。所有现有 JS 入口及脚本导入路径必须保持，发布检查不得依赖丢失的声明文件。
7. CI 隔离构建目录只复制该宿主目录和 `packages/device-runtime`，保持仓库相对布局；不能靠整仓依赖目录使构建“偶然成功”。产物再移入另一处空目录、移除源码访问后做 smoke。
8. 调整 import 校验为精确解析目标白名单，拒绝任何其他越界、符号链接逃逸、DSH 路径和私人路径；同时扫描生成 JS 的未解析相对 import。

Viewer 提取时先将 `VideoDevice`、`ScrcpyStreamSink` 等纯类型放入公共 `contracts.ts`，让公共 Viewer 不反向 import 任一宿主的流实现。Codex 浏览器测试当前也有 `rootDir` 限制：将其测试构建改为单独的 `tsdown.viewer.config.ts`，输出 `.artifacts/browser/viewer.js` 并更新现有 `test:viewer` 参数；保持浏览器测试命令不变，避免为了测试重新复制一份 Viewer。

在各包 `lib/runtime-manifest.json` 写入构建来源：宿主名、包版本、来源 commit、公共契约版本、公共源码 digest。digest 按公共目录相对路径排序，对路径与文件字节计算 SHA-256；不含时间戳，不记录机器绝对路径。来源 commit 在复制到隔离构建目录前从原 checkout 生成，随构建输入传递；发布构建缺少来源时直接失败，不在脱仓目录猜测 Git 信息。Codex stage allowlist 明确加入此文件，WorkBuddy lib 随包带入。

共同内核不单独滚动更新。每个宿主版本锁定构建时内核；回滚该宿主包即回滚它的内核。IPC 协议号仅在该宿主线协议实际发生不兼容时增加。

## 6. Skill 与热安装体验

两端保留各自 Skill 文件，因为工具名、图片呈现和生命周期确有差异。共用契约测试检查它们都表达：先可见首帧、一次一个动作、结果不明不重放、观察后结束任务、控制结束不关闭用户画面。不要把一份 WorkBuddy 操作指南原样安装到 Codex。

GitHub 安装 Skill 继续是给用户粘贴的入口，自动选择宿主安装器及可验证版本。版本号、包链接、checksum 和适配器元数据由同一次发布更新，不能再把“安装器运行成功”写成“手机已可控制”。

WorkBuddy 安装流程固定为：

1. 预检宿主版本、选中的产品配置路径与写入条件。
2. 5.5.6+ 走已有 live install 路径，先 `LIVE_PREFLIGHT_OK`，成功写入后 `LIVE_CONFIG_WRITTEN`；备份和原子更新沿用现有安装器。
3. 在宿主内通过 `/hooks` 审阅并应用变化、通过 `/skills` 确认可见；验证 MCP 工具发现和 Hook 任务上下文。只有当前任务没有刷新时再新建任务。
4. 旧兼容版本按 `HOST_RESTART_REQUIRED` 给出重启步骤；不能一概要求退出，也不能一概承诺热加载。
5. 插件二进制升级与正在执行的任务分开处理：活动任务期间拒绝强行切换该实例；提示结束任务再重试。没有活动任务时只更新/重连本宿主拥有的后台进程。首版不做在途任务跨版本迁移。
6. 最后做设备只读发现与首帧检查；手机 USB 授权仍由用户在设备端完成。

Codex 不套用 WorkBuddy 的 Hook/热发现机制。沿用自己的安装入口与宿主刷新方式；源码热更新、宿主配置刷新、后台进程重启是三件事。验收报告逐项写明实测宿主版本与加载方式。

## 7. 分阶段实施与交付

预计 **4 个独立可合并 PR、约 10–15 个工程工作日**，是单人实施与复核的估算，不包含等待真机、宿主版本或 CI 下载恢复的时间。整体会触及超过 8 个文件，预计 35–50 个源码、测试、构建和文档文件；不是一次机械搬目录的小改动。

| PR | 具体范围 | 本 PR 独立交付与门禁 | 估算 |
|---|---|---|---|
| 1：共享 Viewer 与构建 | 提取 3 个相同模块；引入公共目录；WorkBuddy 打包改造；manifest；CI 路径和隔离检查；更新 SOURCE/旧安装边界说明 | 两端功能保持原状，共用 Viewer 已生效；双方构建、打包、脱仓启动、浏览器首帧测试通过 | 2–3 天 |
| 2：共用动作执行 | 提取动作/设备/并发/执行状态/错误；控制器注入编码及可选视觉策略；公共采样比较逻辑；保持宿主输入输出 | 两端完成 observe→act→observe，WB 增强视觉保护不退化；停止、不确定结果、旧观察、预算测试通过 | 3–4 天 |
| 3：共用资源生命周期 | 提取 session-runtime、视频流与 owned forward 清理；两端 service 改为适配；保留 Hook/daemon 生命周期策略 | 两端不同设备同时运行；一端退出/超时/回滚不清理另一端；新任务与旧回调隔离 | 3–4 天 |
| 4：安装、Skill 与候选验收 | 更新两端 Skill 和安装说明；完成活动任务升级检查；为两端同一公共 commit 产出候选包；运行真实宿主矩阵并记录证据 | 从 GitHub 成品安装、热配置/重启路径、可见首帧、控制、停止、卸载/回滚证据齐全后才准入稳定发布 | 2–4 天 |

每个 PR 合并后两端都必须可用；不能靠下一个 PR 修复构建或入口。每个 PR 都运行双方核心检查，产出可安装候选，不在 PR 4 才首次打包。PR 4 即使受真机门禁阻塞，前面代码仍可保持预发布状态。

### 文件落点

- 公共源码及测试：`packages/device-runtime/src/`、`packages/device-runtime/tests/`、`packages/device-runtime/README.md`。
- Codex：`plugins/opengui/src/` 中上述共用模块及 `codex/service.ts`；`tsdown.config.ts`、新增 `tsdown.viewer.config.ts` 并替代 `tsconfig.browser.json` 的测试发射用途；`scripts/validate.mjs`、`scripts/stage.mjs`、`scripts/package.mjs`；`SOURCE.md`、Skill、README。
- WorkBuddy：`workbuddy-plugin/src/` 中上述共用模块及 `service.ts`；新增 `tsdown.config.ts`；调整 `package.json`/lock/tsconfig；保留并检查 `scripts/finalize.mjs`、`validate.mjs`、`package.mjs`、`smoke-packed.mjs` 和安装器；调整 connector Skill。
- CI：`.github/workflows/opengui-codex-{ci,release}.yml`、`.github/workflows/workbuddy-plugin-{ci,release}.yml`；公共目录变化必须触发双方 CI。
- 发布证据：沿用各宿主现有 readiness 文件及 `docs/plans/2026-09-13-viewer-candidate-acceptance.md` 的门禁；新增本次验收记录，不能把历史 verified 直接搬到新版本。

公共测试用例通过两个宿主的 Vitest 配置各运行一次，不新增第三套测试依赖树。测试夹具使用可注入时间、虚拟 ADB、合成图片和流；核心夹具不得访问用户真实设备。

## 8. 验收矩阵

| 层级 | 必测路径 | 通过条件 |
|---|---|---|
| 契约 | 正常 observe/act；多设备；跨 owner；旧 observation；旋转/尺寸变化；重复动作/预算；取消排队动作 | 期望动作精确执行一次，非法请求零 dispatch，错误分类正确 |
| 执行失败 | 发送前失败；发送后超时/断连；截图失败；Unicode 部分失败；重连 | 不确定结果不重放；旧观察失效；重新观察后才可继续 |
| WB 增强视觉 | 点击目标改变、前台应用改变、画面未稳定、像素采样失败 | 保留 `screen_changed` 与 settled 语义，不能静默关闭检查 |
| 会话/资源 | 旧任务晚到清理、重复 close、lease 到期、进程退出、socket 中断、两端不同设备并行 | 精确释放本 owner；无孤儿子进程/forward；另一端继续工作 |
| Viewer | 可见真首帧、只有 WS 没画面、解码失败、30 秒超时、关闭/隐藏、换任务 | firstDisplay 由真实显示确认；终止失败不可绕过；生命周期符合第 4 节 |
| 成品 | 空目录安装、只读发现、无源码/父目录依赖、缓存后离线启动、manifest/checksum | 成品完整；离线只指依赖已缓存，不宣称首次离线安装 |
| WorkBuddy 宿主 | 新安装、0.3.1 升级、5.5.6+ live、旧版 restart、Hook 缺失/恢复、停止/续跑 | Skill/MCP/Hook 各自可见且语义正确；基础工具可用不冒充自动续跑可用 |
| Codex 宿主 | 已安装 Skill、CLI 进程退出、请求中断、跨 thread、新任务、图片文件呈现 | 真图进入当前模型上下文；任务隔离；正常短请求不误取消任务 |
| 用户任务 | 测试设备打开设置只读查看、主页无害滑动并恢复、测试输入框中英文输入后清空 | 用户看到过程；最终图验证目标；无发送/购买/发布等额外副作用 |
| 发布 | 安装下载、包哈希、真实运行、回滚、另一端配置未变 | commit、包、宿主版本、设备和证据一一对应 |

设备测试先使用专用模拟器；真机阶段使用明确授权的测试设备。**至少两台物理设备的冲突/并行、30 分钟视频稳定性和实际宿主中的动态画面**仍按已有 Viewer 门禁验收；历史合成流结果不充当本版本真机证据。既有动态画面目标为至少 24fps、端到端 P95 延迟不高于 500ms，测量必须包含源事件到实际显示，不拿 WS 到达间隔替代。

macOS 是本轮用户控制体验的交付平台。WorkBuddy 的 Linux/Windows 打包启动 smoke 继续保留；其通过不等于完整桌面控制体验已获支持。国内/海外产品配置路径和版本分别记录；未实测的组合明确标为未验收。

### 实施后的验证命令

以下从仓库根目录执行；本方案没有实际运行这些产品测试。

```bash
rtk proxy pnpm --dir plugins/opengui check
rtk proxy pnpm --dir plugins/opengui package
rtk proxy pnpm --dir plugins/opengui test:viewer
rtk proxy npm --prefix workbuddy-plugin run check
rtk proxy npm --prefix workbuddy-plugin run pack:release
rtk proxy npm --prefix workbuddy-plugin run smoke:packed
rtk proxy npm --prefix workbuddy-plugin run test:viewer
rtk proxy npm --prefix workbuddy-plugin run test:browser
rtk proxy npm --prefix workbuddy-plugin run test:native
rtk proxy git diff --check
```

`test:native` 在 macOS 执行。依赖安装使用各自 lockfile 和禁用 lifecycle 的既有 CI 流程；不要为了跑打包 smoke 接管用户默认 ADB server。WorkBuddy 已有测试专属 ADB 端口/空发现适配器，必须继续使用。

真实宿主结果另外记入验收记录：来源 commit、宿主版本、插件版本、公共 digest、用例、开始/结束时间、结果、证据路径。截图/录屏仅用于已授权测试，公开记录不得包含私人屏幕、设备序列号、token URL 或任务文本。

## 9. 发布、升级与回滚

1. 各 PR 经双方检查后合并；公共变化的候选成品必须来自同一提交，并验证两份 manifest 的公共 digest 相同。
2. 版本分别递增、沿用 `opengui-codex-v*` / `opengui-workbuddy-v*` tag 体系。正式候选发包时以 main 的最新版本决定下一个 minor，不沿用本文基线版本硬编码发布，禁止覆盖旧 tag/附件。
3. 先预发布。GitHub 发布后重新下载资产并核对 checksum，再从下载包安装验收；本地 dist 成功不能代替 GitHub 资产成功。
4. 稳定发布须两端各自门禁齐全；任一宿主缺真机/首帧/停止/回滚证据时，该宿主保持 prerelease。某一端已经通过不要求另一端跟着升级。
5. 安装器保留原配置备份和独立版本目录。升级前检查该实例的活动任务；有活动任务则停止切换，保留运行版本。依赖下载/校验失败也保留原配置，不自动放宽校验或无上限重试。
6. 回滚先结束目标宿主活动任务，再恢复它自己的上一版本与配置备份，重连该宿主运行实例；不复用新版本在途 session/observation，不操作另一端配置或 DSH。
7. 核心状态继续为进程内态，不引入数据库迁移。回滚无需数据转换；正在执行的手机动作不可事务回滚，因此不能把“回滚插件”写成“撤销手机操作”。

## 10. 成本、风险与取舍

**最小方案**是只同步修订两端 Skill、保留两份代码，再加一组行为对照测试，约 1–2 天。它能修正文案和暴露差异，但以后动作、视频和清理问题仍需修两遍。本方案先从三个完全一致文件开始，逐步减少这个维护风险。

更重的方案是一个跨宿主 daemon + 一个任务 API，能进一步统一设备仲裁和任务状态，但会新增共享安装、全局升级、授权隔离、单点故障和旧版本协议协商。本轮不选择它；用户不必承担这些部署成本。

**最脆弱的假设**：两个宿主的差异主要能通过现有生命周期与图片交付边界隔离。如果必须在公共内核到处判断宿主名字，这个假设就不成立。应保留该部分宿主实现，仅提取已有共同机制；不要为了提高共用比例牺牲已验证行为。第 1 个 PR 的独立 Viewer 提取即使后续停止，仍有维护收益。

| 风险 | 处理与停止条件 |
|---|---|
| WB 打包改变动态文件定位或 native 依赖 | 保持全部原 JS 入口，外置 native 依赖，成品 smoke 必须包含 Hook/broker/installer，不只 `--help` |
| 公共 Bug 同时影响两端 | 同一契约双方运行；分别固定成品版本；先候选再发布，允许独立回滚 |
| 为了代码统一削弱 WB 保护 | 增强视觉与完成证据专项测试是阻断门禁；不通过则不迁移该模块 |
| Codex 新增截图/比较延迟 | 本轮不添加其缺少的像素采样；记录 observe/act P50/P95，相同夹具下 P95 超过基线 20% 时阻止发布并定位 |
| 依赖网络不可达 | 下载失败终止升级、保留旧版；已缓存启动单独验证，禁止把 offline-cache 说成完全离线 |
| 多设备负载扩大 | 保留当前最多 4 设备、并发媒体限制与背压；不因抽公共内核宣称支持更多设备 |
| 跨宿主同机争用 | 明确不支持，不声称进程内锁是全局保护；各控不同设备作为交付边界 |

### 新增维护面清单

| 类别 | 增量 | 维护责任与回滚成本 |
|---|---|---|
| 用户命令、env、账号、API Key、配置页面 | +0 | 用户沿用原入口；没有新增凭据要求 |
| 常驻服务、端口、数据库 | +0 | 保留现有两端 daemon/broker，不引入第三个服务 |
| 内部源码组件 | +1：device-runtime | 插件维护者负责；随消费者 PR 审查，回滚对应包即可 |
| 构建开发依赖 | WB +1：tsdown，版本与 Codex 对齐 | 构建维护者负责 native/入口检查；不进入用户运行依赖 |
| 成品元数据 | 每包 +1：runtime-manifest.json | 构建生成、安装诊断读取；无用户配置和运行状态迁移 |
| 公共内部契约 | +1：contracts.ts | 配对适配器测试约束；不作为第三方可独立升级的公共 SDK |

除现有 Node、ADB、scrcpy、GitHub 分发与宿主工具链外不依赖新服务。本轮已核对现有源码与 GitHub main，可用性验证不涵盖未来发布时的下载端点、两端实际宿主和 USB 设备；这些列为实施/发布的明确门禁，不能表述为已通过。

## 11. 给后续宿主留下的边界

DSH、豆包工作、千问工作将来应复用公共执行契约，分别实现工具发现、真实图片交付、可信任务身份、取消/结束信号、用户授权和安装更新适配。当前没有证据证明所有宿主都具备这些能力，因此不宣传“装同一个 Skill 就全部支持”。

本轮只需保证内核不引用 Codex/WorkBuddy 私有配置或模型 API；不提前创建空适配器、不增加宿主注册中心。未来接入以能力验收为依据，避免把今天两端的特殊 Hook 机制变成所有产品的强制要求。

实施入口：按 PR 1 → PR 2 → PR 3 → PR 4 顺序推进。每一步的评审重点分别是成品独立性、执行语义、生命周期隔离、实际安装与使用证据；以完成上述交付目标为终点，不以“代码已移动”作为收敛完成。
