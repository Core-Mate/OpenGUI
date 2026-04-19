# OpenGUI Setup Flow

Use this reference when executing the bootstrap workflow.

## Operating Principle

The user should feel that Claude or Codex is the installer and operator.

The user should only need to:

- describe the goal in plain language
- provide secrets when required
- perform physical phone-side actions when required

The user should not need to learn the setup order, terminal commands, env var names, or model-routing internals.

## Decision Tree

### Case 1: Public docs-only checkout

Symptoms:

- repository contains only `README.md`, `README.zh-CN.md`, and documentation files
- no `server/` directory
- no `client/` directory

Action:

- stop immediately
- explain that this checkout cannot run OpenGUI
- tell the user a full internal or source-complete checkout is required

Suggested response shape:

- "This repository snapshot documents OpenGUI but does not include the runnable backend and Android client. I cannot complete setup from this checkout."

### Case 2: Full runnable checkout

Proceed with:

1. interpret the user's plain-language intent
2. backend bootstrap
3. model-provider selection and env generation
4. backend verification
5. Android build
6. `adb` connection work
7. device-side permission hand-off
8. first task verification

### Case 3: Partial checkout

Symptoms:

- `server/` exists but `client/` does not
- `client/` exists but no backend bootstrap exists
- key scripts are missing

Action:

- identify the missing path explicitly
- stop unless the user confirms a nonstandard layout

## Plain-Language Intent Mapping

Map user requests into setup targets without asking them to translate their request into config terms.

Examples:

- "Run OpenGUI for me" -> full bootstrap with conservative defaults
- "Use Claude" -> prefer Claude-compatible planning endpoint
- "Use GPT and Gemini" -> use GPT-compatible text endpoint and Gemini-compatible vision endpoint when supported
- "Use my own API" -> ask only for the missing endpoint or secret
- "Tell me only what to do on the phone" -> maximize automation and reduce hand-offs to physical-world steps only

## Tooling Expectations

Minimum practical expectations for an automated run:

- Node.js
- pnpm
- Docker
- adb
- Java / Gradle compatibility for Android build

## Model Provider Handling

OpenGUI should be presented as provider-flexible.

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
- "Set these six env vars yourself and rerun the script."

## Verification Targets

Prefer these checks when available:

- backend docs endpoint
- backend API base URL
- device listed in `adb devices`
- successful `adb reverse`
- APK path exists after Gradle build
- `adb install` succeeds or reports a clear device-side blocker
- selected model endpoint configuration is present

## Principle

The user should feel that Codex is the installer and operator.

The user should only be pulled in when the task crosses into physical-world interaction, device UI permissions, or secrets.
