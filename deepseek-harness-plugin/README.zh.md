# OpenGUI

[English](README.md) | 中文

`dsh-coremate-mobile` 是 OpenGUI 的 DeepSeek Harness 插件，让 Harness 通过受限子任务控制一台或多台已授权的 Android 手机，以及插件自行管理的本地浏览器。它提供直接命令 `/opengui`，也允许父 agent 通过 `phone_agent` 和 `browser_agent` 委派任务。OpenGUI 默认复用接收任务的 DSH 会话模型，专用视觉模型只作为兼容性回退。旧 `/coremate` 命令暂时保留用于兼容。

当前能力闭环的任务所有权、设备快照、会话归属、视频降级与资源回收设计见[实现方案](docs/implementation-plan.zh.md)。

插件不会修改或发布 DeepSeek Harness 源码，也不依赖 CoreMateDesktop2、系统 Chrome、Python 或 Hermes CLI。仓库只包含插件源码、测试、发布元数据和随包 Android Debug Bridge（ADB）runtime；浏览器在首次实际需要时经用户确认后按需安装。

## Codex Plugin

同一源码目录现在也是名为 `opengui` 的 Codex Plugin。仓库 marketplace 位于 [`../.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json)，本地 stdio MCP 提供以下接口：

- `opengui_list_devices`
- `opengui_open_session`
- `opengui_observe`
- `opengui_act`
- `opengui_status`
- `opengui_cancel`
- `opengui_close_session`

Android 任务由 `opengui:control` Skill 编排：冻结一至四台已授权手机、每次变更必须携带最新截图的 `observationId`、发送/发布/购买/删除前再次确认，并在任务结束后关闭会话。需要多设备监控时，把返回的本地 `deviceWallUrl` 交给 Codex 原生 Browser 打开；纯网站任务直接使用 Codex Browser，不走手机 adapter。

仓库 marketplace 同时加载 Skill 与本地 MCP。[`codex-public`](./codex-public) 中的公共目录模板刻意保持 Skills-only，不新增公网手机控制网关。

在 OpenGUI 仓库根目录安装本地 Codex Plugin：

```sh
codex plugin marketplace add /OpenGUI/仓库的绝对路径
codex plugin add opengui@opengui-local
```

提交公共目录前，先执行 `pnpm run build`，再用 `pnpm codex:stage-public -- /绝对路径/空输出目录` 生成不含 MCP 配置的 Skills-only 审核包。

## 支持范围与前置条件

开始安装前，请确认：

- 已安装并能启动官方 DeepSeek Harness；受支持版本为 `0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1` 和 `0.1.1-rc.2`，首选版本为 `0.1.1-rc.2`。
- Node.js 版本为 `^22.19.0` 或 `>=24`。
- 安装机器能访问本仓库公开的 GitHub Releases。
- DSH 当前会话模型应支持图片输入和工具调用；若不兼容，OpenGUI 可引导用户配置独立的 OpenAI 兼容视觉模型作为回退。
- 每个非空 `/opengui` 或 `@OpenGUI` 任务都需要至少一台已授权且选中的 Android 手机，包括之后被路由为纯浏览器操作的任务。
- 主机是 macOS arm64/x64、Linux x64 或 Windows x64。Linux arm64 和 Windows arm64 暂未随包提供 ADB。

如果你不熟悉终端、Git 或 YAML，请直接使用[普通用户安装指南](docs/install-for-beginners.zh.md)。

## 安装插件（两种接入方式共用）

下面以 `web` profile 和默认的 `$DSH_HOME=~/.dsh` 为例。使用其他 profile 或自定义 `DSH_HOME` 时，请替换对应路径。

### macOS：通过 Codex Skill 安装

让 Codex 从仓库的 [`deepseek-harness-plugin/skills/opengui-coremate-install`](./skills/opengui-coremate-install) 安装 Skill，然后调用 `$opengui-coremate-install`。Skill 会解析最新的插件正式版 Release，下载并校验对应的安装包，忽略草稿、预发布版和 OpenGUI 的其他 Release；同时保留 `web` profile 中的其他配置，并安装用户级 LaunchAgent，让 DSH 在异常退出或重新登录后自动恢复。整个过程不要求登录 GitHub。插件回滚或可复现安装使用 `--version VERSION`，需要选择某个受支持的 DSH 精确版本时使用 `--dsh-version VERSION`。

如果 3080 端口属于 OpenGUI 管理的 DSH，安装器会安全更新并重启对应 LaunchAgent；如果属于其他 DSH 进程，安装器绝不会强制终止它，新 LaunchAgent 会在下次登录后接管。下面的手动安装方式仍适用于所有受支持的系统。

精确支持的 DSH 版本是 `0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1` 和 `0.1.1-rc.2`，默认使用 `0.1.1-rc.2`；`0.1.2-alpha.4` 明确不受支持。安装器只会复用与所选版本完全一致的 `PATH` runtime，否则使用按版本隔离的 managed runtime。默认版本下载失败时，安装器可以回退到本机已有的最高兼容 managed runtime，并明确提示；显式传入 `--dsh-version` 时不会静默回退。现有 DSH、工作区、设置、凭据和手机授权都不会被替换。页头展示的是 Host 实际加载的组件版本；由于 DSH RC 包的内部依赖使用兼容范围，它可能比所选 CLI 版本更新。

需要恢复上一版组合时，执行 `./skills/opengui-coremate-install/scripts/install-macos.sh --version 0.1.10 --dsh-version 0.1.0-rc.7`；该操作不会删除用户状态。

### 1. 下载发布包

从 [OpenGUI 公开 Release](https://github.com/Core-Mate/OpenGUI/releases/tag/dsh-coremate-mobile-v0.1.12) 下载：

- `dsh-coremate-mobile-0.1.12.tgz`
- `dsh-coremate-mobile-0.1.12.tgz.sha256`

不要解压 `.tgz`，也不要下载 GitHub 自动生成的 Source code 压缩包。

在两个文件所在目录校验安装包：

```sh
# Linux
sha256sum -c dsh-coremate-mobile-0.1.12.tgz.sha256

# macOS
shasum -a 256 -c dsh-coremate-mobile-0.1.12.tgz.sha256
```

Windows PowerShell 可分别执行 `Get-FileHash .\dsh-coremate-mobile-0.1.12.tgz -Algorithm SHA256` 和 `Get-Content .\dsh-coremate-mobile-0.1.12.tgz.sha256`，确认两者显示的哈希一致。

### 2. 安装到 Harness profile

```sh
dsh plugin --profile web add /绝对路径/dsh-coremate-mobile-0.1.12.tgz
```

如果使用 `npx` 启动官方 CLI，可将命令中的 `dsh` 替换为：

```text
npx @deepseek-ai/dsh@0.1.1-rc.2
```

首次安装若出现 `ERR_PNPM_IGNORED_BUILDS`，在 `$DSH_HOME/profiles/web/pnpm-workspace.yaml` 已有内容中合并下面两项，然后原样重试安装命令：

```yaml
allowBuilds:
  '@google/genai': false
  protobufjs: false
```

不要用这三行覆盖整个文件。

安装完成后直接启动 Web GUI。独立模型配置不是首启前置条件，只在兼容性回退或用户显式选择时使用。

## Web GUI 当前模型优先流程（推荐）

### 1. 启动 Harness

```sh
dsh web
```

### 2. 验证命令

在 Web UI 中发送：

```text
/opengui
```

空命令始终只返回用法，不会进入任何模型配置：

```text
Usage: /opengui <task>
```

打开 DSH、查看手机、选择操作设备和手动打开一个或多个投屏窗口，也都不要求先配置 OpenGUI 专用模型。

执行任务时需要在命令后带上文本：

```text
/opengui 打开设置并报告 Android 版本
```

也可以从原生 `@` 菜单选择 `@OpenGUI`，再输入相同任务。裸 `@OpenGUI` 与空 `/opengui` 一样，只展示用法；两种入口共用同一条命令生命周期。

OpenGUI 会继承当前 DSH 的 provider、model 和输出 token 上限。当前模型明确声明支持图片时直接执行；自定义模型只是遗漏能力声明时，会询问它是否支持图片和工具调用，确认后仅补全当前 provider/model 并继续原任务；明确不支持图片时才进入专用视觉模型配置。切换模型后会重新判断。

跳过能力确认或配置中的任意步骤，都会正常取消本次任务：不调用 OpenGUI 模型、不操作设备、不保存半套配置。手机画面和手动投屏仍可使用，下次任务会重新询问。

若继承模型实际返回图片或工具能力错误，OpenGUI 不会自动重跑原任务，以免重复手机或浏览器副作用。界面会允许切换到专用视觉模型，并要求配置完成后重新提交。

## 可选的专用视觉模型回退

只有当前 DSH 模型不兼容，或把 `modelStrategy` 显式设为 `dedicated` 时，才需要配置下面的独立模型。

推荐把用户配置写入 `$DSH_HOME/settings.yaml`：

```yaml
coremate-mobile:
  baseURL: https://gateway.example/v1
  api: openai-responses
  model: vision-model
```

仅当服务商明确要求 Chat Completions 协议时，才把 `api` 改为 `openai-completions`。

把 API Key 写入 `$DSH_HOME/.credentials.yaml`，不要放进 `settings.yaml` 或提交到 Git：

```yaml
COREMATE_MOBILE_API_KEY: sk-...
```

macOS 和 Linux 上，手工创建凭据文件后执行：

```sh
chmod 600 "${DSH_HOME:-$HOME/.dsh}/.credentials.yaml"
```

未设置 `DSH_HOME` 时，上面的命令会使用 `~/.dsh/.credentials.yaml`。

## 验证安装和装载

先检查 profile 的最终组合配置：

```sh
dsh --profile web --dump-config
```

输出中应包含 `dsh-coremate-mobile` 层和 `id: coremate-mobile`。这个检查只证明 bundle 已加入配置，不代表插件已经在运行时成功装载。

启动 Harness：

```sh
dsh web
```

在 Web UI 中把下面内容作为一条独立消息发送：

```text
/opengui
```

预期返回：

```text
Usage: /opengui <task>
```

这说明插件模块和命令已经成功装载。空命令不会读取或检查模型配置。

## 执行第一个手机任务

保持手机解锁并已通过 USB 调试授权，然后发送：

```text
/opengui 打开设置并报告 Android 版本
```

手机选择和状态统一放在原生 **OpenGUI** Tab。只有一台已授权手机时会自动选中；有多台时，可在工作台中勾选任意一台或多台后再发送 `/opengui` 或 `@OpenGUI`。非空任务会先确定当前模型或完成专用回退配置，再等待手机；在选定设备快照就绪前不会向 provider 发起模型请求。等待期间仍可连接、选择和投屏，检测成功后才锁定本次设备快照，直到整批结束。

原生 **OpenGUI** Tab 是全宽设备照片墙。界面按 Host 顺序展示全部可见手机，并在末尾追加唯一的连接说明卡，不会为凑列数预留空卡。新检测到的手机先立即展示完整截图，后台自动准备低延迟实时画面，完成后无缝切换；普通用户不需要理解或批准底层组件。浏览器不支持或视频流失败时会继续显示截图，并提供重试。每台手机还可按需打开独立投屏窗口。

插件启动后会在后台检查公开的 `Core-Mate/OpenGUI` GitHub Releases 列表，并将频率限制为每 6 小时最多一次。它会忽略 Android APK、草稿和预发布条目，只识别带版本匹配 `.tgz` 与 `.sha256` 的稳定 `dsh-coremate-mobile-v*` Release。只有发现更高版本时，OpenGUI Tab 才显示**更新**按钮；OpenGUI 任务运行期间禁止安装，失败时保留当前版本，成功后重启 Harness 生效。

选中 `@OpenGUI` 后，原生输入菜单会显示自由描述、QA、运营和手游四个选项；场景只填入草稿，不会自动发送。提交非空 OpenGUI 任务后，输入框会立即恢复，任务继续写入所属会话。此时新建 DSH 会话会进入真正的空白对话，原任务仍在原会话运行，新会话中会提供紧凑的返回入口。

`/opengui` 会启动一个受限的任务路由子任务，只能选择 `phone_agent`、`browser_agent`，或在确有必要时顺序调用两者。手机任务仍为每台已选手机创建一个绑定固定设备的子任务；普通对话也可以直接使用两个委派工具。同一时间只允许一个 OpenGUI 任务，包括通过旧 `/coremate` 别名启动的任务。

执行期间，外层 `phone_agent` / `browser_agent` 卡片会实时展示内部 `phone_control` / `browser_control` 调用及其可见结果。内部推理、系统提示词和模型配置不会投影到父对话。

OpenGUI 任务运行时，输入框右侧会出现方形“停止 OpenGUI 操作”按钮。点击会取消路由、手机或浏览器子任务，以及正在运行的 ADB、浏览器下载和浏览器操作；手动打开的投屏窗口保持独立。

成功的直接 OpenGUI 任务会在对应 Turn 尾部最多显示一次组合卡片，其中可包含 2–3 个经过校验的动态追问。点击建议只会填入 `@OpenGUI` 草稿。卡片同时提供[用例页](docs/use-cases.zh.md)与 OpenGUI GitHub 入口；失败、取消、空命令、仅配置和普通任务均不展示。

## 按需浏览器控制

只有任务实际调用 `browser_agent` 时，插件才检查托管 Chromium。若尚未安装，**OpenGUI** Tab 会显示固定版本、下载大小、确认操作和安装进度，Chat 只提示前往该 Tab；确认后当前任务继续下载、校验 SHA-256、原子解压并打开可见浏览器。取消安装或点击停止按钮会终止本次任务。后续任务复用 `$DSH_HOME/cache/coremate-mobile/browser` 中的缓存和独立浏览器配置目录。

浏览器工具只允许 HTTP/HTTPS 导航，以及观察、点击、Unicode 文本输入、有限按键、滚动、后退、刷新和等待。中文通过 CDP 直接写入当前焦点字段。浏览器二进制、生命周期和控制代码均由插件负责，不会查找或调用 CoreMateDesktop2 或系统 Chrome。

## 配置参考

| 键 | 含义 |
|---|---|
| `modelStrategy` | `current-first`（默认）复用接收任务的 DSH 模型；`dedicated` 始终使用下面的回退模型。 |
| `trustUnknownCurrentModels` | 已废弃的兼容开关。升级后首次遇到时，只会迁移为对当前 provider/model 的精确信任，然后自动关闭。 |
| `baseURL` | 可选专用回退模型的 OpenAI 兼容 HTTP/HTTPS 端点。请求包含凭据、提示词和截图，应优先使用 HTTPS。 |
| `api` | 专用回退协议：`openai-responses`（默认）或 `openai-completions`。 |
| `model` | 专用回退模型，必须同时支持图片输入和工具调用。 |
| `apiKeyEnv` | Harness 凭据引用；默认 `COREMATE_MOBILE_API_KEY`。 |
| `commandTimeoutMs` | 每个本地 ADB 进程及浏览器动作的基础超时；默认 15 秒。 |
| `maxOperations` | 单次子任务允许的 `phone_control` 或 `browser_control` 调用上限；默认 100 次。 |
| `maxParallelDevices` | 单个 OpenGUI 任务同时处理的已选手机上限；默认 4，范围 1–16。 |
| `contextWindow` | 声明的模型上下文容量；默认 262,144 token。 |
| `maxTokens` | 声明的最大模型输出；默认 32,768 token。 |
| `streamIdleTimeoutMs` | 模型 stream 无新事件的最长时间；默认 300 秒。 |
| `adbPath` | 仅用于开发和测试覆盖；发布包始终使用自身携带的 ADB。 |

需要按 profile 隔离配置时，也可以在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中加入：

```yaml
- id: coremate-mobile
  config:
    baseURL: https://gateway.example/v1
    api: openai-responses
    model: vision-model
```

这是高级用法：profile patch 会替换目标行的整个 `config`，之后 `$DSH_HOME/settings.yaml` 中的同名 section 仍具有更高优先级。不要把 API Key 写入 patch。

## 从源码 checkout 安装（开发用途）

生产环境应使用上面的预构建 Release 包。开发时可以 checkout OpenGUI 的公开 Release tag，再安装插件目录：

```sh
git clone --branch dsh-coremate-mobile-v0.1.12 --depth 1 https://github.com/Core-Mate/OpenGUI.git
cd OpenGUI/deepseek-harness-plugin
dsh plugin --profile web add "$(pwd)"
```

公开仓库无需 GitHub 登录即可拉取。源码安装需要运行包内 `prepare` 构建，因此还要在 profile 的 `allowBuilds` 中明确允许 `dsh-coremate-mobile: true`。只应对已审查并固定版本的源码授予安装期脚本权限。详细语义见[开发者接入与实测记录](docs/research/deepseek-harness-plugin-integration.md)。

```yaml
allowBuilds:
  dsh-coremate-mobile: true
  '@google/genai': false
  protobufjs: false
```

## 常见问题

- **`ERR_PNPM_IGNORED_BUILDS`**：按安装步骤合并 `allowBuilds` 决定并重试，不要覆盖整个 YAML。
- **`/opengui` 没有被识别**：确认安装无报错，完全停止并重启 Harness，再检查 `--dump-config` 输出。
- **专用回退的 API Key、401 或模型 unauthorized**：检查凭据值、端点和协议；这不是手机 USB 授权错误。
- **没有可用设备或 device unauthorized**：解锁手机、重新插拔 USB，并在手机上接受 USB 调试授权。
- **当前模型能聊天但不会操作手机**：确认它同时支持图片输入和工具调用，或按 OpenGUI 提示配置专用回退。失败任务不会自动重试。
- **任务长时间无进展**：检查模型是否可靠调用工具、手机是否停留在授权弹窗，以及终端中的完整错误信息。

求助时请提供主机系统与架构、Harness 版本、插件版本、操作步骤和完整错误文本。不要发送 API Key 或凭据文件。

## 按需手机投屏

每台已连接手机的设备项右侧常驻一个眼睛图标，不需要先运行 OpenGUI 任务，也不要求勾选为操作目标。点击某台的眼睛后，插件会在**运行 Harness 的电脑**上为该设备打开独立的只读 scrcpy 窗口；再次点击关闭。可依次点击多台手机的眼睛，同时显示多个投屏窗口。从另一台电脑访问 Web 界面时，窗口不会出现在浏览器所在电脑。

首次显示实时画面、投屏或输入 Unicode 手机文本时，插件会在后台下载固定、已审核的官方 scrcpy v4.1 资产（约 11–18 MB），校验内置 SHA-256 后原子安装到当前系统用户的 OpenGUI 缓存。macOS 使用 `~/Library/Caches/OpenGUI/scrcpy`，Linux 遵循 `$XDG_CACHE_HOME`（默认 `~/.cache`），Windows 使用 `%LOCALAPPDATA%`；旧 `$DSH_HOME/cache/coremate-mobile/scrcpy` 中已校验的缓存仍可直接复用，不复制也不重复下载。

官方预构建客户端覆盖 macOS arm64/x64、Linux x64 和 Windows x64。其他主机架构会显示不支持。下载失败可直接重试；校验失败的内容绝不会执行。若不再需要缓存，可在 Harness 完全停止后删除对应系统的 OpenGUI 缓存目录。

## 卸载

通过 macOS Skill 安装时，优先运行配套卸载脚本；它只移除对应插件和 LaunchAgent，保留设置、凭据和缓存：

```sh
./skills/opengui-coremate-install/scripts/uninstall-macos.sh
```

```sh
dsh plugin --profile web remove dsh-coremate-mobile
```

如果使用了推荐的 settings 配置，删除 `$DSH_HOME/settings.yaml` 中的 `coremate-mobile` section；确认不再使用后，再删除对应凭据。

卸载不会自动删除手机画面或 Chromium 缓存；需要释放空间时，可在 Harness 停止后删除对应系统的 OpenGUI `scrcpy` 缓存、旧 `$DSH_HOME/cache/coremate-mobile/scrcpy` 和 `$DSH_HOME/cache/coremate-mobile/browser`。

如果使用了 profile patch，还必须删除其中的 `coremate-mobile` 行；文件没有其他条目时保留 `[]`。残留 patch 会导致下次启动出现 `entry "coremate-mobile" not found`。

## 安全行为与已知限制

- 插件忽略 offline 和 unauthorized 设备；浏览器只接收进程内的 opaque id、型号和显示名，不接收 ADB serial。单台自动选择，多台由用户在 OpenGUI Tab 选择。
- 一批任务会冻结所选设备，并为每台设备绑定独立子任务；设备选择不能在任务运行中修改。
- `phone_control` 不接受任意 shell、ADB 子命令、应用安装/卸载、文件传输、权限修改、重启或任意 intent。
- 每次修改必须引用最新观察；重复无进展操作和超出操作预算会被拒绝。
- 手机文本输入最多 500 个 Unicode 字符。安全 ASCII 直接使用 `adb input text`；中文、emoji 等文本使用 scrcpy 标准控制协议发送 UTF-8 剪贴板消息，并必须收到对应的设备 ACK。该路径与手机厂商和当前输入法无关，也不会静默退化为模拟屏幕键盘逐字输入。
- `browser_control` 不暴露任意 CDP、JavaScript 执行、文件系统访问或非 HTTP(S) URL；页面修改必须引用最新观察。
- 当前 DSH 路由通过内部代理转发，不复制凭据；provider 请求保留工具 schema、取消信号和流式结果，并且最多只保留最新手机截图。
- 发给模型的手机截图保持原始宽高比，统一编码为质量 65、最长边不超过 2048px 的 JPEG；小图不会放大。点击和滑动坐标会从该截图空间换算回 Android 逻辑显示尺寸。
- 能力错误不会自动重试可能已经产生手机或浏览器副作用的任务。
- 直接 `/opengui` 的最终结果只显示文本；截图保留在对应控制子会话中。
- 原生投屏只读且只在运行 Harness 的桌面主机上打开；无图形桌面的主机无法显示窗口。

随包 ADB 的版本、校验值和上游 notice 见 [runtime 清单](assets/platform-tools/MANIFEST.md)。更完整的工具、截图历史、Token 与 KV Cache 行为见[模型交互说明](docs/model-experience.zh.md)。

## 开发

仓库不需要 DeepSeek Harness 源码 checkout 即可构建：

```sh
corepack enable
pnpm install
pnpm run check
npm pack
```

发布由仓库级 [GitHub Release workflow](../.github/workflows/deepseek-harness-plugin-release.yml) 完成：tag 必须是 `dsh-coremate-mobile-v` 加 `package.json` 中的准确版本。不要重复使用已经存在的版本 tag。兼容范围以 `package.json` 的 `peerDependencies` 为准。

完整的官方 Harness 源码准备、隔离 profile 安装、配置优先级、运行时验证和移除记录见[开发者接入与实测记录](docs/research/deepseek-harness-plugin-integration.md)。
