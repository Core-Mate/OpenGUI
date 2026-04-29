# OpenGUI Release - Repository Guide for Claude Code / Codex

## 1. Repository Positioning

This repository is the source-available public release of OpenGUI.

- `server/` comes from the original `coremate` backend and is now the public NestJS service
- `client/` comes from the original `haomai` Android app and is now the public mobile client
- `docs/` contains public-facing architecture and evaluation materials

In the maintainer workspace there may also be sibling directories such as `../coremate` and `../haomai_v0.0.1`. Treat them as reference-only source snapshots. Unless the user explicitly asks otherwise, all public changes should land in **this** repository only.

## 2. Default Working Rules

- Reply to the user in Chinese.
- Use UTF-8 when creating or editing files.
- Treat this repository as the source of truth for current behavior. If README/comments conflict with code, trust code first and then fix docs.
- Keep every change public-release-safe. Never reintroduce private endpoints, production IPs, commercial SDKs, hardcoded credentials, internal dashboards, or company-only workflows.
- Do not edit generated or dependency directories such as `server/node_modules`, `server/.turbo`, `client/build`, `client/.gradle`, or `client/.kotlin`.
- The root `.gitignore` is intentionally minimal. Be proactive about not committing local env files, generated output, APKs, logs, or cache directories.

## 3. High-Level Architecture

OpenGUI is a two-part system:

1. `server/` is the brain.
   It plans tasks, runs the LangGraph-based agent pipeline, owns task/execution state, and dispatches work to devices over WebSocket.
2. `client/` is the hands.
   It runs on Android, keeps a standby connection, executes GUI actions through accessibility services, uploads screenshots, and shows task state in the app / floating windows.

The main public flow is:

`Task/API/IM request -> server task execution -> standby device pickup -> execution WebSocket -> Android action loop -> summarizer result`

## 4. Directory Map

### Root

```text
opengui-release/
├── server/    # NestJS monorepo + Prisma database package
├── client/    # Android multi-module app
├── docs/      # Public docs / images / reports
└── CLAUDE.md  # This file
```

### Server

```text
server/
├── apps/backend/
│   └── src/
│       ├── modules/
│       │   ├── graph-agent/   # Core IP: planning / execution / summarization graph
│       │   ├── task/          # Task + execution lifecycle
│       │   ├── creator-agent/ # Content generation helper module
│       │   ├── im-channel/    # Feishu / Telegram remote dispatch
│       │   ├── credits/       # Stub
│       │   ├── knowledge/     # Stub
│       │   ├── tos/           # Stub, local filesystem storage
│       │   ├── device-log/    # Device log ingestion / retry flow
│       │   ├── apk/
│       │   ├── app-config/
│       │   ├── tenant/
│       │   └── user/
│       ├── common/ws/         # Standby / execution socket protocol
│       └── prisma/
├── packages/database/         # Prisma schema + generated client package
└── start.sh                   # One-command local bootstrap
```

### Client

```text
client/
├── app/                # Application shell, SplashActivity, PromotorApplication
├── feature_promotor/   # Main UI, task list, execution windows, settings
├── automation/         # Automation framework and task logic
├── core_accessibility/ # GestureService and action execution
├── core_network/       # Retrofit + WebSocket managers
├── core_common/        # Android shared utilities, stubs, local logging
├── core_common_jvm/    # Cross-module shared models / interfaces
└── core_aop/           # JVM support code
```

## 5. Open-Source Boundaries and Compatibility Rules

This repository is a cleaned public release, not the original internal product. Preserve that boundary.

### Backend modules intentionally removed or not shipped

- Internal admin app is not part of this repo
- OTP/auth module is not part of the current public backend surface
- Payment / recharge logic is not part of the public release
- Private push / cloud integrations must not be reintroduced

### Backend modules intentionally kept as stubs

- `server/apps/backend/src/modules/credits/credits.service.ts`
- `server/apps/backend/src/modules/credits/billing.service.ts`
- `server/apps/backend/src/modules/knowledge/knowledge.service.ts`
- `server/apps/backend/src/modules/tos/tos.service.ts`

These stubs exist because other modules still inject them. Do **not** delete them just because the public version no longer uses the original commercial behavior.

Rules:

- `credits/` must continue to behave as unlimited / no-deduction unless there is a deliberate product decision to add a real public billing system
- `knowledge/` currently returns empty results; do not remove the service contract blindly
- `tos/` writes to local filesystem under `./uploads`; keep the API shape stable for graph / device-log callers
- If you replace a stub with a real implementation, keep the public interface and verify all callers

### Client behaviors intentionally changed for open source

- `SplashActivity` bypasses authentication and jumps directly to `HomeActivity`
- `PushManager` is a no-op stub
- `StatisticsManager` is a no-op stub
- `LogManager` writes locally and logs with `Log.d`, without cloud log shipping

Do not reintroduce UMeng, Bugly, Aliyun SLS, or any other commercial/mobile tracking SDKs without explicit user approval.

### Executor mode

The public release is GUI/vision-first. The server-side A11y tree reasoning path from older versions is gone. The Android client still uses accessibility services to perform actions, but do not casually resurrect old `executor_a11y` / A11y-tree routing ideas from private code.

## 6. Sensitive Areas

### Highest-risk server areas

- `server/apps/backend/src/modules/graph-agent/`
  This is the crown jewel. Small changes here can break planning, loop control, token accounting, or execution semantics.
- `server/apps/backend/src/modules/task/`
  Owns execution creation, resume/fork/cancel, queueing, and state transitions.
- `server/apps/backend/src/common/ws/`
  Defines standby/execution socket contracts used by Android.
- `server/apps/backend/src/modules/creator-agent/`
  Separate feature area, but it shares agent config plumbing and has incomplete placeholder tools.
- `server/apps/backend/src/modules/im-channel/`
  Feishu/Telegram are optional and only activate when credentials are present.

### Highest-risk client areas

- `client/core_accessibility/`
  Real device actions and accessibility service lifecycle live here.
- `client/automation/`
  Automation logic and service helpers.
- `client/feature_promotor/common/MessageController.kt`
  Central execution wiring between app state, action handler, SSE/WS, and floating windows.
- `client/core_network/src/main/java/com/coremate/opengui/network/websocket/`
  Socket protocol implementation; keep this aligned with `server/common/ws`.
- `client/feature_promotor/ui/home/HomeActivity.kt`
  Standby service startup and remote-dispatch entry point.

If a change touches both `task/common/ws` on the server and websocket/action code on Android, treat it as a protocol change and verify both ends.

## 7. Runtime Truths That Are Easy to Miss

- The client runtime default backend URL is currently `http://127.0.0.1:7777`, defined in `client/core_network/.../ServerConstant.kt`
- The Settings page stores an override in MMKV key `BaseUrl`; restart is required after changing it
- Older docs and `client/local.properties.example` still mention `10.0.2.2`; do not assume those are the runtime source of truth
- `server/start.sh` copies `.env.example` to `.env` and exits on first run; after filling keys you must run it again
- `creator-agent` exists in the public repo, but its web search tool is still placeholder-level
- `knowledge`-related UI and docs still contain TODOs; do not assume that surface is complete
- `tos` returns `/uploads/...` URLs; if you build a feature that depends on serving uploaded files externally, verify the HTTP serving path end-to-end

## 8. Local Development Commands

### Server

```bash
cd server
./start.sh
```

Useful commands:

```bash
pnpm build
pnpm test
pnpm backend
pnpm format-and-lint
pnpm format-and-lint:fix
pnpm --filter @repo/db db:generate
```

`start.sh` is the preferred bootstrap path because it:

- checks Node / pnpm / Docker
- starts PostgreSQL and Redis
- creates `.env` from `.env.example` if missing
- generates Prisma client
- pushes schema and imports seed data
- starts the backend on port `7777`

### Client

```bash
cd client
./gradlew assembleDebug
```

For local server access with the current runtime default:

```bash
adb reverse tcp:7777 tcp:7777
```

If `adb reverse` is not available or you use a different network setup, change the server URL in the app Settings page or update the runtime config accordingly.

## 9. Verification Expectations

When you change code, verify at the right level.

### Server-only changes

- Always run `cd server && pnpm build`
- If you touched `graph-agent`, `task`, `common/ws`, or DTO/controller logic, run relevant tests too
- If you changed Prisma schema or DB package code, regenerate client and verify build again

### Client-only changes

- Always run `cd client && ./gradlew assembleDebug`
- If you changed accessibility / execution flow, verify the affected screen or service path manually when possible

### Cross-stack changes

At minimum verify:

- backend starts successfully
- Android app launches to `HomeActivity`
- standby connection can come up
- task execution protocol still works from server to client
- summarizer / completion flow still returns cleanly

If you cannot run device-level verification, say so explicitly instead of pretending the flow was tested.

## 10. Practical Editing Guidance

- Prefer small, public-safe changes over importing large chunks from private source trees
- If you use sibling `../coremate` or `../haomai_v0.0.1` for reference, diff carefully and port only the public-release-safe subset
- Keep comments and docs consistent with actual file paths and current behavior
- When behavior changes, update `README`, `README_CN`, or this file if the change affects onboarding or agent guidance
- Never change protocol/event names on one side only
- Never delete a module just because it looks unused before checking dependency injection and Android references

## 11. What Future Agents Should Assume

- The repo root is `opengui-release`, not the larger maintainer workspace
- `CLAUDE.md` is the repository-wide instruction source of truth
- `AGENTS.md` only points back here; if there is any ambiguity, follow this file
- The main mission is to keep the public repo buildable, understandable, and safe for the source-available public release
