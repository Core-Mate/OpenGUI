---
name: open-gui-bootstrap
description: Automate OpenGUI setup, environment preparation, service startup, Android client build, and first-run guidance. Use when Codex needs to install, bootstrap, debug, or run OpenGUI for a user while minimizing manual steps. This skill should handle everything it can in the terminal and only ask the user to do physical-world actions such as connecting a phone, granting Android permissions, or providing API keys.
---

# OpenGUI Bootstrap

Automate as much of OpenGUI setup as possible.

## Core Rules

- Perform environment detection, dependency installation, file generation, service startup, and build commands directly.
- Do not ask the user to run terminal commands that Codex can run.
- Ask the user only for actions that require physical access, OS dialogs, secrets, or Android device interaction.
- Before claiming setup is complete, verify each major step.
- If the checkout does not contain runnable OpenGUI code, stop and say so clearly.

## Required Physical-World Hand-offs

Only hand off when one of these is required:

- connect an Android phone or emulator
- approve USB debugging on the device
- enable Accessibility Service
- grant overlay or battery-exemption permissions
- provide API keys or other secrets

Everything else should be done by Codex.

## First Step

Run `scripts/preflight.sh` from this skill to classify the checkout.

Interpret the result as follows:

- `CHECKOUT_OK`: continue with automated setup
- `CHECKOUT_DOCS_ONLY`: explain that the public repository snapshot does not contain `server/` and `client/`, so the project cannot be run from this checkout
- `CHECKOUT_INCOMPLETE`: explain which required paths are missing and stop unless the user provides the full checkout

## Standard Workflow

### 1. Inspect the checkout

Run the preflight script.

If the checkout is runnable, confirm these paths exist:

- `server/start.sh`
- `server/apps/backend/.env.example` or equivalent env template
- `client/gradlew`
- Android app module under `client/`

If the checkout is not runnable, stop early instead of pretending setup can continue.

### 2. Detect local tools and install what can be installed safely

Check for:

- `node`
- `pnpm`
- `docker`
- `adb`
- Java / Android build prerequisites when building the client

Install or remediate only when it is safe and already available through the user's package manager conventions. Otherwise report the exact missing prerequisite.

Do not install Android Studio automatically.

### 3. Bootstrap the backend automatically

Do all of the following yourself when the files exist:

- enter `server/`
- run `./start.sh`
- detect first-run exit caused by `.env` generation
- inspect generated env file path
- ask the user only for missing API keys
- resume `./start.sh` after keys are provided
- verify backend health endpoints or docs endpoint if available

Never tell the user to manually copy `.env.example` if the project already has a bootstrap script that can do it.

### 4. Build the Android client automatically

Do all of the following yourself when the files exist:

- enter `client/`
- run the Gradle build
- locate the generated APK
- install with `adb install` if a device is connected

If no device is connected, build the APK anyway and tell the user the exact next physical step: connect a device or start an emulator.

### 5. Minimize device-side user work

When a device is present, Codex should handle terminal-side device setup, including when possible:

- `adb devices`
- `adb reverse tcp:7777 tcp:7777`
- APK install or reinstall

Ask the user only to do device-side steps such as:

- tap "Allow" on USB debugging
- open the OpenGUI app
- enable accessibility permissions
- allow overlay permission
- exempt the app from battery restrictions

### 6. Verify first run

After backend and APK are ready, verify the first runnable path.

At minimum, confirm:

- backend process started successfully
- API or docs endpoint is reachable
- APK was built
- device connection status is known
- user knows the exact remaining phone-side actions

If the project supports a simple API-auth or task-creation flow, automate the terminal/API part and leave only phone-side permissions to the user.

## Output Contract

At the end, provide a short status block with:

- what Codex completed automatically
- what is still blocked
- the exact next user action, if any
- the exact command Codex will run next after the user completes that action

## Failure Handling

If setup fails:

- report the failing command
- report the concrete reason
- propose the smallest next fix
- continue automatically if the fix is terminal-only
- stop only when blocked on physical access, secrets, or missing source files

## References

Load `references/setup-flow.md` when you need the detailed decision tree.