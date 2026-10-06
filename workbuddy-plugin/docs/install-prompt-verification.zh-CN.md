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
