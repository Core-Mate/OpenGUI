# WorkBuddy 仓库链接安装验证

验证日期：2026-10-06。宿主：macOS、WorkBuddy 5.6.2。此电脑原先已有本地 OpenGUI 候选版，因此不能把已有配置或设备发现计作一次全新安装。

## 原始短提示词

在 WorkBuddy 新聊天实际发送：

```text
安装 https://github.com/Core-Mate/OpenGUI
```

WorkBuddy 识别了已安装的 OpenGUI Skill，但接着反复尝试克隆整个仓库。首次克隆退出码为 137，之后仍未完成；约 4 分 45 秒时停止了该尝试。未观察到安装器执行或配置写入。结论：**本次短提示词安装未通过**，不能写成“一句话安装实测成功”。

## 公开安装器的独立检查

从 `opengui-workbuddy-v0.3.1` Release 下载 `opengui-workbuddy-0.3.1-install.command` 及相邻 `.sha256`，校验成功。安装器 SHA-256：

```text
c731ff61a591ddc44ebb5f8a4c41d7cb4471a8a7b3b0bd619f8077d2c2281732
```

运行 `--check --app /Applications/WorkBuddy.app` 返回：

```text
[HOST_HOOKS] The bundled CLI does not expose UserPromptSubmit. Upgrade to a compatible WorkBuddy build.
```

原因是公开安装器只检查 `dist/codebuddy.js`。当前源码安装器额外识别 `codebuddy-headless.js` 和 `codebuddy-lite-wb.mjs`，同机预检返回 `LIVE_PREFLIGHT_OK`、`PREFLIGHT_OK`。这些是预检证据，不等于完成安装。

## 本地候选包与宿主权限验证

在 WorkBuddy 内继续验证本地候选包时，三个文件校验通过，但原源码安装器被 `/bin/ps: Operation not permitted` 阻塞，返回 `HOST_PROCESS_CHECK` 和退出码 1，未写入配置。这与公开安装器的旧 CLI 路径问题是两个独立原因。

本轮修复：对于明确支持热安装的 5.5.6+，不再枚举宿主进程；旧版仍严格检查宿主是否退出，所有版本仍检查旧 OpenGUI broker。没有修改宿主权限。针对性回归覆盖拒绝 `ps` 时新版通过、旧版失败，以及其他既有预检情形。

修复后再在 WorkBuddy 执行一次候选包安装：通过宿主与 CLI 检查、依赖检查和缓存视频资源准备，随后因旧 broker 仍在线返回 `upgrade_blocked`（退出码 1），没有写入配置。升级保护仍然有效。本次使用的安装器 SHA-256 为 `6a8ce9087e761c7772711d1a5316669fccb6618bb342d017e364acc62af2e864`，候选包为 `c475baa5e2db8988655a6d0bd827b20192e9173569f1ddf17bb0de381b6b85c7`。

宿主还拒绝了退出清理中的 `rmdir`，留下空的安装锁；在确认该验证安装进程已结束、锁目录为空且非符号链接后，已清除本次测试留下的空目录。没有删除活跃运行时的锁，没有更改宿主权限或强停旧 broker。当前已安装的候选版配置保留；本次不能认定为重新安装或宿主加载成功。

继续排查发现：旧本地 Hook 使用 `/opengui/i` 匹配任意用户提示，安装链接也会启动 broker，导致停用 MCP 后继续询问安装又启动旧服务。本轮收紧为显式技能调用（`@opengui`、`@skill:opengui`、`/opengui` 及宿主序列化的开头技能名），保留正在执行任务的生命周期转发。新增回归覆盖安装链接不启动服务、技能调用仍正常。完整 61 个测试文件、479 项测试、构建、发布契约校验和打包通过；预检与隔离安装器回归通过。隔离安装器测试复用经安装器校验的本地 Node、视频和 npm 缓存，未以外网重新下载依赖作为通过依据。

新候选包 `ba62536bf31bfcc5e3c39bc87519e58e0ab4d1added880a066ab4e00868ca9e0` 的宿主复测通过了旧服务检查（`upgrade_ready`），并实际安装了 130 个 npm 包；随后配置原子重命名被 WorkBuddy 文件策略拒绝：

```text
Brokered host rename source refused by file policy: prompt
installationFailed: true
rollbackComplete: true
```

该次退出码 1、配置未写入。失败位置为包内 `scripts/install-local.mjs:94`，宿主返回的策略决定为 `prompt`。这需要正常的文件授权，不能靠关闭沙箱、绕过重命名校验或把缓存安装成功当作宿主安装成功来处理。至此，**默认权限下的一句话完整安装仍未验收通过**。

已请求 WorkBuddy 使用正常的一次性文件授权入口，但其当前工具无法展示这种授权。未关闭沙箱、未修改文件策略、未通过其他入口写入被拒的新配置。验证结束后，已恢复测试前原有 MCP 配置（原版本重新启用，其他连接器不变），清除了确认已结束的测试遗留空锁。新候选包只保留在缓存中，尚未替换正在使用的版本。

## 文档变更

- 中英文首页提供短安装提示词、WorkBuddy 专用路由、安装后技能/工具检查、设备授权和 Try it。
- 新增 `workbuddy-plugin/INSTALL.md`，直接下载并校验安装器，无需克隆仓库；明确区分配置写入、宿主加载、设备发现和实际手机任务。
- 首页和指南如实标注公开安装器的 5.6.2 阻塞，以及公开包和本地候选版的差别。
- 本次改动区域的本地链接、锚点、Shell 示例语法和 diff 空白检查通过。

## 公开流程验收前的必要步骤

发布包含兼容修复的安装入口，并让 GitHub 首页指向该入口。若同时发布新版运行时，应使用新版本号和新 Release，保留 0.3.1 的不可变资产。然后在没有 OpenGUI 的 WorkBuddy 环境中重新测试短提示词，核实安装、宿主加载和只读设备发现。当前工作区候选包的成功不能替代该项验收。


## 2026-10-07：WorkBuddy 5.7.6 与官方发布包

本轮使用 macOS arm64、WorkBuddy 5.7.6、默认权限、快速模型（DeepSeek-V4.1-Flash）。开始前没有 `opengui` MCP 配置、生命周期 Hooks 或 Skill；不能把缓存目录当成已安装插件。

用户实际发送：

```text
帮我安装opengui插件：https://github.com/Core-Mate/OpenGUI
```

助手先确认旧发布版安装器的 `HOST_HOOKS` 兼容问题，再询问是否使用仓库修复版。这个选择卡片是助手的问答，不是安装器或系统的授权窗口。继续后，它将脚本固定到仓库提交，校验后执行安装：

- 安装器提交：`4e4c57f15811fabaecfe8f00a4af1400fb2b1b8c`。
- 安装器 SHA-256：`6a8ce9087e761c7772711d1a5316669fccb6618bb342d017e364acc62af2e864`。
- 官方 `opengui-mcp-0.3.1.tgz` SHA-256：`7246c9800de2afceebc06785c6dbd666be0b7d29c21839bf1811b7a19351d535`。
- 预检通过，官方包、私有 Node 和视频依赖准备完成。
- `install-local.mjs:94` 原子替换 `settings.json` 时被宿主拒绝；先前已切换的 `mcp.json` 完整回滚。

```text
Error: Brokered host rename source refused by file policy: prompt
code: CODEBUDDY_BROKER_DENY
decision: prompt
installationFailed: true
rollbackComplete: true
```

请求宿主使用正常一次性授权入口后，助手检查可用工具并报告没有该入口；未显示可确认的文件授权弹窗。没有关闭沙箱、修改全局权限或移除宿主注入。用户接受必要的真实授权弹窗；本轮阻塞是授权请求没有可响应的入口，而不是用户拒绝授权。

用户随后明确允许本机终端完成同一安装。确认安装进程已结束后，移除失败清理遗留的两个空安装锁，再运行同一已校验脚本。终端约 4 秒返回 `CONFIG_WRITTEN` 与 `LIVE_CONFIG_WRITTEN`，配置指向上述官方包，7 个 Hooks 和 Skill 写入成功。核对确认其他 MCP 配置及非 Hook 设置（包括权限策略）保持不变。

### 宿主加载与设备发现

独立 MCP 客户端可以列出官方包的 14 个工具，调用 `opengui_list_devices` 返回 1 台已连接且已授权的 `sdk gphone64 arm64` 模拟器。此项先证明安装产物可启动，不单独作为 WorkBuddy 已加载的证据。

WorkBuddy 技能页已显示启用的 `opengui`，但聊天最初检索不到 MCP 工具。进入 **专家·技能·连接器 → 连接器 → 自定义连接器** 后，MCP 服务管理中可见 `opengui`，虽然标注“14/14 个工具已启用”，服务总开关仍是灰色关闭状态。

在原生界面打开 `opengui` 总开关后，状态指示由黄色变为绿色，本次没有额外信任弹窗。返回验证会话，重新发现并直接调用 `mcp__opengui__opengui_list_devices` 成功，返回上述模拟器，`state: "device"`、`connected: true`、`authorized: true`。未创建手机控制会话、读取手机屏幕或执行手机动作。

因此，本轮 **配置写入、WorkBuddy MCP 加载、只读设备发现已通过**；Skill 存在或安装器退出成功都不足以独立证明这些阶段全部完成。

本次 README 将推荐流程明确为“固定提交的兼容安装器 + 原始官方发布包”，并提供完整安装请求，减少无必要的安装器选择。完整新提示词尚未在全新环境独立验收；不能写成已证明所有版本、模型都不会询问。默认权限下 **WorkBuddy 内全自动安装仍未通过**，本机终端成功属于用户另行授权的备用流程。


## 2026-10-07：短提示词重试、终端恢复与缓存权限缺陷

用户卸载后再次发送同一短提示词，原生对话从 13:25 到 13:58，最终报告配置重命名被 `CODEBUDDY_BROKER_DENY` / `decision: prompt` 拒绝并回滚。此次确认不是误入其他插件的安装任务。检查本机时，OpenGUI MCP、Skill 与 Hooks 均不存在，但下载和运行时缓存仍在。

沿用用户明确允许的本机终端备用流程，同一已校验安装器和官方包约 4 秒返回 `CONFIG_WRITTEN`、`LIVE_CONFIG_WRITTEN`。与本次备份对比，其他 MCP 和非 Hook 设置保持不变；Skill 与 7 个 Hook 事件写入。原聊天仍找不到工具，原生 MCP 管理最初也未列出 OpenGUI；退出并重开空闲 WorkBuddy 后，总开关已开启、状态绿色、14/14 个工具，无需再手动切换。

真实调用随后暴露另一个问题：`WorkBuddy state directory must be private, owned by this user, and not a symlink`。本机 `~/.workbuddy/opengui` 是当前用户所有的普通目录，模式为 `0755`。直接调用已安装官方包的 `ensurePrivateState()` 同样失败；仅将该目录收紧至 `0700` 后同一检查通过。没有更改 WorkBuddy 根目录或宿主权限策略。

原安装器虽然设置 `umask 077`，但 `mkdir -p` 不会改变已有缓存目录的权限。此次修复在既有归属和符号链接检查后，仅收紧 OpenGUI 状态根目录。回归先在旧脚本上失败（期望 `0700`，实际 `0755`），修复后通过；同时验证预检不改变权限、宿主根目录保持原模式、符号链接被拒且目标权限不变。该测试在归档检查处停止，不用网络下载模拟权限问题。

最终在原生 WorkBuddy 原安装对话中再次直接调用 `mcp__opengui__opengui_list_devices` 成功，返回 1 台 `sdk gphone64 arm64` 模拟器，`connected: true`、`authorized: true`、`state: device`。本轮没有读取手机屏幕或执行手机动作。

当前推荐安装器固定为提交 `d6a5f5ce240cdd6ca393ea516206b8a329411ac0`，SHA-256 为 `b3581c8d928068e7bf7a8a886f75c1c436efdb71ae2c5bf97b220b36bf9f0239`；官方 0.3.1 包及其哈希不变。README 把已验证的终端路径直接放在 WorkBuddy 安装入口，保留助手安装请求但明确权限边界。此次成功是终端恢复加原生只读验收，仍不能声称 WorkBuddy 默认权限的一句话全自动安装通过。

## 2026-10-07：可双击安装入口 1.0.0

新增 ZIP 将固定的兼容安装脚本与交互入口一起分发，仍安装原始官方插件 0.3.1。入口要求独立交互终端，先核对内含脚本 SHA-256，再等待用户按回车。每次实际尝试创建独立的结果目录；安装成功只记录 `configuration_written`，宿主加载始终保留 `unverified`，等待原生工具调用验收。

8 项隔离自动测试通过，覆盖非交互与宿主注入拒绝、取消、失败退出码及日志、成功标记、仅下载不算成功、篡改/符号链接拒绝，以及 ZIP 中可执行权限和内含脚本校验。测试使用临时 HOME 和模拟安装载荷，不写入真实 WorkBuddy 配置；测试中自动输入仅用于模拟载荷，不代表用户确认流程已实机验收。

本机使用 `ditto` 解压后，Finder 可以识别 `OpenGUI-Install.command` 为终端 shell 脚本。桌面控制工具拒绝访问 macOS Terminal，因此交给用户手动打开并确认。用户提供的终端截图显示“安装配置已写入”及进程完成；核对本次独立结果目录，`status=configuration_written`、`exitCode=0`、`hostLoaded=unverified`，日志显示约 5 秒完成并输出 `LIVE_CONFIG_WRITTEN`。这是已有运行时缓存的重装验证，不是全新机器冷安装。

重新打开 WorkBuddy 5.7.6 后，在原安装对话中通过工具发现机制直接调用 `mcp__opengui__opengui_list_devices`。原生会话的 `DeferExecuteTool` 完成结果和 `mcpMeta.structuredContent` 均返回 1 台 `sdk gphone64 arm64` 模拟器，`state=device`、`connected=true`、`authorized=true`。没有使用 Shell 代替宿主工具验证，也没有执行手机操作。

本次已验证“解压入口 → 用户终端确认 → 配置写入 → 重开 WorkBuddy → 原生只读 MCP 调用”。带浏览器隔离属性的下载打开流程，以及新 README 短请求自动准备安装包的前半段，仍未独立实测；不能据此承诺默认权限下无人值守安装。macOS/Linux 的入口 CI 均通过，插件打包与 485 项运行时测试通过；现有依赖审计仍因 MCP SDK 的 GHSA-6qxp-vccf-f47h 失败，本次未修改该运行时依赖。


## 2026-10-07：目录入口与慢速下载修复（安装入口 1.0.2）

用户在真实终端运行 1.0.1 时，窗口停留在“正在准备运行环境”。读取本次日志和进程后确认：正在从 nodejs.org 下载约 47.7 MB 的 Node.js 包，下载有进展，但旧脚本的 `--max-time 240` 已触发超时重试；摘要过滤器隐藏了下载进度和重试信息。诊断时没有修改正在运行的脚本、终止进程或删除锁。

1.0.2 保留完整日志，并实时显示 curl 的百分比、已下载量、速度、剩余时间估计及重试错误；下载单次限时改为 1800 秒，保留连接限时，并新增低于 1024 B/s 持续 60 秒的断流检测。校验、确认和配置写入条件保持不变。

README 与安装指南将交接改为“点击打开安装脚本目录”：使用实际目录及宿主支持的“打开文件夹 / 在 Finder 中显示”，用户再双击 `OpenGUI-Install.command` 并按回车。普通 Markdown 链接是否直接进入 Finder 由 WorkBuddy 决定，本次未将该点击行为记为实测通过，保留宿主原生目录操作和 Command-Shift-G 步骤。

验证：11 个隔离测试通过，包括下载进度必须在模拟下载结束前可见、重试提示、下载限时和错误码保留；两个 shell 文件通过语法检查，ZIP 内入口权限与 payload SHA-256 均经过验证。本次未重新安装宿主或执行手机任务；不能把 fixture 测试视为新版冷安装全链路验收。
