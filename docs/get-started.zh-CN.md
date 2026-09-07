<p align="center">
  <strong>语言切换：</strong><a href="./get-started.md">English</a> | <a href="./get-started.zh-CN.md">简体中文</a> | <a href="./get-started.ja-JP.md">日本語</a>
</p>

# OpenGUI 快速入门

本仓库已经包含可运行的后端和 Android 客户端。

## 方式一：使用 Claude Code、Codex 或 OpenCode 启动

首先使用 Bootstrap Skill：

- [`skills/open-gui-bootstrap/SKILL.md`](../skills/open-gui-bootstrap/SKILL.md)

推荐提示词：

```text
Read ./skills/open-gui-bootstrap/SKILL.md and help me run OpenGUI. Only ask me for phone-side actions.
```

同一段提示词也适用于 OpenCode。由于本仓库将 Skill 放在顶层 `skills/` 目录中，请像上面一样明确指定路径。OpenCode 的自动发现机制会查找 `.opencode/skills/`、`.agents/skills/` 等目录；详情请参阅其 [Agent Skills 文档](https://opencode.ai/docs/skills/)。OpenGUI 不需要额外的 OpenCode 专用配置。

Skill 应直接使用仓库脚本：

- `server/start.sh`
- `client/start.sh`

## 方式二：手动配置

### 1. 启动后端

```bash
cd server
./start.sh
```

`server/start.sh` 会执行以下操作：

- 检查 Node.js 22+、pnpm 和 Docker
- 在 Docker 中启动 PostgreSQL 和 Redis
- 首次运行时，根据 `.env.example` 创建 `server/apps/backend/.env`
- 安装依赖
- 生成 Prisma client
- 推送数据库 schema 并写入默认后端数据
- 在 `7777` 端口启动后端

首次使用默认配置时，只需添加模型 API Key：

- `VLM_API_KEY`

后端目前使用 `VLM_*` 变量作为 graph agent 共用的 OpenAI 兼容模型配置。规划、监督、总结和 executor 的视觉链路都会使用这些变量。

`.env.example` 已为 `VLM_BASE_URL` 和 `VLM_MODEL` 提供默认值。只有在使用其他 OpenAI 兼容服务商或模型时才需要修改。

示例：

```env
VLM_API_KEY=your_api_key
VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VLM_MODEL=qwen3.6-plus
```

没有 `VLM_API_KEY` 时后端仍可启动，但 graph 需要调用模型时，真实任务将执行失败。首次运行不需要配置 LangSmith tracing 和 IM channel 凭据。

启动后可使用以下地址：

- API：`http://localhost:7777/api`
- 文档：`http://localhost:7777/docs`

### 2. 连接设备并安装 Android 客户端

OpenGUI 不需要 Root，也不需要解锁 Bootloader。OpenGUI 通过 Android 标准的 `AccessibilityService` API 获取截图并执行手势。ADB 只用于安装和启动 APK，以及为本地后端配置 `adb reverse`；它不会 Root 或修改 Android 系统。

当前 Android 客户端要求 Android 11（API 30）或更高版本。Android 9（API 28）及其他更早版本不支持当前基于截图的执行链路。客户端目前以 Android 15（API 35）为目标版本。

```bash
cd client
./start.sh
```

`client/start.sh` 会执行以下操作：

- 检查 `adb` 和 Java
- 要求连接一台 Android 设备
- 执行 `adb reverse tcp:7777 tcp:7777`
- 构建 debug APK
- 安装 APK
- 启动 `com.coremate.opengui/.login.SplashActivity`

`adb reverse` 映射属于当前 ADB 设备连接。手机断开后重新连接、手机重启或 ADB 服务重启后，该映射可能会丢失。如果 Android 客户端无法再次连接本地后端，请重新连接设备并执行：

```bash
adb reverse tcp:7777 tcp:7777
```

重新运行 `client/start.sh` 也会重新创建该映射。

### 3. 完成手机端权限配置

打开应用并启用：

- USB 调试授权
- 无障碍服务
- 悬浮窗权限
- 必要时允许 OpenGUI 忽略电池优化

## 当前源码开放版本的行为

当前源码开放版本的 Android 应用会跳过旧的登录流程，直接进入 `HomeActivity`。

本地运行时，后端任务 controller 也默认使用 `userId = 1`，因此首次配置不再依赖旧的 OTP 流程。

## 更多资料

- 后端详情：[`server/apps/backend/README.md`](../server/apps/backend/README.md)
- Discord 远程控制：[`docs/DISCORD.zh-CN.md`](./DISCORD.zh-CN.md)
- Android 客户端详情：[`client/README.md`](../client/README.md)
