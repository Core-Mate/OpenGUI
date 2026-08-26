---
name: open-gui-remote-control
description: Control an Android phone through OpenGUI from Codex or Claude Code. Use when an agent should list online devices, run a natural-language mobile task, check execution status, pause, resume, or cancel through the local OpenGUI backend and CLI.
---

# OpenGUI Remote Control

Use this skill when Codex or Claude Code needs to operate an Android phone through OpenGUI.

The agent should not drive the phone with raw `adb shell input` commands. The supported path is:

```text
Codex / Claude Code
  -> server CLI or REST API
  -> OpenGUI backend task/execution services
  -> standby dispatch
  -> Android client
  -> execution socket action loop
```

## Trigger Guidance

Start this skill when the user asks for any of these:

- "Use OpenGUI to control my phone"
- "让 Codex 操控手机"
- "Run this task on the Android device"
- "Use the OpenGUI CLI"
- "List OpenGUI devices"
- "Check / pause / resume / cancel an OpenGUI execution"
- "让 Claude Code 通过 OpenGUI 跑手机任务"

If the user asks to install or bootstrap OpenGUI from scratch, use `open-gui-bootstrap` first. After backend and Android client are running, return to this skill for task execution.

## Core Rules

- First obtain or locate a runnable OpenGUI checkout. The CLI cannot work without the repository.
- Use the repository CLI first: `cd server && pnpm opengui -- ...`.
- Use `--json` whenever the result will be parsed by Codex or Claude Code.
- Do not ask the user to run terminal commands that the agent can run.
- Ask the user only for physical phone actions, Android permissions, or missing secrets.
- Do not change Android socket event names or payloads.
- Do not use IM commands for this workflow.
- Do not bypass OpenGUI with coordinate-only `adb shell input` scripts.
- Treat `devices` as standby presence only; execution can still fail because of model config, Android permissions, app state, or device lifecycle.

## Repository Source

OpenGUI's runnable source checkout is:

```text
https://github.com/Core-Mate/OpenGUI
```

The checkout must contain both:

- `server/package.json`
- `client/start.sh`

If those paths are missing, the current directory is not the runnable OpenGUI checkout.

## Local Or Remote Workspace

Before using this skill, decide where OpenGUI should run.

Use a local workspace when:

- the Android phone is connected to the same machine by USB
- `adb reverse tcp:7777 tcp:7777` should be used
- the agent has terminal access to the developer machine

Use a remote workspace only when:

- the user explicitly asks to run OpenGUI on a remote host
- the remote host can reach the Android device or a device bridge
- the backend URL used by the Android client is reachable from the phone

Do not silently choose a remote host for phone control. USB debugging, `adb reverse`, Android build/install, and phone-side permissions are usually local-machine operations.

## Checkout Acquisition

If the current directory already contains the runnable checkout, use it.

If the current directory is a wrapper directory, search one level down for the runnable checkout before cloning:

```bash
find . -maxdepth 3 -type f -path '*/server/package.json' -print
find . -maxdepth 3 -type f -path '*/client/start.sh' -print
```

If no runnable checkout exists and the user wants the agent to set it up locally, clone the public repository:

```bash
git clone https://github.com/Core-Mate/OpenGUI.git
cd OpenGUI
```

If the destination already exists, do not overwrite it. Enter the existing directory, inspect `git status`, and pull only when the user asked for the latest code or when the checkout is clean enough to update safely.

If the user wants a remote setup, SSH to the remote host first, then perform the same checkout detection or clone on that host. Keep the backend URL and Android connectivity explicit; a backend running on a remote host will not be reachable through local `adb reverse` unless the user has provided a bridge.

## Preconditions

Before sending a task, verify these conditions:

- backend is reachable at `http://localhost:7777` unless the user gave another base URL
- Android client is installed and open
- `adb reverse tcp:7777 tcp:7777` has been applied for a USB-connected phone
- phone-side USB debugging is approved
- Accessibility Service is enabled
- overlay permission is enabled when needed
- at least one standby device is online

If the backend or client is not running, use the repository scripts:

```bash
cd server
./start.sh
```

```bash
cd client
./start.sh
```

## CLI Reference

Run commands from the `server/` directory.

List online standby devices:

```bash
pnpm opengui -- devices --json
```

Create and run a new task:

```bash
pnpm opengui -- do "观察当前手机屏幕，简要描述你看到了什么，然后结束" --json
```

Run a task on a specific device:

```bash
pnpm opengui -- do "打开设置，检查当前网络状态" --device <deviceId> --json
```

Run an existing task:

```bash
pnpm opengui -- run <taskId> --json
```

Check execution status:

```bash
pnpm opengui -- status <executionId> --json
```

Pause, resume, or cancel:

```bash
pnpm opengui -- pause <executionId> --json
pnpm opengui -- resume <executionId> "继续执行，但不要打开新的 App" --json
pnpm opengui -- cancel <executionId> --json
```

Use a non-default backend:

```bash
pnpm opengui -- devices --base-url http://localhost:7777 --json
```

Base URL priority:

```text
--base-url > OPENGUI_BASE_URL > http://localhost:7777
```

## Standard Workflow

### 1. Obtain the runnable checkout

Find or clone `https://github.com/Core-Mate/OpenGUI`.

Then work from the repository root that contains both:

- `server/package.json`
- `client/start.sh`

If the current directory is a wrapper repo, find the nested runnable checkout before running commands. If no runnable checkout exists, clone it or ask for the intended repository location.

### 2. Verify backend

Check the backend before task dispatch:

```bash
curl -fsS http://localhost:7777/docs >/dev/null
```

If this fails, start the backend:

```bash
cd server
./start.sh
```

If `start.sh` creates `.env` and exits, ask only for the missing model keys required for execution, then run it again.

### 3. Verify Android client

Prefer the repo script:

```bash
cd client
./start.sh
```

If a device is already installed and connected, still make sure reverse proxy is set:

```bash
adb reverse tcp:7777 tcp:7777
```

Only interrupt the user for phone-side prompts:

- approve USB debugging
- enable Accessibility Service
- enable overlay permission
- keep the OpenGUI app open

### 4. List devices

Use JSON output:

```bash
cd server
pnpm opengui -- devices --json
```

If no devices are returned, do not dispatch a task. Ask the user to open the Android app and complete the required permissions, then retry.

If multiple devices are returned, choose the intended one by `deviceId`. If the user did not specify a device and the task is low-risk, use the first online device.

### 5. Dispatch the task

For a new natural-language task:

```bash
pnpm opengui -- do "<task description>" --device <deviceId> --json
```

For an existing task:

```bash
pnpm opengui -- run <taskId> --device <deviceId> --json
```

Capture `executionId` from the response.

### 6. Poll status

Poll until the execution reaches a terminal state:

```bash
pnpm opengui -- status <executionId> --json
```

Terminal outcomes usually include success, cancellation, or failure states in the backend execution result. If the status stays running for a long time, inspect backend logs before assuming the phone is stuck.

### 7. Control the execution when needed

Cancel when the user asks to stop or the task is clearly wrong:

```bash
pnpm opengui -- cancel <executionId> --json
```

Pause when human feedback is needed:

```bash
pnpm opengui -- pause <executionId> --json
```

Resume with concise feedback:

```bash
pnpm opengui -- resume <executionId> "<feedback>" --json
```

Feedback should be specific to the current phone state, for example:

- "继续搜索，但不要点击广告结果"
- "回到上一页，然后重新打开搜索框"
- "任务已经完成，可以结束"

## Failure Handling

### Backend is unreachable

Symptom:

```text
fetch failed
```

Action:

- check whether backend is running
- start it with `cd server && ./start.sh`
- if another port is used, pass `--base-url`

### No online device

Symptom:

```text
No online device. Start the Android app on the work phone first.
```

Action:

- ask the user to open the OpenGUI Android app
- verify USB debugging approval
- run `adb reverse tcp:7777 tcp:7777`
- verify Accessibility Service and overlay permission
- retry `pnpm opengui -- devices --json`

### Device ID is not online

Symptom:

```text
Device "<deviceId>" is not online
```

Action:

- list devices again
- use a currently online `deviceId`
- if the expected phone disappeared, ask the user to reopen the app

### Execution starts but does not progress

Action:

- check backend logs
- confirm model keys and base URLs are configured
- confirm the phone screen is unlocked
- confirm Accessibility Service is still enabled
- cancel only when the task is clearly unrecoverable or the user asks to stop

### Execution succeeds but summary is weak

Action:

- check execution logs before rerunning the task
- if logs show that the VLM observed the screen, treat this as a summarization or persistence issue, not a transport failure

## REST API Reference

The CLI wraps these local backend endpoints:

```text
GET  /api/remote-control/devices
POST /api/remote-control/tasks/do
POST /api/remote-control/tasks/run
GET  /api/remote-control/executions/:id
PUT  /api/remote-control/executions/:id/cancel
PUT  /api/remote-control/executions/:id/pause
PUT  /api/remote-control/executions/:id/resume
```

Prefer the CLI unless the user explicitly asks for direct REST usage.

## Completion Criteria

Before saying the phone was controlled successfully, provide evidence:

- selected `deviceId`
- created or reused `taskId`
- `executionId`
- final execution status/result
- any important backend or device-side limitation observed

If the task could not be run, state the concrete blocker and the next required phone-side or config action.
