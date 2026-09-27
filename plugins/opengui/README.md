# OpenGUI for Codex 0.3.0

[中文说明](README.zh-CN.md). macOS candidate, protocol 4. No public release or directory approval is implied by these files.

OpenGUI opens real-time phone video beside the current chat using Codex native `open_in_codex` with placement `right`. A visible decoded H.264 frame must reach the backend before the first phone observation or action. An opening request or screenshot preview is insufficient. Video is read-only and local; model observations still use explicit screenshots.

## Legacy step-control flow

1. List devices and freeze the sole authorized phone or the user's selected devices (one to four).
2. Call `opengui_open_viewer`, open its URL in the host's right browser, and call `opengui_viewer_status` with `waitMs: 30000` once. A timeout is terminal for that logical task, including repeated opens; report the blocker.
3. For pure viewing, finish. For control, call `opengui_open_session` with the same `viewerId` and devices, then observe and act one screenshot at a time.
4. Close/cancel control when finished. Watching continues. Hiding pauses video; closing the last page releases its source within the cleanup budget. Reopening watching does not restart the task.

After first display authorization, video failure or page closure does not cancel healthy screenshot control. Physical disconnection still invalidates observations; never switch phones or replay uncertain actions. Each task owns control exclusively. Viewer credentials never authorize phone actions. OpenGUI hosts now share an atomic local device-admission lock; a competing host is refused. Unrelated ADB clients are outside this protocol.

## Installation and migration

For source development, run `npm run dev:task-service` from `plugins/opengui`. It builds and runs an isolated foreground service, prints the workbench address, and rebuilds/restarts after plugin or shared package source changes. Open the printed address directly in a browser. Press Ctrl-C to stop. Restarts interrupt development tasks and may change the port. This loop does not use the installed launchd service.

Use the supplied installer and matching archive with adjacent SHA-256 sidecars:

```sh
bash scripts/install-macos.command --archive /absolute/path/opengui-codex-0.3.0.tar.gz
```

The installer prepares private Node, verifies the package and scrcpy resources, and only then changes this host's configuration. Complete old phone tasks and close old displays before upgrading. No migration force-kills an old runtime. Repeated installation reuses verified caches; download failure reports its stage and leaves previous configuration available. Keep the old installer/archive and recovery record to reinstall the old version. The installer reports configuration, host loading and real-viewer acceptance separately.

The standalone marketplace remains `opengui-standalone`; legacy plugin sources and other hosts remain untouched. CLI calls keep the host CODEX_THREAD_ID. The installer preserves configuration and marketplace inventories. An incompatible machine-wide ADB server is never automatically restarted.

## Runtime and privacy

Each plugin independently packages scrcpy 4.1 transport and browser H.264 decoding: maximum dimension 960, 30 fps, 2 Mbps, no audio and no video control channel. Up to four per-device sources are shared within this host. Clients use bounded queues and recover on configuration/key frames. The task workbench uses a shared local service; it does not depend on DSH.

Open the local workbench address directly in a browser. The video transport is read-only. Phone screenshots sent to the model follow host data policies; video is not sent frame by frame. Session locks and observation authority are never restored after restart. See VIDEO-NOTICE.md and LICENSE for provenance.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:viewer
pnpm package
```

The browser test additionally needs development-only `agent-browser` and `ffmpeg`. It validates actual H.264 decode and canvas changes, first-frame receipts, continued playback after completion, and subscriber cleanup. End users do not need those tools. See the [candidate acceptance report](../../docs/plans/2026-09-13-viewer-candidate-acceptance.md) for separate host, device, performance, installation and release evidence. Candidate packaging alone does not pass those gates.


### Shared source, independent installation

Device execution is built from `packages/device-runtime` in this repository.
Install only the host package; the current installers do not yet install the shared task service.
Host state, task identity, configuration and rollback remain independent. Device
control uses a minimal machine-wide device lease: another host's occupied phone
is rejected without preemption. The packaged `lib/runtime-manifest.json` records build provenance.

## Host-driven tasks (macOS candidate)

The current Codex model plans, reads screenshots and decides phone actions. Model configuration is disabled. Open `opengui_open_workbench` in the current chat, then submit `opengui_run_task` with requestId and goal. The host plans independent branches and OpenGUI assigns authorized phones. Keep the workbench visible for each branch's first decoded frame. Use `opengui_manage_task` next/decide throughout execution; inspect each returned imagePath with the host image tool. Use the parent taskId to advance the whole task, or a branch taskId to poll only that branch. status, stop, steer and resume manage the same durable task; `opengui_list_tasks` returns this conversation's records.

The homepage can submit a task for the host to claim. The plugin manifest registers the `--mcp` entry through `.mcp.json`, exposing a native workbench resource and a conversation-bound message bridge. Archive discovery passes, but loading in the real Codex host and automatic homepage handoff remain unverified. Closing the workbench is not a stop, but host decisions are required to progress. Host termination or a decision timeout can interrupt execution. Evidence remains on disk, and interrupted tasks become unknown without replay. Parent and branch journals use goals-v1 and tasks-v1, which old versions do not consume. Legacy sessions and host-driven tasks contend for the same device lease. Upgrade guards refuse replacement while phone work is active.

This is a development candidate, not a new published release. Read the repository's `docs/plans/2026-09-19-phone-agent-workbench.md` for implemented scope and outstanding real-host acceptance.
