# Codex 原生工作台接手核验

更新：2026-09-21。状态：MCP入口已注册并原位更新personal安装，尚未完成真实插件调用或首页自动接手。下方带时间的小节保留各阶段证据。

## 当前缺口

Codex manifest已通过 `.mcp.json` 注册同一CLI构建的 `--mcp` 入口，校验及打包脚本检查固定入口配置。共享网页已有Codex消息桥，但实际宿主工具发现、逐调用身份、sandbox来源和首页接手仍未验证。不能用普通浏览器打开成功替代接手验收。

## 本机安装证据

实际应用位于 `/Applications/ChatGPT.app`，含Codex运行时。只读检查安装包app.asar，未修改宿主，也未调用私有接口：

- `thread-mcp-app-side-panel-tab-*.js` 提供原生MCP App侧栏容器。
- `app-initial-*.js` 的 `ui/message` 分支检查消息功能及可用composer，然后交给宿主跟进消息处理器；不是普通网页直接调用的公开全局函数。
- 同一实现为组件提供 `hostCapabilities.message`，并存在跟进消息授权确认组件。因此不能假设所有安装、视图和权限状态都允许自动发送。
- 宿主 `mcpServer/tool/call` 在有threadId时填入 `_meta.thread_id` 和 `_meta.threadId`。这提供会话归属的候选传递路径，但尚未证明本机插件每种模型调用和组件调用都收到它。
- 普通 `open_in_codex` 浏览器面板没有由上述证据证明具备MCP桥。

官方文档 [Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui) 描述 `_meta.ui.resourceUri`、`text/html;profile=mcp-app` 与 `ui/message` 标准；文档中的ChatGPT支持声明本身不足以证明当前Codex插件可用。

## 接续实施边界

1. 增加Codex原生MCP适配器，保留CLI及同一daemon/任务契约；先用不调用手机的协议测试验证资源发现及初始化。
2. 每次调用从经核验的宿主元数据获得owner；缺失或冲突拒绝。不可把模型参数中的threadId当作身份，也不可临时修改共享process.env去服务并发会话。
3. 从工具结果把owner绑定的工作台能力交给对应组件；原生组件通过标准桥通知所属对话。不得直接读取宿主数据库、凭据或内部IPC，也不另起CLI模型进程替代当前对话。
4. 核验原生sandbox/CSP、localhost画面与真实首帧，不能直接照搬WorkBuddy的localhost origin假设和专有session扩展。
5. 实际安装验收必须覆盖两会话归属、首页提交、补充指令、拒绝/未知消息送达不重发、手机终态证据；通过前保留未接通结论。

此路线无需创建独立Codex任务。personal插件已原位更新到0.3.0，安装证据见下；旧隔离候选的手机证据不能替代新原生入口验收。

## 23:50 MCP适配层源码与成品协议验证

- SDK精确锁定1.29.0。`src/mcp-server.ts` 按每次调用的host `_meta.thread_id` / `_meta.threadId`绑定owner，缺失、非UUID或冲突均拒绝；不从模型arguments或共享进程环境获取身份。
- 复用现有daemon请求、参数校验和15个工具；不复制模型循环、设备执行或状态存储。不自动重放失败请求。当前未暴露UI资源、未注册插件MCP配置，也未更换personal安装。
- Codex check最终通过151项Vitest、3项共享构建测试、构建及校验。初次失败分别为测试使用超出TS lib的Promise.withResolvers，以及归档正则误判依赖JSDoc中的import，均已修复并复检。
- 分阶段成品校验实际启动归档内 `cli.js --mcp`，完成stdio初始化与15工具发现，无身份调用被拒绝；未启动设备daemon或创建手机任务。两并发会话身份不串、模型参数不能覆盖身份、失败不重放已由MCP协议测试覆盖。真实Codex传递身份尚待验证。
- 归档导入检查改为TypeScript语法树，忽略注释/普通字符串，继续检查静态导入、导出、动态导入及literal require；增加假import不报错和真实导入不漏检回归。
- pnpm安装最初被@google/genai的构建脚本审核拦下；该依赖preinstall仅输出no-op，明确禁用其脚本后冻结锁文件安装通过，没有允许执行新的依赖脚本。

共享归档检查在WorkBuddy当前构建通过；DSH首次检查因旧coreDigest拒绝，重建后校验通过。没有更新DSH实际安装，也未把此次构建验证算成真机回归。

## 23:55 原生资源与消息桥接线

`--mcp` 已提供原生资源发现和读取，open_workbench描述带标准ui.resourceUri。资源只接受所属工具结果中的回环session能力地址；当前bootstrap严格要求回环HTTP sandbox origin，尚未证明真实Codex符合此条件。普通浏览器页面不初始化宿主桥。

Codex原生页面通过tools/call重新调用open_workbench，将宿主返回的owner绑定URL与当前origin/path对比；首次连接和每次发送前都校验。参数中不传owner，身份依赖每次宿主元数据。首页提交及等待后的补充接入该桥，消息超时保留已尝试标记、不自动重发。共享Workbench仅对对应宿主/标志允许owner绑定的原生文档导航；API同源规则保持，WorkBuddy的缺Origin例外没有推广到Codex。

回归：Codex check152项、3项共享构建测试、构建与成品协议校验通过；共享native桥15项通过（含Codex会话切换拒绝与未知送达去重）；WorkBuddy完整check通过。这些均是源码、协议与夹具证明，不是实际Codex原生面板/手机验收。manifest仍未注册MCP，personal安装未修改。下一步需以安装成品验证宿主发现、sandbox来源、逐调用身份与可见首帧。

追加验证：Codex资源bootstrap的2项回归通过；DSH完整check323项、构建和结构校验通过。未运行此次候选的真实Codex UI/真机流程。

## 2026-09-21 注册与personal原位安装

- 归档SHA-256：`b8ff3638fc16a5f3dd4d6e60ea165ef23f289cf4317ceebcda58e77b4e76ad54`。归档烟测通过钉版Node实际启动器发现15个工具和1个UI资源；缺身份调用被拒绝，没有启动ADB或修改宿主配置。
- 活动任务升级检查返回ready；保留原插件身份 `opengui@personal`，从旧版 `0.1.0+codex.20260906133201` 更新到 `0.3.0`。更新后重新查询插件列表，确认version为0.3.0且enabled为true。
- 原安装源、配置快照和收据已备份；没有卸载插件、创建新任务、提交或发布。备份含本机配置，仅供本地恢复，不纳入仓库。
- 当前任务的可调用工具清单仍没有OpenGUI。界面工具明确拒绝操作Codex应用，未绕过该限制。需宿主重新加载后验证工具和原生面板；安装成功不代表hostLoaded，也不代表此次候选的手机验收成功。
