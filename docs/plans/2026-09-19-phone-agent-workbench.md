# OpenGUI 三宿主自主手机任务候选实现

日期：2026-09-19。基线：`codex/device-runtime-convergence` 的 `801cfbf`，接续未合并的 PR #103–#106。
本变更为本地候选实现，没有发布，也没有改动 Desktop、NestJS Backend 或 Android 客户端。


## 当前决定：只使用宿主模型（2026-09-20）

用户明确要求：保留首页任务入口，所有任务由宿主模型规划、看图和决策；关闭用户自配模型入口。未来才考虑 OpenGUI 自有模型。此决定替代本文后续历史段落中的 BYOK 必需、Pi 独立执行和退出宿主后继续承诺。

当前生产工厂在 Codex、WorkBuddy、DSH 均使用 HostExecutor。`opengui_run_task` 接收目标；`opengui_manage_task next/decide` 将候选设备、截图与决策交回宿主。网页任务等待宿主领取；没有宿主轮询时不会假执行，也不会调用配置中的旧模型。规划保留验证、自动分配和父子记录；动作仍经过原租约、首帧、观察 ID、预算、确认与终态证据检查。

WorkBuddy/DSH 用工具 image 内容传递截图，Codex 返回私有证据文件路径，由宿主查看。配置 API 在 host 模式拒绝写入；历史模型凭据不删除，但不读取。当前默认配置是逻辑上的宿主模型标识，不冒充知道宿主实际模型名。

DSH 原生面板的首页提交已通过所属会话的命令与 Agent.followup 自动交给宿主，并完成真实只读验收。WorkBuddy/Codex 网页提交自动唤起当前桌面聊天仍未接通，不能宣称三宿主均已支持。WorkBuddy 使用 Hook 任务身份，缺少 Hook 时限定 MCP 连接；正常回复结束可保留等待用户处理的任务，显式停止和 MCP 断开仍清理其已绑定任务。Codex CLI 短连接不等于任务停止，待决策有超时且不自动重放。

### 最新验收概况（2026-09-20）

| 宿主 | 已取得的真实证据 | 尚未证明 |
| --- | --- | --- |
| WorkBuddy | 聊天提交、宿主看图决策、一次点击进入 Android 版本页；新版候选同一任务跨轮等待/恢复；中文搜索任务 `0a74a4a7` 已完成、独立终态截图与检查一致 | 首页自动唤醒；完整冷启动导航和双机并行 |
| DSH | 原生首页自动交给 Grok 4.6；只读 Android 15；真实点击及受阻终态证据；规划阶段与首帧后原生停止；聊天/工作台往返恢复原任务；真实跨宿主同机占用拒绝；工作台澄清和用户帮助两次继续后同一任务完成 `08c444cb` | 中文输入复测受阻（点击定位偏差）；双机、断连/授权丢失实测 |
| Codex | 隔离成品经当前真实宿主完成系统设置中文搜索：可见首帧、一次点击、中文输入、独立终态截图和检查一致 | 默认插件迁移；首页自动唤醒；完整三宿主异常/双机验收 |

当前逐项验收与缺口见 [完整对齐验收表](2026-09-20-host-alignment-acceptance.md)。

这些结果不构成三宿主完整验收或发布。以下历史段落保留实施过程，旧模型配置、退出宿主后继续和旧安装状态均以本节及最新验收条目为准。

较早的宿主模式基线验证：Codex 128、WorkBuddy 149、DSH 311 项检查通过；新增无凭据宿主闭环、任务领取、停止后晚到决策拒绝及 MCP 真 image 内容验证。host-mode 浏览器 fixture 覆盖首页提交、模型入口关闭/API 拒绝、首帧、宿主截图决策、完成证据及 375px。该 fixture 是合成设备与测试决策，不替代真实宿主模型验收。

## 历史实现边界

用户批准的新方案替代此前“插件不拥有模型循环”和“DSH 不参与迁移”的限制。支持目标仍为 macOS 的 Codex、WorkBuddy、DSH 与 Android；Windows 未验收，原有 Windows 检查保持不变。DSH 浏览器能力保留。

三个共享组件在构建时进入各宿主成品：

| 组件 | 实际入口与职责 |
| --- | --- |
| device-runtime | PhoneController、观察/动作契约、scrcpy、ViewerServer；新增机器级设备租约 |
| phone-agent | PhoneRuntime、TaskHost、Pi 工具、Keychain、事件日志、工作台 HTTP |
| workbench | 真正读取任务服务的共用界面；没有原型模拟执行 |

Pi agent-core 和 pi-ai 在三个宿主均精确锁定 0.85.1。模型流适配位于各宿主 `src/phone-agent.ts`，避免共享源码解析另一个宿主的依赖。没有导入私有 coremate2。

## 宿主接线

- Codex：独立 daemon 接四个任务 CLI 入口；原有 session 工具继续保留。任务身份沿用 CODEX_THREAD_ID。协议升级为 4。
- WorkBuddy：broker 在旧 Hook/session 调度之前处理四个任务工具；MCP 客户端断开、聊天 Hook 停止不取消自主任务。任务可由同一 WorkBuddy 本机用户重连管理。协议升级为 9。
- DSH：新增独立、detached 的 phone-worker 和私有 Unix socket；原生面板嵌入同一工作台。`/opengui` 打开工作台，`/opengui <目标>` 提交任务，`phone_agent` 保留为后台提交别名，返回 submitted 而非 completed。`legacy-phone` 与原浏览器路由保留。

新入口为 `opengui_run_task`、`opengui_manage_task`（status/stop/steer/resume）、`opengui_list_tasks`、`opengui_open_workbench`。宿主必须立即打开提交返回的工作台 URL，使该任务获得真实可见首帧。每个任务的首帧截止时间不能通过重复调用重置。

## 执行与数据

同一实例按手机排队，最多四台手机并行。requestId 在 owner 范围内去重，参数冲突明确拒绝。宿主和新旧执行入口共用机器级租约；冲突不抢占。仅锁元信息跨宿主共享，任务和凭据不共享。

后台维护 queued/preparing/running/waiting/stopping 与 completed/blocked/failed/cancelled/unknown 契约。当前运行错误按执行前 blocked、动作后 unknown 分类；failed 为保留状态。停止先禁用新动作、传播取消，再等待资源清理；清理不确定时保留设备锁并报告 unknown。补充指令进入 Pi 下一决策边界。

父任务冻结模型快照，由 Pi 规划独立分支并自动分配设备；每个执行分支固定一台手机。动作需最新 observationId，执行器串行并保留原预算、画面变化与无进展校验。发送、发布、购买和删除保留一次动作的本机确认，拒绝后不可重复弹窗绕过。动作结果不明需要重新观察，不自动重放。

首帧必须由实际浏览器解码并绘制到可见 canvas 后回执。首帧建立以后，关闭页面仅影响观看；截图执行继续。终态 completed 要求最后一次动作之后再独立观察，所有成功标准检查引用该截图。

父任务存在各宿主独立 `phone-agent/goals-v1`，执行分支及旧单机任务在 `tasks-v1`，证据在 `evidence-v1`；追加事件 fsync，截图权限 0600。重启读取历史，将未结束任务标记 unknown，不恢复动作。截断的尾部事件另存 `.incomplete` 后修复写入边界。旧插件不读取新任务目录。

Keychain service 分别为 `org.opengui.phone-agent.codex/workbuddy/dsh`；配置和任务只有 credentialRef。模型保存前用测试图片和工具调用检查协议能力。支持 HTTPS 或 loopback HTTP 的 Chat Completions/Responses。没有官方账号、额度或支付入口；缺失用量和费用显示未知。

工作台绑定 loopback，使用随机路径能力、Host/Origin 检查、JSON 写入与 CSP；能力 URL 不写入事件日志。DSH 嵌入仅授权对应本机 Origin。

## 安装与回滚

构建 manifest 包含宿主版本、Git 基线和三个共享组件的内容摘要。Codex 与 WorkBuddy 安装器使用已有升级检查，自主任务计入活动计数；DSH 自更新器在替换前调用 worker 的空闲关闭检查。工作台打开期间也拒绝停止后台。

只回滚对应宿主的安装位置，保留任务、截图、模型配置和凭据。不要手动覆盖活动进程正在使用的目录；绕过安装器的 `npm install --ignore-scripts` 等文件替换不属于已验证的升级入口。崩溃后机器租约不会按 PID/超时被自动偷取；确认旧手机进程已停止后才允许人工处理残留锁。

## 验证命令与证据

以下分别记录源码/自动化、成品安装、浏览器和真机，不互相替代。命令按工作区约定加 `rtk proxy`。

| 工作目录 | 检查 |
| --- | --- |
| plugins/opengui | `pnpm check`，包括共享任务与真实 Pi 本地网关测试 |
| plugins/opengui | `pnpm test:viewer`，真实 H.264 解码、画面变化、关闭释放 |
| plugins/opengui | `pnpm test:workbench`，合成视频和测试执行器驱动真实浏览器 UI |
| workbuddy-plugin | `npm run check`、`npm run pack:release`、`npm run smoke:packed` |
| deepseek-harness-plugin | `pnpm check`、`DSH_COMPAT_VERSION=0.1.5-rc.1 pnpm check:dsh-compatibility` |
| workbuddy-plugin | 指定 OPENGUI_QA_SERIAL 后 `node scripts/test-real-viewer.mjs`，只读真机首帧 |

自动化覆盖：去重、同机排队与排队取消、四机上限、跨宿主互斥与晚到释放、模型冻结、补充指令、过期观察、未知结果不重放、终态证据、停止/清理时序、Keychain 等待期间停止、进程中断与残缺日志、宿主连接丢失仍执行、活动任务拒绝升级，以及两种协议的 Pi 图片/工具闭环。

本轮使用一次性测试凭据验证了真实 macOS Keychain stdin 写入/读取，并清理测试项。没有读取其他应用的 API key。

成品检查使用隔离目录，未覆盖用户已安装插件。WorkBuddy 测试含 18 工具发现、在线/离线缓存、安装幂等、宿主配置保留及回滚。DSH 检查含成品安装、Host boot、运行时/任务 API 和客户端注册。DSH fixture 明确许可 esbuild 构建，不关闭包管理安全检查。

## 尚未完成的候选验收

- 真实自带模型尚未配置；真实模型、中文输入、补充指令、停止和业务目标核验需要从三个宿主安装成品继续验收。本地模拟协议闭环不能替代。
- 当前仅发现一台授权手机；两台真机并行、两个真实宿主争用、物理断连/授权撤回需要补证据。
- 真机可见首帧有成功记录，也出现复测超时；在稳定性问题查明前不得宣称稳定发布。
- DSH 原生面板和退出真实宿主后的任务连续性，需要实际宿主 UI 验收；隔离 Loader/浏览器测试只证明相应边界。
- 不发布 Windows 能力；没有云端调度、跨宿主任务接力或完整视频回放。

## 本轮候选结果

- Codex `pnpm check`：108 项通过；WorkBuddy `npm run check`：148 项通过；DSH `pnpm check`：311 项通过。另有共享构建边界 Node tests 通过。并行运行时旧安装器/自动重载测试曾触发 5 秒超时；单独完整重跑通过，没有修改超时或删测。
- 真实 Pi 0.85.1 对本地 SSE 网关：Chat Completions、Responses 图片/工具闭环均通过；这不是远端视觉模型能力验收。
- `pnpm test:viewer`：单路及四路合成视频的真实 H.264 解码、画面更新、分辨率变化、任务结束后播放和关闭释放通过。
- `pnpm test:workbench`：真实浏览器完成任务提交、解码首帧、关闭页面仍运行、补充指令、停止、历史与 390px 布局检查。测试使用合成视频和测试执行器；截图在 `plugins/opengui/.artifacts/workbench/narrow.png`。
- Codex 成品：校验 SHA256 后解包，使用私有钉版 Node 22.23.2，通过 launcher 和 15 个接口发现。
- WorkBuddy 成品：预检、安装配置、18 工具、broker、在线/离线缓存启动通过；最终安装器直连 GitHub 下载曾超时，使用本机已有代理并设置 `NODE_USE_ENV_PROXY=1` 后，完整安装、幂等及回滚测试通过。代理网络应让 Node 显式使用环境代理，不把网络失败报告为插件安装成功。
- DSH 0.1.5-rc.1：成品隔离安装、Host boot、运行时/任务 API 和客户端注册通过；另单独启动编译后的 detached worker，验证私有 socket、任务发现和真实工作台 HTTP 服务。Loader 额外断言四个高层任务工具都已注册。
- 一台真实授权 PKV110：首次 15.3 秒、诊断复测 14.4 秒与最终成品源码复测 14.9 秒建立真实可见解码首帧；另一次并行检查期间超时（0 解码帧），原因未确认，仍列为稳定性待验收。没有执行真实模型驱动的手机动作。
- macOS Keychain 使用一次性测试凭据通过写入/读取/清理；原仓库分支和 WIP 保留。候选仅打包，没有发布或覆盖生产安装。


## 历史本地安装包（首轮候选，非当前全部成品）

以下是首轮候选的历史记录：当时成品的 `lib/runtime-manifest.json` 已逐一解包比较，与当时构建一致，三个成品的隔离安装检查均通过。后续界面和多机变更不由这些旧哈希证明；WorkBuddy 使用 `NODE_USE_ENV_PROXY=1`。

| 宿主 | 仓库相对路径 | SHA256 |
| --- | --- | --- |
| Codex | plugins/opengui/.artifacts/opengui-codex-0.3.0.tar.gz | ca8a018e0867004c838aa7810959be86921d6078eed59911879cbfb96b373cb9 |
| WorkBuddy | workbuddy-plugin/dist/opengui-mcp-0.4.0.tgz | dd86cd3af7c810144f3958ceb0cd9f743266ed11b0d949f05885667f377c0286 |
| DSH | deepseek-harness-plugin/.artifacts/dsh-coremate-mobile-0.1.13.tgz | 24b8e6472753d0330442941c0d57d53cc95607d1c578527754d5bd3ad9512efa |

这些版本号沿用候选基线，不代表已发布新版本。最终布局变更后补跑了工作台浏览器回归、Viewer 四路解码、三个宿主构建和三个安装包检查；没有用新包的构建结果覆盖前述真实宿主验收缺口。

## WorkBuddy 界面纠偏（2026-09-19）

实机验收发现初版工作台与已评审 V6 原型偏离：深色配色、首页默认展开凭据表单、历史与投屏堆叠，不能将功能连通视为界面验收通过。现按原型设计值恢复 `#fafbf9` / `#24312f` / `#23644e` 与系统字体，模型配置移到设置入口，历史收起，任务与真实画面并列、窄侧栏上下排列。保留当前自主任务接口，不导入原型模拟执行器及旧宿主驱动语义。本次是界面纠偏，未声明与原型全部页面逐像素一致。

验证：WorkBuddy 148 项测试、构建、打包通过；共享任务 15 项测试通过；浏览器任务提交、真实合成 H.264 解码、关闭页面继续运行、补充、停止、历史及 375px 无溢出通过。测试画面为合成蓝色帧，不是真机或真实模型验收。

本次重新生成 WorkBuddy 候选 tgz SHA-256：`05a5f8488f10e72504d463ae030e37be2122add0b1da2689660c773ce6ec0f98`。版本号仍为未发布候选 0.4.0，旧哈希对应此前安装包，不能混同本轮候选。

## V6 页面与交互对齐验收（2026-09-19，替代上节首次纠偏）

首次纠偏只恢复了配色，不能代表完整页面对齐。本轮按已评审 V6 的 viewer.html、style.css、app.js 重建共享工作台，设计契约见 `packages/workbench/DESIGN.md`。

| 原型界面 | 当前实现与验收 |
| --- | --- |
| 首页 | 原型标题、任务输入、我的设备、示例与最近任务；补充成功标准、真实手机和模型选择。切页保留草稿。 |
| 设备 / 放大画面 | 真实连接与授权状态，卡片查看、放大与隐藏；WorkBuddy 成品内 PKV110 已显示真实解码画面和“实时播放”。 |
| 任务列表 | 全部 / 进行中 / 已结束筛选，真实来源、状态和历史；不生成演示任务。 |
| 任务详情 | 实时画面、步骤、补充与停止、终态检查、截图证据、导出和复用草稿；375px 滚动时停止按钮保持可见。 |
| 设置 | 模型连接验证、错误反馈、成功保存清空凭据字段；首次未配置状态已在真实 WorkBuddy 核对。 |
| 使用指南 | 七步连接、执行与结果流程；真实 WorkBuddy 页面已逐页查看。 |

统一采用 V6 浅色背景、绿色强调、系统字体、边框和间距；宽屏与 375px 均检查。没有复制原型的假宿主外壳、模拟执行面板或旧“宿主负责模型循环”语义。真实任务详情按新版自主任务契约补充画面与成功标准，因此不声明每个像素与旧原型相同。

自动化：Codex 108、WorkBuddy 148、DSH 311 项测试及各自构建/校验通过；Viewer 浏览器真实合成 H.264 首帧、画面变化、分辨率变化和关闭释放通过。工作台浏览器覆盖导航、草稿、提交、页面关闭继续运行、补充、停止、筛选、模型成功/失败、真实 JPEG 证据、空设备与未授权状态。截图在 `plugins/opengui/.artifacts/workbench/`。这些任务使用测试执行器与合成画面。

WorkBuddy 5.5.6 实际安装并启用了本轮候选，SHA256 `f6cf443c072841b671ae3abb2c49a08eebd7b01b2de94ff06f392880dc4f0b7a`。升级前关闭旧页面、停用 MCP 并等待旧 broker 自然退出；安装器报告无旧 broker，没有强杀活动任务。新工作台由宿主重新调用工具打开，首页、设备、任务、设置、指南已检查，PKV110 只读画面可见。旧哈希属于历史候选；上表 Codex/DSH 安装包不代表这轮界面更新后的新打包产物。

本轮仅确认共享工作台界面/交互及 WorkBuddy 实际显示。真实 BYOK 模型尚未配置，没有执行真实模型手机动作；三宿主全流程、两台真机及首帧稳定性仍按前文待验收，不据此发布。

## 首页动线纠正（2026-09-19，替代前述“完整对齐”结论）

用户指出原 site 没有每次选手机、选模型或单独填写成功标准的步骤，源码复核确认属实。首页恢复为单个任务输入框与开始操作，单台手机自动使用；多台目标不明确时仅在提交后澄清。模型使用后台已存在的“最近验证保存的配置”默认规则，不在首页选模型。任务描述本身作为终态核验标准，仍须新截图和检查结果，未绕过证据门槛。设置页标出当前默认模型。

本轮 WorkBuddy 候选 SHA256：`80ba413e16c15a49e5d3c8a0c64a1cc28de5cc5925f3f26a8b80a891abe7576c`。此前页面对齐结论存在遗漏，以实际交互验收为准。原型多机按业务账号自动分配/拆分尚非当前任务实现，不应将显式澄清描述为完整自动调配。

### 最新范围决定：恢复原 site 多机任务语义

用户明确选择“按原 site：自动分配，必要时拆分多机任务”。这替代此前顶层任务固定单台、多台必须人工选择的范围；每个实际执行分支仍固定手机，沿用租约与动作证据约束。完整对齐尚未完成，不能把上面的临时多机确认控件作为最终交付。

后续必须完成并验证：
- 顶层请求只提交任务目标和请求 ID，模型配置由服务固定；Pi 规划输出独立分支或具体业务澄清，不通过关键词规则假拆分。
- 自动分配基于授权设备、占用与明确业务约束，不能根据设备名猜账号；登录/业务目标不明时只暂停相关分支。
- 父任务保存分支及规划记录，统一 ID、状态、补充、停止与结果；同机串行、异机并行最多四台，跨宿主不抢占。
- 停止父任务阻止新增分支，并等待全部在途分支清理；部分完成与未知结果不得聚合成成功。
- 页面呈现执行分支、对应设备、状态、证据；查看手机不改变分配。
- 关闭网页/宿主继续，重启留历史但不重放动作；去重覆盖规划和子任务创建，模型更改不影响已接收任务。
- 规划、调度、父子停止、部分失败、澄清与恢复、跨进程中断须有自动化证据；真实安装及真机证据独立记录。

本轮安装复核：第一次升级因旧 broker 仍在线被拒绝；等待自然退出后重试成功，未强杀。WorkBuddy MCP 已重新启用，宿主重新打开新工作台，实际截图确认首页只有一个任务输入框，没有手机/模型选择和成功标准输入框。WorkBuddy 148 项测试、构建/打包与工作台浏览器回归通过；浏览器额外验证多个模型配置时使用最后保存的默认模型，任务描述进入终态核验字段。多机自动规划/分支尚待实现，目标保持进行中。

### 自动分配与父子任务实现进展

新增 `planner.ts`，复用三个宿主已有 Pi 工厂，只有结构化规划工具，没有手机动作工具；校验授权设备、独立分支数量、重复分支及取消后晚到输出。新增 `goals.ts` 保存父任务和规划事件，按候选设备的本地队列长度分配分支，沿用原 PhoneRuntime 的每机串行/最多四机并行、跨宿主租约和首帧检查。模型配置在接收父任务时固定。

宿主高层入口和工作台提交已接入父任务。首页不再有多机选择控件；任务详情呈现执行分支和各自画面，列表只列顶层任务。父任务可接受业务澄清、统一补充/停止、汇总结果；完成要求所有分支已完成，部分受阻/未知不视为成功。父记录位于 goals-v1，旧单机记录和分支仍在 tasks-v1。重启后未结束父任务标未知，不重新规划或重放。

证据：规划/父子任务核心 33 项测试通过（22 runtime、7 planner、4 Pi）；Pi 的两种协议均通过真实本地 SSE 网关规划工具调用。浏览器使用合成 H.264 测试双分支分配、首帧、补充与完成汇总，375px 与桌面截图位于 `.artifacts/workbench/multi-*.png`。测试发现窄栏不可见首帧与 iframe 最小宽度裁切，已保留可见首帧门禁并修正预览布局。

尚不代表完整验收：需要继续验证四台与长队列的可见首帧、排队分支补充、真实宿主升级、账号/断连分支的人工恢复动线、真实模型与真机执行。当前 WorkBuddy 已安装版本仍为上一轮首页简化候选，不能把新源码测试当成已安装新多机能力。

### 四机排队与用户处理验收

浏览器 fixture 已验证四台合成视频设备、八个独立分支：首批四个并行，后四个排队；统一补充同时覆盖运行中和排队分支，全部八个完成且各有至少两次观察证据。`four-queue-narrow.png` 记录窄栏。

新增等待用户处理状态与 Pi request_help 工具。等待只暂停相关分支，保留原手机；用户通过“已处理，继续”或补充回复恢复，恢复时清空旧 observation，强制重新观察。统一停止可取消等待并确认清理。核心测试额外验证一支等待时另一支继续、原设备不迁移、旧观察拒绝、等待期间停止。浏览器 `userHelpResume` 已通过；这是合成登录等待，不是实际业务账号登录。

草稿进入本宿主私有本地文件，页面刷新与重新打开恢复，提交成功后清空；`durableDraft` 浏览器验收通过。新任务仍不自动重放中断后的手机动作。

最新 WorkBuddy 0.4.0 本地候选 SHA256：`96f734c6adca4a9aa7dee493b4192c2857f0a4a559847e36e2f04a8cafcb2601`，已由安装器写入当前 WorkBuddy 5.5.6 配置。旧 broker 自然退出后更新，无强杀；仍未发布。核心测试 35 项通过（24 runtime、7 planner、4 Pi）；Codex 全套 126、WorkBuddy 148、DSH 311 项测试通过，草稿补充后 WorkBuddy 完整打包回归通过。浏览器四机八分支、用户处理后继续和重新打开恢复草稿通过，均为合成设备/测试执行器。

DSH `DSH_COMPAT_VERSION=0.1.5-rc.1 pnpm check:dsh-compatibility` 已退出成功，覆盖成品安装、Host 启动、runtime/task API 与 client 注册。该检查不替代 DSH 原生界面和真机验收。WorkBuddy 已重新调用工具打开最新候选工作台；真实视觉模型尚待用户在设置页验证保存，未执行真实模型手机任务。

宿主入口复核：DSH `/opengui` 和 `phone_agent` 的新手机任务均提交到独立后台的同一父任务入口；浏览器及显式 legacy 路径保留。修正 DSH 工具 schema 遗漏的 `resume`，并在实际 Loader 组装测试中要求该动作可见。修正后 `pnpm check` 的 311 项测试、构建和插件结构验证通过；尚不代表真实 DSH 手机恢复操作验收。

最新只读真机复核：通过共享 WorkBuddy LocalAdbPhoneHost 发现唯一授权 PKV110，沿用机器租约执行 `scripts/test-real-viewer.mjs`，本次 2070ms 首帧建立，canvas 为 430×960、2 个已解码帧、visible/rendered 为 true，状态 ready／实时播放；检查退出 0 并释放临时 viewer、host、设备租约。此为本地构建的只读浏览器检查，没有执行手机动作，不等于真实模型任务或历史偶发超时已彻底解决。模型配置文件仍不存在；真实任务验收等待用户配置模型。

宿主模式 WorkBuddy 候选 `d571838b3299b31705bf1e2d107a109b530348ea26958e86b54f42641c2faf71` 已安装并启用，旧 broker 自然退出，无强杀。实际 WorkBuddy 当前选中 Deepseek-V4.1-Flash。首次真实目标提交沿用了旧设备 ID，在规划前受阻，0 步、无截图、无动作；保留该失败记录，并要求宿主新提交仅含 goal/requestId，从本次 next 的授权设备列表规划。此时仍不能宣称真实执行通过。

真实 WorkBuddy 宿主已接收到图片并规划分支；launch com.android.settings 已送达，随后 swipe 被执行内核以 not_executed 拒绝。初版宿主桥错误地结束该可恢复分支，现增加错误返回、强制重新观察和不重放保护，并随请求提供动作/完成契约。新核心恢复用例通过，共享任务测试共 27 项；修正版打包通过 WorkBuddy 149 项检查。Mac 随后锁定，界面工具要求用户手动解锁，修正版尚未重新安装及完成真机回归。当前已安装仍为 d571838 候选，不能以修正版测试替代安装证据。

恢复修正和宿主模式说明同步后的 WorkBuddy 最终本地包 SHA256：`bfe7bcb3db708f54ca8b5a380c6e91b394d16c4275fe3025e167453bd8a16825`，149 项测试、构建、18 工具/技能完整性校验和打包通过。尚待解锁 Mac 后安装与真实宿主回归，未发布。

2026-09-20 解锁后的真实验收：bfe7bcb3 候选已安装并在 WorkBuddy 启用，真实首帧可见，宿主使用当前 Deepseek-V4.1-Flash 连续 next/decide，无额外模型配置。动作拒绝能够重新观察，但多次 swipe 被拒；本次任务已明确停止并完成清理，未宣称目标完成。源码定位到 HostExecutor 错把原始手机尺寸作为缩小截图的坐标空间（720×1604 原图被编码到最长边 1280），导致宿主坐标可能越界。已改用 image.width/image.height，证据尺寸同步按实际文件记录，保留内核校验；返回拒绝时补充具体控制器原因。共享任务 27 项测试通过，包含原图与截图尺寸不同的回归；WorkBuddy 完整检查与打包通过，新包 SHA256 为 `1864292cb9c38a887753bfe4ea27eaeac48328b484e4a1a42cbd63983aa2bf73`。仍需新安装成品真机回归。

坐标修正版 1864292c 已安装：旧会话保留 MCP 连接导致升级器拒绝替换；正常退出 WorkBuddy 后，旧 broker 空闲退出，安装输出 upgrade_ready，无强杀。重新打开 WorkBuddy 并恢复既有 OpenGUI 信任，宿主调用新版本。最新源码 Codex 129、WorkBuddy 149、DSH 311 项测试及各自构建通过。新真机任务 11dd6839-9ee5-43d6-8c7c-6ceb55844649 的截图/证据尺寸现为 575×1280；launch/Home 动作送达，但画面主体黑屏，仅状态栏可见，尚未取得 Android 版本证据。已请用户确认 PKV110 本体点亮解锁后的实际画面，不把动作送达当目标完成。

本次真实宿主验收最终通过工作台“停止任务”结束，界面与 journal 均为 cancelled，所有分支已停止；随后结束 WorkBuddy 本轮模型执行，等待用户检查手机。工作台补充指令已记录且在宿主返回的 supplementalInstructions 中出现，实际控制中心后来可以显示，但未取得 Android 版本终态证据，仍不计任务成功。不要把本轮 16 步或工具送达当验收通过。

宿主领取权限补充：TaskHost 对网页任务的查询、补充、停止原先仍按 workbench owner 校验，实际领取宿主无法管理；现基于 HostExecutor 的精确任务 claim 授权父任务及其固定分支，并在 list 与空 mailbox 状态中仅返回本会话/已领取任务。新增真实 TaskHost 接口回归覆盖领取者管理、其他会话拒绝、状态隔离及停止后晚到决定拒绝。Codex 130 项测试、构建/校验通过；WorkBuddy 149 项检查及打包通过；DSH 构建通过。新包 SHA256 `37ebf971a29286a4b61ef09ac7a6b636b69f75f36cddc361d51669b020eedf18` 尚未安装；实际 WorkBuddy 仍为坐标修正版 1864292c。这不解决首页自动唤起空闲宿主，也不替代手机黑屏后的真实目标验收。

DSH 命令接手修复：当前 /opengui 手机分支此前仅提交并返回，宿主模型没有继续决策。新增 phone-host-dispatch.ts，通过已安装 DSH 公共 Agent.followup/createUserMessage API 将已接收 task ID 交回原会话，以插件来源记录，不创建另一个模型实例、不重新提交任务。缺少 followup 的宿主在提交前明确拒绝；唤醒抛错时停止已接收任务。补充根路由提示，已有任务直接 next/decide，避免 phone_agent 重复创建。新增 3 项用例，全套 DSH 314 项测试与构建通过；提示词更新后的组装/派发 4 项定向复查通过。此处验证的是命令接线，不是 DSH 网页提交自动接手或真实模型验收。
WorkBuddy 内置 codebuddy --help 确认提供 print/resume 等 CLI 模式，但尚未证明这些能唤起桌面当前会话并继承其当前模型；不能将另开 CLI 当作已实现的桌面会话接手。

上述 DSH 最终构建的 0.1.5-rc.1 成品安装、Host 启动、runtime/task API 与 client 注册兼容性检查已通过；仍未做原生宿主模型的命令执行实测。

DSH 内嵌首页交接接线：工作台在用户提交成功后，只向已配置的 DSH embedOrigin 发送 opengui-task-accepted/taskId；原生面板校验精确 iframe window、origin 和 UUID，去重后通过现有 session.command 发起 /opengui continue <id>。命令只领取指定任务，再使用当前 Agent.followup 推进，不重新 submit；客户端传输失败提供重试，重试沿用同一 task ID。共享 next 增加 taskId 过滤，测试验证不会误领取队列中其他任务。
验证：Codex 131 项测试/构建/校验通过；DSH 315 项测试通过，修正 exactOptionalPropertyTypes 后构建通过，0.1.5-rc.1 安装/启动/注册兼容检查通过。新增 iframe 消息来源及格式拒绝测试。浏览器嵌入 fixture 通过：真实页面提交、一次 task ID 通知、合成视频可见首帧、宿主 mailbox 图片决策与终态证据；使用专用 headless Chrome Frame 解决 agent-browser wait/eval 未作用 iframe 及固定导航遮挡测试点击的问题。该 fixture 没有真实 DSH 模型或物理手机，不单独证明真实原生面板整个链路验收完成。WorkBuddy/Codex 网页自动唤起当前桌面会话仍未解决；WorkBuddy 已安装版本仍为 1864292c，不能把这些源码变更视为已热安装。

2026-09-20 08:32 WorkBuddy 真机宿主闭环通过（范围受限）：用户确认手机已准备好后，重新枚举 PKV110 并创建只读 viewer，宿主报告 firstDisplayEstablished=true、4931ms；实际 WorkBuddy 窗口截图可见设置 Android 搜索结果，非黑屏。随后新建父任务 15fb15cd-5b95-4884-9323-57ec34687427，子任务 b64e2cb7-b432-4a90-b9f7-1710b1ad8943，由当前 Deepseek-V4.1-Flash 通过 next/decide 执行一次 tap，从已有搜索结果进入版本信息页。父子 journal 均 completed；独立终态观察 phone-observation-8b07b34d-03d3-4215-be23-6f84d27390a7-6 与 passed 检查的 evidenceId 一致。已实际打开保存的 575×1280 终态截图 214b5bf8-1a27-40c6-a60b-4d9e27cfbf91.jpg，确认 Android 15、版本号 PKV110_15.0.0.702(CN01)。宿主本轮已结束，无额外模型配置。仍为已安装 1864292c 候选；此结果仅证明聊天发起、宿主模型看图决策、真机执行和证据闭环，不证明从桌面冷启动完整导航、首页自动唤醒、其他宿主或黑屏根因已修复。分支卡片实时画面过小仍需修正。

2026-09-20 分支画面可读性修正：移除 renderTask 对分支 iframe 的 180/260px 内联高度及多分支固定两列，使用响应式列宽与 490–650px 画面容器，窄侧栏自动单列。宿主模式 runtime/workbench 的通用失败提示改为检查手机连接及宿主任务状态，不再误导用户配置模型。WorkBuddy 149 项测试、构建及验证通过，共享任务 29 项测试通过；嵌入浏览器 fixture 在 375px 与 1280px 渲染并检查无横向溢出、分支画面最小高度、首帧和终态证据，通过。截图已目视检查；使用合成蓝色视频，不代表本次改动已装入真实宿主。实际安装包仍为 1864292c，待后续成品更新验收。

2026-09-20 宿主跨轮等待修正：WorkBuddy 高层任务 owner 从每轮 AutomationTask.id 改为已认证 Hook 的 hostSession（session_id 与 agent_id 组合），无 Hook 时仍用连接随机 ID。每轮各自注册终止监听，正常结束回复的 unknown 结果保留 waiting 或业务澄清任务；显式 interrupted/cancelled 和 MCP 连接关闭仍停止所拥有任务。记录与领取权限按同一会话延续，其他会话保持隔离。共享 TaskHost 增加显式 preserveUserWait 参数，默认仍全部停止。新增 broker 跨轮身份/不同会话/显式停止集成测试和共享执行器用户等待/恢复新观察/停止测试；WorkBuddy 150 项测试、构建与插件校验、共享任务 30 项测试通过。该测试验证真实接口组合与合成设备，尚未以更新安装包在真实 WorkBuddy 跨轮操作验收；历史临时 owner 的记录仍可从工作台查看，不伪造归属迁移。

2026-09-20 08:46 更新安装与跨轮真机验收通过：WorkBuddy 新候选包 SHA256 fbf1e5a288d3426e6acfe09bad6147c18f0ddc048ddccce643c0d6795b907c09 经 pack:release 及完整 smoke:packed 通过（150 项测试、构建、离线成品启动、重复安装及回滚记录）。通过原生菜单退出空闲 WorkBuddy，旧 broker 自然退出，安装器确认 upgrade_ready 且未终止进程；已写入新包配置。重新打开 WorkBuddy 后恢复既有 MCP 信任为绿色启用。新父任务 76b64878-5bb3-40c5-86f7-eddc4ac01d6c／子任务 58554248-76c4-4733-a844-4456fba1d51f：真实宿主首轮 observe → help 后结束，UI 与 journal 保持 waiting；下一轮 resume → next → 新 observe → finish，同一任务 completed，0 手机动作，无重复提交。journal 的 owner 为 authenticated-host-session，证明已走新的会话归属路径；宿主最终文案关于 Hook 为空的推断不作为事实。终态观察 phone-observation-364dece7-82d4-4bad-bd3a-853e1e4fb805-2 与 passed evidenceId 一致；已打开截图 094ca3a0-825e-4bb8-b039-f29d1b4b1af3.jpg 确认 Android 15。此验收证明聊天跨轮等待恢复，不代表首页自动唤醒或其他宿主验收完成。

2026-09-20 DSH 当前状态复核：本机 web profile 的 dsh-coremate-mobile 仍来自缓存 releases/v0.1.13 的安装包，不能视为当前候选已装载。已校正 README.zh.md 默认命令、宿主模型边界、首页交接、macOS 范围及宿主退出行为，将专用模型配置与旧子任务说明明确归入 legacy 路径；英文入口同步当前候选说明。最新 pnpm check 通过 315 项测试、构建与 Codex 插件结构检查。DSH 原生面板和真实宿主模型验收仍未完成。

2026-09-20 DSH 候选安装：当前 tgz SHA256 4f8cc8d87f2e3129378519f305ab1854b3dc23bc5987389c809e9245631aa00d，通过 DSH_COMPAT_VERSION=0.1.1-rc.2 pnpm check:dsh-compatibility 的隔离成品安装、Host 启动、runtime/task API 与 client 注册。真实 web profile 更新前 task/status 为 active=false、idle，配置文件备份在 ~/.dsh/backups/opengui-host-candidate-20260920-085155。仅停止并重启 com.coremate.opengui.web LaunchAgent，用现有 DSH CLI plugin add 安装本地 tgz，未改模型或凭据。真实原生面板已显示宿主手机任务入口、加载内嵌新工作台、识别 PKV110，当前宿主模型仍为 Grok 4.6。首页只读验收草稿已填；当前 IAB 控制工具对 iframe 点击/键盘报目标或焦点失效，未提交，故首页自动接手和真实模型执行尚未验收。没有新手机任务或动作。


2026-09-20 08:55 DSH 首页真实宿主只读验收通过：候选 SHA256 `4f8cc8d87f2e3129378519f305ab1854b3dc23bc5987389c809e9245631aa00d` 在 DSH 0.1.1-rc.2 的原生面板首页提交后，由当前 Grok 4.6 自动接手，无额外模型配置。父任务 `4e0ffd80-b37e-459d-9a68-d44b37266f35`／子任务 `02a712ab-9e34-4fed-987e-465d87b8542c` 均 completed、steps=0，未点击、滑动、输入或启动应用。独立终态观察 `phone-observation-7e49b406-3c08-4315-92db-c2107773d4c6-2` 与 passed 检查 evidenceId 一致；保存的 919×2048 截图 `e628c657-6835-43bb-8b6f-9d1e38c82193.jpg` 已目视确认 Android 15。证据位于本机 DSH 私有 phone-agent/evidence-v1，父子事件分别在 goals-v1/tasks-v1。宿主本轮已结束。此结果证明首页自动接手与真实宿主看图、记录闭环，不证明手机动作、中文输入、多机、断连或停止均通过；仍未发布。

2026-09-20 宿主分支轮询修正：DSH 真实验收中宿主曾用 context.branchId 调用 next，旧 HostExecutor 仅按父 taskId 过滤而返回空。新增双分支 TaskHost 回归，修复前实际失败；修复后父 ID 查询全部分支，分支 ID 只查询该分支，仍以父任务 claim 校验会话权限。验证包括其他会话拒绝、停止分支不误取兄弟分支、未知 ID 不取任何任务；工具说明引导持续使用 decision.taskId 推进整体任务。三个宿主共用这一过滤入口，无独立重复实现。Codex 全套 133 项测试、构建和插件结构校验通过。此改动尚未重新打包安装到实际宿主，先前真机证据对应上一候选。

2026-09-20 工作台阶段反馈修正：父任务 preparing 显示等待宿主规划，分支准备阶段根据 viewerUrl 区分连接画面与等待真实首帧；不再将尚未分配手机的任务描述为等待首帧。业务澄清显示等待补充信息，继续同一任务的操作提示替代重新创建提示；此类任务归入进行中，保留停止入口并隐藏重新创建入口。共用详情、分支卡片和列表使用一致状态文案。嵌入浏览器 fixture 已验证首页提交、澄清、列表分类、用户补充、同一父任务重新规划、真实浏览器解码合成视频及终态证据；375px 与1280px检查通过。host-planning-narrow.png 与 host-clarification-narrow.png 已目视检查，31 项共享任务测试通过，diff 检查通过。测试使用合成设备，更新尚未安装到真实宿主。

2026-09-20 Codex 候选成品复核：重新构建并打包，归档 SHA256 `8ede2aa3440f11fb7c2523a96ec204e3623919165b39dfbcfd6738df98a24dfb`。smoke-archive 使用校验过的官方 Node 22.23.2 归档，在隔离临时目录解压候选、运行随包启动器并发现 15 个接口，退出成功；未启动 ADB 或修改 Codex 配置。中英文 README 已移除新任务 BYOK/Pi 独立执行和退出宿主继续的错误说明，协议修正为4，记录宿主 next/decide、自动分配与首页唤醒限制。当前实际安装仍为 opengui@personal 0.1.0+codex.20260906133201；候选安装器拒绝跨来源覆盖。已请求用户选择是否迁移到 opengui@opengui-standalone，未移除旧安装，安装后真机验收仍待完成。

2026-09-20 DSH 宿主取消接线：原 agent/disposed 只清理 legacy manager，独立 phone-worker 未收到明确取消信号。新增 agent/turn-stopping 的 aborted 信号与 agent/disposed 转发，通过已有私有 socket 调用 __interrupt_owner__，后台复用 TaskHost.interruptOwner 的会话/claim 权限和停止清理。正常 turn-stopping 不取消用户等待，不为取消通知启动不存在的 worker；通信失败只记录清理未确认，不宣称任务已停止。返回 stopProcessed 仅表示停止处理已结束，实际 cancelled/unknown 仍以任务状态为准。新增事件分支与真实本地 socket 的通知测试，覆盖正常回复不停止、明确取消、会话销毁、传输失败和 worker 不存在。最新 pnpm check 的317项测试、构建及插件结构校验通过。更新尚未安装到实际 DSH，原生停止按钮与真机清理验收仍待完成。

2026-09-20 09:20 DSH 原生停止真实验收：第一次候选 39fba155 安装后，原生停止没有取消等待规划的后台任务；任务9f54dea8-4e3a-43fe-bdc3-ebb743f20bed已通过明确stop清理为cancelled，0动作。检查实际DSH 0.1.1-rc.2 loop发现signal.throwIfAborted位于agent/turn-stopping之前，取消路径跳过该事件；改为监听finally中发出的session/event turn/end，且仅reason.kind=aborted触发停止，正常回复保留等待状态。工具schema另补齐run_task的requestId/goal及manage_task的action必填约束，组装测试校验实际导出schema。317项测试、构建通过，新增组装断言和生命周期定向6项通过。

同路径同版本tgz重复安装被pnpm缓存复用，已通过安装文件比对发现并改用内容哈希文件名；当前实际安装为dsh-coremate-mobile-0.1.13-f6975f459481.tgz，SHA256 f6975f45948177292351d7755ad8bd8fadaa9c9fbe09e6386d022f50f8fd9d99。安装后的lib/index.js及phone-worker.js与候选构建逐字节一致。空闲worker通过正常shutdown退出，LaunchAgent正常停止/重启，无强杀；安装前配置备份在~/.dsh/backups/opengui-lifecycle-20260920-091311。

真实宿主Grok4.6调用opengui_run_task成功创建9142868a-6e69-4572-9646-8829ac05c367；点击原生Stop generating后，后台journal自动出现accepted→stop_requested→settled，phase=cancelled，steps=0，未创建分支或执行手机动作。此次没有额外API补救停止，证明等待规划阶段的原生取消已接通；不代表在途动作停止、首帧后的清理或中文输入验收完成。旧失败记录保留，最新候选未发布。

2026-09-20 09:25 DSH 中文输入验收未通过：网页提交父任务 a6fbd008-a42c-4d31-9e12-515e4b668d2f 自动交回当前 Grok4.6，分支 f33389de-3e23-4341-87e9-d73efe4e7d85 通过可见首帧并执行10步。真实截图停留在系统设置首页，未取得搜索框中文“版本”或搜索结果证据。journal 的 lastAction 保留实际动作参数；多次点击框 y=236–344，而保存的919×2048画面搜索栏约在y=403–505。宿主工具详情中的截图附件和context尺寸均为919×2048；共享控制器依据对应观察的截图尺寸转换坐标，当前没有证据支持修改坐标换算。供应商内部视觉缩放未核实，不能仅凭该次失败断定具体模型内部原因。

本轮点击原生 Stop generating 后，父子 journal 均自动 settled/cancelled，父任务显示所有执行分支已停止；没有额外API补救停止。最后独立保存画面1782707e-50ad-4a84-9305-7214193a26f5.jpg仍为设置首页。此次证明首帧后任务可通过原生停止结束，不证明中文输入成功。

停止文案修复：runtime 的异常处理此前把主动取消也映射为连接/模型故障。现在仅在资源清理结束且最终为cancelled时显示“任务已停止”；在途动作结果未知保留明确提示，清理失败仍为unknown。新增断言先在旧实现失败，再通过修复；共享任务33项测试通过，包含在途未知与清理失败分支。此源码修复尚未重新打包安装，实际DSH仍为f6975f459481候选。

2026-09-20 09:36 宿主坐标契约补充与候选更新：共享HostExecutor每步actionContract明确使用最新附件的绝对像素坐标、左上角原点及width/height边界，禁止混用原生设备尺寸/浏览器显示尺寸/归一化坐标；画面不变时重新定位，输入前确认可见焦点。未修改坐标换算，也不将提示补充视为真机修复证明。三个宿主检查通过：Codex135项、WorkBuddy150项、DSH317项，均含各自构建/结构校验。

DSH新归档SHA256 85ab2f1bcd562aeeff62dc126c268f88c14bfe91af375eddb1e8e4f40e49718a，按哈希文件名安装到web profile；实际index.js与phone-worker.js和候选逐字节一致。更新前worker ping activeTasks=0、正常shutdown，宿主正常bootout/bootstrap。此次备份明确来自~/.dsh/profiles/web的配置及锁文件，存于~/.dsh/backups/opengui-coordinate-20260920-093531（私有权限）；此前备份位置不应单独视为web profile已完整备份的证据。WorkBuddy/Codex实际安装尚未更新本轮变更。

2026-09-20 09:40 DSH 新候选真实复测：网页父任务58e7b635-a42f-4392-a37c-95763e6f7943自动交给当前宿主，分支b61e47e1-1ff1-4b99-9cbc-cce7195793ac取得可见首帧。宿主仍把搜索栏定位为y=250–330/242–338，连续两次点击均未聚焦；遵照任务上限，没有盲目输入，自行获取独立终态观察phone-observation-c1a6fa08-7644-4b9a-932b-91d85042b435-4并报告blocked/failed，父子状态及检查引用一致。终态截图d50080a9-b7fd-4075-8de8-c920e688b2a3.jpg已目视确认仍是设置首页。新坐标说明不能视为定位问题已修复；中文输入能力未得到本轮验证。该次证明首页接手、首帧、动作、受阻结果与终态证据链路可正常结束，不能计为业务成功。

2026-09-20 DSH面板往返动线修复：真机验收中切到Chat再返回OpenGUI会卸载PhoneWorkbench，组件内url丢失，迫使用户重新打开工作台且回到首页。现在按宿主session仅在页面内存保留opened/route，返回时重新请求已验证的本机工作台地址并恢复hash；不持久化带访问令牌的URL，不重新提交任务。共享工作台仅向已配置embedOrigin同步路由，宿主校验精确来源/frame与固定路由白名单。会话key隔离组件，过期启动响应不更新已卸载面板。新增会话隔离/来源拒绝/路由非派发测试，3项通过；嵌入浏览器fixture的375/1280宽度、导航通知、仅一次任务交接与终态证据通过。此处为源码及fixture证据，真实候选安装验收另记。

2026-09-20 09:46 DSH导航保留真实宿主验收通过：319项测试及构建/结构校验通过，安装归档SHA256 bbf1ed5488dc5d4d419bb6c143f3c2f44c071c016674c4a34f210631c8b71bb9，实际index.js、phone-worker.js、client.js与构建逐字节一致。更新前activeTasks=0并正常shutdown，web profile备份于~/.dsh/backups/opengui-navigation-20260920-094454。真实DSH面板打开已有任务a6fbd008-a42c-4d31-9e12-515e4b668d2f，切换Chat再返回OpenGUI自动恢复该任务标题、“已停止 · 10步”及所有分支已停止结果，无再次打开按钮、无新任务提交、无手机动作。页面刷新后的恢复不在本修复范围（导航仅保存在宿主页面内存）。验收同时发现重启后首页最近任务顺序不按时间排列，另需修正。

2026-09-20 09:49 任务历史排序修复：PhoneRuntime与GoalRuntime原先reverse Map插入顺序，日志按随机UUID文件名恢复后“最近任务”不再按时间排列。统一newestTaskFirst按createdAt倒序及ID稳定次序；同时修正工作台state与宿主opengui_list_tasks合并父任务/旧单机任务后的排序，owner过滤保留。新增真实文件日志重载回归覆盖四条列表路径与会话隔离，在旧代码确实失败，修复后Codex136项测试、构建和结构校验通过。排序修复尚未安装到真实宿主；实际DSH仍是bbf1ed5488dc候选。

2026-09-20 Codex隔离成品验收发现CLI入口缺陷：归档95e6ae30ea14908a40fde31cd54691471dd72e47b45958ad8fa109b0df74a673解压至独立~/.local/share/opengui-codex-acceptance/95e6ae30ea14，校验官方Node22.23.2缓存，doctor确认ADB兼容、PKV110已授权，官方scrcpy下载校验通过。使用真实CODEX_THREAD_ID提交父任务97d8a0f3-6b7d-4fb7-81f8-44a4023272be并打开工作台，但CLI validateValue假定每个object都有properties，decide的开放对象导致Cannot convert undefined or null to object，未进入规划执行。已明确stop为cancelled、0步、无分支；没有替换opengui@personal。

根因修复仅允许additionalProperties===true的动态字段，其他对象继续拒绝未知字段。新增3项CLI参数回归（规划/观察/动作/帮助/完成、无效decision与外层字段、旧手机动作bbox严格校验），旧代码2项失败，修复后Codex139项检查及构建通过。同形自定义校验器全仓搜索只发现此处；WorkBuddy使用AJV，DSH使用宿主schema。仍需新成品走通实际decide，不能将内部TaskHost测试等同于CLI验收。

2026-09-20 09:58 Codex修复后成品真机闭环通过：归档SHA256 5f631414bce72a64a7e990316044c725764a87e736feaac4c83111dda7b153bc，解压至独立~/.local/share/opengui-codex-acceptance/5f631414bce7。使用随包launcher、已验证官方Node和scrcpy，以及未改动的当前CODEX_THREAD_ID。新父任务ccca508b-e9dd-460a-b228-8c0859d9679e、子任务0cceffe6-ca78-4b2e-a390-1c6089aa3070由当前Codex宿主规划和逐步决策；真实工作台首帧可见，通过CLI decide的tap一次成功聚焦搜索框，text输入“版本”后显示版本信息、版本号、基带版本、内核版本及Android版本。没有修改设置或操作其他应用。独立observe产生phone-observation-e4ee7147-3d3f-47d7-b52d-e1dccefcfdfd-4，对应d3140b76-5d27-4977-9662-c16d11a73c97.jpg（720×1604），已实际查看；父子journal均completed/2步，passed检查引用同一终态观察。工作台显示已完成与成功标准已满足。

该证据来自隔离成品和真实Codex执行，不是默认市场插件升级证明；opengui@personal未替换。此前失败候选任务已取消，关闭重复验收页后旧候选daemon正常shutdown，未强杀。DSH/Grok此前的视觉定位受阻仍独立保留，不能用Codex成功替代DSH验收。

2026-09-20 10:02 Codex→DSH真机同机互斥验收通过：Codex隔离成品5f631414bce7创建父任务ab172c56-af97-47ee-8d47-c4b33e842bdb、分支1fd0b05e-e610-4256-a7e2-949bccda766b，真实首帧及一次observe后通过宿主help进入waiting，零动作。机器级锁owner确认为该Codex分支且持锁进程存活。随后由实际DSH/Grok4.6在新requestId=dsh-cross-host-lease-20260920提交只读任务，父任务9666dd70-9c07-4eaf-ae53-4ece0bf8bbff、子任务81d5073b-9e63-4f4d-8b5c-2447ee412360均blocked，error为device_busy，动作事件为0；DSH宿主核对status后报告占用，没有重试或抢锁。再次核对原Codex锁仍保留。最后通过Codex任务stop正常取消等待任务，子任务summary为“任务已停止”、无error、0步；原设备锁已释放。无手机修改、无强杀、无手动删锁。此证据覆盖两个真实宿主争用同一手机，不替代两台手机并行、全部宿主组合或断连验收。

### 2026-09-20 设备占用提示本地化

- 共享工作台将 `device_busy:` 错误显示为中文，说明应在占用宿主停止任务、确认停止后重试；保留错误码。父任务汇总也展示分支提示，其他分支结果保持原样。
- 只改变展示，原始错误与任务记录保持不变。
- 宿主模式嵌入式浏览器测试通过，覆盖占用提示、父任务汇总、其他错误不被改写及原始记录保留；这是模拟浏览器验收，不是新一轮真机验收。`git diff --check` 通过。
- 此提示改动尚未重新打包安装到三个宿主。

### 2026-09-20 WorkBuddy 候选包同步与隔离安装验证

- WorkBuddy README 删除过期的新任务 BYOK/Pi、关闭宿主继续执行与跨宿主不支持互斥说明；按当前 broker 的 HostExecutor 接线描述宿主 next/decide、自动分支、首页待领取和终态证据。Skill 旧流程的生命周期措辞同步澄清。
- `npm run pack:release` 通过：150 项 Vitest 测试、2 项共享构建边界测试、TypeScript/build 和产物校验。
- 当前 `workbuddy-plugin/dist/opengui-mcp-0.4.0.tgz` SHA256：`1b2f49a78577a98121e2be0e600d8b0329d00fa4ccb32b6debf9141efa57939d`。包含最新共享排序、停止提示、坐标契约、占用提示和工作台修正。
- `npm run smoke:packed` 全部通过：隔离新缓存与离线缓存、18 个工具、只读空设备发现、安装/幂等/回滚凭据、保留其他 MCP/Hooks。测试拥有的 ADB 和临时 broker 已退出。安装 fixture 模拟 WorkBuddy 5.5.6 行为，不等于实际宿主已升级。
- 实际 WorkBuddy 5.5.6 窗口确认旧只读任务完成；关闭其旧工作台。`check-upgrade.js` 对仍存活旧 broker 返回 `upgrade_blocked`，未替换实际配置、未强杀后台。实际宿主仍为之前 fbf1e5a 候选，后续需正常断开 MCP、等待 idle exit，再安装并验收新包。

### 2026-09-20 10:15 WorkBuddy 实际升级

- 检查旧版本 7 个父任务与 6 个分支的最新 journal 均为终态。通过 WorkBuddy MCP 管理 UI 关闭 OpenGUI；旧 broker PID 14318 正常退出，无强杀。
- 从正式本地安装脚本安装候选 `1b2f49a78577a98121e2be0e600d8b0329d00fa4ccb32b6debf9141efa57939d`，安装检查返回 `upgrade_ready`。配置、Skill 备份及回滚凭据保留在 `~/.workbuddy/opengui/local-install-154e208fa8284598.json`，此次备份时间戳 `2026-09-20T02-13-54-253Z`。
- UI 恢复 OpenGUI 后显示绿色。实际 MCP PID 80417、broker PID 80854 均来自上述新哈希目录；67 个安装 JS/manifest/Skill 文件与当前构建逐字节一致。
- WorkBuddy 桌面输入框 `/hooks` 显示无匹配结果，未据此声称 Hook 审核通过。已清除该草稿并发起限定只读工具/工作台验收；无新手机任务或动作授权。

- 实际 WorkBuddy Deepseek-V4.1-Flash 只读验收已完成：list_devices 返回 PKV110 connected/authorized；list_tasks 返回该会话已完成的 76b64878 历史任务；open_workbench + present_files 成功打开新后台工作台。
- 原生 UI 直接确认：首页一个任务输入、自动调配设备、无手机/模型下拉框；最近任务按时间显示；设置页只显示宿主执行与本地服务说明，没有独立模型配置表单。本轮未创建或执行手机任务，中文输入等新版真机执行仍待验收。

### 2026-09-20 10:18 WorkBuddy 新版中文输入真机验收

- 实际安装候选 `1b2f49a78577a98121e2be0e600d8b0329d00fa4ccb32b6debf9141efa57939d`，WorkBuddy 5.5.6 / Deepseek-V4.1-Flash，通过宿主 run_task、next/decide 与 present_files 执行；未使用外部模型、shell、原始 ADB 或 legacy 手机动作。
- requestId `wb-chinese-20260920-1017`；父任务 `0a74a4a7-dd43-4f73-b0de-349874656edf`，分支 `e85196a1-7b05-4484-a1ea-ab8b4ebb6da1`，均 completed，checks passed。任务限定 PKV110 系统设置搜索，不修改设置，最多 6 次动作。
- 实际 WorkBuddy 面板可见首帧与实时播放。宿主先清空已有“版本”，重新聚焦并输入中文；一次动作因 stale_observation 被拒绝，随后重新观察。Journal 共 4 次 action_intent、3 次 action_delivered、1 次 action_rejected；界面显示“已完成 · 4 步”。宿主文字称 3 次动作指送达数，不能据此把尝试数写成 3。
- 独立查看了清空后截图 `292c1f4a-f7a8-4d05-8b20-c29c40aff218.jpg` 与终态 `a61a45ea-f5d3-472b-af31-50c34c6695a5.jpg`，路径均在 `~/.workbuddy/opengui/phone-agent/evidence-v1/`。前者显示空搜索框，后者显示“版本”及版本信息、版本号、基带版本、内核版本、Android 版本等结果，排除了沿用旧查询的假阳性。
- 终态证据 `phone-observation-8874ac75-ecfe-41f1-bfc8-557ae1fdfa4b-13`，575×1280，于 10:18:28 独立 observe 保存，并与 checks.evidenceId 一致。实际工作台显示已完成与正确画面。
- 此项证明该宿主/模型/候选的这次中文搜索执行成功；不替代 DSH Grok 中文输入、多机并行及其他异常验收，也不能据一次成功断言所有模型的坐标定位问题已修复。

### 2026-09-20 10:22 DSH Grok 有界中文搜索仍受阻

- 实际已安装 DSH 候选 bbf1ed5488dc / DSH 0.1.1-rc.2 / Grok 4.6，requestId `dsh-chinese-search-20260920-1020`。父任务 `4286f78d-16a5-4e75-8822-c576ead49a24`，分支 `8912c2bd-cc86-4246-b018-12c983587c80` 均 blocked，3 次 tap，无 text。
- 从现成设置搜索结果页开始，真实首帧已在 DSH 工作台可见。模型拟点击清除，实际返回设置首页；随后两次拟点击搜索栏未产生焦点，遵守两次无进展停止条件，独立 observe 后报告 blocked。不能把模型自报“已清空旧查询”当作清除成功证据。
- 两次搜索框 bbox 为 `[70,250,500,330]` 与 `[48,242,760,340]`，中心 y=290/291。独立查看终态 919×2048 图像，实际搜索框约在 y=403–505；模型提交的坐标不覆盖目标。此事实定位到提交动作前的视觉定位结果错误，不足以断言供应商内部缩放原因。
- 终态证据 `phone-observation-1d336dcd-9359-422b-8ed8-de0b5d4d1657-5`，本地文件 `~/.local/share/opengui-dsh/phone-agent/evidence-v1/3847d554-f602-440e-976f-4f078268a9ae.jpg`，checks failed 且 evidenceId 对齐。未修改设置或进入其他应用。
- 后续应先做无手机动作的定位对照，验证宿主实际传图与模型坐标输出；不继续以重复真机点击或未经证据支持的统一缩放系数掩盖问题。DSH 中文输入仍未验收通过。

### 2026-09-20 10:26 DSH 离线定位对照

- 同一 DSH/Grok4.6 会话仅调用原生 `read_image` 读取前次终态 JPEG；未创建任务、未调用手机操作或 shell。三个 bbox 输出：设置标题 `[42,170,200,252]`、搜索栏 `[36,276,872,368]`、登录卡片 `[36,400,883,558]`。搜索栏原图实际约 y=403–505，离线读图仍定位错误。
- read_image 返回 PNG 附件 `sha256:a5812344e88f09617d8a1c7fd6b63fb4b576ab2472ea0e9a7edd142465389c28`，160030 bytes，919×2048；原 JPEG 128704 bytes，SHA256 `46569424aa48c00d3ad20e2fdf727a15b314f6a82d86f8d5da2f75a4979c8060`。实际查看了该 PNG，画面正常且与原截图视觉布局一致。两者解码后均 919×2048 RGB；像素并非逐字节相同，不能写成无损一致。
- 本地安装的 dsh-tool-fs read_image 通过 attachments.saveImage 保存文件；dsh-llm-pi-ai userContent 从 requestImages 取 version.data 和 version.mediaType，并附 requestImageHandleText。此静态接线与附件验证不能证明供应商内部处理无缩放。
- 对照结果说明坐标偏差可在 OpenGUI 动作通道之外复现。尚不能区分 DSH 后续传图处理、供应商图像编码与模型定位能力；不以模型自报“未缩放”作为链路证明，不改 ADB 映射来补偿未证实的固定系数。下一步应做受控尺寸/传图对照或请求级图片验证。

### 2026-09-20 10:30 本地请求图像处理与相对坐标对照

- 检查实际安装 dsh-llm-pi-ai 的 prepareRequestImages → attachments.readImageRequest → dsh-attachment-local createRequestImage。默认单图像素预算 4194304、字节预算 1048576，图像在预算内会原样返回。
- 对实际 PNG 附件调用安装包导出的 readRequestImageFile，使用上述默认策略，输出 919×2048 / 160030 bytes，Buffer 内容与附件完全一致。这是本地函数实测，非网络请求抓包；不能单独证明当前网关或供应商处理不变。
- 同一 DSH/Grok 会话重新 read_image，改为先报归一化中心再乘原图尺寸。输出搜索栏 (0.50,0.157) → (459.5,321.5)，登录卡片 (0.50,0.234) → (459.5,479.2)。与原图实际搜索栏中心约 y=454、登录卡片中心约 y=640 不符；相对坐标提示未解决定位偏差。
- 两次离线对照均无手机动作。已获得足够证据，不继续重复同一提示/真机点按，也不把不可靠的固定缩放系数写入动作映射。后续定位需要请求级传图证据或另一受控宿主模型对照；其他产品对齐工作仍可独立推进。

### 2026-09-20 DSH 工作台回复唤起修复

- 根因：首次提交会发送 `opengui-task-accepted`，但等待用户后的 resume/steer 仅写入记录，没有通知宿主；面板原先以 taskId 永久去重，也会阻止同一任务再次接手。
- 等待用户或业务澄清后的成功回复新增 `opengui-task-continued`，携带已保存的 taskId/sequence；面板校验精确 iframe 来源、origin、UUID 与正整数事件序号，以会话和事件身份去重。执行中的普通补充仍在下一决策边界消费，不额外唤起宿主。
- 自动化：DSH 320 项测试、构建和插件结构校验通过；嵌入工作台浏览器流程通过首次提交、业务澄清回复、等待用户后无文本继续、重新观察及终态证据。验证同一任务收到两个不同序号的继续通知，未重新创建任务。
- 本次尚未升级用户正在运行的 DSH 安装；浏览器夹具使用模拟设备与宿主决策，不能视为真实宿主模型或真机继续流程验收。

### 2026-09-20 DSH 宿主接手结果确认

- 核对本地开发依赖与实际安装的 DSH 0.1.1-rc.2：`session.command()` 仅返回命令匹配结果，不能证明 handler 成功。
- 工作台现在从当前会话的公开 snapshot/subscribe 接口等待匹配的新增 command outcome。排除旧记录和其他任务命令；明确失败可重试，30 秒未确认显示结果待确认，不自动重发。命令回包丢失同样保留未知状态，避免重复宿主轮次。
- 回归覆盖已匹配但执行失败、旧记录、其他任务、同步完成、超时未知和订阅释放。DSH 322 项测试、构建、结构校验通过；本轮未更新安装态，未将源码验证等同于真机验收。

### 2026-09-20 DSH 接手修复安装验证

- 通过正式 profile 插件安装命令更新 DSH web profile，版本仍为 0.1.13，候选 SHA256 `f267b6ca3b0f6c0a7be9cada572926b9d192734653a5da71c2661c7e6b486266`。升级前 worker ping activeTasks=0，正常 shutdown 返回 stopping=true；LaunchAgent 正常停止和启动。
- 回滚备份 `~/.dsh/backups/opengui-handoff-20260920-104150`；安装后 client/index/phone-worker/manifest 与本次构建逐字节相同。实际 DSH 0.1.1-rc.2 页面恢复，历史保留、首页宿主模型执行且无模型/设备选择框。该候选独立打包兼容性检查通过。
- 真实工作台测试父任务 `08c444cb-0997-49e4-bdeb-78878d1d853f` 已从首页创建，经 Grok4.6 返回业务澄清后结束宿主轮次；在工作台回复后原父任务 sequence 从 2 增至 3，恢复 preparing。后续等待/继续和终态证据仍需核对，不能仅凭 preparing 宣称验收完成。

### 2026-09-20 10:48 真实 DSH 工作台双次继续通过

- 在已安装 f267b6ca3b0f 候选、DSH 0.1.1-rc.2 / Grok4.6 上，从工作台首页提交父任务 `08c444cb-0997-49e4-bdeb-78878d1d853f`。规划澄清后宿主轮次结束；工作台文字回复唤起下一宿主轮次并创建唯一分支 `1d6d159d-5a58-4901-9caa-b8c4cf6507dc`。
- 真实视频首帧可见。首次 observe 后 help 等待，宿主再次结束轮次；不输入文字点击“已处理，继续”后第三个宿主轮次启动，重新 observe 并完成。全过程无 action_intent/action_delivered，steps=0；没有点击、输入、启动应用或重复创建父任务。
- 父任务 sequence=13 completed；子任务 sequence=11 completed，事件包含 user_help_requested → instruction_accepted → user_help_resolved → observation → result_proposed → settled。
- 两张观察分别采集于 10:46:09 和 10:47:58。终态检查 passed 指向 `phone-observation-37d68917-72bf-4e32-999e-4821dcbce388-2`；已实际查看终态 JPEG `~/.local/share/opengui-dsh/phone-agent/evidence-v1/56eaa545-3c50-47bf-b032-3bd6ce546273.jpg`（919×2048），与报告的设置首页一致。工作台显示父子任务“已完成”及成功标准“已满足”。
- 此项证明 DSH 工作台澄清/用户帮助两条继续路径已由真实宿主闭环；不替代 DSH 中文输入定位、多机并行或其他宿主首页唤起验收。

### 2026-09-20 对齐审计与长目标文字层级

- 新增逐项验收表 `2026-09-20-host-alignment-acceptance.md`，区分被最新决定替代的范围、源码/自动化与安装/真机证据、尚未完成项。重新读取三宿主本地父任务日志后修正顶部概况：WorkBuddy中文已完成、DSH双次继续已完成，不能继续列为未测。
- `packages/workbench/DESIGN.md` 删除现阶段模型配置和后台独立模型循环的过时约束，与宿主唯一模型执行决定一致。
- 长目标详情改为首句标题与可原位展开的完整内容，避免整段验收要求作为大标题挤占首屏。设备页文案改为每个执行分支固定手机，避免把父任务误写成只能一台。事件、目标、成功标准与导出内容不变。
- 34项共享phone-agent测试通过；嵌入浏览器宿主模式通过长目标展开/收起、原文保留、澄清和等待后继续、终态证据。实际查看375px规划页及1280px完成页截图，无横向溢出。此轮UI尚未打入各宿主安装包。

### 2026-09-20 10:58 DSH 主工作台与独立投屏分离

- DSH CoremateView 将旧设备墙收进“独立投屏与设备选择”，默认不挂载 PhoneStream，也不轮询旧视频状态。独立投屏/选择工具保留；旧版手机任务的非 idle 阶段仍自动展开其首帧观看入口。新任务无需使用旧选择框。
- 322项DSH测试、构建通过；补充旧任务自动展开后重新构建。候选 `20459c8a3245aa55ea8e9947ade23631ab73079bdb0cd74484779520a50d2239` 已经正常关闭空闲worker后安装到web profile，备份 `~/.dsh/backups/opengui-layout-20260920-105638`，四个关键产物逐字节对齐。
- 真实DSH页面验证默认折叠、展开可见PKV110选择与独立窗口入口、收起后设备照片墙退出DOM；主工作台与历史正常。已打开原完成任务08c444cb，实际截图确认首句标题与完整目标折叠入口，原任务仍为completed。此轮没有创建新手机任务或操作手机。
- 自动展开旧任务属于源码行为，本轮没有发起legacy手机控制验收；不把折叠区可展开等同于旧任务全链路通过。

### 2026-09-20 父任务结果页证据直达

- 纠正父任务结果页隐藏证据区的问题：在原页聚合各子任务截图，以所属taskId与evidenceId构成唯一选择项；标注手机、采集时间、尺寸与“核验引用”。文件仍通过已有分支级证据端点读取，不复制或修改记录。
- 完成后默认显示检查结果引用的截图，避免保留执行前的旧观察；用户仍可选择历史截图、打开原图。
- 34项共享phone-agent测试通过；嵌入浏览器流程确认父任务无需跳转即可加载真实JPEG，URL归属实际子任务，默认文件与终态证据一致。375px截图 `plugins/opengui/.artifacts/workbench/parent-evidence-narrow.png` 已渲染检查。夹具为合成设备，不是真机。此变化尚未进入当前已安装候选。

### 2026-09-20 11:03 DSH 1280像素受控输入对照

- 同一DSH会话和Grok4.6，仅使用原生read_image，无OpenGUI工具、手机动作或shell。将此前终态设置截图919×2048等比例缩小到574×1280 PNG，保存在本地忽略的 `.artifacts/vision-probe/settings-1280.png`，不修改原始证据。
- 实际查看缩小图：搜索栏约y=252–316，中心约284。模型返回标题 `[26,118,122,168]`、搜索栏 `[24,196,550,254]`、登录卡片 `[24,276,550,376]`；搜索中心(287,225)，归一化(0.50,0.176)。中心仍落在搜索栏上方。
- 此结果否定“仅将OpenGUI长边2048改成1280即可解决当前定位”的假设。没有修改编码尺寸或坐标映射；当前DSH中文输入仍未通过。单次同会话对照不能定位到供应商内部处理、模型视觉能力或长历史锚定，后续需要隔离上下文或请求级图像证据，不能重复无进展真机点击。

### 2026-09-20 11:04 DSH 新会话只读定位对照

- 新建临时 DSH 验收会话，保留 Grok4.6，使用同一张 574×1280 PNG。仅调用原生 read_image，没有 OpenGUI 调用、shell 或手机动作；新会话仍包含宿主系统说明，不能称为无系统上下文实验。
- 模型返回标题 `[32,118,148,176]`、搜索栏 `[24,198,550,268]`、登录卡片 `[24,292,550,412]`，搜索中心 `(287,233)`、归一化 `(0.500,0.182)`。实际搜索栏约 y=252–316，返回中心仍在其上方。
- 排除“只需清除旧会话坐标历史即可解决”的解释；尚不能区分请求图像处理、网关或模型定位能力。保留受阻状态，不补偿坐标，不继续重复失败点按。
- 最新共享结果页改动后，Codex `pnpm check` 通过（2 项共享构建测试、139 项 Vitest、构建及校验）；WorkBuddy `npm run check` 通过（2 项共享构建测试、150 项 Vitest、构建及校验）。本次构建未升级实际安装；父任务证据直达仍属于源码与浏览器夹具证据。

### 2026-09-20 11:13 多分支证据回归与 DSH 实际安装

- 浏览器夹具新增两分支证据逐项切换，核对图片地址、原图链接、设备名称，以及正常状态轮询后保留用户选择；再进入单分支详情确认原证据路径兼容。完整浏览器流程通过，包含四机排队、停止、历史与用户帮助恢复。合成手机和模型不构成真实多机验收。
- 首次新增测试误点结果页不可用的首页刷新按钮而失败；改为等待正常状态轮询后重跑通过。实际查看 `multi-evidence-narrow.png`，证据可见；已结束分支仍占据空白投屏区域，保留为后续视觉问题。
- DSH 构建与 0.1.1-rc.2 安装包兼容检查通过。新候选 SHA256 `e4cd98712663bc3830d9bbd3c6187d4d503bec1e61bd760d646dbc7db160e64e`，正常关闭 activeTasks=0 的 worker 后安装、重启 LaunchAgent。备份 `~/.dsh/backups/opengui-evidence-20260920-111144`；client/index/phone-worker/manifest 与构建产物逐字节一致。
- 真实 DSH 首页仍显示宿主模型执行、自动调配，无模型选择。打开原父任务 `08c444cb-0997-49e4-bdeb-78878d1d853f`，证据列表显示两张截图并默认选择 10:47:58 的核验引用。图片实际加载为 919×2048，文件 `56eaa545-3c50-47bf-b032-3bd6ce546273.jpg` 与终态记录一致，已在面板截图中看到系统设置首页。
- 本轮未创建手机任务或发送手机动作，未更新 WorkBuddy/Codex 安装，不宣称整体对齐完成。

### 2026-09-20 结束任务投屏占位修正

- 共享工作台按分支活动状态挂载投屏地址；分支结束后隐藏 iframe 并清除 src，保留名称、状态和详情入口。单任务结束后收起手机画面区域，结果区使用单列，避免空白实时画面挤占结果。
- 宿主嵌入浏览器流程通过：运行时画面高度与首帧仍正常，结束后所有分支 iframe 隐藏且无 src，终态证据仍加载。完整浏览器流程通过双分支切换、单分支详情、四机排队、停止和历史；34项共享任务测试及DSH构建通过。
- 已查看1280px宿主结果页与375px多分支截图，结束分支不再有手机高度的空白框。这是合成设备浏览器证据；该轮源码尚未更新实际安装，DSH当前仍为e4cd98712663候选。

### 2026-09-20 WorkBuddy MCP 初始化契约对齐

- 发现 MCP server 的初始化 instructions 仍要求默认先 open_viewer/open_session，与已更新的宿主任务 Skill 冲突。现改为默认 open_workbench → run_task 或领取既有首页任务 → next/decide，明确自动分配、首帧门槛、终态观察、同一决策去重及停止清理。旧入口仅用于显式逐步控制或纯查看，禁止混用于新任务。
- 初始化传输测试直接读取 MCP Client 收到的 instructions，防止仅修改 Skill 而遗漏实际协议说明。WorkBuddy npm run check 通过：2项共享构建测试、150项Vitest、构建和结构校验。
- 新打包候选 SHA256 `7d247f83a6475423899621322d3ab017c23123b304606d1fdfb907e3ba66206d`。打包 smoke 增加初始化说明断言；隔离新缓存与离线缓存均通过真实 stdio、18工具、broker和只读空设备发现。用户安装未切换；该变更不等于首页能自动唤起空闲聊天。

### 2026-09-20 11:24 WorkBuddy 新候选实际安装与只读验收

- 升级前检查本地15个父/子记录均为终态，WorkBuddy当前聊天无运行中的模型轮次。通过实际MCP管理页停用OpenGUI。首次安装被旧broker存活检查拒绝，未切换配置；关闭旧工作台投屏标签并等待60秒空闲退出后，确认 upgrade_ready，无进程强制终止。端口探测会重置旧broker空闲计时，等待期间停止重复探测。
- 安装候选 `7d247f83a6475423899621322d3ab017c23123b304606d1fdfb907e3ba66206d`，72个lib文件与构建一致。配置备份时间戳 `2026-09-20T03-23-06-142Z`，收据 `~/.workbuddy/opengui/local-install-154e208fa8284598.json`。实际管理页恢复信任后绿色连接，MCP与broker进程入口均指向新候选目录。
- 同一WorkBuddy聊天执行限定只读验收：list_devices/list_tasks/open_workbench及present_files完成，未创建手机任务。宿主返回1台已授权PKV110、该会话2条已完成历史；实际工作台仍可浏览既有历史。
- 实际打开父任务 `0a74a4a7-dd43-4f73-b0de-349874656edf`：完成分支不再显示空白投屏，标题可展开完整目标，结果与截图在同页。核验引用选中10:18:28、575×1280，已通过截图看到中文“版本”及匹配结果。
- 以上证明新版安装和既有证据展示，不替代首页空闲宿主自动唤起、多机或新的真机动作验收。Codex默认安装未迁移，DSH当前安装仍不包含最后一轮结束投屏布局修正。

### 2026-09-20 11:30 升级探测不再延长空闲后台寿命

- 上轮实际安装发现：check-upgrade 仅建立端口连接，但 broker 对所有 socket close 都重新计时，重复探测会让旧后台无法达到空闲退出时间。
- 调整为仅认证连接离开时重置计时；未认证端口探测或拒绝握手不改变已有期限。活动任务、真实客户端和投屏的保留检查不变。
- 新增持续端口探测下仍正常退出的回归，broker 13项通过；完整 npm run check 通过2项共享构建、151项Vitest、构建及结构校验。当前安装仍为7d247f83a647，本次修正尚未打包安装。
- 同轮核对WorkBuddy SessionManager.setCurrent会更新channel订阅的会话引用，固定会话接手仍未证明；记录已更新到workbuddy-host-handoff.md，没有启用生产channel或改变宿主权限。

### 2026-09-20 独立进程崩溃恢复验证

- 在临时目录和独立 Node 子进程运行当前共享 PhoneRuntime/HostExecutor 构建，使用合成设备，不接实体手机、不调用模型或凭据。提交父任务并确认preparing且宿主plan决策待处理，然后仅对该测试子进程发送SIGKILL。
- 两次分别启动新进程读取同一目录：原任务均恢复unknown；重复提交相同requestId返回原任务ID，未出现新的待决策请求，动作计数0，interrupted事件始终只有1条。测试进程退出，临时目录清理。
- 这补充了真实进程终止与磁盘重启读取证据，不只是同进程重新实例化。覆盖范围仅为待规划父任务；不能替代正在执行手机动作时崩溃、操作系统重启或三宿主实际后台恢复验收。

### 2026-09-20：动作在途中断状态修复

- action_intent 写入前将 lastExecutionState 设为 unknown；旧版未终结任务恢复时检查最后动作事件，仅修正尚无结果的 intent，保留明确拒绝/送达。新增三项恢复回归，共享 phone-agent 测试 37 项通过。
- 独立合成设备测试进程在动作派发后等待期间被 SIGKILL，重启后任务/动作均 unknown，动作计数为 1、无重放，原观察证据保留。测试目录已清理；未操作真机，也未证明租约回收。
- Codex check 142 项、WorkBuddy check 151 项及各自 2 项共享构建测试通过；DSH check 322 项和构建通过。
- 当前安装未包含本修复；安装成品、真实宿主崩溃、真机在途动作恢复仍需分别验收。

### 2026-09-20：最新 WorkBuddy 修复进入候选成品

基于已通过 check 的构建打包，候选 `workbuddy-plugin/dist/opengui-mcp-0.4.0.tgz` SHA256 `18f96ecd3c57720135903958b38602dbdf6fa57d07502c97384a2e4b7c2b41eb`，共享源码摘要 `b0f675eed35cdef5e583579c0e5200fb5d30744a8febb1ccb7bfeed78a1e872b`。直接读取归档内 JavaScript 确认包含旧 action_intent 恢复修正和 authenticated 才重置 idle 的逻辑；初次按源码变量名检查因打包器内联变量失败，改查真实打包语句后通过，未改动产物。

`npm run smoke:packed` 退出 0：预检、隔离安装、新缓存及离线启动、18 个 MCP 工具、宿主任务 instructions、只读空设备发现、幂等安装与回滚凭据夹具均通过。测试自有 ADB 和临时 broker 已退出。安装夹具不代表用户当前 WorkBuddy 已更新；实际安装仍为 `7d247f83a647…`，本轮未替换宿主或操作手机。

### 2026-09-20：工作台提交绑定宿主 owner

共享 TaskHost 将 owner 传给 Workbench.open，生成随机的会话路径；网页提交由服务端绑定 owner，避免统一 workbench 所有者被另一聊天先领取。新 HTTP 回归通过，共享 phone-agent 共 38 项；覆盖 A/B 两个 owner、重开稳定 URL、原页面归属、拒绝跨 owner 领取、请求体不能篡改归属、重复请求去重及无效路径拒绝。保留无宿主直开兼容入口，历史展示范围未改。Codex check 143 项及 2 项共享构建测试通过；WorkBuddy check 通过。真实 WorkBuddy owner 隔离和自动唤起仍需独立验收，未宣称完成。安装包 18f96ecd 不含这次会话绑定修改。

本轮 DSH check 322 项、构建及插件结构校验也通过；三宿主实际安装均尚未包含工作台会话路径修改。

### 2026-09-20：WorkBuddy 共享 MCP 连接的会话归属集成回归

新增真正 broker TCP/Hook/HTTP/TaskHost/HostExecutor 联调测试，两个 Hook 聊天共用同一 MCP 客户端：分别打开工作台后，从 A 旧页面提交，B 无法领取或在 next 返回中看到任务，A 获得计划决定并保持原 URL，最后显式停止。使用临时状态目录与 FakeHost，未调用手机动作。初次夹具缺少 videoStreams 导致运行时构造失败，补上禁止启动视频的替身后，broker 14 项全部通过。生产源码未新增变化，本轮不重复全量构建。原生宿主 Hook 事件及 channel 投递尚未验证。

### 2026-09-20：DSH 工作台真实聊天身份接线修正

跟踪新增会话路径发现 DSH `/api/opengui/phone-workbench` 仍用固定 `dsh-workbench` owner，会使网页提交与真实执行会话不匹配。PhoneWorkbench 现在发送当前 sessionId，缺失时不打开；HTTP 入口要求非空 sessionId 并传给 TaskHost，缺失返回 400。沿用其他同源 DSH HTTP 接口的 sessionId 契约；CoremateView 已按 sessionId 设置 React key，切换聊天会卸载旧面板。新增 HTTP 测试覆盖两个聊天和缺失身份拒绝。DSH check 323 项、构建与结构校验通过。

浏览器夹具改为通过 owner 绑定路径打开工作台并检查另一个 owner 无法领取，嵌入宿主模式通过：提交、澄清、等待后继续、真实浏览器首帧、宿主截图决定、终态证据；已查看 375px 终态截图。手机、模型及宿主都是测试夹具，不作为真机/原生 DSH 验收。

新 DSH 候选 `.artifacts/dsh-coremate-mobile-0.1.13.tgz` SHA256 `637e6b366bd78661485f24ce97300073e944906a85c869017c2febbd18244087`，尚未替换实际安装。直接运行兼容检查缺少必填 DSH_COMPAT_VERSION 因而退出；指定实际宿主版本 0.1.1-rc.2 后启动候选兼容检查。

DSH 0.1.1-rc.2 候选兼容检查退出 0：隔离包安装、Host 启动、runtime/task API、客户端注册通过。用户实际安装保持原候选。

### 2026-09-20 11:54：DSH 会话绑定候选实际安装及真机只读验收

- 更新前实际 UI 空闲，worker ping activeTasks=0，卸载工作台后通过 __shutdown__ 正常退出。web profile 配置、锁文件及原插件备份到 `~/.dsh/backups/opengui-session-binding-20260920-115138`。正常 bootout/bootstrap 原 LaunchAgent，使用官方 DSH CLI 安装哈希命名候选 `637e6b366bd78661485f24ce97300073e944906a85c869017c2febbd18244087`。安装输出存在宿主 peer 缺失提示；隔离兼容检查及随后真实宿主启动/客户端/任务均通过，未额外改装依赖。
- 实际安装的 index.js、phone-worker.js、client.js、runtime-manifest.json 与本次构建逐字节一致。重载原聊天，打开工作台，确认 iframe URL 使用 session 绑定路径、原历史保留、PKV110 就绪；模型仍为宿主 Grok4.6，无额外模型配置。
- 从实际首页提交只读任务，父任务 `b939fcec-009a-4b29-aef0-94b05bd536c5`，子任务 `d9c3d939-a878-47be-90ab-ca4fcbb64e7e`。通过页面消息自动交给当前聊天，parent/child owner 均为当前真实 session（非固定 dsh-workbench），最终均 completed，0 action_intent、0 步。运行期间实际查看可见手机首帧。
- 两次观察 `phone-observation-fef63ada-e6bb-42ed-ab57-a4f0af0389f1-1/-2`；终态文件 `bdcba234-e800-49d8-b8f7-ec892b35f1f9.jpg`，919×2048，核验引用 -2。实际工作台该图 complete=true、naturalWidth=919、naturalHeight=2048，且人工查看图片确认系统设置页。完成后分支视频已移除，结果及证据保留。
- 这证明本候选的单聊天首页接手、只读真机执行与终态证据，不证明跨聊天切换、中文定位、多真机或 WorkBuddy/Codex 首页接手。未发布。

### 2026-09-20 11:57：WorkBuddy 会话绑定候选安装

候选 SHA256 `7623cacbd3de47d81ebba98bdfd2e14ea6e99fbb83a90f2c7eab4ff8b2e178e3`，完整 smoke:packed 通过。安装前记录中 blocked1/cancelled6/completed6/unknown2，无活动任务；正常退出空闲 WorkBuddy，安装器确认 upgrade_ready、未终止后台进程，写入新 MCP/Hook/Skill 配置并保留备份，时间戳 `2026-09-20T03-57-08-425Z`。72 个 lib 文件与当前构建逐字节一致。

真实宿主第一次只读检查未通过：新不可变路径尚未信任，三个工具均未挂载。管理页已实际显示此提示，恢复同一 OpenGUI 的信任后看到绿色启用；随后在原聊天重试只读三工具检查。宿主对“空 Hook 等于 MCP 掉线”的自行推断不作为验证事实。

12:01 原聊天重试在24秒完成：三只读工具恢复，授权 PKV110 一台、所属历史两条 completed，present_files 打开实际工作台。通过原生 AX 确认 HTML 工作台 URL 含 /session/、页面显示1台就绪及宿主模型执行；未新增任务或手机动作。新 MCP/后台进程路径指向 7623cacb 候选。该验收证明新版已挂载，不证明页面自动唤起或跨聊天真实隔离。

### 2026-09-20 12:03：WorkBuddy 真实两聊天只读隔离

在实际安装7623cacb候选中，第二个已有聊天“安装 OpenGUI for WorkBuddy 公测版”执行 list_tasks/open_workbench，返回0条所属任务并由present_files打开不同 /session/ 工作台路径；原聊天“OpenGUI 工作台与设备任务列表”先前为2条所属任务。原生 AX 比对确认两个路径不同，切回原聊天后仍是原路径。原聊天已恢复，无新手机任务/动作。该证据补上真实 Hook 身份/页面绑定及工具历史列表隔离，未覆盖跨会话动作拒绝、自动唤起或权限转交。

### 2026-09-20：WorkBuddy 首页接手找到 MCP Apps 候选路线

实际安装源码存在专用 MCP App ui/message → adapter.requestSendPrompt(sessionId=currentConversation.id) 链路，宿主声明 message 能力并提供实例关联会话读取；其承载为专用 webview preload，普通 present_files 页面不直接适用。不同于 channel 的默认权限切换路线，值得优先验证标准 MCP App 资源接入。已记录具体源码、哈希及回执/会话切换限制于 research/workbuddy-host-handoff.md。未启用新权限、未发送真实桥接消息，不能宣称已接通。
