# Install OpenGUI into WorkBuddy

Use this guide when a user asks WorkBuddy to install `https://github.com/Core-Mate/OpenGUI`. The target is the WorkBuddy connector: MCP + `opengui` Skill + lifecycle Hooks. Do not select the DSH installer or deploy `server/` and `client/` for this request.

## Requirements

- macOS on Apple Silicon or Intel, with WorkBuddy installed. Version 5.5.6+ supports live configuration; the installer checks compatibility and reports any restart requirement.
- Network access to GitHub release assets and the runtime downloads used by the installer.
- No phone is needed to install. USB debugging authorization is needed later to operate an Android phone.

Use the public **`opengui-workbuddy-v0.3.1`** prerelease below. Do not use GitHub's generic `/releases/latest`: this repository also publishes DSH and Codex plugins. Do not substitute a local development archive or claim unreleased features are included in the public package.

**Known compatibility blocker (verified 2026-10-06):** the published 0.3.1 installer checks only the older `dist/codebuddy.js` layout and fails with `HOST_HOOKS` on WorkBuddy 5.6.2. The current repository installer also checks `codebuddy-headless.js` and `codebuddy-lite-wb.mjs`, but that fix is not in the immutable release installer. Until a compatible installer is published, do not claim the short GitHub prompt completes installation on 5.6.2. Maintainers can validate a local candidate using the development-build procedure below; that is not a public-release installation test.

The source installer also avoids process enumeration for live-compatible WorkBuddy 5.5.6+ because the host command sandbox can deny `/bin/ps`. Older hosts still require the process check; the active OpenGUI broker check remains mandatory for every version. Do not disable sandbox protections or skip upgrade checks to install.

The development Hook now starts a broker only for an explicit skill invocation, rather than any text containing “OpenGUI”. Earlier local candidates can start the old broker merely from an installation prompt containing the repository URL. If that happens during an upgrade, stop the old tasks/viewers and disable the old MCP, allow the broker to exit, then continue the existing installation chat without invoking the phone Skill. If the host refuses configuration writes or cleanup, report the exact denied operation and use its normal authorization flow; do not weaken host security settings.

**Actual host authorization remains required:** on WorkBuddy 5.6.2 with the tested default permissions, the candidate reached `install-local.mjs` but the host refused the atomic configuration rename with `Brokered host rename source refused by file policy: prompt`. The transaction rolled back. Package download/extraction is not installation success. The user must complete the required WorkBuddy file authorization before configuration can be written; never describe this as an unattended install. See the [recorded prompt tests](docs/install-prompt-verification.zh-CN.md).

## Install from the public release

Download the installer and its adjacent SHA-256 file from the same release, verify before executing, then let the installer download and verify the package. A source checkout, npm install, sudo, and a system Node installation are unnecessary.

```bash
(
  set -euo pipefail
  install_dir=$(mktemp -d "${TMPDIR:-/tmp}/opengui-workbuddy.XXXXXXXX")
  release_url='https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v0.3.1'
  installer='opengui-workbuddy-0.3.1-install.command'
  cd "$install_dir"
  for asset in "$installer" "$installer.sha256"; do
    curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location \
      --connect-timeout 15 --max-time 240 --retry 2 "$release_url/$asset" -o "$asset"
  done
  shasum -a 256 -c "$installer.sha256"
  bash "$installer" --check
  bash "$installer"
)
```

The installer identifies the application and configuration directory, prepares private dependencies, and merges MCP/Skill/Hooks while preserving unrelated settings and backups. If multiple WorkBuddy applications are present, pass the intended absolute `.app` path with `--app` to both invocations. Do not guess another host's configuration directory.

For upgrades, finish existing OpenGUI tasks and close their viewers first. If the old broker is still active, disable the old OpenGUI MCP in WorkBuddy and wait for its normal idle exit before retrying. Do not force-kill host or phone processes or delete runtime locks to bypass this check. If preflight requests Command-Q, let the user finish other work and quit before continuing. A download or checksum failure is an installation failure, not permission to skip verification.

## Verify the installation

Report each stage separately:

1. **Configuration written:** the installer exits successfully and reports `CONFIG_WRITTEN`, `LIVE_CONFIG_WRITTEN`, or an already-configured result. This alone does not prove WorkBuddy loaded the plugin.
2. **Host loaded:** enable/trust OpenGUI if prompted, review external Hook changes in `/hooks`, confirm `opengui` in `/skills`, and check that the OpenGUI MCP tools are available. A new chat may be needed to refresh discovery.
3. **Device discovery:** ask `@opengui List connected devices without operating them`. An empty list means installation may be valid but no authorized device is connected; explain phone-side setup instead of declaring a device test passed.
4. **First task:** after the user connects and authorizes a phone, try `@opengui Open Settings, then return to the home screen. Stop after confirming the home screen is visible.` Verify the right-hand preview and the actual result. Do not launch a phone task merely to complete installation unless the user requested it.

Keep trust, device authorization, and any account/model prompts visible to the user. Do not claim automatic phone authorization or complete business acceptance from an installer success message.

## Development builds

Maintainers may deliberately install a locally built archive using `scripts/install-macos.command --archive /absolute/path/opengui-mcp-0.3.1.tgz`; its adjacent `.sha256` is required. This is a separate test from installing the public GitHub release. Record the archive digest because local candidates currently share the `0.3.1` version label with the published release. Never overwrite immutable release assets to make these packages appear identical.

Current development behavior and data flow: [English](README.md) · [简体中文](README.zh-CN.md).
