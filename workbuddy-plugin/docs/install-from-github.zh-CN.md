# 从 GitHub 安装 OpenGUI 到 WorkBuddy

适用于 macOS（Apple 芯片 / Intel）、WorkBuddy 5.5.3 及以上版本，包含国际版 WorkBuddy AI。通过 [OpenGUI GitHub 仓库](https://github.com/Core-Mate/OpenGUI)和 GitHub Release 安装本地 MCP、Skill、任务 Hooks 及依赖，不需要先在官方连接器市场上架，也不需要部署 `server/` 或编译 Android 客户端。

当前公开运行时为 [0.4.1 公测预发布版](https://github.com/Core-Mate/OpenGUI/releases/tag/opengui-workbuddy-v0.4.1)，国内版和国际版共用同一个安装包。中英文切换、自动跟随 WorkBuddy 语言和模拟器下拉框改进尚未合入公开源码或安装包。

完整流程：**运行 GitHub 安装脚本 → 重启 WorkBuddy 一次 → 用户授权 Skill 和 MCP → 原生工具验证 → 登录并开始手机任务**。

## 选择版本与安装方式

| 目标 | 使用方式 |
| --- | --- |
| 国际版 WorkBuddy AI，安装 GitHub 已发布运行时 | 使用本文的 `--app "/Applications/WorkBuddy AI.app" --download-source official` 命令。 |
| 国内版 WorkBuddy，安装 GitHub 已发布运行时 | 将 `--app` 改为 `"/Applications/WorkBuddy.app"`；可按网络情况选择 `cn` 或 `official` 下载源。 |
| 安装当前源码，包括本地未发布改动 | 在源码目录构建并打包，再用 `--archive` 安装本地产物，见下方“当前源码安装”。 |

两版同时安装时，明确指定 `--app`，以免自动发现选中另一版。应用不在 `/Applications` 时，改成其实际绝对路径。配置目录从所选应用的产品信息读取；国际版当前为 `~/.workbuddy-ai`。

本文所说“从 GitHub 安装”是下载并执行仓库提供的完整安装器。上传单个 `SKILL.md` 或手动添加一段 MCP JSON，不能替代任务 Hooks 和本地依赖的安装。

## 方式一：在国际版 WorkBuddy 聊天中发起

打开国际版 WorkBuddy，新建聊天，粘贴：

```text
请从官方仓库 https://github.com/Core-Mate/OpenGUI 安装 OpenGUI 到本机国际版 WorkBuddy AI。
我的国际版应用位于 /Applications/WorkBuddy AI.app。

先读取仓库 workbuddy-plugin/docs/install-from-github.zh-CN.md，并检查公开安装脚本的参数。
使用仓库 workbuddy-plugin/install.sh，明确指定 --app "/Applications/WorkBuddy AI.app" 和 --download-source official。
先执行 --check；通过后执行完整安装，保留安装结果、日志和授权指南路径。
已有运行中的 OpenGUI 任务导致升级受阻时，报告原因并保留原配置，不强制结束进程。

安装完成后提醒我结束其他任务，用 Command-Q 完全退出并重新打开国际版。
Skill 授权、MCP Trust/启用和可能出现的 Hooks 审阅由我本人完成。
我确认完成后，只调用一次 opengui_list_devices 验证连接，报告成功与设备数量。
安装和连接验证期间，不截图、不打开投屏、不创建控制会话、不操作手机。
```

WorkBuddy 的正常终端权限提示仍适用。如果它无法读取 GitHub 或执行安装命令，使用下面的终端方式。无需把整个 OpenGUI 源码复制进聊天，也无需让它从零重新实现插件。

## 方式二：在 macOS 终端安装已发布版本

可选：先执行环境检查。入口会下载并校验文件、保留本次检查记录，不写 MCP、Skill 或 Hooks 配置：

```bash
cd "$HOME" && curl -fsSL https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/install.sh | bash -s -- --check --app "/Applications/WorkBuddy AI.app" --download-source official
```

然后执行完整安装：

```bash
cd "$HOME" && curl -fsSL https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/install.sh | bash -s -- --app "/Applications/WorkBuddy AI.app" --download-source official
```

也可以[下载 install.sh](https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/install.sh)，保存到电脑后执行：

```bash
bash /实际下载路径/install.sh --app "/Applications/WorkBuddy AI.app" --download-source official
```

安装器会校验后续脚本、运行包和视频资源，准备私有 Node 与插件依赖，备份并增量合并所选 WorkBuddy 的 MCP、Skill、Hooks 配置。现有其他插件保留。运行包版本由 GitHub 安装器指定，安装 GitHub Release 的构建产物，不会自动包含本机未提交的改动。

Node/npm 的 `official` 源分别为 `nodejs.org` 和 `registry.npmjs.org`；视频和 OpenGUI 运行包另从 GitHub 获取。网络问题可以选择[下载源或视频镜像](../INSTALL.md#download-sources)，校验失败时应排查文件来源，不跳过校验。

## 重启与原生授权

1. 确认安装输出包含 `CONFIG_WRITTEN`；GitHub 脚本入口还会打印 `INSTALLATION_RESULT` 和 `AUTHORIZATION_GUIDE`。本次回执中的 `status=configuration_written` 只证明配置已写入。
2. 结束其他 WorkBuddy 任务，按 **⌘Q 完全退出**，再打开国际版 WorkBuddy AI。关闭窗口不能代替退出。
3. 打开 **Experts · Skills · Connectors → Connectors → Custom connectors**，找到 `opengui`，亲自点击 **Trust**，确认开关开启、服务连接成功。
4. 在 **Skills** 中找到 OpenGUI / `opengui`，按提示完成授权并启用。若提示审阅 Hooks，使用 `/hooks` 检查当前 OpenGUI 对应项。

安装器不会替用户完成首次信任。WorkBuddy 可能有独立的工具授权提示，也由用户检查。界面已加载但连接失败时，先看实际错误与本次日志；打开指南失败可以直接打开 `AUTHORIZATION_GUIDE` 对应文件。

## 验证连接与开始使用

授权后新建聊天，发送：

```text
仅验证 OpenGUI MCP 连接：调用一次 opengui_list_devices，用中文报告调用是否成功、发现几台设备。
不截图、不打开工作台或投屏、不创建控制会话、不操作手机。
```

看到原生 `opengui_list_devices` 成功返回，才算通过 WorkBuddy 工具调用验证。设备数量为 0 也可以证明连接成功；安装回执、开关启用、单独进程返回工具目录，都不能代替这次原生调用。

开始实际任务时：

1. Android 手机开启 USB 调试，连接电脑，在手机上允许调试授权；也可使用支持的本地模拟器。
2. 在 WorkBuddy 输入 `/opengui`，按工作台提示登录 OpenGUI 账号。当前账号服务仍需中国大陆手机号；WorkBuddy 的 Google/GitHub 登录与其独立。
3. 输入真实任务，检查目标和设备，点击“开始执行”。例如：“打开手机设置，再返回桌面，确认回到桌面后结束。”

连接验证不等于真机任务验收；首次画面、操作、停止、接管和报告分别以实际执行结果为准。

## 当前源码安装

这条路线适合开发者验证当前提交或本地改动，要求有兼容 Node/npm；macOS 构建包含原生辅助程序，还需要 Xcode Command Line Tools。普通用户使用上方已发布版本安装即可。

从 GitHub 获取一个独立源码目录，或使用现有工作区；已有目录中先检查本地改动，再决定更新方式：

```bash
git clone https://github.com/Core-Mate/OpenGUI.git
cd OpenGUI/workbuddy-plugin
npm ci
npm run pack:release
```

打包成功后，由当前源码的 `package.json` 读取版本，再安装对应归档：

```bash
plugin_version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')
bash scripts/install-macos.command \
  --app "/Applications/WorkBuddy AI.app" \
  --download-source official \
  --archive "$PWD/dist/opengui-mcp-$plugin_version.tgz"
```

归档与相邻 `.sha256` 保持在同一目录。源码安装后也要完成上面的重启、原生授权及只读工具调用验证。WorkBuddy 聊天同样可以在该源码工作区执行这组命令；需要安装当前源码时，明确要求 `--archive`，否则安装器仍会下载已发布运行时。

[安装验证及排障](../INSTALL.md) · [授权动图与说明](../resources/OpenGUI-授权指南.html) · [GitHub Releases](https://github.com/Core-Mate/OpenGUI/releases)
