# OpenGUI Setup Flow

Use this reference when executing the bootstrap workflow.

## Operating Principle

Claude or Codex should behave like the installer and operator.

The user should only need to:

- describe the goal in plain language
- provide secrets when required
- perform physical phone-side actions when required

The user should not need to learn the setup order, terminal commands, env var names, or model-routing internals.

## Concrete Repository Path

This repository already contains the runnable path:

- `server/start.sh`
- `client/start.sh`
- `server/apps/backend/.env.example`
- `client/gradlew`

Default bootstrap order:

1. inspect checkout
2. run `server/start.sh`
3. collect only the missing keys
4. verify backend docs endpoint
5. run `client/start.sh`
6. handle `adb` and device-side permissions
7. verify first run

## Decision Tree

### Case 1: Full runnable checkout

Symptoms:

- `server/` exists
- `client/` exists
- `server/start.sh` exists
- `client/start.sh` and `client/gradlew` exist

Action:

- proceed with backend bootstrap
- use the actual scripts
- keep user hand-offs limited to phone-side actions and secrets

### Case 2: Partial checkout

Symptoms:

- `server/` exists but `client/` does not
- `client/` exists but `server/` does not
- required scripts are missing

Action:

- identify the missing path explicitly
- stop unless the user confirms a nonstandard layout

### Case 3: Docs-only checkout

Symptoms:

- repository contains documentation but no runnable backend or client

Action:

- stop immediately
- explain that this checkout cannot run OpenGUI

## Plain-Language Intent Mapping

Map user requests into setup targets without asking them to translate their request into config terms.

Examples:

- "Run OpenGUI for me" -> full bootstrap with conservative defaults
- "Use Claude" -> use Claude-style config for planning
- "Use GPT and Gemini" -> use GPT for planning and Gemini for vision when supported
- "Use my own API" -> ask only for the missing endpoint or secret
- "Tell me only what to do on the phone" -> maximize automation and reduce hand-offs to physical-world steps only

## Tooling Expectations

Minimum practical expectations:

- Node.js 22+
- pnpm
- Docker
- adb
- Java for Android build

## Model Provider Handling

Supported intent examples include:

- Claude
- GPT
- Gemini
- Kimi
- MiniMax
- other OpenAI-compatible or custom-compatible endpoints

Guidelines:

- prefer the provider explicitly named by the user
- if no provider is named, use the repository default or the most practical working default
- if planning and vision are separate roles, choose the split automatically when possible
- ask only for the smallest missing secret or endpoint detail
- do not push provider-specific env var details onto the user unless blocked

## Hand-off Language

Use direct instructions for physical actions.

Good:

- "Connect the Android phone by USB and tap Allow on the USB debugging dialog. Tell me once that is done."
- "Open the OpenGUI app on the phone and enable Accessibility Service. Tell me when the permission is enabled."
- "Paste the Claude API key and I will continue the bootstrap automatically."

Bad:

- "Please follow the setup guide manually."
- "You may need to configure some Android permissions."
- "Set these env vars yourself and rerun the script."

## Verification Targets

Prefer these checks when available:

- backend docs endpoint at `http://localhost:7777/docs`
- backend API base URL at `http://localhost:7777/api`
- device listed in `adb devices`
- successful `adb reverse`
- APK path exists after Gradle build
- `adb install` succeeds or reports a clear device-side blocker
- selected model endpoint configuration is present
- app starts into the open-source path without requiring the old OTP-first login flow
