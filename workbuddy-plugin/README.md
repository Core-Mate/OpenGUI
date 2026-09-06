# OpenGUI for WorkBuddy

[中文说明](README.zh-CN.md)

Independent local **MCP + Skill + lifecycle Hooks** connector for autonomous Android control, native read-only mirroring, and a read-only device wall. Version `0.2.0` (broker protocol `7`) is a local candidate, not a published release or a marketplace-approved connector.

Every OpenGUI request begins with `opengui_start`, displaying all connected authorized phones without taking control locks. Windows are read-only and silent, and persist across task completion, cancellation and MCP recycling. Only user-requested closure or device/runtime failure ends them. Phone tasks use the current WorkBuddy VLM in a screenshot–action–screenshot loop; standalone viewing sends no images to the model. On macOS the bundled helper verifies initial window visibility and renderer readiness once per control task. Subsequent minimization, occlusion, desktop switching, closure or renderer exit does not revoke control: the model receives independent phone screenshots. Initial display failure is reported and blocks operation until startup succeeds; it is never silently bypassed. First use downloads verified scrcpy into the independent WorkBuddy cache.

## What it does

- Discover USB/ADB-authorized Android phones; freeze one to four per session.
- Observe bounded screenshots and execute one allowlisted action at a time: tap, swipe, text, key, launch, or wait.
- View each session's phones in a private loopback device wall.
- Keep WorkBuddy connections isolated through a per-user broker. Different phones may run concurrently; the same phone cannot be shared by WorkBuddy sessions.
- Execute the user's authorized task without redundant plugin confirmation pages or approval flags. Host restrictions, account authentication and USB authorization remain mandatory.
- Continue unfinished recoverable tasks through native WorkBuddy Stop feedback, up to ten continuations. FinalStop, SessionEnd and a ten-minute execution-inactivity lease release control without closing mirrors.

There is no DSH/Codex dependency, installer, UI injection, browser agent, custom model service, cloud gateway, or API-key requirement. Those production plugins and their state remain separate. WorkBuddy's selected model must support tools and MCP images. Semantic classification of an arbitrary tap is the assistant's responsibility; the runtime cannot infer its consequence from coordinates.

## Requirements and privacy

- WorkBuddy 5.5.3 or newer; actual host acceptance is tracked separately in `release-readiness.json`.
- Node `^22.19.0 || >=24`, declared in the connector for WorkBuddy's managed runtime.
- Bundled ADB: macOS arm64/x64, Linux x64, Windows x64. Other architectures need an explicit compatible `OPENGUI_ADB_PATH`; Unicode support is limited to the pinned scrcpy platforms.
- Android USB debugging and user-approved authorization. The connector never accepts that authorization automatically.
- First installation needs GitHub and npm access. Unicode input downloads a checksum-pinned official scrcpy archive on first use. A cached installation may be restarted offline after all required dependencies and scrcpy assets are cached.

Screenshots and visible phone data are returned to the current WorkBuddy model. They are not written to disk by this runtime, although WorkBuddy may retain tool results. Device-wall URLs contain private viewing capabilities; do not share them. HTTP serves only `127.0.0.1`, checks Host/Origin and per-session tokens, sends no-store headers, and loads no remote assets. The wall stops reading frames after session termination.

Local state: `~/.workbuddy/opengui` (private token, owned-forward inventory, scrcpy cache). Windows uses inherited filesystem ACLs. `OPENGUI_WORKBUDDY_HOME` isolates tests; separate roots must never control the same phone concurrently. Version mismatches fail closed. For upgrades, explicitly finish old tasks and close old displays before switching the MCP path to an immutable new package directory. Never force-close existing displays or overwrite the running installation. Keep the previous configuration, Skill and package for rollback.

Do not run DSH, Codex, manual ADB, or another automation host against the same physical phone concurrently. WorkBuddy leases cannot coordinate those external owners. The package never runs `adb kill-server`, removes global forwards, or modifies another host's cache.

## Build and local testing

Run from `workbuddy-plugin/`:

```sh
npm ci
npm run check
npm run pack:release
npm run smoke:packed
```

`check` runs independent tests, TypeScript compilation, connector validation, source-isolation checks, and bundled ADB hash checks. It never builds the production plugins. `smoke:packed` starts the tarball through npm's isolated cache, checks MCP initialization/discovery/ping, launches its private broker, lists ADB devices read-only, and repeats with `--offline`. It cleans only the authenticated broker launched in its temporary state root. It sends no phone actions and is not WorkBuddy end-to-end acceptance.

Developers with `agent-browser` installed can run `npm run test:browser` to verify Chromium device-wall image updates and stop behavior using synthetic data only. This QA tool is not an end-user dependency. On macOS, `npm run test:native` verifies immediate readiness logs and graceful/forced cleanup of synthetic child processes; it never opens or operates a phone.

Install the local tarball in an immutable version directory under `~/.workbuddy/opengui/packages/`. Stop the old WorkBuddy OpenGUI runtime before switching. Run `node scripts/install-local.mjs --package-dir <absolute-installed-opengui-mcp-directory> --node <managed-node-executable>` from this built source package. The installer backs up and incrementally merges WorkBuddy `mcp.json`, `settings.json` and the `opengui` Skill, retaining other plugins and hooks. It refuses redirected configuration paths. This local override does not use the unpublished Release URL. Roll back using the backup paths in `opengui/local-install.json`, restore the previous MCP package path, and restart WorkBuddy; do not delete other hosts' data or the retained cache.

Try “Check the Android version on my phone.” A single connected phone is selected automatically; an explicit device name takes precedence. VLM tasks send phone screenshots to the current model; get permission for sensitive content. Close control sessions with the actual outcome and latest observation evidence, never displays. Closing resources alone records an unknown outcome, not success. Legacy mirror handles retain their private resume capability, but new viewing requests need no session. Closing or minimizing an established window affects viewing only; use `opengui_cancel` to stop the task. Recovery does not reopen closed windows. Physical disconnection invalidates observations; a new control session and fresh images are required after connection loss. No failed phone action is automatically replayed.

Hooks bind the native host session to each direct MCP call or DeferExecuteTool wrapper through a short-lived, exact-argument token. A model-supplied task ID is not authority. Hooks never approve or execute phone actions and never alter returned images. Missing hook context is explicitly reported as automatic continuation unavailable. The original logical task retains its frozen phones and 100 observations/actions per device across new connections; status polls and mirroring do not renew the control lease. User interruption wins over Stop continuation.

Actions use current observation credentials, consumed before dispatch. Transient read failures get at most two retries. An uncertain mutation must be verified from a new screenshot, not replayed. Pixel-difference checks compare the overall page and tap region; post-action stabilization samples every 250 ms for up to two seconds and reports unsettled frames rather than waiting indefinitely. Three repeated no-progress actions require a different strategy. These image checks are not semantic proof of task success. Deprecated confirmation fields confer no permission and no confirmation UI remains.

Builds on macOS require Xcode command-line tools and bundle arm64/x64 window helpers; end users do not need a compiler. Helpers inspect metadata only and never capture pixels. Accessibility permission may be needed to raise windows; denial blocks operation. Windows/Linux display verification is not yet supported, so phone operations fail closed there rather than claiming macOS parity.

## Distribution

Candidate tag convention: `opengui-workbuddy-v0.2.0` (not created by local installation). `pack:release` creates:

- `dist/opengui-mcp-0.2.0.tgz` and `.sha256`
- `dist/opengui-workbuddy-connector-0.2.0.zip` and `.sha256`

The ZIP contains `opengui/connector-meta.json`, `mcp.json`, `icon.svg`, and `skills/control/SKILL.md`. Its npx command pins the matching GitHub Release tarball. Do not distribute this candidate manifest as installable until that asset exists. The tarball includes code, ADB, notices, and package metadata; npm resolves its pinned runtime dependencies. No npm publish step is required.

The WorkBuddy-only workflows do not modify the DSH/Codex pipelines. Publishing additionally requires all real-host acceptance entries in `release-readiness.json` to be verified with evidence. A successful build, local archive, pushed commit, GitHub Release, and WorkBuddy marketplace approval are distinct states. Release assets are immutable; a rerun compares existing bytes and fails rather than replacing mismatched files.

Submit the verified connector ZIP to the WorkBuddy team separately. See the official [connector format](https://open.workbuddy.cn/docs/connector) and [Skill format](https://open.workbuddy.cn/docs/skill).

## Acceptance before release

1. Load the candidate in the real WorkBuddy client, confirm eleven tools and actual images available to the selected model.
2. Verify tap/swipe/ASCII and Unicode text/key/launch/wait on an authorized test phone. Never test payment, publication, or deletion on real accounts.
3. With two physical phones, verify independent tasks and the device wall; prove a second task cannot take an occupied phone.
4. Exercise native Stop continuation, FinalStop/SessionEnd cleanup, first-call recovery and user interruption; simulate authorized consequential actions without plugin confirmation UI.
5. Stop a task, disconnect/restart WorkBuddy, verify only owned sessions and forwards are cleaned, and reconnect successfully.
6. Run packaged startup on all claimed desktop platforms. Record real-host evidence before marking the release gates verified.

See [NOTICE.md](NOTICE.md) for the fixed public-source provenance and third-party notices.
