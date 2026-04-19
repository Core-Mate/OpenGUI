<div align="center">

# OpenGUI

**AI Agent for Autonomous Android Device Control**

<p>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/android-API%2024%2B-green" alt="Android">
  <img src="https://img.shields.io/badge/kotlin-2.0-purple" alt="Kotlin">
  <img src="https://img.shields.io/badge/langgraph-powered-orange" alt="LangGraph">
  <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-red" alt="Chinese README"></a>
</p>

</div>

OpenGUI is an AI agent system for operating real Android devices from natural-language instructions.

Give it a task in plain language. It observes the screen, plans the next step, executes actions on-device, and returns structured results.

Instead of depending on brittle selectors, handwritten scripts, or per-app adapters, OpenGUI uses screen understanding and step-by-step execution so it can continue adapting when the UI changes.

Originally built for internal mobile automation workflows, OpenGUI is now being opened up for broader developer, research, and team use.

## At a Glance

| Area | What OpenGUI does |
|---|---|
| **Vision-first execution** | Understands app state from screenshots instead of hardcoded selectors |
| **Multi-step task planning** | Breaks goals into sub-tasks, executes, reviews, and retries |
| **Real Android control** | Uses AccessibilityService to tap, swipe, type, and observe the screen |
| **Remote task dispatch** | Trigger tasks from Feishu, Telegram, or REST API |
| **Open architecture** | Both the backend and Android client live in this repository |
| **Built for real workflows** | Designed for internal processes and operational mobile tasks, not just demos |

## Why OpenGUI

Most mobile automation systems still rely on:

- app-specific selectors
- fragile scripts
- manual adapter maintenance for each target app

OpenGUI takes a different approach:

- **See the screen** instead of depending on brittle selectors
- **Plan and act** instead of replaying scripts
- **Review and retry** instead of failing on the first UI change
- **Operate remotely** instead of requiring someone to sit next to the device

This makes OpenGUI a strong fit for:

- internal mobile workflow automation
- Android-based AI operators
- app-side data collection and summarization
- cross-app operational tasks
- mobile GUI agent research on real devices

## Typical Use Cases

- Search Weibo for AI news and summarize the top results
- Open Xiaohongshu and collect posts for a topic
- Execute repetitive mobile workflows on Android devices
- Trigger Android tasks remotely from Feishu or Telegram
- Prototype internal AI operators without building per-app adapters

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
