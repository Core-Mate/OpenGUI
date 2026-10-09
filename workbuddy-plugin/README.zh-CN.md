# OpenGUI for WorkBuddy 0.3.1 候选版

本轮支持 macOS，协议版本 8。这是本地候选交付，不代表已公开发布或所有真机验收通过。

使用流程：选择手机 → `opengui_open_viewer` → 宿主在聊天右侧打开 URL → `opengui_viewer_status` 最多等待 30 秒 → 真实视频首帧验证成功 → 打开关联 viewerId 的控制会话 → 截图与动作。

WorkBuddy 使用内置 present_files，传入 URL 与当前工作目录。国内版与海外版分别识别配置目录和安装记录。默认不再启动独立 scrcpy 窗口，兼容工具只在用户明确请求时使用。

投屏不会把每帧发给模型。纯观看不需要控制会话和持续模型调用。模型仍通过截图接口观察、按最新 observationId 操作。初始视频没有显示时，零手机操作；超时后报告阻塞，不重复建会话绕过。

首次展示成功后，关闭或隐藏页面不停止 AI 任务；任务完成或取消不关闭仍开着的投屏。手机断连时不换另一台设备，不自动重放结果不确定的动作。再次打开观看不会重启任务。

## 安装

下载安装脚本，在 macOS 终端运行，完成后重启一次 WorkBuddy，再授权技能和连接器。

> [!IMPORTANT]
> **安装后需要重启一次 WorkBuddy。** 请先结束其他任务，用 **⌘Q 完全退出** WorkBuddy，再重新打开，然后授权 OpenGUI。只关闭窗口不算退出。

下载地址和完整步骤已放入[根 README 的 WorkBuddy 安装部分](../README.zh-CN.md#workbuddy-安装)。验证及排障见 [INSTALL.md](INSTALL.md)，下面的归档命令用于维护和本地验证。

核对安装器及归档旁的 SHA-256 文件，结束旧任务、关闭旧展示后运行：

```sh
bash scripts/install-macos.command --archive /绝对路径/opengui-mcp-0.3.1.tgz
```

安装器自动准备独立 Node 与 scrcpy 资源，缓存完整时复用；准备失败保留旧配置，并输出恢复步骤。安装完成后重启一次 WorkBuddy，使新 MCP 配置加载生效；外部 Hook 变更在 `/hooks` 中审查应用，并在 `/skills` 中确认 `opengui`。可用 --check 做只读预检，用 --app 指定国内或海外应用。

升级前仍需结束旧手机任务并关闭旧展示。如果旧 broker 仍在运行，先在 MCP 服务管理中停用旧 OpenGUI，等待其空闲退出后重试；安装器不会强杀 WorkBuddy 或手机进程。

自动发现支持 `com.workbuddy.workbuddy`、`com.workbuddy.workbuddy-ai` 和旧的 `com.tencent.workbuddy.*` 标识。两种应用同时存在时，优先 WorkBuddy（含旧标识），只有 WorkBuddy AI 时选择 AI 版。同一优先级有多个副本时，需要用 `--app` 明确选择；显式指定应用会覆盖默认优先级。配置目录从所选应用的产品信息读取，支持 `.workbuddy` 和 `.workbuddy-ai`。

Node 与 npm 依赖默认使用 npmmirror，失败时回退官方源；用 `--download-source official` 可切回官方源，选择只影响本次安装。视频组件另从 GitHub 下载，可用 `--video-mirror https://镜像地址/归档目录` 指定相同归档的镜像，保留大小和 SHA-256 校验并支持官方回退。详见[下载源选项](INSTALL.md#download-sources)；旧包不支持新的视频镜像选项。

安装结果分别报告“配置已写入”“宿主已加载”“设备墙可用”，写入配置不是验收通过。安装后在实际宿主选择 OpenGUI Skill，先检查只读设备发现，再验收右侧视频与截图操作。

## 回退和验收

回退前结束当前控制任务、关闭展示；使用保留的旧版安装器和旧归档重新安装。安装目录保留旧包及配置恢复记录。不要强杀其他宿主进程，不要整体覆盖配置或删除无关插件。

两端分别独立构建和打包，不依赖 DSH。当前验证结果及尚未通过的项目见候选验收报告。浏览器支持解码、模拟视频通过、真机播放、宿主自动操作、发布上线是不同证据。
