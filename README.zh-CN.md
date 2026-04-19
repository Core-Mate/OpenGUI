<div align="center">

# OpenGUI

**面向真实 Android 设备自主控制的 AI Agent 系统**

<p>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/android-API%2024%2B-green" alt="Android">
  <img src="https://img.shields.io/badge/kotlin-2.0-purple" alt="Kotlin">
  <img src="https://img.shields.io/badge/langgraph-powered-orange" alt="LangGraph">
  <a href="./README.md"><img src="https://img.shields.io/badge/README-English-black" alt="English README"></a>
</p>

</div>

OpenGUI 是一个用于真实 Android 设备自主操作的 AI Agent 系统。

你只需要给它一个自然语言任务，它就会观察屏幕、规划步骤、在设备上执行动作，并返回结构化结果。

与依赖写死选择器、脆弱脚本或单 App 适配器的传统移动自动化不同，OpenGUI 通过视觉理解界面、按步骤执行任务，并能在 UI 变化时继续调整和推进。

它最初来自内部移动自动化场景，现在正在逐步开放出来，供更多开发者、研究者和团队使用。

## 一眼看懂 OpenGUI

| 方向 | OpenGUI 提供什么 |
|---|---|
| **视觉优先执行** | 基于截图理解界面状态，而不是依赖写死的选择器 |
| **多步任务规划** | 把目标拆成子任务，执行、复核、重试 |
| **真实 Android 控制** | 通过 AccessibilityService 完成点击、滑动、输入和界面观察 |
| **远程任务下发** | 支持通过飞书、Telegram 或 REST API 触发任务 |
| **开放式架构** | 后端和 Android 客户端都在同一个仓库中 |
| **面向真实场景** | 不只是 Demo，而是为内部流程和移动操作场景设计 |

## Why OpenGUI

大多数移动自动化系统通常依赖：

- 针对单个 App 的选择器
- 容易失效的脚本
- 每个应用都要单独维护的适配逻辑

OpenGUI 采用了不同的方法：

- **看懂屏幕**，而不是依赖脆弱选择器
- **规划再执行**，而不是只回放脚本
- **失败可复核、可重试**，而不是在 UI 变化后直接中断
- **支持远程下发任务**，而不是必须守在设备旁边

这让 OpenGUI 非常适合：

- 内部移动流程自动化
- Android 端 AI Operator
- App 数据采集与总结
- 跨 App 操作任务
- 基于真实设备的移动 GUI Agent 研究

## 典型使用场景

- 搜索微博上的 AI 新闻并汇总前几条结果
- 打开小红书并采集某个主题的近期内容
- 在 Android 设备上执行重复性的移动工作流
- 从飞书或 Telegram 远程触发手机任务
- 在不构建单 App 适配器的前提下，原型化内部 AI Operator

## Quick Install

### 前置依赖

需要准备：

- Node.js `>= 22`
- pnpm `>= 10`
- Docker
- Android Studio
- 建议安装 `adb`
- Claude 兼容 API Key
- 一个视觉模型 API Key

### 1. 克隆仓库

```bash
git clone https://github.com/Core-Mate/open-gui.git
cd open-gui
```

### 2. 启动服务端

```bash
cd server
./start.sh
```

`start.sh` 是推荐的本地启动方式。它会自动完成：

- 检查 Node.js、pnpm、Docker
- 启动 PostgreSQL 和 Redis
- 如果不存在，则从 `.env.example` 创建 `apps/backend/.env`
- 安装依赖
- 生成 Prisma Client
- 初始化数据库结构
- 在 `7777` 端口启动后端服务

第一次运行时有一个重要行为：

- `start.sh` 会先创建 `apps/backend/.env`，然后主动退出
- 你需要先填写 API Key
- 然后再次执行 `./start.sh`

至少需要配置：

```env
CLAUDE_API_KEY=your_claude_api_key
VLM_API_KEY=your_vlm_api_key
VLM_BASE_URL=your_vlm_compatible_endpoint
```

服务端启动后可访问：

- API：`http://localhost:7777/api`
- Swagger：`http://localhost:7777/docs`

### 3. 构建并安装 Android 客户端

```bash
cd ../client
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

也可以直接用 Android Studio 打开 `client/` 并运行。

### 4. 让 Android 客户端连接本地服务端

当前运行时默认地址是：

```text
http://127.0.0.1:7777
```

本地开发最简单的方式是：

```bash
adb reverse tcp:7777 tcp:7777
```

如果你使用真机且不方便走 `adb reverse`，可以在 App 的 Settings 页面把 `BaseUrl` 改成你电脑的局域网地址，例如：

```text
http://192.168.1.10:7777
```

### 5. 打开 Android 必要权限

OpenGUI 至少需要以下权限才能稳定工作：

- 无障碍服务
- 悬浮窗权限
- 电池优化豁免 / 后台无限制

否则客户端无法稳定执行任务，后台连接也容易被系统杀掉。

## Getting Started

### 获取开发环境 Token

在开发模式下，后端会把 OTP 打印到服务端控制台。

先请求 OTP：

```bash
curl -X POST http://localhost:7777/api/user-auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"13800138000"}'
```

再校验 OTP：

```bash
curl -X POST http://localhost:7777/api/user-auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"13800138000","code":"123456"}'
```

导出返回的 Token：

```bash
export OPENGUI_TOKEN="paste_the_token_here"
```

### 创建第一个任务

```bash
curl -X POST http://localhost:7777/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENGUI_TOKEN" \
  -d '{
    "taskName": "Open Xiaohongshu and search for studio apartments in Shanghai",
    "taskDescription": "Launch Xiaohongshu, search for studio apartments in Shanghai, and summarize the top results.",
    "relatedPlatforms": ["XIAOHONGSHU"],
    "category": "CUSTOM"
  }'
```

你也可以直接打开：

- `http://localhost:7777/docs`

通过 Swagger 查看和调试接口。

## CLI / Runtime Quick Reference

| 操作 | 命令 / 路径 |
|---|---|
| 启动后端 | `cd server && ./start.sh` |
| 构建 Android App | `cd client && ./gradlew assembleDebug` |
| 安装 APK | `adb install app/build/outputs/apk/debug/app-debug.apk` |
| 本地端口转发 | `adb reverse tcp:7777 tcp:7777` |
| 后端文档 | `http://localhost:7777/docs` |
| 后端 API | `http://localhost:7777/api` |
| 主配置文件 | `server/apps/backend/.env` |
| Android 服务端覆盖地址 | App Settings -> `BaseUrl` |

## 架构说明

OpenGUI 主要由两部分组成：

- `server/`：大脑
- `client/`：双手

后端负责规划任务、管理执行状态和向设备派发任务。  
Android 客户端负责保持待命连接、截图，并通过无障碍服务执行动作。

<p align="center">
  <img src="docs/architecture.png" alt="OpenGUI architecture" width="900">
</p>

高层执行流程：

```text
任务 / API / IM 请求
  -> Planner
  -> Executor
  -> Android 动作执行循环
  -> Reviewer / 重试
  -> Summarizer
  -> 结构化结果
```

## 当前范围与限制

OpenGUI 现在已经可用，但这里不把它包装成一个已经完全产品化的终端产品。

更准确的定位是：一个正在持续演进的开源移动 Agent 框架。

目前需要注意的边界包括：

- 当前活跃客户端目标是 Android
- 后端有一部分模块在开源版本中仍然是 stub
- 生产级部署、可观测性和多设备编排还在演进中
- 实际稳定性依赖于 App UI 复杂度、模型质量和设备权限状态
- 某些文档和功能面还保留着从内部系统迁移为开源版本的痕迹

如果你准备在内部场景中采用 OpenGUI，通常还需要补齐部署、护栏、评估和任务定制这部分工程工作。

## Documentation

- [docs/get-started.md](./docs/get-started.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CLAUDE.md](./CLAUDE.md)

## Community / Support

如果 OpenGUI 对你有帮助，最有效的支持方式包括：

- 给仓库点 Star
- 提交 bug 和 feature request
- 分享真实使用场景和部署反馈
- 贡献文档、集成和修复
- 推荐给正在做移动 AI Agent 的团队

对于一个从内部系统逐步开放出来的项目来说，真实使用反馈尤其重要，因为它会直接影响接下来哪些能力最值得优先做成 public-grade。

## License

OpenGUI 采用 Apache 2.0 License。

详见 [LICENSE](./LICENSE).
