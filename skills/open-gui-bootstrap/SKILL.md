---
name: open-gui-bootstrap
description: Launch and bootstrap OpenGUI from a plain-language user request. Use when Claude or Codex should install, configure, debug, and run the actual backend and Android client shipped in this repository while keeping manual setup to a minimum.
---

# OpenGUI Bootstrap

Launch OpenGUI from a plain-language request.

OpenGUI should be treated as a runnable mobile operator system in this repository.

The concrete install path already exists:

- `server/start.sh`
- `client/start.sh`
- `server/apps/backend/.env.example`
- `client/gradlew`

The user should be able to say things like:

- "Help me run OpenGUI on my phone"
- "Use Claude to bootstrap OpenGUI for me"
- "Set up OpenGUI with GPT and Gemini as my model endpoints"
- "Get OpenGUI running and tell me only what I must tap on the phone"
- "Help me set up OpenGUI for a long-running mobile workflow"

Do not require the user to know the setup order, env var names, or shell commands unless there is a real blocker.

## Trigger Guidance

If the user asks to run, bootstrap, install, configure, or debug OpenGUI in plain language, start.

Typical trigger forms include:

- "Run OpenGUI"
- "Bootstrap OpenGUI"
- "Install OpenGUI for me"
- "Use Claude to start OpenGUI"
- "Use Codex to get OpenGUI running"
- "Set up OpenGUI with my model APIs"
- "Only tell me the phone-side steps"

## Example Prompts

- "Help me run OpenGUI on this machine."
- "Use Claude to bootstrap OpenGUI for me."
- "Use Codex to get OpenGUI running and only tell me what I need to do on the phone."
- "Set up OpenGUI with GPT for planning and Gemini for vision."
- "Use my existing model APIs and get OpenGUI working."
- "Help me bring up OpenGUI for a long mobile workflow."

## Core Rules

- Treat Codex or Claude as the installer and operator.
- Use the repository's actual scripts before inventing a custom flow.
- Default to doing the work directly instead of explaining how to do it.
- Do not ask the user to run terminal commands that Codex can run.
- Ask the user only for physical actions, OS dialogs, secrets, or Android device interaction.
- Before claiming setup is complete, verify each major step.
- If the checkout is missing `server/` or `client/`, say so clearly and stop.
- Prefer sensible defaults over exposing internal config detail.

## First Step

Run `scripts/preflight.sh` from this skill.

Interpret the result as follows:

- `CHECKOUT_OK`: continue with setup
- `CHECKOUT_DOCS_ONLY`: explain that this checkout does not contain the runnable backend or client
- `CHECKOUT_INCOMPLETE`: explain which required paths are missing and stop unless the user provides the full checkout

## Standard Workflow

### 1. Inspect the checkout

Run the preflight script.

When the checkout is runnable, confirm these paths exist:

- `server/start.sh`
- `server/apps/backend/.env.example`
- `client/start.sh`
- `client/gradlew`

### 2. Interpret the user's intent

Map the user's plain-language request onto a practical setup target.

Examples:

- "Help me run OpenGUI" -> full bootstrap with conservative defaults
- "Use Claude" -> prefer Claude for planning and text-side orchestration
- "Use GPT and Gemini" -> prefer GPT for planning and Gemini for vision when the environment supports that split
- "Use my own models" -> ask only for the missing endpoint or secret
- "Tell me only what to do on the phone" -> maximize automation and keep hand-offs to physical steps only

### 3. Bootstrap the backend with the actual script

Use:

```bash
cd server
./start.sh
```

Expected behavior:

- checks Node.js, pnpm, and Docker
- starts PostgreSQL and Redis
- creates `.env` from `.env.example` on first run and exits
- installs dependencies
- generates Prisma client
- pushes schema and seeds data
- starts the backend

If the first run exits after creating `.env`, ask only for the keys still missing. The default practical keys are:

- `CLAUDE_API_KEY`
- `VLM_API_KEY`

Optional keys include:

- `ANTHROPIC_API_KEY` for creator-agent flows
- `FEISHU_APP_ID` / `FEISHU_APP_SECRET`
- `TELEGRAM_BOT_TOKEN`

### 4. Route model providers

Supported user intent examples include:

- Claude
- GPT
- Gemini
- Kimi
- MiniMax
- OpenAI-compatible endpoints

Rules:

- prefer the provider explicitly named by the user
- use Claude-style config for planning by default when no override is provided
- use the VLM fields for vision-side execution
- ask only for the smallest missing endpoint or secret

### 5. Build and install the Android client with the actual script

Use:

```bash
cd client
./start.sh
```

Expected behavior:

- checks `adb` and Java
- verifies a device is connected
- runs `adb reverse tcp:7777 tcp:7777`
- builds the debug APK
- installs it
- launches the app

If no device is connected, build as much as possible and ask the user for the exact next physical step.

### 6. Minimize device-side hand-offs

Only interrupt the user for:

- connecting a phone or starting an emulator
- approving USB debugging
- enabling AccessibilityService
- granting overlay or battery permissions
- providing API keys or bot credentials

### 7. Verify the first run

At minimum, confirm:

- backend is up
- `http://localhost:7777/docs` is reachable
- APK build succeeded
- device connection status is known
- the remaining phone-side steps, if any, are explicit

### 8. Keep current open-source behavior in mind

The open-source Android build currently skips the old login gate and opens `HomeActivity` directly.

For local runs, backend task controllers also default to `userId = 1`, so do not send the user into an OTP-first flow unless they explicitly ask for the older auth path.

## Communication Style

Keep updates short and operational.

Good:

- "The backend script created `.env` and stopped. I need `CLAUDE_API_KEY` and `VLM_API_KEY` to continue."
- "The APK is built. Connect the phone by USB and tap Allow on the debugging dialog. I will install it after that."
