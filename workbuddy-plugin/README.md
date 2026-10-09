# OpenGUI for WorkBuddy 0.3.1

[中文说明](README.zh-CN.md). macOS public-testing candidate, protocol 8. Marketplace approval and the remaining real-device gates are separate.

OpenGUI opens real-time phone video beside the current chat using WorkBuddy built-in `present_files` with the Viewer URL and current working directory. A visible decoded H.264 frame must reach the backend before the first phone observation or action. An opening request or screenshot preview is insufficient. Video is read-only and local; model observations still use explicit screenshots.

## Task flow

1. List devices and freeze the sole authorized phone or the user's selected devices (one to four).
2. Call `opengui_open_viewer`, open its URL in the host's right browser, and call `opengui_viewer_status` with `waitMs: 30000` once. A timeout is terminal for that logical task, including repeated opens; report the blocker.
3. For pure viewing, finish. For control, call `opengui_open_session` with the same `viewerId` and devices, then observe and act one screenshot at a time.
4. Close/cancel control when finished. Watching continues. Hiding pauses video; closing the last page releases its source within the cleanup budget. Reopening watching does not restart the task.

After first display authorization, video failure or page closure does not cancel healthy screenshot control. Physical disconnection still invalidates observations; never switch phones or replay uncertain actions. Each task owns control exclusively. Viewer credentials never authorize phone actions. Independent host processes cannot coordinate external controllers, so do not control the same phone through another host concurrently.

## Installation and migration

Download the installer and run it in macOS Terminal, restart WorkBuddy once, then authorize the Skill and connector.

> [!IMPORTANT]
> **Restart WorkBuddy once after installation.** Finish other tasks, **fully quit with ⌘Q**, and reopen WorkBuddy before authorizing OpenGUI. Closing its window is not enough.

The complete steps and download link are in the [root README](../README.md#use-opengui-in-workbuddy). See [installation verification and troubleshooting](INSTALL.md) for details; the archive command below is for maintenance and local verification.

Use the supplied installer and matching archive with adjacent SHA-256 sidecars:

```sh
bash scripts/install-macos.command --archive /absolute/path/opengui-mcp-0.3.1.tgz
```

The installer prepares private Node, verifies the package and scrcpy resources, and only then changes this host's configuration. After installation, restart WorkBuddy once to load the new MCP configuration, review external Hook changes in `/hooks`, and confirm the installed Skill in `/skills`.

Complete old phone tasks and close old displays before upgrading. If an old broker remains, disable the old OpenGUI MCP and wait for its idle exit before retrying. No migration force-kills an old runtime. Repeated installation reuses verified caches; download failure reports its stage and leaves previous configuration available. Keep the old installer/archive and recovery record to reinstall the old version. The installer reports configuration, host loading and real-viewer acceptance separately.

WorkBuddy 5.5.3 domestic and overseas configuration discovery, version-aware running-host preflight, per-configuration receipts, and native Hooks are retained. Use `--check` or `--app /absolute/WorkBuddy.app` for explicit preflight. Legacy `opengui_start` and native mirror tools are compatibility-only, on explicit request. They never substitute for browser first-frame authorization.

Automatic discovery accepts `com.workbuddy.workbuddy`, `com.workbuddy.workbuddy-ai`, and legacy `com.tencent.workbuddy.*` identities. It prefers WorkBuddy (including legacy bundles) over WorkBuddy AI; multiple bundles in the preferred group require `--app`. An explicit `--app` overrides this preference. Configuration paths come from the selected application's product metadata, including `.workbuddy` and `.workbuddy-ai`.

Node and npm default to npmmirror with official fallback for this installation only. Use `--download-source official` to select official sources. Video archives remain separate GitHub downloads; `--video-mirror https://host/archive-directory` optionally selects an identical archive mirror with size/checksum verification and official fallback. See [download sources](INSTALL.md#download-sources); older packages cannot honor the new video option.

## Runtime and privacy

Each plugin independently packages scrcpy 4.1 transport and browser H.264 decoding: maximum dimension 960, 30 fps, 2 Mbps, no audio and no video control channel. Up to four per-device sources are shared within this host. Clients use bounded queues and recover on configuration/key frames. There is no shared background service or dependency on DSH.

The local HTTP/WebSocket server checks loopback Host, Origin and private viewer credentials. Do not share Viewer URLs. Phone screenshots sent to the model follow host data policies; video is not sent frame by frame. Session locks and observation authority are never restored after restart. See VIDEO-NOTICE.md and LICENSE for provenance.

## Verification

```sh
npm ci
npm run pack:release
npm run smoke:packed
```

The browser test additionally needs development-only `agent-browser` and `ffmpeg`. It validates actual H.264 decode and canvas changes, first-frame receipts, continued playback after completion, and subscriber cleanup. End users do not need those tools. See the [candidate acceptance report](../docs/plans/2026-09-13-viewer-candidate-acceptance.md) for separate host, device, performance, installation and release evidence. Candidate packaging alone does not pass those gates.
