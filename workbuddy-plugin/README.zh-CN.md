# OpenGUI WorkBuddy 连接器

独立的本地 MCP + Skill + 生命周期 Hook 插件，提供 Android 手机自动操作、scrcpy 只读独立投屏窗口和只读设备墙。当前 `0.2.0`（broker 协议 `7`）是本地候选版本，尚未正式发布或通过 WorkBuddy 市场审核。

每次调起 OpenGUI，Skill 首先调用 `opengui_start`，自动展示全部已连接且已授权的手机。投屏只读、静音，不占用控制锁；任务结束、取消、回复结束或 MCP 重连均不关闭窗口。首次展示验证通过后，最小化、遮挡、切换桌面、关窗或渲染进程退出只影响观看，不暂停手机任务、不抢焦点。取消任务应调用 `opengui_cancel`，不是关闭窗口；下次明确调起时恢复投屏。纯观看不发送模型截图；正常手机任务必须通过截图 → VLM 判断 → 单步操作 → 新截图完成闭环。真机断线会撤销观察凭据，重连或截图失败后必须重新观察，不自动重放操作。

macOS 包内提供原生窗口辅助程序，每个控制任务首次操作前核对自有窗口的真实可见性与 scrcpy 渲染初始化。首次下载遇到可恢复网络错误时最多重试两次；展示仍失败则准确结束，不静默绕过，也不能只凭 running 宣称展示成功。首次成功后不再逐步要求窗口可见：模型读取的是手机截图。投屏状态与任务状态分别报告。辅助程序不截图；最终画面持续更新仍需桌面验收。Windows/Linux 尚不具备同等展示验证，首次操作会明确受阻，不标为通过。

已明确授权的任务不再弹出插件逐动作确认页，也不需要用户反复说“继续”。全自动不扩大任务范围；账号验证、USB 授权和宿主强制限制不能绕过。Hook 只绑定宿主任务并管理续跑和收尾，不批准或执行手机动作，不替换模型图片。

原生 Stop 反馈最多自动续跑十轮；FinalStop、SessionEnd 和十分钟无执行活动的控制租约负责收尾。预算按原任务每台手机累计一百次观察/操作，重连或重建会话不能重置。状态查询和投屏不续租。用户主动停止优先；Hook 未接通时明确报告能力缺失，不假称自动续跑已可用。

升级使用不可变的独立包目录，先备份 MCP 配置与 Skill。旧任务或窗口还在时，不强杀、不覆盖运行目录；用户明确结束旧运行后再切换。回退恢复旧路径与配置，不清理其他宿主数据。

DSH、Codex 的源码、依赖、安装配置、缓存和发布流程均不复用。手机控制逻辑从固定的公开版本移植到本目录，由本目录独立维护。

## macOS 安装

当前提供未发布候选版的源码安装路径，以 macOS、WorkBuddy 5.5.3 为验收基线。需要支持工具调用和图片的模型，以及 Git、Node.js 22.19 及以上的 22.x 或 24 及以上版本、npm。源码构建还需要 Xcode 命令行工具，可用 `xcode-select -p` 检查。ADB 已随包提供，scrcpy 会自动下载并校验，不需要通过 Homebrew 安装。使用预构建包不需要 Xcode，但当前尚无正式发布的候选包下载入口。

克隆候选分支到新目录，不覆盖已有工作区：

```sh
git clone --branch codex/workbuddy-vlm-persistent-mirror --single-branch \
  https://github.com/Core-Mate/OpenGUI.git opengui-workbuddy-candidate
cd opengui-workbuddy-candidate/workbuddy-plugin
npm ci
npm run pack:release
npm run smoke:packed
```

升级前先完成或取消旧 WorkBuddy OpenGUI 任务，明确关闭旧投屏窗口，再退出 WorkBuddy。不要批量终止 scrcpy 或 ADB 进程。以下命令在同一个终端、上述源码目录执行，任一步失败就停止：

```sh
OPENGUI_ARCHIVE="$PWD/dist/opengui-mcp-0.2.0.tgz"
(cd dist && shasum -a 256 -c opengui-mcp-0.2.0.tgz.sha256)
OPENGUI_NODE="$(node -p 'process.execPath')"
mkdir -p "$HOME/.workbuddy/opengui/packages"
OPENGUI_INSTALL="$(mktemp -d "$HOME/.workbuddy/opengui/packages/0.2.0-local.XXXXXX")"
npm install --prefix "$OPENGUI_INSTALL" --no-audit --no-fund "$OPENGUI_ARCHIVE"
node scripts/install-local.mjs \
  --package-dir "$OPENGUI_INSTALL/node_modules/opengui-mcp" \
  --node "$OPENGUI_NODE"
```

保留这个 Node 可执行文件，MCP 和 Hooks 使用它的绝对路径。安装脚本从已构建的源码目录运行，不在 tarball 内。安装器先备份，再增量更新 `~/.workbuddy/mcp.json`、`~/.workbuddy/settings.json` 和 `~/.workbuddy/skills/opengui/SKILL.md`，保留其他插件和 Hooks，拒绝软链接重定向。每次安装使用新目录，旧包保留用于回退。正式 Release 资源发布前，不要直接使用连接器 ZIP 中的 Release 下载地址。

### 安装验证与排查

1. 重开 WorkBuddy，按宿主提示启用并信任 `opengui` MCP，选择支持 MCP 图片和工具调用的模型。
2. 连接空闲的 Android 手机，开启 USB 调试，并在手机上确认 USB 授权。不要让其他宿主同时操作这台手机。
3. 输入 `/opengui` 并选中技能，发送“列出已连接手机，不操作手机”，确认工具可用且返回真实设备状态。
4. 在允许截图发送给当前模型的手机上，发送“打开手机设置，查看并告诉我 Android 版本”。核对实际投屏窗口、看图操作、结果和任务结束后的控制锁释放，投屏应继续保留。

找不到技能时，检查 `~/.workbuddy/skills/opengui/SKILL.md` 并重开 WorkBuddy，只配置 MCP 不够。找不到工具时，检查宿主的 MCP 信任和连接状态，以及 Node、安装包路径。提示无法自动续跑时，检查 `settings.json` 中是否保留本插件的生命周期 Hooks，不要用反复输入“继续”代替修复。USB 授权和 macOS 权限弹窗需要用户在系统界面批准。构建和冒烟检查通过，不等于桌面和真机验收通过。

### 回退

结束任务，关闭 WorkBuddy OpenGUI 投屏并退出 WorkBuddy。`~/.workbuddy/opengui/local-install.json` 记录配置文件及对应备份，恢复上一版 MCP、Hook 配置、Skill，以及存在的上一版安装元数据，再重开 WorkBuddy。备份为 `null` 表示安装前没有该文件；如果此后加入其他配置，只移除本次安装的条目。保留后续无关修改、旧包和缓存，不重置整个 WorkBuddy 配置，不动 DSH/Codex 数据。

## 使用方式

可尝试“看看手机上的 Android 版本”或“在设备墙里查看这两台手机”。模型先启动投屏，再为操作任务锁定一至四台手机，根据截图逐步操作。每台手机每个任务最多 100 次观察/操作，重连不重置。任务结束由模型和 Hooks 收尾，用户无需手动关闭控制会话。只想本机观看时，可以说“展示手机投屏，不截图给模型，也不要操作手机”。关闭投屏或设备墙只影响观看；停止手机任务请使用 WorkBuddy 的停止按钮。

## 安全与限制

- 截图和手机上可见的信息会作为工具结果发送给当前 WorkBuddy 模型。本运行时不落盘保存截图，但宿主可能保存对话记录。
- 手机动作必须属于用户已授权的任务；不额外弹插件确认页，旧确认参数不赋予权限。点击的实际业务含义仍需要模型根据画面正确判断。
- 每步消费最新观察凭据。读操作瞬态错误最多重试两次；动作已下发但结果未知时先看新截图，绝不直接重放。页面和目标区域使用像素差异检查，动作后每 250 毫秒检查稳定性，最多两秒；连续三次无进展必须换策略。画面变化不等于语义成功。
- 完成会话时提交实际结果与最新截图证据；只关闭资源不等于任务成功。单设备自动选择，明确指定手机时不额外提问。自动恢复不重新弹出用户已关闭的窗口。
- 设备墙只监听本机环回地址，每个会话独立令牌；链接具有查看权限，不要公开分享。会话停止后不再读取画面。
- 状态存储在 `~/.workbuddy/opengui`。不读取或迁移 DSH/Codex 缓存。没有任务、MCP 客户端或持续投屏时，本机 WorkBuddy 服务才可空闲退出。
- WorkBuddy 内部会话不会抢占同一台手机，但无法协调其他宿主。不要让 DSH、Codex、手动 ADB 同时操作这台手机。
- 包含 macOS arm64/x64、Linux x64、Windows x64 的 ADB。首次安装需要 GitHub/npm 网络；首次中文输入还会下载校验过的 scrcpy。完整缓存后的离线重启需单独验证，不承诺全新离线安装。

## 交付与发布

候选版本标签约定：`opengui-workbuddy-v0.2.0`；本地安装不会创建标签。打包产物是 `dist/` 中的 MCP `.tgz`、连接器 `.zip` 及对应 SHA-256 文件，不需要发布到 npm。

自动测试、归档包和标准 MCP 冒烟检查不等于真实 WorkBuddy 验收。`release-readiness.json` 中的宿主图片接入、真机动作、双机隔离、自动续跑和停止恢复等项目全部验收后，专属发布流程才允许创建 GitHub Release。WorkBuddy 市场提交与审核另行进行。

完整的接口流程、验证清单、隐私说明和来源见 [英文 README](README.md)、[Skill](connector/skills/control/SKILL.md) 和 [来源说明](NOTICE.md)。
