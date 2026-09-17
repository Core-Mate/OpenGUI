---
name: opengui-plugin-install
description: Install or upgrade the standalone OpenGUI Codex or WorkBuddy plugin on macOS from verified prebuilt GitHub releases. Use for plugin installation, not phone actions or DSH installation.
---

# OpenGUI plugin installation

Infer Codex or WorkBuddy from the request; ask only if the target is missing. The two plugins have independent versions and installation directories. Do not install both unless requested.

1. Read the public GitHub releases API for `Core-Mate/OpenGUI`, following pagination. Select the newest non-draft, non-prerelease semantic version with tag `opengui-codex-vX.Y.Z` or `opengui-workbuddy-vX.Y.Z` and all matching assets below. If the user explicitly asks for the public testing/prerelease version, include non-draft prereleases for that host and explain their uncompleted device acceptance. An explicit requested version takes precedence; never silently substitute a different version. Do not use the repository-wide latest release, which may be DSH or an APK.
2. Download `opengui-HOST-X.Y.Z-install.command` and its `.sha256` asset from that release into a fresh temporary directory. Use HTTPS with redirect-to-HTTPS only. Require exact filenames and verify SHA-256 before executing the installer. The checksum establishes integrity relative to the selected public release, not an independent publisher signature.
3. Finish existing OpenGUI phone tasks before an upgrade. WorkBuddy 5.5.6 or newer may stay open; never kill it or its phone/mirror processes. Older compatible WorkBuddy versions require a normal Command-Q restart when the installer reports `HOST_RESTART_REQUIRED`. Codex requires the native CLI with `codex plugin` support. Never remove a conflicting plugin source without the user's authorization.
4. For WorkBuddy, run the selected installer with `--check` first. Read its exact error code; do not inspect the entire application or rewrite configuration manually. Multiple applications require an explicit `--app` selection. When invoked inside WorkBuddy 5.5.6+, run `bash /absolute/path/opengui-HOST-X.Y.Z-install.command` directly in the current task after the preflight passes. It downloads and verifies the matching package, prepares private Node 22.23.2, installs into a fresh version directory, and atomically configures only the selected host. If an upgrade reports `upgrade_blocked`, finish and close the old OpenGUI task/viewer/mirror, disable OpenGUI in MCP service management, wait for its broker to exit, then retry once. No Git clone, pnpm, source compilation, agent-written JSON, or user-run test suite is required.
5. Read the result. After `LIVE_CONFIG_WRITTEN`, keep WorkBuddy open: trust/enable the OpenGUI MCP if prompted, open `/hooks` to review and apply the external Hook change, and open `/skills` to confirm `opengui`. Start a new task only if the current task does not refresh. After a stopped-host installation, open WorkBuddy and perform the same checks. Verify read-only device discovery before phone actions. USB and system permissions remain user actions. Installation success does not prove phone control, desktop visibility, or two-device acceptance.

Required release assets:
- Codex: `opengui-codex-X.Y.Z.tar.gz`, its `.sha256`, and the installer plus its `.sha256`.
- WorkBuddy: `opengui-mcp-X.Y.Z.tgz`, its `.sha256`, and the installer plus its `.sha256`.

If no complete release exists or downloads fail, report that precise state. Do not replace the installer with source builds or invent a working download link. For explicitly requested candidate testing, use a maintainer-provided archive with its adjacent checksum and the matching source installer: `bash install-macos.command --archive /absolute/package.tar.gz` (WorkBuddy uses `.tgz`). Keep candidate and published status separate.

Rollback uses the previous version's verified installer after tasks end. WorkBuddy also records scoped configuration backups in `~/.workbuddy/opengui/local-install-<configuration-id>.json`; Codex retains previous inventories and a configuration backup beside each immutable package. Preserve subsequent unrelated edits when recovering; do not reset an entire host or touch DSH.

The two packages embed shared device-runtime code but install independently. Do
not install a third runtime service or reuse another host's state directory.
Report configuration installation, MCP tool discovery, Hook continuation, and
visible-device readiness separately. A candidate `lib/runtime-manifest.json`
identifies its host, package version, source commit and shared-source digest;
it is provenance metadata, not a replacement for release checksum verification.
