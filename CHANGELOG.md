# Changelog

## [0.1.2] - 2026-05-16

### Codex / Claude Code remote control

**Server**
- Added `RemoteControlModule` with REST endpoints for listing devices, creating and running tasks, and controlling executions.
- Added shared dispatch logic that reuses the existing standby socket path to send executions to online Android devices.
- Reused the remote-control dispatch path from IM commands to avoid separate execution routing logic.

**CLI and Skills**
- Added `pnpm opengui -- ...` for local device listing, task dispatch, status checks, pause, resume, and cancel.
- Added the `open-gui-remote-control` Skill so Codex / Claude Code can operate Android phones through OpenGUI.
- Added Chinese documentation for using Codex to control Android phones through OpenGUI.

## [0.1.0] - 2026-03-30

### Initial source-available release

**Server**
- LangGraph-based AI agent orchestration (Coordinator → Planner → Executor → GUI → Reviewer → Summarizer)
- NestJS backend with WebSocket real-time task execution
- PostgreSQL + Redis infrastructure via one-command `start.sh`
- Feishu and Telegram bot integration for remote task dispatch
- Creator Agent powered by Claude Agent SDK

**Android Client**
- Accessibility service-based device automation engine
- Real-time task execution with Socket.IO
- Screenshot capture and UI element interaction
- Gesture actions: click, swipe, scroll, drag, long press, type
- Runtime server URL configuration
