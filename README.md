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

OpenGUI is an Android operator system for real mobile workflows, not just a phone-agent demo driven from a laptop.

It brings together an Android-native execution client, backend task orchestration, and remote task dispatch so mobile tasks can be triggered, executed, reviewed, and returned as structured results.

If a laptop-side ADB loop is the first layer of mobile agents, OpenGUI is aimed at the next layer: persistent device availability, task lifecycle management, remote entry points, and a system shape that fits real operational workflows.

Originally built for internal mobile automation, OpenGUI is now being opened up for broader developer, research, and team use.

## Why It Feels Different

The key difference is not only that OpenGUI can understand the screen. The bigger difference is that the execution system is filled in end to end.

It behaves more like a real operator stack than a standalone phone-agent experiment:

- **Android-native executor on the device**
- **Backend task orchestration and lifecycle management**
- **Remote entry points through Feishu, Telegram, and API**
- **Structured result handoff back to external systems**

That combination makes it better suited for repeatable workflows, not just local experiments.

## OpenGUI vs Typical Phone-Agent Frameworks

| Dimension | Typical phone-agent framework | OpenGUI |
|---|---|---|
| **Control path** | Usually driven by a laptop-side ADB loop | Android-native client executes actions through AccessibilityService |
| **System shape** | Agent loop plus model calls | Backend plus Android client plus task lifecycle |
| **Task entry** | Often local CLI or scripts | Feishu, Telegram, and REST API dispatch |
| **Execution mode** | Best for local experiments and debugging | Better for remote operation and repeatable internal workflows |
| **Output** | Mostly execution traces | Structured task results that can be consumed by other systems |

## At a Glance

| Area | What OpenGUI does |
|---|---|
| **Android-native execution** | Runs a persistent Android client instead of relying only on a laptop bridge |
| **Vision-first execution** | Understands app state from screenshots instead of hardcoded selectors |
| **Multi-step task planning** | Breaks goals into sub-tasks, executes, reviews, and retries |
| **Backend orchestration** | Tracks task state, execution flow, and result handoff on the server |
| **Remote task dispatch** | Accepts tasks from Feishu, Telegram, or REST API |
| **Built for real workflows** | Designed for internal processes and operational mobile tasks, not just demos |

## What This Means In Practice

OpenGUI is a better fit if you need to:

- keep Android devices online and remotely operable
- trigger mobile tasks from chat tools or backend systems
- return structured results instead of only action traces
- build internal AI operators on top of real device execution
- move from one-off local debugging to repeatable workflow execution

## Typical Use Cases

- Search Weibo for AI news and summarize the top results
- Open X and collect recent posts for a topic
- Execute repetitive mobile workflows on Android devices
- Trigger Android tasks remotely from Feishu or Telegram
- Prototype internal AI operators without building per-app adapters

## AI-Assisted Setup

If you are using Codex, start with the built-in skill first: [`skills/open-gui-bootstrap/SKILL.md`](./skills/open-gui-bootstrap/SKILL.md)

This skill is meant to push as much terminal-side setup as possible onto AI:

- determine whether the current checkout is actually runnable
- install or validate dependencies
- bootstrap the backend
- generate environment files
- build the Android client
- handle `adb` checks and port reverse when possible

The user should only need to handle physical-world steps:

- connect a phone or boot an emulator
- accept USB debugging authorization on-device
- enable AccessibilityService
- grant overlay and battery permissions
- provide API keys when needed

If the current checkout is only a public docs snapshot, the skill stops early and says so directly instead of pretending the project can already be launched.

## Quick Install

### Before you start

The public repository may expose docs, skill assets, and release-planning material before the full runnable tree is published. Use the bootstrap skill first if you want AI to detect what is available in your checkout.

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

`start.sh` is the recommended local bootstrap path. It is expected to:

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
- Battery optimization exemption or unrestricted background mode

Without these, task execution and background stability will be unreliable.

## First Run

The default public onboarding path is intentionally lighter than the internal deployment path.

For first-run evaluation, prefer one of these entry points:

- use the bootstrap skill to let AI handle setup and environment checks
- use Swagger at `http://localhost:7777/docs` once backend and device are connected
- trigger a task from Feishu, Telegram, or your own API client when those integrations are configured

Phone-number login and OTP-based auth are deployment-specific concerns. They are not the recommended first-run path for public evaluation.

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

OpenGUI is useful today, but it should be evaluated as an evolving open-source mobile operator framework, not as a fully polished end-user product.

Current constraints:

- Android is the active client target in this repository
- some backend modules are intentionally stubbed in the public release
- production deployment, observability, and multi-device orchestration are still evolving
- reliability depends on UI complexity, model quality, and device permission stability
- some docs and surfaces still reflect the transition from an internal system to an open-source release

If you are adopting OpenGUI internally, expect additional engineering work around deployment, guardrails, evaluation, and task-specific tuning.

## Documentation

- [skills/open-gui-bootstrap/SKILL.md](./skills/open-gui-bootstrap/SKILL.md)
- [PUBLIC_RELEASE_PLAN.md](./PUBLIC_RELEASE_PLAN.md)
- [docs/get-started.md](./docs/get-started.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CLAUDE.md](./CLAUDE.md)

## Community / Support

If OpenGUI is useful to you, the most helpful ways to support it are:

- star the repository
- open issues for bugs and feature requests
- share real use cases and deployment feedback
- contribute docs, integrations, and fixes
- introduce the project to teams building mobile AI agents

For a project moving from internal infrastructure toward a public framework, real usage feedback is especially valuable because it directly shapes what should become public-grade next.

## License

OpenGUI is licensed under the Apache 2.0 License.

See [LICENSE](./LICENSE).
