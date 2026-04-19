<div align="center">

# OpenGUI

**Android-Native Operator Stack for Real Device Automation**

<p>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/android-API%2024%2B-green" alt="Android">
  <img src="https://img.shields.io/badge/kotlin-2.0-purple" alt="Kotlin">
  <img src="https://img.shields.io/badge/langgraph-powered-orange" alt="LangGraph">
</p>

<p><strong>Language:</strong> <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a></p>

</div>

OpenGUI is a full-stack Android operator system for teams that need more than a local phone-agent demo.

It combines an Android-native execution client, a backend task orchestration layer, and remote dispatch channels so mobile tasks can be triggered, executed, reviewed, and returned as structured results.

If your baseline is a laptop-side ADB loop, OpenGUI is the next layer up: persistent device-side execution, server-managed task lifecycle, and integrations that let mobile automation plug into real workflows.

Originally built for internal mobile automation workflows, OpenGUI is now being opened up for broader developer, research, and team use.

## Why It Feels Different

What makes OpenGUI interesting is not only that it can understand screens.

It is that the execution system is split the way real operator systems usually need to be split:

- **Android-native executor** on the device
- **Task orchestration backend** on the server
- **Remote dispatch layer** through Feishu, Telegram, and API
- **Structured result return** for external systems and repeatable workflows

This is the gap between a phone-agent experiment and a mobile operator stack.

## OpenGUI vs Typical Phone-Agent Frameworks

| Category | Typical phone-agent framework | OpenGUI |
|---|---|---|
| **Control path** | Usually driven from a computer-side ADB loop | Android-native client executes through AccessibilityService |
| **System shape** | Agent loop plus model call | Backend + Android client + task lifecycle |
| **Task entry** | Usually local CLI or script driven | Feishu, Telegram, and REST API dispatch |
| **Execution style** | Best for local experimentation and debugging | Built for remote operation and repeatable internal workflows |
| **Output** | Step-by-step execution result | Structured task result that can be returned to external systems |

## At a Glance

| Area | What OpenGUI does |
|---|---|
| **Android-native execution** | Runs a resident Android client instead of depending only on a computer-side bridge |
| **Vision-first execution** | Understands app state from screenshots instead of hardcoded selectors |
| **Multi-step task planning** | Breaks goals into sub-tasks, executes, reviews, and retries |
| **Backend task orchestration** | Manages task state, execution flow, and result return on the server side |
| **Remote task dispatch** | Trigger tasks from Feishu, Telegram, or REST API |
| **Built for real workflows** | Designed for internal processes and operational mobile tasks, not just demos |

## What This Means In Practice

OpenGUI is a strong fit if you want to:

- keep Android devices online and remotely operable
- run mobile workflows from chat tools or backend systems
- return structured outcomes instead of only action traces
- build internal AI operators on top of real device execution
- move beyond one-off laptop-side debugging loops

## Typical Use Cases

- Search Weibo for AI news and summarize the top results
- Open Xiaohongshu and collect posts for a topic
- Execute repetitive mobile workflows on Android devices
- Trigger Android tasks remotely from Feishu or Telegram
- Prototype internal AI operators without building per-app adapters

## AI-Assisted Setup

If you are using Codex, start with the bundled skill: [`skills/open-gui-bootstrap/SKILL.md`](./skills/open-gui-bootstrap/SKILL.md)

The skill is designed to do the terminal work for the user:

- inspect whether the checkout is runnable
- install or verify prerequisites
- bootstrap the backend
- generate env files
- build the Android client
- handle `adb` checks and port reverse when possible

The user should only be pulled in for physical-world steps:

- connect the phone or emulator
- approve USB debugging
- enable Accessibility Service
- grant overlay or battery permissions
- provide API keys when needed

If the checkout is only a public docs snapshot, the skill will say so directly instead of pretending the project can already be launched.

## Quick Install

### Requirements

- Node.js `>= 22`
- pnpm `>= 10`
- Docker
- Android Studio
- `adb` recommended
- Claude-compatible API key
- Vision model API key

### 1. Clone the repository

```bash
git clone https://github.com/Core-Mate/open-gui.git
cd open-gui
```

### 2. Start the server

```bash
cd server
./start.sh
```

`start.sh` is the recommended local bootstrap path. It will:

- check Node.js, pnpm, and Docker
- start PostgreSQL and Redis
- create `apps/backend/.env` from `.env.example` if missing
- install dependencies
- generate the Prisma client
- initialize the database schema
- start the backend on port `7777`

Important first-run behavior:

- on the first run, `start.sh` creates `apps/backend/.env` and exits intentionally
- fill in your API keys
- run `./start.sh` again

At minimum, configure:

```env
CLAUDE_API_KEY=your_claude_api_key
VLM_API_KEY=your_vlm_api_key
VLM_BASE_URL=your_vlm_compatible_endpoint
```

Once the backend is running:

- API: `http://localhost:7777/api`
- Swagger: `http://localhost:7777/docs`

### 3. Build and install the Android client

```bash
cd ../client
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

You can also open `client/` in Android Studio and run it directly.

### 4. Connect the Android client to your local server

The current runtime default is:

```text
http://127.0.0.1:7777
```

For local development, the easiest path is:

```bash
adb reverse tcp:7777 tcp:7777
```

If you are using a physical device without `adb reverse`, change `BaseUrl` in the app Settings page to your computer's LAN IP, for example:

```text
http://192.168.1.10:7777
```

### 5. Grant required Android permissions

OpenGUI requires:

- Accessibility Service
- Display over other apps
- Battery optimization exemption / unrestricted background mode

Without these, task execution and background stability will be unreliable.

## Getting Started

### Get a development token

In development mode, the backend prints OTP codes to the server console.

Request an OTP:

```bash
curl -X POST http://localhost:7777/api/user-auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"13800138000"}'
```

Verify the OTP:

```bash
curl -X POST http://localhost:7777/api/user-auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"13800138000","code":"123456"}'
```

Export the returned token:

```bash
export OPENGUI_TOKEN="paste_the_token_here"
```

### Create your first task

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

You can also inspect and test endpoints from:

- `http://localhost:7777/docs`

## CLI / Runtime Quick Reference

| Action | Command / Path |
|---|---|
| Start backend | `cd server && ./start.sh` |
| Build Android app | `cd client && ./gradlew assembleDebug` |
| Install APK | `adb install app/build/outputs/apk/debug/app-debug.apk` |
| Reverse local port | `adb reverse tcp:7777 tcp:7777` |
| Backend docs | `http://localhost:7777/docs` |
| Backend API | `http://localhost:7777/api` |
| Main config | `server/apps/backend/.env` |
| Android server override | App Settings -> `BaseUrl` |

## Architecture

OpenGUI has two major parts:

- `server/`: the brain
- `client/`: the hands

The backend plans tasks, manages execution state, and dispatches work.  
The Android client keeps a standby connection, captures screenshots, and executes actions through accessibility services.

<p align="center">
  <img src="docs/architecture.png" alt="OpenGUI architecture" width="900">
</p>

High-level execution flow:

```text
Task / API / IM request
  -> Planner
  -> Executor
  -> Android action loop
  -> Reviewer / retry
  -> Summarizer
  -> Structured result
```

## Current Scope and Limitations

OpenGUI is useful today, but it should be evaluated as an open-source mobile agent framework, not as a fully polished end-user product.

Current constraints:

- Android is the active client target in this repository
- some backend modules are intentionally stubbed in the public release
- production deployment, observability, and multi-device orchestration are still evolving
- reliability depends on UI complexity, model quality, and device permission stability
- some docs and surfaces still reflect the transition from an internal system to an open-source release

If you are adopting OpenGUI internally, expect some engineering work around deployment, guardrails, evaluation, and task-specific tuning.

## Documentation

- [skills/open-gui-bootstrap/SKILL.md](./skills/open-gui-bootstrap/SKILL.md)
- [PUBLIC_RELEASE_PLAN.md](./PUBLIC_RELEASE_PLAN.md)
- [docs/get-started.md](./docs/get-started.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CLAUDE.md](./CLAUDE.md)

## Community / Support

If OpenGUI is useful to you, the best ways to support it are:

- star the repository
- open issues for bugs and feature requests
- share real use cases and deployment feedback
- contribute docs, integrations, and fixes
- introduce the project to teams building mobile AI agents

For a project evolving from internal infrastructure into a public open-source framework, real usage feedback is especially valuable.

## License

OpenGUI is licensed under the Apache 2.0 License.

See [LICENSE](./LICENSE).