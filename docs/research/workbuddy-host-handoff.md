# WorkBuddy 当前会话接手接口核查

2026-09-20，针对本机 WorkBuddy 5.5.6。此记录是实现前的接口证据，不表示首页唤起已经接通。

## 来源与范围

读取已安装应用的 `Contents/Resources/app.asar.unpacked/cli/dist/codebuddy.js`，SHA256 为 `e31404d8d1c40523eb4f8d9a18db173ca25ba20130637a433fc1e78b3fef8784`。没有修改宿主源码、权限设置或发送真实 channel 消息。发行版本变化后必须重新核查。

## 实际接线

- MCP stdio、SSE、HTTP 客户端连接后调用 `registerChannelIfApplicable`。普通 sampling 的命中来自 SDK/schema；所检查客户端构造没有声明 sampling 能力，未发现对应宿主业务 handler。不能据 SDK 包含 createMessage 就宣称可调用宿主模型。
- ChannelManager 检查服务端 `experimental['claude/channel']`，并遵守宿主 channelsEnabled 与 allowedChannels 配置。
- `registerChannelNotificationHandlers` 接收 `notifications/claude/channel`。宿主空闲时调用 AgentService.run，忙时进入 MessageQueueManager；这确实是值得继续验证的接手路径。
- handler 从 SessionManager 当前会话选择执行目标。通知 meta 被写入消息属性，不用于按 session_id 定位会话。不能把传入 taskId/sessionId 等同于已绑定打开工作台的聊天。
- 继续核对 SessionManager：`setCurrent` 在切换会话时执行 `sessionSubject.next`；channel handler 订阅该 subject 并更新内部会话引用。AsyncLocalStorage 的请求上下文并没有把这份订阅固定到创建工作台的会话。是否由桌面进程隔离进一步限制切换范围，尚需实际宿主验证。
- 没有 `claude/channel/permission` 能力时，空闲唤起分支会临时使用 BypassPermissions。声明权限转交后不执行该切换，但插件必须真正实现权限请求处理，不能只伪报能力。

## 隔离函数验证

从上述实际安装源码截取 handler，使用内存中的 SessionManager、AgentService 与 MCP transport 替身运行，不执行真实模型或工具：

| 输入 | 实际选择 | 权限变更 |
| --- | --- | --- |
| 当前会话 B，meta.session_id=A，无权限转交 | B | 切到 bypass |
| 当前会话 B，meta.session_id=A，有权限转交 | B | 未切换 |

这比字符串命中进一步验证了 handler 分支行为，但不证明桌面实例注册、会话切换、消息投递与 UI 反馈都正常。

本机只读切换“OpenGUI 工作台与设备任务列表”与“安装 OpenGUI for WorkBuddy 公测版”两个已有聊天后，MCP PID 28343、父进程 28318 与 broker PID 28671 均未变化，随后已恢复原聊天。没有发送模型请求、channel 消息或手机动作。此结果排除了直接假定每次切换都有独立 MCP 进程的接法；不证明上层逻辑 session 或客户端复用的全部细节。

## 接入前必须解决

1. 工作台与宿主连接绑定到明确会话；用户切换聊天、连接重建、多窗口时不得把原任务交给另一聊天。需核对桌面进程的 SessionManager 隔离范围，不能只依赖通知 meta。
2. 保留宿主权限策略。实现真实权限转交及取消/超时语义，或使用不会改变权限的宿主接口；不启用无权限转交的默认 channel 路径。
3. 通知成功只算送达；以原任务被正确 owner 领取作为接手证明。持久化事件身份、去重与结果未知处理，禁止超时后重复唤起造成重复执行。
4. 首发、等待用户后继续、宿主忙时排队、宿主切换、断连及停止均需实际宿主验收。现有 DSH followup 实现不能直接证明 WorkBuddy 行为。

当前保持生产 channel 能力关闭。此发现提供了可探索的当前聊天路线，不能把独立 CLI 任务当作用户已选择的替代路线。

## 工作台任务归属已补强（2026-09-20）

TaskHost 打开的工作台现在使用绑定 owner 的随机 session 路径。同一个 owner 重开获得稳定路径，不同 owner 使用不同路径；网页 run 的 owner 由服务端路径映射确定，不接受请求体覆盖。这样即使另一宿主聊天先轮询 next，也不能领取该任务。直接构造的无宿主工作台保留显式领取的兼容路径。历史浏览范围未在此次修改中改变。

真实 HTTP 回归覆盖：先打开 A、再打开 B，从 A 原页面提交仍属于 A；B 按任务 ID 和空 ID 均领不到；重复提交去重；伪造 session 路径被拒绝；没有手机动作。此验证基于独立 owner，仍需要核实 WorkBuddy 实际 owner 生成与会话切换；不能据此宣称 channel 的目标选择及权限转交已解决。

### Broker 连接级归属验证

新增 `workbuddy-plugin/tests/broker.spec.ts` 集成用例，使用真正的 broker TCP、Hook 认证连接、同一 MCP 客户端、TaskHost、工作台 HTTP 和 HostExecutor；设备适配器为 FakeHost，状态目录为自动清理的临时目录。先通过 Hook 分别以 chat-a/chat-b 打开工作台，再从 A 原页面提交；B 轮询该任务返回空决定和空任务列表，A 获得 plan 且返回 A 原 URL，最后由 A 停止。14 项 broker 用例通过。

这确认已实现的 Hook → broker → owner → 工作台 → mailbox 接线支持共享 MCP 连接下的两个聊天；没有向原生 WorkBuddy 发送真实 channel 消息，也没有验证宿主运行时切换聊天的 Hook 事件。生产自动唤起仍关闭，权限转交及实际投递目标仍待解决。

### 实际 WorkBuddy 两聊天只读验证（2026-09-20 12:03）

在已安装 7623cacbd3de… 候选的 WorkBuddy 5.5.6 中，原聊天“OpenGUI 工作台与设备任务列表”此前调用 list_tasks 返回2条所属已完成任务，open_workbench 返回绑定路径。切到已有“安装 OpenGUI for WorkBuddy 公测版”聊天，实际模型调用 list_tasks/open_workbench，并通过 present_files 展示工作台：所属任务数为0，原生 AX 中工作台路径含 /session/ 且与原聊天不同。随后返回原聊天，原工作台路径与先前完全一致，没有被第二聊天替换。

全程未创建手机任务、未领取待执行任务、未操作手机。此结果确认真实 Hook 聊天身份进入工具及页面路径，不能单独证明跨聊天拒绝执行或 channel 投递安全；前者仍有连接级回归，后者仍未接通。第二聊天使用自身原有 GLM 快速模型，未更改任何模型设置。

## 新候选：WorkBuddy MCP Apps UI 消息桥（2026-09-20 12:06）

从实际安装 app.asar 的 renderer 源码找到不同于 channel 的原生路线：

- `renderer/assets/safe-delete-events-DTZ_MsC7.js`（SHA256 `1c3e6a554e5616c21fabdef3bcdcddfd93e97c46286903755d4636fa62f1d3f5`）的 useMcpAppsHost 声明 hostCapabilities.message，McpAppsBridge 的 ui/message 交给 onUserMessage，再经 handleMcpAppUserMessage 调用 adapter.requestSendPrompt，包含 currentConversation.id 和 MCP App provenance。桥接有 active instance 检查；完整切换竞态尚需验证。
- 同桥 dispatcher 有 getWBCurrentSessionId，读取 instance.sessionId，再回退到宿主 sessionId；可继续核对实际 RPC 名称和实例绑定。未调用 host/getToken，也未读取或导出凭据。
- `resources/mcp-app-preload.js` 位于 app.asar.unpacked，说明此桥由专用 MCP App webview preload 接收 JSON-RPC postMessage，再通过 Electron ipc-message 转给宿主。普通 present_files 网页没有因此自动获得桥接能力。
- `renderer/assets/ui-docs-viewer-I1qnB70Y.js` 的 ui/message 返回 {}，只表示消息 handler 被调用；不能把它当成任务已领取。需要保持 accepted/delivered/claimed 区分与请求去重。
- 另有 widget:sendMessage 路线，来自可视化组件私有 iframe，handler 检查 event.source 与组件 iframe；不是给任意本地网页广播的入口。

下一步应优先验证标准 MCP App 资源与工具元数据能否将共享工作台挂入原生面板，再通过 UI 消息桥向宿主提交只含 taskId 的继续请求；不读取宿主凭据、不启用 channel 权限绕过、不假定普通网页支持此桥。需验证原会话身份、切换/关闭页面、忙时投递和真实领取回执。当前仅为源码证据，生产尚未接入。

### 原生资源契约补充核对

继续只读检查同一安装包的 `main/app-server-mcp-apps-host.js` 和 `renderer/assets/ui-docs-viewer-I1qnB70Y.js`，确认：

- 面板位置字段是工具 `_meta.workbuddy.ui.launchSurface = "panel"`；资源地址仍是 `_meta.ui.resourceUri`。不能把 launchSurface 直接写进标准 ui 对象并假定宿主识别。宿主按 request metadata、tool metadata、host default 的顺序选择位置。
- 原生 HTML 资源 MIME 为 `text/html;profile=mcp-app`。当前 OpenGUI MCP 服务只声明 tools，没有 resources/read handler，因此仅修改工作台网页不能使其成为原生 MCP App。
- 会话查询扩展的实际 RPC 名为 `host/getWBCurrentSessionId`。它不要求调用 `host/getToken`；查询结果也不能替代服务端 owner 校验。
- `proxyAppToolCall` 和 `proxyAppResourceRead` 将实例的 sessionId/projectId 传入 runtime；`handleAgentToolCall` 按 sessionId + toolCallId 去重。不同聊天复用同一个 toolCallId 时不应合并实例。
- 会话 worker extension resolver 将 conversationId 解析为真实 conversation，再调用其 worker extension；这比全局 current-session channel 更适合后续核对，但不证明 OpenGUI Hook 已在该路径触发。
- MCP App webview 装载专用 preload，通过 `mcp-app-client-message` / `mcp-app-host-message` 桥接。源代码中存在这一能力，不等于把现有本地 URL 导航进去后桥接、CSP、图片流和会话绑定都能正常工作；需独立实测。

尚未修改生产工具元数据或安装新的资源入口。下一次原生接入验收需要同时证明：资源可见、原会话身份、正常宿主权限、任务被原 owner 领取，以及切换聊天后不会投递给另一个聊天。不得用 ui/message 的空成功响应代替任务领取证据。

### 原生入口实现，尚未安装验收

新增 `workbuddy-plugin/src/mcp-app.ts`，MCP 服务在显式设置 `OPENGUI_WORKBUDDY_MCP_APP=1` 时声明工作台资源及原生 panel 元数据。默认普通网页入口保持不变。静态资源先完成 ui/initialize，再等待所属工具结果中的 URL；只接受 127.0.0.1、明确端口、无凭据、包含 owner session 路径的地址，随后导航到同一页面的 `?mcpApp=1` 入口。重复工具结果不会重复导航，不接受其他窗口消息作为工具结果。

共享 HTTP 服务只为 WorkBuddy、有效 session capability、顶层 document GET 增加跨站导航例外；API、POST、iframe、无效 session 和其他宿主继续使用原有同源检查。该入口没有发送 ui/message，没有领取任务，也没有改动设备执行或模型配置。

验证：MCP 及资源 bootstrap 19 项、共享 phone-agent 39 项通过；WorkBuddy build 和 validate 通过。测试覆盖资源发现及读取、未知 URI 拒绝、不触发 broker、非所属消息及不合法目的地址拒绝、导航去重，以及跨站例外的限制范围。尚未打包安装此变更，也未证明真实宿主导航后 preload/消息桥仍然有效；首页自动接手仍未完成。

### 安装成品与真实宿主反证（2026-09-20 12:26）

为原生页面增加只读握手：查询 `host/getWBCurrentSessionId`，与服务端返回的 workbenchOwner 比较，要求宿主具有 message 能力；不一致或十秒无响应时报错，不发送任务消息。普通页面不初始化此桥。四项测试覆盖普通页面、来源检查、匹配/错配和超时不重试。

新安装候选 SHA256：`492193e25242b84c93e353c42b521d168306ac35b7c8b5012430d743634b8927`。完整 WorkBuddy check 160 项 + 2 项 build 边界测试通过，共享任务 39 项通过，packed smoke 全部通过。初次安装被旧 broker 存活检查拒绝，旧配置未变；原生 MCP 管理页停用旧连接后再次安装，返回 no existing broker/no process terminated。新包 74 个 lib 文件与构建逐字节一致。安装备份时间为 `2026-09-20T04-23-14-367Z`。

本机仅给 OpenGUI MCP 添加 `OPENGUI_WORKBUDDY_MCP_APP=1`，添加前另存 `~/.workbuddy/mcp.json.before-native-workbench-20260920-1223`。宿主已信任并启用新包；该开关是本机验收状态，不是发布默认值。

原聊天实际只调用一次 open_workbench，16 秒完成并返回 URL；没有 present_files、手机任务或设备动作。原生面板没有出现，原有浏览器产物显示暂无数据。宿主 `mcp-apps-diag.log` 在 04:25:39–04:25:53 UTC 仍报告 catalog acceptedCount=0，收到的调用名为 ToolSearch/DeferExecuteTool，而非可匹配的 MCP App 工具；结果确有 structuredContent.url。不能据此断言标准 MCP Apps 不支持 stdio，需要继续定位目录扫描及延迟工具适配。

直接使用当前安装配置启动独立只读 stdio 客户端，initialize/listTools/listResources 确认 resources 能力、`_meta.ui.resourceUri`、`_meta.workbuddy.ui.launchSurface=panel` 和 HTML MIME 均存在。未连接 broker 或操作手机。这将下一步范围缩到真实宿主目录发现/转发路径，而不是 OpenGUI 服务端漏发元数据。当前仍未实际运行页面桥接、宿主接手或跨聊天执行验收。

### 自定义 stdio 不在目录发现范围（2026-09-20 12:31）

安装包 `main/app-server-mcp-apps-host.js` 实际构造 `CompositeMcpAppDiscovery([remoteRuntime, new StdioMcpAppDiscoverySource(new BuiltinLocalMcpAppDiscovery(...))])`。remoteRuntime 的 listAppToolDiscovery 对非远程配置返回 skipped；`main/stdio-mcp-inspector.js` 的 BuiltinLocalMcpAppDiscovery.loadCandidates 只枚举受信任的 bundled workbuddy-builtin/mcps。没有扫描自定义 stdio 配置的第三个来源。这解释了新插件正确返回元数据，目录却仍 acceptedCount=0 的实测结果。不能通过把 OpenGUI 冒充内置应用来解决。

新增实验性的 `workbuddy-plugin/src/mcp-http.ts`，复用现有 MCP 工具契约和 broker，供后续本机 HTTP 原生目录验证。监听 127.0.0.1 随机端口，使用随机 Bearer 凭据、Host/Origin 校验和带上限的 MCP session 集合。HTTP session 关闭只关闭协议会话；多个 HTTP session 共用一个延迟建立的 broker 连接，避免宿主 inspector 或单次工具请求断开时中断手机任务。整个 HTTP 服务关闭时才释放 broker。

两项真实 HTTP/SDK 客户端测试通过，覆盖身份校验、外部 Origin/Host 拒绝、未知 session、资源读取、客户端终止后的下一会话及 broker 生命周期；构建通过。Host 头测试改用 node:http，避免 fetch 忽略自定义 Host 导致错误的测试前提。此模块尚未加入 CLI/安装器，也未替换本机 stdio 配置。还需要真实远程目录发现、Hook owner 接线、原生页面加载以及任务消息/领取验收，不能称为已支持的 HTTP 安装方式。

### 本机 HTTP 真实目录发现通过，面板仍空白（2026-09-20 12:37）

用当前构建启动有明确 PID/进程句柄的临时本机 HTTP 服务；凭据只写入权限为 0600 的临时 endpoint 配置，未打印。仅将现有 opengui MCP 条目临时切换为 type=http，保留原配置备份 `~/.workbuddy/mcp.json.before-native-http-20260920-1233`，从原生 MCP 管理页信任同一插件。

04:32:34 UTC 实际宿主日志变为 scanned=55 / acceptedCount=1 / liveApps=[opengui/opengui_open_workbench]。随后 resources/read 成功，HTML 1278 字符，MIME 正确，创建了原生 appInstance。原聊天又进行一次只读 open_workbench，12 秒完成，未调用 present_files 或任何手机任务工具。宿主创建第二个原生面板并保留 structuredContent.url。证据证明自定义本机 HTTP 能进入目录和资源解析链路，不能证明页面桥接或任务唤起。

实际截图：两个原生面板都空白，展开面板也没有内容。宿主 app.html 返回 HTTP 200、包含预期 bootstrap，CSP 允许 inline script；renderer.log 存在大量 ResizeObserver loop 警告，但尚未证明它就是空白根因。没有观察到页面成功初始化、session 查询或工作台身份检查。新标准 SandboxFrame 和旧 webview/preload 路径都存在于该宿主，不能再假定实际面板必然走旧 preload。

验收结束后只恢复 opengui 条目为已安装 492193e25242… 包的 stdio 配置，并移除实验 native 开关，保留其他 MCP 设置；两个新建空白面板已关闭。对本轮自建 HTTP 进程发送 TERM，进程句柄确认 exit 0，临时 endpoint 文件由正常关闭删除。没有停止用户宿主、强杀 broker 或修改手机。正常网页产物旧地址已失效，需要后续重新打开工作台；恢复配置不代表本轮已重新验收普通网页显示。

随后的常规入口恢复验收已完成：原聊天实际 open_workbench + present_files 在 9 秒内完成，AX 与截图确认首页表单、宿主模型说明、1 台就绪 PKV110 和任务入口重新可见，没有模型配置选择器，也没有发起手机任务。同一 owner 返回地址仍稳定；先前“暂无数据”不能据此判定后台 capability 地址已失效，实际重新展示原地址后成功加载。当前本机配置为 stdio、native 开关关闭、临时 HTTP endpoint 文件不存在。

### 空白的隔离复现与加载修复（2026-09-20 12:47）

使用实际宿主公开 sandbox-proxy HTTP 响应，在临时浏览器中装载 OpenGUI 原生资源；宿主消息用有界替身回应，工作台 API 用空设备/任务替身，未调用模型、ADB 或真实 broker。临时材料位于被忽略的 `.artifacts/native-sandbox-probe/`，不将第三方宿主实现加入公开源码。

修复前的浏览器证据：sandbox-proxy-ready → ui/initialize → initialized 均出现，随后导航到工作台被 `frame-src 'none'` 拦截，工作台 HTTP 请求根本未发出，并产生跨源 document 访问错误。这证明 bootstrap 能握手，但我们没有声明所需的本机导航能力；仅根据面板空白推断宿主没有挂载是不成立的。

修复：资源 `_meta.ui.csp.frameDomains` 声明本机 127.0.0.1 页面；bootstrap 在导航前上报尺寸，让代理停止自行测量，避免导航后继续读取跨源文档；将真实 sandbox origin 随原生地址传入。HTTP 工作台验证其为无路径/凭据的明确 loopback origin，只在 WorkBuddy 的有效 session 原生 GET 页面上允许该精确 origin 和 file renderer 作为祖先。普通页面 frame-ancestors 仍为 none，API 同源限制未改变，无效会话和非本机祖先被拒绝。

修复后两次隔离浏览器验证（HTTP 根页面、file 根页面）都完成：sandbox-ready → 初始化 → 尺寸通知 → 工作台再次初始化 → host/getWBCurrentSessionId → 本地 state 身份匹配。首页完整显示，连接状态为 connected，浏览器错误为零。25 项 MCP/桥接/HTTP 测试、39 项共享任务测试及 WorkBuddy 构建通过。此轮没有替换真实宿主安装；还需真实成品加载、嵌套手机 viewer 的祖先策略、用户提交/继续的 ui/message 与实际 owner 领取验收。


### 首页任务通知接线（2026-09-20 12:53）

原生桥新增 continueTask：握手成功后，校验任务 owner，每次发送前重新查询当前聊天身份，再通过 ui/message 要求宿主继续已有 taskId，使用 next/decide 和当前宿主模型，不另行 run_task。首页提交成功后先保留任务并切到详情，再尝试通知；等待用户处理或澄清的任务补充后也走同一入口。普通浏览器与 DSH 入口不受影响。

通知前按 owner/taskId/sequence 写入 sessionStorage。消息返回只显示已通知、等待接手；超时报告送达未知，不自动重发，同一序列不会再次发送。页面关闭清理挂起 RPC，身份不符不发送任务消息。此去重限于同一个工作台标签页；跨标签页、聊天切换与宿主实际领取仍需真实验收，不能将 RPC 应答当成执行证明。

新增四项桥接回归测试，覆盖已有身份和去重、任务及聊天错配、通知超时不重放、关闭页面清理。WorkBuddy 完整 npm run check 通过：166 项 Vitest、2 项构建边界测试、构建与发布结构校验。当前安装仍为此前的 492193 候选，原生开关关闭；本轮源码尚未安装，未声称真实首页自动执行已经通过。


### 原生面板真实显示与身份编码修复（2026-09-20 13:03）

候选 95b4c1032097a4336597e9822d60c481b851938c0f52fdcfcd7bfa8ab1a61c6a 已通过标准安装器安装；旧 broker 存活时安装器拒绝替换，关闭旧页面、正常停用连接后返回 no existing broker / no process terminated。75 个 lib 文件与本地构建逐字节一致。

通过已安装的 mcp-http 模块进行临时原生验收，宿主 resources/read 返回新的 frameDomains 元数据。实际 WorkBuddy 5.5.6 截图首次完整显示原生工作台首页，而非空白。顶部归属检查报告不匹配，未提交手机任务。只读工具结果和对应工作台 state 证明：MCP App 的 sessionId 是聊天 UUID，而 broker 的 owner 是 workbuddy: 前缀加 JSON.stringify([session_id, agent_id ?? null])。此前桥接直接拼接字符串的假设错误；已改为主聊天元组，并增加子 Agent 归属拒绝测试。未通过放宽归属检查解决。

同时为单个 viewer 增加经过 owner 检查的原生嵌入祖先；只在该 viewer 页面 GET 允许 file renderer 与精确 loopback sandbox，状态/API/frame receipt 的同源门禁不变，其他 viewer 不继承。8 项 viewer 测试及 39 项共享任务测试通过。最新修复重新打包的完整检查为 168 项 Vitest + 2 项构建边界测试，候选 SHA256 24edf5fd29d7d9a7b4fc3607b061b0c3b8df5991a15264edce46e4fb3fb4be9a。

首轮临时 HTTP 进程已明确 TERM 并 exit 0，正常恢复 stdio，仅关闭本轮两个原生面板。接着安装身份编码修复候选，继续真实握手和任务验收；不把面板加载成功当作宿主已执行任务。


### 身份编码候选复测仍受阻（2026-09-20 13:08）

24edf5fd29d7d9a7b4fc3607b061b0c3b8df5991a15264edce46e4fb3fb4be9a 已实际安装，备份时间 2026-09-20T05-04-27-807Z；75 个 lib 文件逐字节一致。完整 smoke:packed 通过：安装前检查、外部配置保留、隔离的新缓存/离线 stdio、18 工具、只读设备发现、安装及回滚收据验证。

真实宿主再次 open_workbench 成功，原生面板完整显示，但仍报告归属不匹配。通过对应工具结果的能力地址只读获取 state，确认 owner 为 workbuddy: 加 [聊天 UUID,null] JSON 元组；获取页面源码确认已包含 JSON.stringify([session,null]) 修复。没有绕过检查，没有创建/领取/执行手机任务。原先“编码修复后即可匹配”的假设被本次真实复测否定；还需要观察当前标准 McpAppHostRuntime 实际返回的 host/getWBCurrentSessionId 消息值，不能只引用旧 McpAppsBridge 源码作证明。

观察到关闭原生标签页后 WorkBuddy 仍保留页面连接，切换到另一聊天才释放；随后旧 broker 按 60 秒空闲策略自行退出。升级没有强杀旧 broker 或用户宿主。第二轮临时 HTTP 进程已 TERM、确认 exit 0，自动恢复为 24edf5 候选的 stdio，disabled=false、native 开关不存在。已在原聊天请求普通 open_workbench + present_files 恢复；最终显示状态另行验证。


恢复普通入口时首个工具调用被 WorkBuddy 的旧 HTTP proxy 拒绝（proxy is no longer active）；这发生在实验切回 stdio 后，不能泛化为正常使用会随机掉线。已进入原生连接器管理，为已安装的 stdio 候选重新信任/连接。后续验收须将配置恢复与宿主实际重连分别验证。

普通入口最终恢复证据：重新信任后，原聊天 open_workbench + present_files 在 11 秒完成；AX 与截图确认首页目标输入、开始任务、宿主模型说明、1 台就绪 PKV110、0 台占用。临时 HTTP 已退出、原生开关关闭；当前安装仍为 24edf5 候选。没有创建手机任务。


### 实际身份响应为 null；保留后台授权的兼容修复（2026-09-20 13:26）

临时只读 MCP App 身份探针只暴露一个诊断工具，不连接 broker、不访问手机。原工作台聊天即使 ToolSearch/重连仍复用旧工具索引；已有的“安装 OpenGUI for WorkBuddy 公测版”验收聊天成功发现新工具并打开原生诊断面板。未新建聊天。

真实截图显示初始化能力含 message.text/image/resourceLink；host/getWBCurrentSessionId 的原始 JSON-RPC 响应为 result:null，id:diag-2。这才是元组修复后仍不匹配的直接证据。不能再将旧 McpAppsBridge 的返回实现当成标准 MCP App 当前行为。

安装包 ui-docs-viewer-I1qnB70Y.js 的标准控制适配器 getWBCurrentSessionId 返回 sessionId ?? null；同文件实际 sendMessage 服务则用 artifact record.sessionId 调用 requestSendPrompt，并记录对应 sessionId。这提供了不同的身份来源：消息服务依附产物归属，但查询扩展未取得 sessionId。发送仍需实际验收，源代码不是发送完成证据。

共享原生桥现在只对明确的 null 返回采用产物消息通道；工作台必须已由服务端绑定到 WorkBuddy 主聊天元组，拒绝未绑定/旧格式/子 Agent owner。宿主返回非空身份时仍严格比较。任务 owner 必须等于页面 owner，消息仅携带现有 taskId；后台 host hook、mailbox claim 和 decide 的 owner 校验保持不变。通知应答不会把任务标成运行或完成，isError 也不视为成功，未知结果不自动重发。文案改为“已连接宿主消息通道”，不宣称已核实当前聊天 ID。

验证：WorkBuddy npm run check 通过，172 项 Vitest + 2 项构建边界测试、构建与结构校验；其中原生桥 13 项、broker 14 项。共享 phone-agent 39 项通过，包含非所属聊天不能领取/管理绑定任务的测试。本轮源码尚未安装，当前安装仍为 24edf5 候选。临时诊断进程已 TERM 并确认 exit 0，诊断配置条目已自动移除，原 opengui stdio 配置保留。下一项是将 null 兼容修复装入候选，在真实原生面板验证消息回到产物归属聊天，再执行首页只读手机任务。


### 普通工作台恢复与新候选打包（2026-09-20 13:31）

原聊天通过 open_workbench + present_files 在 11 秒完成恢复。独立 AX 检查确认真实工作台首页、新任务输入、宿主模型执行/自动调配设备说明、1 台就绪 PKV110、0 台占用以及历史任务可见；没有模型选择器。未提交新手机任务，未操作设备。

在上一轮完整 check 已通过且源码未再修改的构建上，通过 npm exec -- node scripts/package.mjs 打包 null 身份兼容候选，SHA256 为 1112e96b5b2fd65e9298f207975adad4065e0c27c1df4afbce7d98ccba6c779f。本轮仅生成安装成品，没有替换当前 24edf5 安装。真实原生首页消息发送、任务领取及最终证据仍未完成验收，不能将普通工作台恢复视为该闭环通过。


### 原生请求缺少 Origin 的真实复现（2026-09-20 13:44）

1112e96b 候选通过标准安装器安装，68 个 JavaScript 构建文件逐字节一致；安装器确认 no existing broker / no process terminated。真实原生页面显示“已连接宿主消息通道”，null 身份兼容握手通过。输入只读目标时草稿 POST 返回 Same-origin JSON required，尚未提交或执行手机任务。

普通 Chromium 嵌套 sandbox 夹具发送同样 JSON POST，Origin 存在；实际 WorkBuddy 原生只读诊断服务收到 method=POST、origin=missing、contentType=application/json、site=same-origin、dest=empty。诊断服务不连接 broker，不访问手机；只打印这五项归一化字段，不打印能力地址或凭据。旧聊天对临时别名仍有工具索引缓存，同名 open_workbench 的只读诊断替换成功获得实际请求。

修复为已注册 native origin 的 WorkBuddy owner 生成独立随机请求令牌，经同源 state 下发，前端 JSON 写请求携带 X-OpenGUI-Request-Token。仅在 Origin 完全缺失、Fetch Metadata 为 same-origin/empty、owner 令牌匹配时允许该原生请求；显式 null/外站 Origin、错误令牌、其他 owner、same-site/cross-site 及其他宿主仍拒绝。不放宽常规 Origin 路径，不修改后台任务领取授权。

共享 phone-agent 40 项通过（新增 native POST 拒绝矩阵与草稿写入），WorkBuddy check 172 项及 2 项构建边界测试通过。候选 SHA256 cfb5b56212b89d87b66bf0a5ebc16c79f25e47334572fd2928f6395555079777 已生成，安装及真实提交复测另记。临时身份别名及请求诊断进程已退出；恢复时曾由两个清理程序并发写入导致别名残留，已明确移除。后续配置清理必须串行。


### 首页原生唤起通过，嵌套可见首帧仍失败（2026-09-20 13:52）

cfb5b562 候选已安装，备份时间 2026-09-20T05-45-10-486Z，68 个 JavaScript 构建文件逐字节一致。原聊天“OpenGUI 工作台与设备任务列表”成功打开原生工作台，草稿输入未再出现 Same-origin JSON required。首页点击开始后，ui/message 立即在原聊天生成继续已有任务的用户消息，宿主自动开始执行；没有人工复制任务 ID，也没有新建宿主聊天。

父任务 4b38cfc2-f425-4d14-823b-09ed36c54eae 于 05:48:32.716Z 接收，05:48:49.835Z 记录宿主计划，分支 a09724dc-c7cb-449e-a78a-0298f3f2298c 于 05:48:49.888Z 进入 display_wait，05:49:19.897Z 因 display_timeout 受阻。父子 owner 一致，零动作、无截图证据。宿主已真实领取并决定分支，证明原生首页交回原聊天的路径通过；没有证明手机执行完成。

宿主回复把超时解释为“接手太晚，提交时已开始30秒倒计时”，与事件时间不符：首帧等待从分支创建后开始，而非首页提交开始。不得将这一模型自述作为根因证据。宿主后来展示独立取景页能看到设置画面，但晚于终态，不能补算本任务通过。

独立只读预览进一步观察到：原生工作台嵌套 viewer 的 HTML 正常加载，视频区域灰色、状态正在连接；普通展示页面能看到画面。尚未证明是 WebSocket Origin 缺失还是 frame receipt 拒绝，需继续针对真实嵌套链路定位。受阻任务未恢复/重建，预览已隐藏。临时 HTTP 验收进程已 TERM 并 exit 0，恢复已安装 cfb5b562 的 stdio 配置；真实普通入口重连另记。

Codex 最新自动化 145 项通过。完整 check 在新测试拒绝矩阵的 TypeScript 推断上失败，已显式标注 Record<string,string>[]，随后 build 和 validate 通过；未将首次 check 描述为全绿。该测试类型修正不影响已安装 WorkBuddy 产物。

恢复常规宿主入口时系统进入锁屏，CUA 明确返回无法自动解锁，未继续点击或绕过锁屏。文件侧复核已恢复 stdio、disabled=false、cfb5b562 候选、诊断别名不存在；这不证明宿主 UI 已重连，需要解锁后完成。


### 首帧回执 Origin 兼容与浏览器对照（2026-09-20 13:58）

只读检查 WorkBuddy 5.5.6 app.asar/main/index.js，确认 defaultSession 的 onBeforeSendHeaders 对 http://127.0.0.1 请求执行 delete requestHeaders["Origin"]。这与上轮实际 POST 诊断一致；该过滤器不匹配 ws://，本次没有放宽 WebSocket Origin 校验。

共享 viewer 的 frame POST 也受同一问题影响。新增例外严格限定：已有 owner 检查登记的 native viewer、匹配 Host、Origin 完全缺失、Sec-Fetch-Site=same-origin、Sec-Fetch-Dest=empty、JSON 内容类型、frame 路由。进入后仍验证当前媒体连接、deviceId、一次性 challenge、visible=true、10秒有效期及未关闭状态；不凭请求成功直接允许控制，不改30秒首帧期限。

新增回归证明未登记 viewer、错误 Origin/Fetch Metadata/类型、未收到媒体、隐藏页面、错误设备、伪造/重放/过期 challenge 均被拒绝；真正的 native receipt 通过后才建立首帧。WorkBuddy check 173项 + 2项构建边界测试通过；Codex 完整 check 145项 + 2项构建边界测试通过；DSH完整 check 323项通过。

隔离浏览器夹具 .artifacts/native-viewer-frame-probe.mjs 使用 file 根页 → sandbox → workbench → viewer 四层，发送合成 H.264 并在 HTTP POST 上去掉 Origin。新构建实际解码红色画面，首帧状态 true，关闭后1条流释放。相同夹具对当前安装的 cfb5b562 代码收到两个 frame HTTP403，首帧未确认，失败退出。夹具不连接真实手机，不能替代 WorkBuddy 实机首帧验收。

新候选 SHA256 349dcbfc462d5aab752a0c2d4e7f71f3a2486428fa9f6ec5d8a447a4e5257ce5 已打包，尚未安装。当前 Mac 仍锁屏，CUA 再次明确无法自动解锁；未绕过锁屏或进行 UI 点击。当前安装仍 cfb5b562，常规 stdio 配置恢复但宿主 UI 重连仍待解锁。


### HTTP 协议会话空闲回收（2026-09-20 14:03）

Mac 仍锁屏，未尝试绕过。继续完成原生 HTTP 接入的已知缺口：宿主 inspector 未发送 DELETE 时，原实现会永久占据16个协议会话名额。现在默认10分钟空闲后关闭单个协议会话，保留共享 broker；有未结束HTTP/SSE响应或工具调用时不回收。工具调用单独计数，避免客户端断开后后台调用尚未完成却被误判为空闲。

真实HTTP测试覆盖名额满时429、调用持续期间不释放名额、客户端中途断开仍等待工具完成、完成后回收且旧session404、新初始化恢复、共享broker不关闭。WorkBuddy完整check为175项 + 2项构建边界测试，构建/校验通过。新候选d55dfa7c27586a7f2c74dd7cc3496ecfcc2b5303be6b425c15054cf1c5e01478已打包，包含首帧回执修复，尚未安装。

这只补协议生命周期，不代表HTTP已成为正式安装默认入口；CLI/安装器启动、更新、回滚的HTTP接入仍待交付。当前实际安装保持cfb5b562/stdin配置（即MCP stdio），首帧修复真实宿主复测仍待解锁。

## 2026-09-20 22:52 原生首帧与只读终态真机通过

- 安装候选 SHA256 `d55dfa7c27586a7f2c74dd7cc3496ecfcc2b5303be6b425c15054cf1c5e01478`，68 个 JavaScript 文件与本地构建逐字节一致。
- WorkBuddy 5.5.6 原生面板首页提交，ui/message 自动进入原所属聊天；父任务 `fec88e7a-0434-4060-a49a-f6afc9c7707a`，分支 `eb4e4952-970a-4b1e-94c2-6e287dd2afaf`，二者 owner 相同。未手动复制任务 ID 接手。
- journal UTC：accepted 14:51:37.138，display_wait 14:51:48.462，started 14:51:50.588，终态14:52:07.164。真实原生面板显示 PKV110 设置首页，首帧约2.126秒。
- 两次观察，0次动作；新终态截图 `4761d42a-49a6-4a61-986d-d938d52d5811.jpg`，575×1280，14:52:02.626；成功标准引用第二次独立观察，父子均 completed。已人工查看截图。
- 本次使用临时本机 HTTP 验收入口；完成后正常终止该入口并确认恢复原 stdio 配置。此证据证明原生任务闭环，不代表 HTTP 安装、启动、升级及回滚已经产品化。

## 2026-09-20 22:58 持久 HTTP 启动与 launchd 重启验证

- 新增 `opengui-mcp --http`（macOS），使用当前 WorkBuddy 私有状态目录的 `native-mcp.json`；端口及随机认证令牌跨进程重启保持不变，配置不兼容、权限暴露、软链接及端口冲突均拒绝启动，不重写已有配置或驱逐监听者。启动输出不含地址和令牌。
- 新增 `nativeLaunchAgent`：按配置根生成稳定且隔离的 label，私有状态通过环境传入，Node 与入口通过 ProgramArguments 传入，包升级不改变 label。新增 HTTP/stdio 配置转换，清除旧 transport 字段，保留其他 MCP。
- WorkBuddy check：180 项测试及2项共享构建测试通过，构建与包校验通过。
- `node scripts/test-native-service.mjs` 在本机真实 launchd 上启动隔离服务、发送 SIGTERM、确认新 PID 及同一端点认证可用，确认401拒绝未授权请求，随后 bootout 并清理临时目录；未启动 broker，未调用手机工具。
- 以上为源码与隔离服务验收，尚未接入正式安装器，也未更新用户已装的 d55dfa7c2758 候选。后续必须完成带活动任务保护的安装切换、失败回滚及真实宿主重新连接。

## 2026-09-20 23:05 升级维护握手与配置转换

- 新增仅 installer 连接可调用的 `prepare_upgrade`：活动手机会话、持久画面、在途工具、活动任务或工作台请求均拒绝退出。普通 MCP 与 hook 不可请求升级，installer 不可调用手机工具。
- `prepareUpgrade` 持有私有 `upgrade.lock`，只与认证且版本兼容的既有 broker 握手，等待监听退出；不启动 broker、不发送进程 kill，不认识的旧版本/监听者拒绝升级。失败释放自己创建的锁，竞争安装不删除他人的锁。
- 后台连接、启动及新请求检查升级锁；已准许维护的工作台返回503，防止检查后又接受新任务。
- 配置脚本增加内部 `--transport http|stdio`，安装记录保存 transport 与 native server 哈希，重复安装保留已选 transport；用户修改过 HTTP 认证字段时报告 MCP_CONFLICT 并保留修改。HTTP 回到 stdio 时清除 URL/headers。
- 验证：WorkBuddy check 186项及2项构建测试通过；Codex check147项及2项构建测试通过，DSH check323项通过；test-install 包含 HTTP 重复安装、用户修改冲突及 stdio 回退，通过。
- 尚未把维护握手、launchd 替换和配置写入组装成同一安装事务；macOS 安装器仍默认 stdio。用户已安装候选未变更，完整安装失败回滚与真实宿主重连未完成。

## 2026-09-20 原生安装事务接线

- `stageNativeService` 在升级锁内校验旧 plist 所有权、暂停旧服务、验证新服务，然后由配置事务提交；失败恢复原 plist 和原加载状态。配置已提交而服务收据落盘失败时保留新服务和 pending 记录，避免新配置指向旧代码。
- `install-local --native-service` 接入上述事务；macOS 安装器在 WorkBuddy5.5.6+ 默认选择 HTTP，支持 `--transport stdio` 回退。普通配置模式保留兼容测试入口。
- 实际 launchd 隔离安装验证通过：首次安装、新版本启动失败回滚、后续升级、退回 stdio（服务卸载）、重新启用 native（同一端点与认证）。三份宿主配置在失败时逐字节保持原样；其他 MCP 保留。测试服务和目录均已清理。
- 打包候选 SHA256 `7a87d3f41d905a1c9667d9c0b02c33c819e5ec3e719de0f51e31016bea1486be`；WorkBuddy check186项和2项共享构建测试、包内容验证通过。完整发行安装器隔离验证正在运行，用户实际安装仍为 d55dfa7c2758。

### launchd 重复安装修正

发行安装器首轮隔离验证发现重复安装时 bootout/bootstrap 竞争：launchd 命令完成不等于标签记录已清理。候选7a87d3f4未通过发行安装器验证，不可视为可安装成品。现已保留同 plist 的健康服务进程，替换时等待标签确实消失，仅在自有标签缺失且 bootstrap 返回临时错误5时有界重试。

带同版本 PID 保留断言的隔离 native-install 再次通过，包括失败启动回滚、升级、stdio 回退与重新启用。最新候选为 `80e32b3ae85e8504d96d15ca0dd7901145b853700e0cfcf8ef776c93d9004f79`，完整发行安装器正在重跑。实际 WorkBuddy 已关闭旧验收页，MCP 显示未连接；当前本机 broker 端口检查为空闲，没有终止进程。实际安装尚未变更。

### 发行安装器成品通过

候选80e32b3a的完整发行安装器隔离实测通过，私有Node22.23.2、完整npm安装成品、含空格路径、外部MCP与Hooks保留、版本检查及真实launchd均覆盖。首次89.298秒，重复1.541秒；测试实例服务和临时目录已清理。随后开始实际 WorkBuddy 安装，尚待安装完成与宿主重新连接证据。

### 实际安装完成

80e32b3a候选已于2026-09-20 15:18:44Z通过发行安装器写入实际 `.workbuddy` 配置，26秒完成，76个JavaScript与构建逐字节一致。launchd自有服务 `org.opengui.workbuddy.154e208fa8284598` 实际running，MCP管理界面18/18工具、1资源，已重新连接。未使用临时HTTP脚本。当前会话的首页只读任务复验仍待完成。

### 安装成品首页真机闭环通过（23:23）

正式候选80e32b3a与launchd服务下，原生首页提交父任务 `1fa8b830-80fa-4810-bbc1-c1b8eac2d08c`，自动进入原所属WorkBuddy会话。子任务 `74ce6e11-e531-47d1-910d-ad911460f9a0` 15:23:24.220Z等待首帧，15:23:26.762Z开始执行（2.542秒）；两次观察、0动作，15:23:40.779Z完成，页面显示已完成。成功标准引用第二次独立观察。新终态截图 `62f5a46e-b5d8-4524-a27e-47a4effa3f73.jpg`，575×1280，15:23:36.558Z，已查看。全程未配置独立模型，未使用临时HTTP进程。正式服务保留运行供用户使用。

## 2026-09-20 23:28 正式安装补充指令与停止验收

- 原生首页父任务 `1f0cd52f-17ea-4b4a-a615-f8bd16c69a5b`，分支 `b26a068d-98ca-4eaf-a7ba-8d7625625cb4`：真实首帧及一次只读观察后，父子均 waiting，summary为“请从工作台补充下一步”。
- 从原生工作台提交补充指令，ui/message 自动进入原 WorkBuddy 会话，仍为同一任务ID；15:27:47.948Z instruction_accepted，15:27:47.956Z user_help_resolved，15:28:00.173Z新观察，15:28:03.384Z再次help等待。没有重新提交任务或手动粘贴任务ID。
- 工作台点击停止：父15:28:27.484Z stop_requested，15:28:27.502Z settled；分支15:28:27.491Z stop_requested，15:28:27.497Z settled。父子均cancelled，0动作，页面显示已停止、首页设备空闲。
- 宿主先前在完成/等待回复后自行 present_files 打开普通预览，会遮住原生页。补充要求“不另开预览”后实际遵守。现已把该要求写入 native bridge 接手指令；源码修正尚未更新已安装80e32b3a候选。

补充验收后已确认实体手机对应跨进程 lease 目录不存在，停止确实释放占用。native bridge 保留原面板的13项回归通过，类型检查/构建通过，修正包SHA256 `3ce291b98105680504615d84448419b8b293084ba4fdc3fee4894ef68b9aff6f`。正在用正式安装器对已运行的80e32b3a服务执行升级，以验证维护握手和端点保持；未手动停止后台。

### 3ce291b9 实际升级完成

正式安装器首次在原会话仍缓存原生面板时正确拒绝 `upgrade_blocked`，保留原安装和配置并释放升级锁。切离原会话使面板停止读取后，重试于2026-09-20 15:32:00Z完成，耗时3秒；旧后台通过维护握手退出，未手动终止进程。新安装76个JavaScript与构建逐字节一致，MCP配置与80e32b3a逐字节相同，端点和认证保持，升级锁已释放。23:36原会话单次调用 `opengui_open_workbench`，实际显示原生首页并接通宿主消息通道。

### 23:38 最新安装成品中文输入闭环通过

3ce291b9候选原生首页提交父任务 `b8b295a3-f3ca-4482-a596-adb19547119b`，自动由原会话Deepseek-V4.1-Flash接手，子任务 `a6e886f9-77ec-4fa7-801c-7ce602331334`。15:37:29.622Z等待首帧，15:37:31.757Z通过（2.135秒）。三次动作依次点击搜索框、输入“蓝牙”、点击取消；五次观察，无过期拒绝或未知动作重放。搜索截图 `b0af4d7b-5099-4f66-82ce-c16472b0886c.jpg` 实际显示中文及蓝牙匹配结果；终态 `160d8425-0677-49d1-85cd-5f1840bd718d.jpg` 为15:38:07.302Z新观察，575×1280，已查看确认返回设置首页。15:38:12.093Z父子完成，checks引用终态observation -13。

宿主最终回复完成后仍只有原生工作台一个标签页，未调用present_files覆盖页面；工作台显示“已完成 · 3步”。宿主关于历史4b38首帧失败的解释仍是未经证实的旧推断，不作为本次验收结论。本次证明当前安装的首页提交、宿主执行、中文输入、终态证据与原位结果链路；不证明三宿主全部完成、双手机并行或在途动作停止。

### 23:43 MCP 初始化呈现指令一致性

发现原生bridge已要求保留面板，但MCP初始化instructions仍无条件要求present_files。现按nativeWorkbench能力分流：原生模式调用工作台工具并保留同一面板，普通stdio兼容模式仍使用present_files。旧逐步viewer呈现说明保留。相关MCP、资源及bridge共32项测试通过；此修正尚未替换用户当前3ce291b9安装。
