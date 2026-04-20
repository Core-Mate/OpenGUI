<div align="center">
  <h1>OpenGUI</h1>
  <p><b>开源 AI Agent —— 自主操控移动设备</b></p>
  <p>
    <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
    <img src="https://img.shields.io/badge/node-≥22-brightgreen" alt="Node.js">
    <img src="https://img.shields.io/badge/kotlin-2.0-purple" alt="Kotlin">
    <img src="https://img.shields.io/badge/android-API%2024+-green" alt="Android">
    <img src="https://img.shields.io/badge/LangGraph-powered-orange" alt="LangGraph">
    <a href="./README.md"><img src="https://img.shields.io/badge/Docs-English-blue" alt="English"></a>
  </p>
</div>

🤖 **OpenGUI** 是一个 AI 驱动的移动端 Agent 系统，能够**自主操控 Android 设备**完成复杂的多步骤任务。服务端是大脑（LangGraph），Android 客户端是双手（无障碍服务）。

⚡ 用自然语言告诉它你想做什么——它会自动规划、执行、观察并自我纠正。适用于**任何 Android App**，无需针对特定应用做适配。

## 📢 动态

- **2026-03-30** 🎉 OpenGUI 正式开源！首个版本包含 LangGraph Agent 核心、视觉驱动执行、飞书和 Telegram 机器人集成。

## 核心特性

🔬 **视觉优先** — 截屏 + 视觉语言模型（VLM），不依赖 XPath 选择器。适用于任何 App、任何语言，自动适应 UI 变化。

🧠 **多步骤规划** — 基于 LangGraph 状态机，将复杂目标拆解为子任务，带有重试循环和自我纠正能力。

⚡ **实时推流** — 通过 WebSocket 实时推送每一步操作、截图和决策过程。

📱 **远程调度** — 通过飞书机器人、Telegram 机器人或 REST API 触发任务，随时随地监控。

🔓 **完全开源** — Apache 2.0 许可证，零商业 SDK，无供应商锁定。

## 🏗️ 架构

<p align="center">
  <img src="docs/architecture.png" alt="OpenGUI 架构" width="800">
</p>

## 目录

- [动态](#-动态)
- [核心特性](#核心特性)
- [架构](#️-架构)
- [使用场景](#-使用场景)
- [工作原理](#-工作原理)
- [快速开始](#-快速开始)
- [远程调度](#-远程调度)
- [配置](#️-配置)
- [项目结构](#-项目结构)
- [贡献与路线图](#-贡献与路线图)

## ✨ 使用场景

<table align="center">
  <tr align="center">
    <th><p align="center">🔍 社媒数据采集</p></th>
    <th><p align="center">💬 跨应用消息</p></th>
    <th><p align="center">📋 自动化工作流</p></th>
    <th><p align="center">🤖 远程任务调度</p></th>
  </tr>
  <tr>
    <td align="center"><p>"在微博搜索 AI 新闻，收集前 10 条帖子"</p></td>
    <td align="center"><p>"打开微信，给张三发消息说明天开会"</p></td>
    <td align="center"><p>"刷小红书，找成都热门旅游攻略"</p></td>
    <td align="center"><p>通过飞书/Telegram 机器人发任务，在聊天中收结果</p></td>
  </tr>
  <tr>
    <td align="center">发现 · 洞察 · 趋势</td>
    <td align="center">编写 · 发送 · 确认</td>
    <td align="center">浏览 · 采集 · 汇总</td>
    <td align="center">调度 · 监控 · 报告</td>
  </tr>
</table>

## 🔄 工作原理

```
用户："帮我在微博搜索 AI 新闻并收集前10条"

  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  规划器   │────▶│  执行器   │────▶│  审查器   │────▶│  总结器   │
  └──────────┘     └──────────┘     └──────────┘     └──────────┘
       │                │                │                │
  拆解为有序子任务   截图 → VLM 分析    检查子任务是否     整理为结构化
  + 选择所需技能     → 生成操作指令     成功 → 重试或继续  报告
```

1. **规划器**（Claude）接收任务，拆解为有序子任务，选择所需技能
2. **执行器**截取屏幕截图，发送给视觉模型（VLM）分析，决定下一步 GUI 操作（点击坐标、滑动、输入文字等）
3. Android 客户端通过无障碍服务**执行操作** —— Agent 的"双手"
4. **审查器**评估执行结果 —— 重试、继续下一个子任务或上报
5. **总结器**将所有结果整理为结构化报告，返回给用户

> 整条流水线以 LangGraph 状态机运行，通过条件边实现重试循环、错误恢复和子任务转换。

## 🚀 快速开始

### 前置条件

| 依赖 | 版本 |
|------|------|
| Node.js | ≥ 22 |
| pnpm | ≥ 10 |
| Docker | 最新版 |
| Android Studio | 最新版（构建客户端用） |
| AI API 密钥 | Anthropic / OpenAI / 兼容供应商 |

### 服务端

**一键启动：**

```bash
git clone https://github.com/anthropics/opengui.git
cd opengui/server
./start.sh
```

> `start.sh` 会自动：
> 1. 通过 Docker 启动 PostgreSQL 16 + Redis 7
> 2. 如果没有 `.env` 则从 `.env.example` 创建（编辑 API 密钥后重新运行）
> 3. 安装依赖并生成 Prisma Client
> 4. 初始化数据库 Schema + 种子数据
> 5. 在 `http://localhost:7777` 启动开发服务器

<details>
<summary><b>手动安装</b></summary>

```bash
cd server

# 启动依赖服务
docker run -d --name opengui-postgres -p 5432:5432 \
  -e POSTGRES_USER=opengui -e POSTGRES_PASSWORD=opengui -e POSTGRES_DB=opengui \
  postgres:16-alpine
docker run -d --name opengui-redis -p 6379:6379 redis:7-alpine

# 配置
cp apps/backend/.env.example apps/backend/.env
# 编辑 .env —— 至少填入 CLAUDE_API_KEY

# 安装并迁移
pnpm install
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db exec prisma db push

# 启动
pnpm backend
```

- API：`http://localhost:7777/api`
- Swagger 文档：`http://localhost:7777/docs`

</details>

### Android 客户端

```bash
cd client
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

也可以在 Android Studio 中打开 `client/` 目录直接运行。

<details>
<summary><b>配置服务端地址</b></summary>

- **模拟器**：默认 `http://10.0.2.2:7777` 开箱即用
- **物理设备**：在 App 设置界面修改，或编辑 `ServerConstant.kt`

</details>

<details>
<summary><b>所需权限</b></summary>

| 权限 | 用途 |
|------|------|
| 无障碍服务 | 设备自动化 —— 点击、滑动、输入、读取屏幕 |
| 悬浮窗权限 | 执行过程中显示任务状态 |
| 电池优化白名单 | 保持后台执行 |

</details>

> **第一次使用 OpenGUI？** 查看完整的[快速上手指南](docs/get-started-cn.md)获取详细步骤。

## 💬 远程调度

随时随地触发任务 —— 无需在设备旁边。

<details>
<summary><b>飞书机器人</b></summary>

**1. 创建飞书应用**
- 访问[飞书开放平台](https://open.feishu.cn/app)
- 创建新应用 → 启用**机器人**能力
- 添加 `im:message` 权限
- 添加 `im.message.receive_v1` 事件 → 选择**长连接**模式
- 获取 **App ID** 和 **App Secret**

**2. 配置**（在 `server/apps/backend/.env` 中）

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

**3. 使用**

给机器人发送任务描述 —— 执行进度和结果会在聊天中返回。

</details>

<details>
<summary><b>Telegram 机器人</b></summary>

**1. 创建机器人**
- 打开 Telegram，搜索 `@BotFather`
- 发送 `/newbot`，按提示操作
- 复制 token

**2. 配置**（在 `server/apps/backend/.env` 中）

```env
TELEGRAM_BOT_TOKEN=xxx
```

**3. 使用**

给机器人发送任务消息 —— 执行结果会在对话中返回。

</details>

<details>
<summary><b>REST API</b></summary>

```bash
# 创建任务
curl -X POST http://localhost:7777/api/task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"prompt": "在微博搜索 AI 新闻"}'
```

完整 API 文档：`http://localhost:7777/docs`

> **获取开发 Token：** 开发模式（`NODE_ENV=development`）下，服务端会在控制台打印 OTP 验证码。使用 `/api/user-auth/send-otp` + `/api/user-auth/verify-otp` 接口获取 Bearer Token。

</details>

## ⚙️ 配置

配置文件：`server/apps/backend/.env`（从 `.env.example` 复制）

### AI 供应商

| 变量 | 用途 | 必填 |
|------|------|------|
| `CLAUDE_API_KEY` | 规划与推理（Claude） | **是** |
| `CLAUDE_BASE_URL` | 自定义 API 端点 | 否 |
| `CLAUDE_MODEL` | 模型名称（默认：`claude-sonnet-4.6`） | 否 |
| `CLAUDE_SMALL_MODEL` | 轻量任务用的小模型 | 否 |
| `VLM_API_KEY` | 截图分析用的视觉模型 | **是** |
| `VLM_BASE_URL` | 视觉模型端点 | **是** |
| `VLM_MODEL` | 视觉模型名称 | 否 |
| `ANTHROPIC_API_KEY` | 创作 Agent（Claude Agent SDK） | 否 |

> **规划器**使用 Claude 进行任务分解和推理。**执行器**使用视觉语言模型（VLM）分析截图。两者可以来自不同供应商。

### 基础设施

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `DATABASE_URL` | `postgresql://opengui:opengui@localhost:5432/opengui` | PostgreSQL 连接 |
| `REDIS_HOST` | `localhost` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `PORT` | `7777` | 服务端口 |

### 可选集成

| 变量 | 用途 |
|------|------|
| `FEISHU_APP_ID` + `FEISHU_APP_SECRET` | 飞书机器人远程调度 |
| `TELEGRAM_BOT_TOKEN` | Telegram 机器人远程调度 |
| `LANGSMITH_TRACING` + `LANGSMITH_API_KEY` | LangSmith 追踪，调试 Agent 行为 |

## 📁 项目结构

```
opengui/
├── server/                          # 🧠 NestJS 单体仓库 (Turborepo + pnpm)
│   ├── apps/backend/src/
│   │   ├── modules/
│   │   │   ├── graph-agent/         #    ★ AI Agent 核心 (LangGraph)
│   │   │   ├── task/                #    任务生命周期管理
│   │   │   ├── creator-agent/       #    内容创作 (Claude Agent SDK)
│   │   │   ├── im-channel/          #    飞书 & Telegram 集成
│   │   │   ├── user/                #    用户管理
│   │   │   ├── tenant/              #    多租户
│   │   │   ├── device-log/          #    设备执行日志
│   │   │   ├── credits/             #    (桩模块) 计费 — 始终无限
│   │   │   ├── tos/                 #    (桩模块) 文件存储 — 本地文件系统
│   │   │   └── knowledge/           #    (桩模块) RAG — 返回空结果
│   │   └── common/                  #    Redis、WebSocket、日志
│   ├── packages/database/           # 💾 Prisma ORM + PostgreSQL Schema
│   └── start.sh                     # 🚀 一键开发环境启动
│
├── client/                          # 📱 Android 应用 (Kotlin, MVVM)
│   ├── app/                         #    主应用模块
│   ├── automation/                  #    任务执行引擎
│   ├── core_accessibility/          #    无障碍服务 — 手势 & 截图
│   ├── core_network/                #    Retrofit + Socket.IO 客户端
│   ├── core_common/                 #    工具类、桩 SDK
│   └── feature_promotor/            #    UI — 任务列表、设置、执行展示
│
├── docs/                            # 📄 博客 & 文档
├── LICENSE                          #    Apache 2.0
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
└── CHANGELOG.md
```

> `credits/`、`tos/`、`knowledge/` 是有意保留的桩模块，因为 `graph-agent` 在编译时依赖它们。详细架构说明见 [CLAUDE.md](CLAUDE.md)。

## 🤝 贡献与路线图

欢迎贡献！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

**路线图** —— 选一个感兴趣的方向，提交 PR！

- [ ] 更多 VLM 供应商支持
- [ ] 可插拔技能系统，面向特定领域任务
- [ ] 多设备编排
- [ ] Web 管理面板
- [ ] iOS 客户端支持

**社区：**
- [Issues](https://github.com/anthropics/opengui/issues) — Bug 报告 & 功能建议
- [Security](SECURITY.md) — 漏洞报告

## 📄 许可证

[Apache 2.0](LICENSE)

<p align="center">
  <sub>OpenGUI 仅供教育、研究和技术交流用途。</sub>
</p>
