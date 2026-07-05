# OpenGUI Getting Started

This repository already contains the runnable backend and Android client.

## Option 1: Bootstrap with Claude or Codex

Open Claude Code or Codex from the OpenGUI repository root, then ask it to read
the bootstrap skill.

Start with the bootstrap skill:

- [`skills/open-gui-bootstrap/SKILL.md`](../skills/open-gui-bootstrap/SKILL.md)

Recommended prompt:

```text
Read ./skills/open-gui-bootstrap/SKILL.md and help me run OpenGUI. Only ask me for phone-side actions.
```

Claude Code or Codex does not connect to the phone directly. The skill guides
the local setup: it starts the backend, builds or installs the Android client,
runs adb setup, and checks whether the phone is visible to OpenGUI.

The skill should use the repository scripts directly:

- `server/start.sh`
- `client/start.sh`

It should only stop for phone-side actions or credentials:

- connecting an Android device or starting an emulator
- approving USB debugging
- enabling Accessibility Service
- granting overlay or screen-related permissions
- providing model API credentials

After setup, run a basic smoke test:

```bash
cd server
pnpm opengui -- devices --json
pnpm opengui -- do "Observe the current Android screen and summarize what you see" --json
```

## Option 2: Manual setup

### 1. Start the backend

```bash
cd server
./start.sh
```

What `server/start.sh` does:

- checks Node.js 22+, pnpm, and Docker
- starts PostgreSQL and Redis in Docker
- creates `server/apps/backend/.env` from `.env.example` on first run
- installs dependencies
- generates Prisma client
- pushes schema and seeds default backend data
- starts the backend on port `7777`

Required keys for a practical first run:

- `VLM_API_KEY`
- `VLM_BASE_URL`
- `VLM_MODEL`

The backend currently uses the `VLM_*` variables as the shared
OpenAI-compatible model configuration for graph agents. They are used by
planning, supervision, summarization, and the executor vision path.

Example:

```env
VLM_API_KEY=your_api_key
VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VLM_MODEL=qwen3.6-plus
```

The backend can start without these values, but real task execution will fail
when the graph needs to call the model.

Useful endpoints after startup:

- API: `http://localhost:7777/api`
- Docs: `http://localhost:7777/docs`

### 2. Connect a device and install the Android client

```bash
cd client
./start.sh
```

What `client/start.sh` does:

- checks `adb` and Java
- requires a connected Android device
- runs `adb reverse tcp:7777 tcp:7777`
- builds the debug APK
- installs the APK
- launches `com.coremate.opengui/.login.SplashActivity`

### 3. Complete phone-side permissions

Open the app and enable:

- USB debugging approval
- Accessibility Service
- overlay permission
- battery optimization exemption if needed

## Current Source-Available Build Behavior

The Android app currently skips the old login gate in the source-available build and goes straight to `HomeActivity`.

For local runs, the backend task controllers also default to `userId = 1`, so first-run setup no longer depends on the older OTP flow.

## More detail

- Backend details: [`server/apps/backend/README.md`](../server/apps/backend/README.md)
- Discord remote control: [`docs/DISCORD.md`](./DISCORD.md)
- Android client details: [`client/README.md`](../client/README.md)
