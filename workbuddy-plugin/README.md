# OpenGUI for WorkBuddy 0.4.0

[中文说明](README.zh-CN.md). macOS public-testing candidate, protocol 8. Marketplace approval and the remaining real-device gates are separate.

OpenGUI opens real-time phone video beside the current chat using WorkBuddy built-in `present_files` with the Viewer URL and current working directory. A visible decoded H.264 frame must reach the backend before the first phone observation or action. An opening request or screenshot preview is insufficient. Video is read-only and local; model observations still use explicit screenshots.

## Task flow

1. List devices and freeze the sole authorized phone or the user's selected devices (one to four).
2. Call `opengui_open_viewer`, open its URL in the host's right browser, and call `opengui_viewer_status` with `waitMs: 30000` once. A timeout is terminal for that logical task, including repeated opens; report the blocker.
3. For pure viewing, finish. For control, call `opengui_open_session` with the same `viewerId` and devices, then observe and act one screenshot at a time.
4. Close/cancel control when finished. Watching continues. Hiding pauses video; closing the last page releases its source within the cleanup budget. Reopening watching does not restart the task.

After first display authorization, video failure or page closure does not cancel healthy screenshot control. Physical disconnection still invalidates observations; never switch phones or replay uncertain actions. Each task owns control exclusively. Viewer credentials never authorize phone actions. OpenGUI hosts now share an atomic local device-admission lock; a competing host is refused. Unrelated ADB clients are outside this protocol.

## Installation and migration

Use the supplied installer and matching archive with adjacent SHA-256 sidecars:

```sh
bash scripts/install-macos.command --archive /absolute/path/opengui-mcp-0.4.0.tgz
```

The installer prepares private Node, verifies the package and scrcpy resources, and only then changes this host's configuration. WorkBuddy 5.5.6+ defaults to an authenticated loopback HTTP service managed by a per-user macOS LaunchAgent, allowing the native workbench to message its owning chat. Its private endpoint survives service restarts; restarting the service does not resume phone actions or provide an independent model loop. On WorkBuddy 5.5.6+, the application may stay open: MCP configuration is watched live, while external Hook changes are reviewed in `/hooks` and the installed Skill is confirmed in `/skills`. Start a new task only if the current task does not refresh. Older compatible hosts use the Command-Q fallback reported by preflight.

Complete old phone tasks and close old displays before upgrading. The installer refuses active tasks, sessions, views and in-flight operations, and holds an upgrade lock during service/configuration replacement. A compatible idle broker exits through an authenticated maintenance handshake. Older brokers without that handshake must be disconnected through MCP management and allowed to exit normally. No migration force-kills an old runtime. New service startup or configuration failures restore the previous service and configuration unless a concurrent user edit requires manual recovery. Use the current installer with `--transport stdio` to return to the compatibility transport and unload the native service before installing a historical stdio-only package. Repeated installation reuses verified caches; download failure reports its stage and leaves previous configuration available. Keep the old installer/archive and recovery record to reinstall the old version. The installer reports configuration, host loading and real-viewer acceptance separately.

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


### Shared source, independent installation

Device execution is built from `packages/device-runtime` in this repository.
Install only the host package; there is no separately installed shared service.
Host state, task identity, configuration and rollback remain independent. All
three hosts check the same minimal machine-local device lease; an occupied phone
is rejected without preemption. The packaged `lib/runtime-manifest.json` records
build provenance.

## Host-driven phone tasks (macOS candidate)

The current WorkBuddy conversation model plans tasks, inspects screenshots and
supplies decisions. OpenGUI validates actions, operates authorized phones and
records evidence. Separate model configuration is disabled for new phone tasks.

Open `opengui_open_workbench` with WorkBuddy's `present_files`. Submit
`opengui_run_task` with a stable requestId and goal, or claim an existing homepage
submission without submitting it again. The host calls `opengui_manage_task`
with `next` and `decide` until every branch finishes or needs user input. The host
plans independent branches and OpenGUI assigns authorized phones automatically.
Keep each branch's workbench visible until its first decoded frame is confirmed.

The homepage, progress, stop, supplementary instructions, results and history use
the same task service as the host tools. Homepage submission currently waits for
an active host turn to claim it; it does not independently wake an ended turn.
Closing the page is not a stop. Execution needs continued host decisions, so
closing WorkBuddy does not guarantee continued execution. Explicit stop waits
for cleanup before reporting completion.

`opengui_list_tasks` returns durable history. Completion requires a fresh terminal
screenshot and success-criteria checks; tool delivery alone is not completion.
Interrupted tasks become unknown without replay. Records remain in this host's
separate versioned journal directory. Legacy step-control tools remain available
and contend for the same device lease. Legacy Pi/model modules are retained for
compatibility; they are not the current phone execution path.

This is a development candidate, not a new published release. Read the
repository's `docs/plans/2026-09-19-phone-agent-workbench.md` for separate code,
package, installed-host and real-device acceptance evidence.
