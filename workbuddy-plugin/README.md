# OpenGUI for WorkBuddy

[中文说明](README.zh-CN.md)

Independent local **MCP + Skill** connector for Android control, native read-only mirroring, and a read-only device wall. Version `0.1.0` is a development candidate, not a published release or a marketplace-approved connector.

Every OpenGUI request begins with `opengui_start`, displaying all connected authorized phones without taking control locks. Windows are read-only and silent, and persist across task completion, cancellation and MCP recycling. Only user-requested closure or device/runtime failure ends them. Phone tasks use the current WorkBuddy VLM in a screenshot–action–screenshot loop; standalone viewing sends no images to the model. On macOS the bundled helper verifies initial window visibility and renderer readiness once per control task. Subsequent minimization, occlusion, desktop switching, closure or renderer exit does not revoke control: the model receives independent phone screenshots. Initial display failure is reported and blocks operation until startup succeeds; it is never silently bypassed. First use downloads verified scrcpy into the independent WorkBuddy cache.

## What it does

- Discover USB/ADB-authorized Android phones; freeze one to four per session.
- Observe bounded screenshots and execute one allowlisted action at a time: tap, swipe, text, key, launch, or wait.
- View each session's phones in a private loopback device wall.
- Keep WorkBuddy connections isolated through a per-user broker. Different phones may run concurrently; the same phone cannot be shared by WorkBuddy sessions.
- Require action-specific human approval for classified send, publish, purchase, and delete actions, preferring native MCP confirmation forms.
- Use a local one-action confirmation page when the host cannot show native MCP forms; reject missing, changed, expired, or reused approvals.

There is no DSH/Codex dependency, installer, UI injection, browser agent, custom model service, cloud gateway, or API-key requirement. Those production plugins and their state remain separate. WorkBuddy's selected model must support tools and MCP images. Semantic classification of an arbitrary tap is the assistant's responsibility; the runtime cannot infer its consequence from coordinates.

## Requirements and privacy

- WorkBuddy 5.3.14 or newer; actual host acceptance is tracked separately in `release-readiness.json`.
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

Developers with `agent-browser` installed can run `npm run test:browser` to verify real Chromium approval/rejection, one-time consumption, device-wall image updates and stop behavior using synthetic data only. This additional QA tool is not an end-user dependency. HTTP unit tests alone cannot prove browser form compatibility: browser-generated Origin headers must remain valid without leaking capability-bearing URL paths. On macOS, `npm run test:native` verifies immediate readiness logs and graceful/forced cleanup of synthetic child processes; it never opens or operates a phone.

For a local WorkBuddy custom MCP connection, use the managed Node executable as **command** and the absolute path to this package's built `lib/mcp.js` as its only **argument**. Select stdio and a 120000 ms timeout. This development override avoids the unpublished Release URL. Add `connector/skills/control/SKILL.md` through WorkBuddy's local Skill UI if supported by the installed client. No setup script edits host settings or installs into DSH/Codex.

Try “Check the Android version on my phone.” Explicitly select task phones when multiple are connected. VLM tasks send phone screenshots to the current model; get permission for sensitive content. Close control sessions on completion, never displays. Legacy mirror-session handles can be resumed with their private token, but new viewing requests need no session. Closing or minimizing an established window affects viewing only; use `opengui_cancel` to stop the task. The runtime does not steal focus or immediately reopen closed windows. Mirror readiness describes the current display, while task activity describes control independently. Physical disconnection invalidates observations and pending approvals; fresh screenshots are required after reconnect or capture failure. No failed phone action is automatically replayed.

For send/publish/purchase/delete, native MCP confirmation is preferred. Clients without form support receive a local one-action confirmation link. The human must approve it; the model must never use browser or shell tools to approve. Resubmit the same action with `confirmationRequestId`; approvals expire after five minutes and are bound to the exact task, device, observation and action. Changed phone frames invalidate execution. The local page is not an identity boundary against malicious software already controlling the desktop.

Builds on macOS require Xcode command-line tools and bundle arm64/x64 window helpers; end users do not need a compiler. Helpers inspect metadata only and never capture pixels. Accessibility permission may be needed to raise windows; denial blocks operation. Windows/Linux display verification is not yet supported, so phone operations fail closed there rather than claiming macOS parity.

## Distribution

Independent tag: `opengui-workbuddy-v0.1.0`. `pack:release` creates:

- `dist/opengui-mcp-0.1.0.tgz` and `.sha256`
- `dist/opengui-workbuddy-connector-0.1.0.zip` and `.sha256`

The ZIP contains `opengui/connector-meta.json`, `mcp.json`, `icon.svg`, and `skills/control/SKILL.md`. Its npx command pins the matching GitHub Release tarball. Do not distribute this candidate manifest as installable until that asset exists. The tarball includes code, ADB, notices, and package metadata; npm resolves its pinned runtime dependencies. No npm publish step is required.

The WorkBuddy-only workflows do not modify the DSH/Codex pipelines. Publishing additionally requires all real-host acceptance entries in `release-readiness.json` to be verified with evidence. A successful build, local archive, pushed commit, GitHub Release, and WorkBuddy marketplace approval are distinct states. Release assets are immutable; a rerun compares existing bytes and fails rather than replacing mismatched files.

Submit the verified connector ZIP to the WorkBuddy team separately. See the official [connector format](https://open.workbuddy.cn/docs/connector) and [Skill format](https://open.workbuddy.cn/docs/skill).

## Acceptance before release

1. Load the candidate in the real WorkBuddy client, confirm eleven tools and actual images available to the selected model.
2. Verify tap/swipe/ASCII and Unicode text/key/launch/wait on an authorized test phone. Never test payment, publication, or deletion on real accounts.
3. With two physical phones, verify independent tasks and the device wall; prove a second task cannot take an occupied phone.
4. Exercise confirmation accept, reject, dismiss, unsupported client, and cancellation while the form is open.
5. Stop a task, disconnect/restart WorkBuddy, verify only owned sessions and forwards are cleaned, and reconnect successfully.
6. Run packaged startup on all claimed desktop platforms. Record real-host evidence before marking the release gates verified.

See [NOTICE.md](NOTICE.md) for the fixed public-source provenance and third-party notices.
