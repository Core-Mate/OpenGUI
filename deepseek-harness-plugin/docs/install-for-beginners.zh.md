# OpenGUI 手机插件安装指南（普通用户版）

这份指南面向不会编程的用户。你不需要下载源码、使用 Git、构建项目或修改 DeepSeek Harness。你只需要下载一个 `.tgz` 插件文件、复制几条命令，并填写模型服务信息。

## 目前能不能直接安装？

可以。从 [OpenGUI 的公开 Release](https://github.com/Core-Mate/OpenGUI/releases/tag/dsh-coremate-mobile-v0.1.11) 打开插件版本，在 Assets 中下载 `dsh-coremate-mobile-0.1.11.tgz`。

下载后不要解压。不要下载 “Source code (zip)” 或 “Source code (tar.gz)”；它们是 GitHub 自动生成的源码压缩包，不是普通用户安装包。

## 安装前需要准备什么？

开始前确认以下事项：

1. 电脑已经能启动官方 DeepSeek Harness；本版本支持 `0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1` 和 `0.1.1-rc.2`，建议使用 `0.1.1-rc.2`。
2. 已下载 `dsh-coremate-mobile-0.1.11.tgz`，并且没有解压。
3. 电脑能访问公开的 GitHub Releases；不需要登录 GitHub。
4. Node.js 版本为 `22.19.x`，或 `24` 及以上。如果 `node --version` 不在这个范围，请先切换到受支持版本。
5. Harness 当前对话里已选择一个模型。该模型最好支持图片输入和工具调用；如果不兼容，OpenGUI 会在第一次真实任务时引导配置专用视觉模型。
6. Android 手机已经通过 USB 连接电脑，已打开“USB 调试”，并在手机上点过“允许”。
7. 电脑是 macOS（Apple 芯片或 Intel）、Windows x64，或 Linux x64。Linux arm64 和 Windows arm64 暂不支持随包 ADB。

如果你的 Harness 版本不在上面的四个版本中，请先向插件维护者确认兼容性；`0.1.2-alpha.4` 当前不支持。本指南默认 Harness 使用 `web` profile，并把用户数据保存在默认的 `$HOME/.dsh`（Windows 为 `%USERPROFILE%\.dsh`）；自定义过这些位置的用户应替换文中的对应路径。

## 第一步：确认 DeepSeek Harness 可以运行

在 macOS 打开“终端”；在 Windows 打开“PowerShell”。复制下面的命令并按回车：

```sh
npx @deepseek-ai/dsh@0.1.1-rc.2 --help
```

第一次执行可能会询问是否下载软件包，输入 `y` 后按回车。看到 DeepSeek Harness 的帮助内容表示可以继续。如果提示找不到 `node` 或 `npx`，说明官方 Harness 的运行环境还没有安装好，应先完成官方 Harness 安装。

首次下载官方 Harness 依赖可能需要几分钟，中间可能没有任何新文字。只要终端没有返回命令提示符，就先等待，不要重复打开多个终端执行同一命令。本次实测首次运行约等待了三分钟，之后的命令会明显更快。

## 第二步：安装插件

先在终端中输入下面这段内容，最后保留一个空格，不要立即按回车：

```text
npx @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add 
```

找到下载好的 `dsh-coremate-mobile-0.1.11.tgz`，用鼠标把它拖进终端窗口，终端会自动填入文件路径，然后按回车。

看到 `dsh-coremate-mobile 0.1.11` 和安装完成信息，表示插件文件已经加入 Harness。此时还没有证明插件能够启动；第三步会进行实际装载验证。

### 如果出现 `ERR_PNPM_IGNORED_BUILDS`

这是首次安装时可能出现的安全确认，不是插件损坏。先不要关闭终端。

macOS 用户复制下面的命令并按回车：

```sh
open -e "$HOME/.dsh/profiles/web/pnpm-workspace.yaml"
```

Windows PowerShell 用户复制下面的命令并按回车：

```powershell
notepad "$env:USERPROFILE\.dsh\profiles\web\pnpm-workspace.yaml"
```

在打开的文件中找到 `allowBuilds:`。保留文件中的其他内容，把下面两个项目改成 `false`：

```yaml
allowBuilds:
  '@google/genai': false
  protobufjs: false
```

保存并关闭文件，然后重新执行本步骤开头的安装命令。不要把整个文件替换成上面的三行，只修改 `allowBuilds` 下面同名项目的值。

## 第三步：启动并确认插件出现

复制下面的命令并按回车：

```sh
npx @deepseek-ai/dsh@0.1.1-rc.2 web
```

终端会显示一个以 `http://127.0.0.1:` 开头的网址。在浏览器中打开这个网址，然后发送：

```text
/opengui
```

如果返回下面的提示，说明插件已经安装并成功加载：

```text
Usage: /opengui <task>
```

如果终端出现红色错误，请不要继续操作手机，先查看本文末尾的“常见问题”。

打开 DSH、查看 OpenGUI Tab 手机列表或使用“独立窗口”，都不需要先填写 OpenGUI 专用模型。

页面顶部还会出现 `OpenGUI` Tab。进入后，已连接手机的画面默认展开；下方三个场景模板只会把 `@OpenGUI` 任务填入输入框，不会自动发送。

## 第四步：执行第一个手机任务

确认手机仍通过 USB 连接电脑、屏幕已解锁，并且手机没有显示 USB 调试授权弹窗。然后在 Harness 中发送：

```text
/opengui 打开设置并告诉我 Android 版本
```

也可以在输入框键入 `@`，选择唯一的 `@OpenGUI` 候选，再描述任务。裸 `@OpenGUI` 只显示用法，不会检查手机或模型。

执行期间不要拔掉 USB 线，也不要同时发送第二个 `/opengui` 任务。

OpenGUI 默认复用当前 DSH 会话模型。当前模型明确支持图片时会直接执行；自定义模型遗漏能力声明时，只会询它是否支持图片和工具调用，确认后自动补全当前模型并继续；明确不支持图片时，才会引导配置专用视觉模型。只有选择专用模型后才会出现 Base URL、协议、模型 ID 和 API Key。API Key 只保存到 Harness 凭据存储，不会成为聊天消息。

跳过任何一步都会安全取消本次任务，不调用模型、不操作手机、不保存半套配置。工作台画面和手动投屏不受影响，下次提交任务时会重新询问。

如果当前模型在执行过程中实际报告不支持图片或工具调用，OpenGUI 不会自动重跑原任务，以免重复手机操作。完成专用模型配置后，请手动重新提交任务。

需要操作网页时也使用同一个命令，例如 `/opengui 打开 https://example.com 并告诉我页面标题`。按产品规则，这类任务也会先确认至少一台手机已连接并选中，然后才让路由模型判断是否调用浏览器。只有任务实际需要浏览器时，界面才会提示安装插件托管的 Chromium；确认后会自动下载并继续原任务，不依赖 CoreMateDesktop2 或系统 Chrome。

## 怎样卸载？

如果通过 macOS 安装 Skill 安装，在仓库中执行：

```sh
./skills/opengui-coremate-install/scripts/uninstall-macos.sh
```

这个脚本会停止并删除 OpenGUI 自己的后台启动项，再移除插件，不会删除设置、密钥和缓存。其他安装方式可在终端执行：

```sh
npx @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web remove dsh-coremate-mobile
```

然后打开 `$HOME/.dsh/settings.yaml`（Windows 为 `%USERPROFILE%\.dsh\settings.yaml`），删除从 `coremate-mobile:` 开始的四行。如果以后不会再使用这个插件，也可以从 `.credentials.yaml` 删除 `COREMATE_MOBILE_API_KEY` 那一行。

## 常见问题

### GitHub 页面没有 `.tgz` 文件

确认打开的是 Releases 页面，并展开最新版本的 Assets。不要下载源码 ZIP；如果 Assets 中仍然没有 `.tgz`，说明该版本的自动发布失败，请联系维护者。

### 提示 `ERR_PNPM_IGNORED_BUILDS`

按照第二步的安全确认说明，把 `@google/genai` 和 `protobufjs` 设为 `false`，保存后重新执行安装命令。

### 输入 `/opengui` 没有任何提示

先确认安装命令没有报错，然后完全停止并重新启动 Harness。仍然没有时，把终端中的完整错误文字发给插件维护者，不要只发送截图的最后一行。

### 提示 API Key、401 或 unauthorized

检查 `.credentials.yaml` 中的 Key 是否正确、是否过期，以及 Key 前后是否多了引号或空格。这里的 unauthorized 是模型服务认证问题，不是手机 USB 授权问题。

### 提示没有可用设备或 device unauthorized

解锁手机，重新插拔 USB 线，在手机弹窗中点“允许 USB 调试”。如果没有弹窗，可在开发者选项中撤销 USB 调试授权后重新连接。

### 模型能聊天，但不会操作手机

确认所选模型同时支持图片输入和工具调用，并确认 `api` 与模型服务商要求的协议一致。仅支持文字的模型无法理解手机截图。

## 向维护者求助时提供什么？

请提供：电脑系统（macOS、Windows 或 Linux）、DeepSeek Harness 版本、插件版本、执行到第几步，以及终端中的完整错误文字。不要发送 API Key，也不要发送 `.credentials.yaml` 文件。
