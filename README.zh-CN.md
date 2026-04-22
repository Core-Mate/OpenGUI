<p align="center">
  <strong>语言切换：</strong><a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="./docs/assets/opengui-banner.svg" alt="OpenGUI banner" width="100%">
</p>

<p align="center">
  <a href="./skills/open-gui-bootstrap/SKILL.md"><img src="https://img.shields.io/badge/BOOTSTRAP-WITH_CLAUDE_OR_CODEX-ffb000?style=for-the-badge" alt="Bootstrap with Claude or Codex"></a>
  <img src="https://img.shields.io/badge/SYSTEM-MULTI_ROLE_OPERATOR-1f6feb?style=for-the-badge" alt="Multi-role operator system">
  <img src="https://img.shields.io/badge/TASKS-UP_TO_12_HOURS-cf222e?style=for-the-badge" alt="Tasks up to 12 hours">
  <img src="https://img.shields.io/badge/MODELS-CLAUDE_GPT_GEMINI_KIMI_MINIMAX-2f9e44?style=for-the-badge" alt="Supported model providers">
  <a href="./docs/get-started.md"><img src="https://img.shields.io/badge/MANUAL_SETUP-DOCS-4b4b4b?style=for-the-badge" alt="Manual setup docs"></a>
</p>

## OpenGUI 是什么

OpenGUI 让 AI 操作真实的 Android 手机。

这个仓库现在已经包含可运行的主要部分：NestJS 后端、基于 LangGraph 的 agent graph、Android 客户端、待命与执行 WebSocket 通道，以及给 Claude 或 Codex 使用的 bootstrap skill。

后端负责任务编排和远程下发。Android 客户端贴近设备执行，通过 AccessibilityService 完成动作、截图，并保持待命连接，接收远程任务。

## 为长时任务而设计

OpenGUI 面向长时移动工作流，适合持续运行数小时的任务。

从源码结构看，这个定位是明确的：

- **Plan Supervisor** 负责维护任务列表和继续执行状态。
- **Executor Graph** 围绕当前设备状态运行截图、视觉分析、动作执行和 call-user 循环。
- **Summarizer** 在任务结束时输出结构化结果。
- **待命派发链路** 让设备可以通过飞书、Telegram 或 REST 入口接收远程任务。
- **模型路由** 把规划侧和 VLM 执行侧分开，便于按角色选择 provider。

长任务真正依赖的是系统稳定性。OpenGUI 的 graph、设备执行链路和模型分工，都是围绕这件事组织起来的。

## 为什么 OpenGUI 不一样

OpenGUI 采用的是一套分层清晰的移动 operator system。

当前源码里可以直接看到这些关键部分：

- `server/apps/backend/src/modules/graph-agent/graph/mobile-agent.graph.ts` 主图
- `server/apps/backend/src/modules/graph-agent/graph/executor.graph.ts` 设备执行子图
- `server/apps/backend/src/common/ws/standby.gateway.ts` 待命设备派发
- `client/core_network/.../StandbySocketManager.kt` 设备待命连接
- `client/core_accessibility/.../GestureService.kt` Android 侧动作执行

| 维度 | 典型手机 Agent Demo | OpenGUI |
|---|---|---|
| **执行模型** | 短时交互循环 | 主图 + executor 子图 |
| **任务状态** | 常常停留在本地会话里 | 任务状态由后端 graph 持有 |
| **设备链路** | 常见是电脑侧驱动手机 | Android 客户端自带待命与执行连接 |
| **模型使用** | 一个主模型承担大部分工作 | 规划和 VLM 执行可以拆给不同 provider |
| **远程运行** | 往往是附加能力 | 飞书、Telegram、REST API、待命派发已经在后端里 |

## 典型使用场景

- 搜索微博上的 AI 新闻并汇总前几条结果
- 打开 X 并采集某个主题的近期内容
- 在 Android 设备上执行重复性的移动工作流
- 从飞书或 Telegram 远程触发手机任务
- 运行需要状态管理、复核和恢复机制的长时移动工作流

## 先用 Bootstrap Skill

如果你在使用 Claude 或 Codex，优先从 [`skills/open-gui-bootstrap/SKILL.md`](./skills/open-gui-bootstrap/SKILL.md) 开始。

这个 skill 应该直接走仓库里已经存在的真实安装路径：

- 运行 `server/start.sh`
- 首次从 `server/apps/backend/.env.example` 生成 `.env`
- 只在缺少 `CLAUDE_API_KEY`、`VLM_API_KEY` 这类关键配置时打断用户
- 用 Docker 启动 PostgreSQL 和 Redis
- 生成 Prisma client，推送 schema，并导入初始化数据
- 运行 `client/start.sh`
- 在设备已连接时自动执行 `adb reverse tcp:7777 tcp:7777`、构建 APK、安装并拉起 App

用户只需要在这些事情上介入：

- 连接手机或启动模拟器
- 允许 USB 调试
- 开启 AccessibilityService
- 授予悬浮窗或电池权限
- 提供 API Key 或机器人密钥

### 直接运行

```text
读一下 ./skills/open-gui-bootstrap/SKILL.md，然后帮我把 OpenGUI 跑起来，只在必须时告诉我手机上要做什么。
```

### 使用 Claude

```text
读一下 ./skills/open-gui-bootstrap/SKILL.md，然后用 Claude 帮我 bootstrap OpenGUI。
```

### 使用 GPT + Gemini

```text
读一下 ./skills/open-gui-bootstrap/SKILL.md，然后帮我用 GPT 做规划，用 Gemini 做视觉分析，把 OpenGUI 配好。
```

### 使用我自己的 API

```text
读一下 ./skills/open-gui-bootstrap/SKILL.md，然后用我现有的模型 API 把 OpenGUI 跑起来。
```

## 手动安装

这里直接给你真实可用的安装入口：

- [docs/get-started.md](./docs/get-started.md)
- [server/start.sh](./server/start.sh)
- [client/start.sh](./client/start.sh)
- [server/apps/backend/README.md](./server/apps/backend/README.md)
- [client/README.md](./client/README.md)

## 系统结构

```mermaid
flowchart LR
    U["用户或 IM 指令"] --> BS["Bootstrap Skill / API / IM 入口"]
    BS --> SP["Plan Supervisor"]

    SP --> EX["Executor Graph"]
    EX --> AC["Android 客户端"]
    AC --> GX["AccessibilityService + 截图 + 动作"]
    EX --> RV["执行复核与重试"]
    RV --> SP

    SP --> SM["Summarizer"]
    SM --> SR["结构化结果"]

    RD["Feishu / Telegram / REST API"] --> ST["Standby Gateway"]
    ST --> AC

    SP --> MR["Model Routing"]
    MR --> MA["Claude / GPT / Gemini / Kimi / MiniMax / compatible"]
    EX --> MR
```

### 运行时核心部件

- **后端 graph**：`server/apps/backend/src/modules/graph-agent/graph/`
- **任务 API**：`server/apps/backend/src/modules/task/task.controller.ts`
- **待命派发**：`server/apps/backend/src/common/ws/standby.gateway.ts`
- **设备待命连接**：`client/core_network/src/main/java/com/coremate/opengui/network/websocket/StandbySocketManager.kt`
- **Android 执行链路**：`client/core_accessibility/src/main/java/com/coremate/opengui/accessibility/GestureService.kt`

## 当前范围与限制

OpenGUI 现在已经可以直接从这个仓库跑起来，但它仍然处在持续演进阶段，定位更接近开源移动 operator framework。

目前需要注意的边界包括：

- 当前活跃客户端目标是 Android
- 后端仍有一部分模块在公开版本中是 stub，例如 `credits`、`knowledge`、`tos`
- 生产级部署、可观测性和多设备编排还在继续完善
- 实际运行质量仍然依赖 App UI 复杂度、模型质量和设备权限状态
- 仓库里现在有两个中文 README，当前版本以 `README.zh-CN.md` 为准

还有一个和旧文档不同的点已经在代码里落地：`SplashActivity` 在开源版本里直接跳转到 `HomeActivity`，不再把登录放在首跑入口。后端任务控制器也默认使用 `userId = 1`，所以本地启动路径不再依赖早期的 OTP 登录流程。

## Documentation

- [skills/open-gui-bootstrap/SKILL.md](./skills/open-gui-bootstrap/SKILL.md)
- [docs/get-started.md](./docs/get-started.md)
- [server/apps/backend/README.md](./server/apps/backend/README.md)
- [client/README.md](./client/README.md)
- [PUBLIC_RELEASE_PLAN.md](./PUBLIC_RELEASE_PLAN.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CLAUDE.md](./CLAUDE.md)

## Community / Support

如果 OpenGUI 对你有帮助，最有效的支持方式包括：

- 给仓库点 Star
- 提交 bug 和 feature request
- 分享真实使用场景和部署反馈
- 贡献文档、集成和修复
- 推荐给正在做移动 AI Agent 的团队

## License

OpenGUI 采用 Apache 2.0 License。

详见 [LICENSE](./LICENSE)。