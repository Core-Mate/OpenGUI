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
git clone https://github.com/Core-Mate/opengui.git
cd opengui
