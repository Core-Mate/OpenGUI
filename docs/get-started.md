# OpenGUI Getting Started

This repository already contains the runnable backend and Android client.

## Option 1: Bootstrap with Claude or Codex

Start with the bootstrap skill:

- [`skills/open-gui-bootstrap/SKILL.md`](../skills/open-gui-bootstrap/SKILL.md)

Recommended prompt:

```text
Read ./skills/open-gui-bootstrap/SKILL.md and help me run OpenGUI. Only ask me for phone-side actions.
```

The skill should use the repository scripts directly:

- `server/start.sh`
- `client/start.sh`

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

- `CLAUDE_API_KEY`
- `VLM_API_KEY`

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

## Current open-source behavior

The Android app currently skips the old login gate in the open-source build and goes straight to `HomeActivity`.

For local runs, the backend task controllers also default to `userId = 1`, so first-run setup no longer depends on the older OTP flow.

## More detail

- Backend details: [`server/apps/backend/README.md`](../server/apps/backend/README.md)
- Android client details: [`client/README.md`](../client/README.md)
