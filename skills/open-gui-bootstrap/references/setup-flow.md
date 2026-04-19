# OpenGUI Setup Flow

Use this reference when executing the bootstrap workflow.

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

1. backend bootstrap
2. env generation
3. API key hand-off
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

## Tooling Expectations

Minimum practical expectations for an automated run:

- Node.js
- pnpm
- Docker
- adb
- Java / Gradle compatibility for Android build

## Hand-off Language

Use direct instructions for physical actions.

Good:

- "Connect the Android phone by USB and tap Allow on the USB debugging dialog. Tell me once that is done."
- "Open the OpenGUI app on the phone and enable Accessibility Service. Tell me when the permission is enabled."

Bad:

- "Please follow the setup guide manually."
- "You may need to configure some Android permissions."

## Verification Targets

Prefer these checks when available:

- backend docs endpoint
- backend API base URL
- device listed in `adb devices`
- successful `adb reverse`
- APK path exists after Gradle build
- `adb install` succeeds or reports a clear device-side blocker

## Principle

The user should feel that Codex is the installer and operator.

The user should only be pulled in when the task crosses into physical-world interaction, device UI permissions, or secrets.
