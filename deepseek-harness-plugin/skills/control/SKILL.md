---
name: control
description: Automatically control locally connected Android phones with OpenGUI screenshots and allowlisted actions whenever a request targets a phone, Android app, mobile game, or multiple devices. The user does not need to name OpenGUI. Use the native Codex Browser instead for browser-only work.
---

# OpenGUI Control

Use the OpenGUI MCP tools when they are available. In a public Skills-only installation, resolve the plugin root as two directories above this file and invoke `node <plugin-root>/lib/codex-cli.js <interface> '<json>'` instead. The CLI returns screenshot files under its private state directory; inspect those files with the available image viewer. Never bypass this adapter with raw `adb shell` commands.

## Route the task

- Route by intent, not invocation syntax. Ordinary requests such as opening an app, testing a phone UI, or claiming a game reward activate this Skill without `$control`, `OpenGUI`, or a special command.
- Treat an explicit Android phone, mobile app, or mobile game target as an OpenGUI task.
- If OpenGUI is unavailable, report its device, session, or adapter error. Do not silently fall back to Bash, shell, raw ADB, or another phone-control path.
- Use the native Codex Browser for a website, URL, web app, or browser-only target.
- Split a mixed phone-and-browser request into the smallest necessary phone actions and native Browser work.

## Phone loop

1. Call `opengui_list_devices`. Explain USB authorization or connection errors rather than guessing.
2. Call `opengui_open_session` with one to four selected device ids. Omit ids only when exactly one authorized phone is connected.
3. Call `opengui_observe` before the first mutation. Treat the returned screenshot pixels as the only valid coordinate space.
4. Perform exactly one `opengui_act` at a time with the newest `observationId`, then inspect the returned observation. Use tight target bounds for taps. Use `wait` only for visible loading.
5. Open the returned `deviceWallUrl` in the native Codex Browser when the user asks to monitor devices or when a multi-device wall helps.
6. Always call `opengui_close_session` after success. Call `opengui_cancel` immediately when the user asks to stop or when continuing would be unsafe.

For a multi-device session, pass `deviceId` on every observation and action. Devices are frozen for the session; never substitute a newly connected phone after a disconnect. Stop on stale-observation, repeated-no-progress, operation-limit, authorization, or disconnection errors.

## External side effects

Before the action that sends a message, publishes content, purchases anything, or deletes data, show the user the current target and intended effect and ask for immediate confirmation. Set `externalSideEffect` to `send`, `publish`, `purchase`, or `delete` on that action. The MCP transport performs a second local confirmation. For the Skills-only CLI fallback, set `confirmedExternalSideEffect: true` only after the user explicitly confirms in the current conversation. Never infer confirmation from the original task wording when the final target or content was not yet visible.
