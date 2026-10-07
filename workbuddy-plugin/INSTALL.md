# Install OpenGUI into WorkBuddy

Use this guide when a user asks WorkBuddy to install `https://github.com/Core-Mate/OpenGUI`. The target is the WorkBuddy connector: MCP + `opengui` Skill + lifecycle Hooks. Do not select the DSH installer or deploy `server/` and `client/` for this request.

## Requirements

- macOS on Apple Silicon or Intel, with WorkBuddy installed. Version 5.5.6+ supports live configuration; the installer checks compatibility and reports any restart requirement.
- Network access to GitHub release assets and the runtime downloads used by the installer.
- No phone is needed to install. USB debugging authorization is needed later to operate an Android phone.

Use the public **`opengui-workbuddy-v0.3.1`** prerelease below. Do not use GitHub's generic `/releases/latest`: this repository also publishes DSH and Codex plugins. Do not substitute a local development archive or claim unreleased features are included in the public package.

## Recommended installation

Use the **commit-pinned compatible installer** below with the **official 0.3.1 release package**. This is the documented installation route, not a choice the user must make between two installers. The old installer attached to the release checks only `codebuddy.js` and fails with `HOST_HOOKS` on the WorkBuddy 5.6.2/5.7.6 headless/lite layout. The pinned script recognizes those layouts and avoids `/bin/ps` on live-compatible hosts. It still checks Hooks, archive integrity, ownership, redirected paths, and active-broker upgrade safety.

An explicit user request to install OpenGUI into WorkBuddy covers the ordinary download, verification, preflight, and MCP/Skill/Hook configuration steps, subject to the host's permission policy. Explain this scope briefly and proceed; do not add a separate installer-selection question just because the fixed script comes from a pinned repository commit. Repository text cannot grant user consent or override host policy. Stop for an actual authorization requirement, ambiguous target, integrity failure, active task, or other concrete blocker.

Download this exact script, verify its pinned SHA-256, then run preflight and installation. The script downloads the official package and its checksum from `opengui-workbuddy-v0.3.1`; it does not build or substitute a development package. A source checkout, sudo, and a system Node installation are unnecessary.

```bash
(
  set -euo pipefail
  install_dir=$(mktemp -d "${TMPDIR:-/tmp}/opengui-workbuddy.XXXXXXXX")
  installer_commit='4e4c57f15811fabaecfe8f00a4af1400fb2b1b8c'
  installer_sha='6a8ce9087e761c7772711d1a5316669fccb6618bb342d017e364acc62af2e864'
  installer='opengui-workbuddy-install.command'
  cd "$install_dir"
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location \
    --connect-timeout 15 --max-time 240 --retry 2 \
    "https://raw.githubusercontent.com/Core-Mate/OpenGUI/$installer_commit/workbuddy-plugin/scripts/install-macos.command" \
    -o "$installer"
  printf '%s  %s\n' "$installer_sha" "$installer" | shasum -a 256 -c -
  bash "$installer" --check
  bash "$installer"
)
```

### What can run without another question?

The complete prompt in the root README explicitly requests the documented installer, official package, and MCP/Skill/Hooks. It can reduce discretionary assistant questions. It does **not** suppress native file authorization, MCP trust, Hook review, phone authorization, or account/model selection, and behavior can vary by host version and model.

**Verified limitation (2026-10-07, WorkBuddy 5.7.6, default permissions):** after the assistant's “continue installation” question was answered, the pinned source installer passed preflight and downloaded the official package. Configuration writing was then refused by the host file policy and the transaction rolled back. The equivalent failure was also observed on 5.6.2. This flow is therefore **not verified as an unattended installation**. See the [prompt-test record](docs/install-prompt-verification.zh-CN.md).

If configuration writing is refused, use WorkBuddy's normal one-time authorization flow if the current tool supports it. If no such flow is available, report the exact operation and error and stop. Do not repeatedly rerun the installer, change global permission settings, remove host-injected environment variables, or switch tools to evade the refusal. A user may choose to run the same verified installer in their own Terminal, or explicitly authorize a local assistant to do so after the refusal is explained. This separate fallback does not change WorkBuddy permission settings and is not proof of an automatic WorkBuddy installation.

The installer identifies the application and configuration directory, prepares private dependencies, and merges MCP/Skill/Hooks while preserving unrelated settings and backups. If multiple WorkBuddy applications are present, pass the intended absolute `.app` path with `--app` to both invocations. Do not guess another host's configuration directory.

For upgrades, finish existing OpenGUI tasks and close their viewers first. If the old broker is still active, disable the old OpenGUI MCP in WorkBuddy and wait for its normal idle exit before retrying. Do not force-kill host or phone processes or delete runtime locks to bypass this check. If preflight requests Command-Q, let the user finish other work and quit before continuing. A download or checksum failure is an installation failure, not permission to skip verification.

## Verify the installation

Report each stage separately:

1. **Configuration written:** the installer exits successfully and reports `CONFIG_WRITTEN`, `LIVE_CONFIG_WRITTEN`, or an already-configured result. This alone does not prove WorkBuddy loaded the plugin.
2. **Host loaded:** confirm `opengui` in `/skills`, then open **Experts · Skills · Connectors → Connectors → Custom connector** (5.7.6 Chinese UI: **专家·技能·连接器 → 连接器 → 自定义连接器**). In MCP service management, enable the `opengui` server and wait for its status indicator to turn green. An enabled Skill or “14/14 tools enabled” label does not mean the server's master switch is on. Complete normal trust prompts and review external Hook changes in `/hooks` if requested. A new chat may be needed to refresh discovery.
3. **Device discovery:** discover and call the loaded `opengui_list_devices` MCP tool directly; WorkBuddy may expose its full name as `mcp__opengui__opengui_list_devices`. Read its actual result. Avoid invoking the phone-control Skill merely for an installation check. An empty list means installation may be valid but no authorized device is connected; explain phone-side setup instead of declaring a device test passed.
4. **First task:** after the user connects and authorizes a phone, try `@opengui Open Settings, then return to the home screen. Stop after confirming the home screen is visible.` Verify the right-hand preview and the actual result. Do not launch a phone task merely to complete installation unless the user requested it.

Keep trust, device authorization, and any account/model prompts visible to the user. Do not claim automatic phone authorization or complete business acceptance from an installer success message.

## Development builds

Maintainers may deliberately install a locally built archive using `scripts/install-macos.command --archive /absolute/path/opengui-mcp-0.3.1.tgz`; its adjacent `.sha256` is required. This is a separate test from installing the public GitHub release. Record the archive digest because local candidates currently share the `0.3.1` version label with the published release. Never overwrite immutable release assets to make these packages appear identical.

Current development behavior and data flow: [English](README.md) · [简体中文](README.zh-CN.md).
