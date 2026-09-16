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

Use the supplied installer and matching archive with adjacent SHA-256 sidecars:

```sh
bash scripts/install-macos.command --archive /absolute/path/opengui-mcp-0.3.1.tgz
```

The installer prepares private Node, verifies the package and scrcpy resources, and only then changes this host's configuration. On WorkBuddy 5.5.6+, the application may stay open: MCP configuration is watched live, while external Hook changes are reviewed in `/hooks` and the installed Skill is confirmed in `/skills`. Start a new task only if the current task does not refresh. Older compatible hosts use the Command-Q fallback reported by preflight.

Complete old phone tasks and close old displays before upgrading. If an old broker remains, disable the old OpenGUI MCP and wait for its idle exit before retrying. No migration force-kills an old runtime. Repeated installation reuses verified caches; download failure reports its stage and leaves previous configuration available. Keep the old installer/archive and recovery record to reinstall the old version. The installer reports configuration, host loading and real-viewer acceptance separately.

WorkBuddy 5.5.3 domestic and overseas configuration discovery, version-aware running-host preflight, per-configuration receipts, and native Hooks are retained. Use `--check` or `--app /absolute/WorkBuddy.app` for explicit preflight. Legacy `opengui_start` and native mirror tools are compatibility-only, on explicit request. They never substitute for browser first-frame authorization.

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
