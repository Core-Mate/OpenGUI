---
name: open-gui-bootstrap
description: Launch and bootstrap OpenGUI from a plain-language user request. Use when Claude or Codex should install, configure, debug, and run a multi-role mobile operator system while minimizing manual setup. The user should only need to describe the goal and complete physical phone-side actions or provide secrets when required.
---

# OpenGUI Bootstrap

Launch OpenGUI from a plain-language request.

OpenGUI should be treated as a **multi-role mobile operator system**.

The bootstrap path exists so Claude or Codex can bring up that system with minimal user intervention, including long-running mobile workflows that may need supervision, execution, review, retry, and continuation over many hours.

The user should be able to say things like:

- "Help me run OpenGUI on my phone"
- "Use Claude to bootstrap OpenGUI for me"
- "Set up OpenGUI with GPT and Gemini as my model endpoints"
- "Get OpenGUI running and tell me only what I must tap on the phone"
- "Bootstrap OpenGUI for a long-running mobile workflow"
- "Help me set up OpenGUI for a 12-hour task"

Do not require the user to know the setup order, environment variable names, or terminal commands unless there is a real blocker.

## Trigger Guidance

If the user mentions OpenGUI setup in plain language, treat that as enough to start.

Typical trigger forms include:

- "Run OpenGUI"
- "Bootstrap OpenGUI"
- "Use Claude to start OpenGUI"
- "Use Codex to get OpenGUI running"
- "Set up OpenGUI with my model APIs"
- "Help me run a long OpenGUI workflow"
- "Only tell me the phone-side steps"

The user should not need to mention internal file paths, env names, or setup phases.

## Example Prompts

Use prompts like these as the intended interaction model:

- "Help me run OpenGUI on this machine."
- "Use Claude to bootstrap OpenGUI for me."
- "Use Codex to get OpenGUI running and only tell me what I need to do on the phone."
- "Set up OpenGUI with GPT for supervision and Gemini for vision and review."
- "Bootstrap OpenGUI with Kimi."
- "Run OpenGUI with MiniMax and tell me the minimum inputs you still need from me."
- "Use my existing model APIs and get OpenGUI working."
- "Get OpenGUI running on Android and keep the setup as automated as possible."
- "Help me bring up OpenGUI for a 12-hour task."

## Core Rules

- Treat Codex or Claude as the installer and operator.
- Treat OpenGUI as a Supervisor / Executor / Reviewer system.
- Default to doing the work directly instead of explaining how to do it.
- Do not ask the user to run terminal commands that Codex can run.
- Ask the user only for actions that require physical access, OS dialogs, secrets, or Android device interaction.
- Before claiming setup is complete, verify each major step.
- If the checkout does not contain runnable OpenGUI code, stop and say so clearly.
- Translate vague user requests into the concrete setup plan yourself.
- Prefer sensible defaults over exposing internal config detail.
- Optimize for recoverable, long-running mobile workflows instead of short demo-only setup choices.

## Input Contract

Assume the user may provide only a plain-language goal.

Examples of sufficient user input:

- "Run OpenGUI on this machine"
- "Use Claude to get OpenGUI running"
- "I want to use GPT for supervision and Gemini for vision"
- "Bootstrap the project and tell me only what to do on the phone"
- "Set this up for a long-running mobile workflow"

Do not require the user to pre-specify:

- exact env var names
- bootstrap order
- backend start commands
- Gradle commands
- `adb` commands
- model routing internals
- which internal role uses which provider

If details are missing, infer the most practical defaults and continue.

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

If the checkout is not runnable, stop early and explain the reason clearly.

### 2. Interpret the user's intent

Convert the user's plain-language request into a concrete setup target.

Examples:

- "Help me run OpenGUI" -> bootstrap backend, build client, detect device, explain only phone-side steps
- "Use Claude to run this" -> prefer Claude-compatible endpoint for supervision and planning unless the project indicates otherwise
- "Use GPT and Gemini" -> use GPT-compatible endpoint for supervision/planning and Gemini-compatible endpoint for vision/review when the project supports split model roles
- "Use my own models" -> ask only for the provider endpoints or keys that are actually missing
- "Set this up for a 12-hour task" -> favor the most stable provider routing and verify the system is ready for a long-running recoverable workflow

Do not ask the user to restate their goal in a structured form unless the request is genuinely ambiguous.

### 3. Detect local tools and install what can be installed safely

Check for:

- `node`
- `pnpm`
- `docker`
- `adb`
- Java / Android build prerequisites when building the client

Install or remediate only when it is safe and already available through the user's package manager conventions. Otherwise report the exact missing prerequisite.

Do not install Android Studio automatically.

### 4. Bootstrap the backend automatically

Do all of the following yourself when the files exist:

- enter `server/`
- run `./start.sh`
- detect first-run exit caused by `.env` generation
- inspect generated env file path
- ask the user only for missing API keys
- resume `./start.sh` after keys are provided
- verify backend health endpoints or docs endpoint if available

Never tell the user to manually copy `.env.example` if the project already has a bootstrap script that can do it.

### 5. Route model providers for the system

OpenGUI should feel provider-flexible, but the important behavior is routing providers into system roles rather than exposing provider mechanics to the user.

Supported intent examples include:

- Claude
- GPT
- Gemini
- Kimi
- MiniMax
- other OpenAI-compatible or custom-compatible endpoints

Rules:

- Prefer the user's existing model stack when they mention one.
- If the project separates supervision, planning, vision, or review roles, choose the most sensible split automatically.
- If the project only exposes generic endpoint fields, map the user's provider choice into those generic fields yourself.
- Ask only for the minimum secret or endpoint information that is still missing.
- If multiple providers are available, choose the one explicitly requested by the user first.
- If no provider is specified, use the repository defaults or the most conservative working default.
- Treat providers as routed components inside the system.

### 6. Build the Android client automatically

Do all of the following yourself when the files exist:

- enter `client/`
- run the Gradle build
- locate the generated APK
- install with `adb install` if a device is connected

If no device is connected, build the APK anyway and tell the user the exact next physical step: connect a device or start an emulator.

### 7. Minimize device-side user work

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

### 8. Verify first run

After backend and APK are ready, verify the first runnable path.

At minimum, confirm:

- backend process started successfully
- API or docs endpoint is reachable
- APK was built
- device connection status is known
- user knows the exact remaining phone-side actions

If the project supports a simple API-auth or task-creation flow, automate the terminal/API part and leave only phone-side permissions to the user.

### 9. Check long-running workflow readiness

If the user is trying to run a long workflow, verify the setup is appropriate for a recoverable multi-hour task.

At minimum, check:

- backend is stable enough to stay up for the intended run
- device connectivity state is known
- required permissions are in place
- the provider routing is sensible for supervision, execution support, and review
- the user understands the exact remaining phone-side dependency, if any

## Communication Style

When responding during setup:

- keep updates short and operational
- say what Codex is doing now
- say what is blocked, if anything
- when blocked, ask for the smallest next thing only
- frame the system as a long-running operator stack when relevant

Good:

- "I generated the env file and started the backend. The only thing I need from you now is the Claude API key."
- "The APK is built. Connect the phone by USB and tap Allow on the debugging dialog. I will install it after that."

Bad:

- "Please follow these seven setup sections manually."
- "Set `FOO_BAR_BAZ` and then maybe run Gradle if needed."

## Output Contract

At the end, provide a short status block with:

- what Codex completed automatically
- what model providers were configured or selected
- whether the setup is ready for a normal run or a long-running workflow
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
