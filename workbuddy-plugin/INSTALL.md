# Install OpenGUI into WorkBuddy

Use this guide when a user asks WorkBuddy to install `https://github.com/Core-Mate/OpenGUI`. The target is the WorkBuddy connector: MCP + `opengui` Skill + lifecycle Hooks. Do not select the DSH installer or deploy `server/` and `client/` for this request.

## Requirements

- macOS on Apple Silicon or Intel, with WorkBuddy installed. Version 5.5.6+ supports live configuration; the installer checks compatibility and reports any restart requirement.
- Network access to GitHub release assets and the runtime downloads used by the installer.
- No phone is needed to install. USB debugging authorization is needed later to operate an Android phone.

Use the public **`opengui-workbuddy-v0.3.1`** prerelease below. Do not use GitHub's generic `/releases/latest`: this repository also publishes DSH and Codex plugins. Do not substitute a local development archive or claim unreleased features are included in the public package.

## Recommended installation

A short request such as `帮我安装opengui插件：https://github.com/Core-Mate/OpenGUI` identifies this workflow. Do not require a longer prompt or ask the user to choose between the old release installer and its documented replacement.

Use the **interactive installer ZIP 1.0.0**, containing the commit-pinned compatible installer, to install the unchanged official **plugin 0.3.1**. This ZIP is an installer entry point, not a signed/notarized app or a new runtime release. It checks the bundled payload again, waits for a human Return, and records a fresh result and log for each installation attempt.

- ZIP: https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-installer-v1.0.0/opengui-workbuddy-installer-1.0.0.zip
- SHA-256: `5c385cd387c09a48ccf7a853a033a7c50c5f508ca08854887f4f17318cc8fa34`
- Checksum file: https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-installer-v1.0.0/opengui-workbuddy-installer-1.0.0.zip.sha256
- Bundled installer commit: `d6a5f5ce240cdd6ca393ea516206b8a329411ac0`
- Bundled installer SHA-256: `b3581c8d928068e7bf7a8a886f75c1c436efdb71ae2c5bf97b220b36bf9f0239`

### Prepare the download

An explicit request to install covers ordinary download, verification, and preparation within the host's normal permissions. State the scope briefly: private runtime, MCP, Skill, and seven lifecycle Hooks, with configuration backups and no phone operation. README text cannot grant consent or override host policy.

Download to a new directory and verify before extraction. The following block **only prepares files**; it does not run the installer. Use macOS `ditto` so the executable bit is preserved. If Downloads access needs authorization, use the host's normal authorization flow or let the user download the ZIP directly.

```bash
(
  set -euo pipefail
  handoff_dir=$(mktemp -d "$HOME/Downloads/OpenGUI-installer.XXXXXXXX")
  cd "$handoff_dir"
  archive='opengui-workbuddy-installer-1.0.0.zip'
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location \
    --connect-timeout 15 --max-time 240 --retry 2 \
    'https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-installer-v1.0.0/opengui-workbuddy-installer-1.0.0.zip' \
    -o "$archive"
  printf '%s  %s\n' '5c385cd387c09a48ccf7a853a033a7c50c5f508ca08854887f4f17318cc8fa34' "$archive" | shasum -a 256 -c -
  /usr/bin/ditto -x -k "$archive" "$handoff_dir"
  printf 'Open in Finder: %s/OpenGUI-WorkBuddy-Installer/OpenGUI-Install.command\n' "$handoff_dir"
)
```

### Open the installer and hand off

1. If the host provides a supported, normally authorized way to open the extracted `.command` file in macOS Terminal, use it. Opening the window must not press Return or feed confirmation on the user's behalf. If that operation is unavailable or refused, stop attempting it and give the exact clickable local path. Tell the user to open Finder, press Command-Shift-G, paste the containing folder's absolute path, and double-click `OpenGUI-Install.command`. Keep `installer.sh` beside it. If preparation itself was blocked, provide the ZIP link and the same extraction/opening steps.
2. The user reads the installation scope and presses Return in Terminal, or types `q` then Return to cancel. If macOS blocks opening, let the user handle the normal system prompt. Do not remove quarantine attributes or disable Gatekeeper. Before upgrading, finish phone tasks, quit WorkBuddy, and wait for the previous broker's normal idle exit. Never force-kill processes or remove active locks.
3. Read the **current attempt's** `installation-result.*/result.txt` and `install.log` if accessible, or ask the user for the displayed result. `status=configuration_written` means configuration was written; `hostLoaded=unverified` is intentional. `status=running`, a missing receipt, cancellation, or a stale earlier receipt is not success. On failure, report the actual exit code and log, including any rollback diagnostics; do not claim a clean rollback without evidence.
4. Return to WorkBuddy for [native verification](#verify-the-installation). Restart once if discovery has not refreshed. Enable only switches actually found off, using normal supported controls; provide the [illustrated guide](docs/enable-opengui.md) only where manual action is required.

Do not run the launcher with `bash` inside WorkBuddy, fabricate a TTY, strip host-injected variables, or pipe a newline into its confirmation. It deliberately refuses noninteractive and recognized host-injected execution. This is a user-confirmed handoff, not an unattended installation guarantee.

**Known WorkBuddy 5.7.6 default-permission limitation:** direct configuration writes returned `CODEBUDDY_BROKER_DENY` / `decision: prompt` without a usable authorization channel. Use the handoff route immediately in this known environment. Do not rerun the old direct flow to rediscover that refusal. In another environment, any direct installation still requires the host's normal authorization; stop after the first matching refusal and hand off to the user. Never change permission modes, switch tools, or remove host injection to evade it. Checksum, download, compatibility, and active-broker failures retain their own diagnostics.

### Command-line fallback

A user who prefers a pasted command can run the block below in the macOS **Terminal** app. The original installer attached to plugin 0.3.1 only checks `codebuddy.js`; this pinned replacement also recognizes WorkBuddy 5.6.2/5.7.6 headless/lite layouts. It downloads and verifies the same official plugin package. No source checkout, sudo, or system Node installation is needed.

Download this exact script, verify its pinned SHA-256, then run preflight and installation. The script downloads the official package and its checksum from `opengui-workbuddy-v0.3.1`; it does not build or substitute a development package. A source checkout, sudo, and a system Node installation are unnecessary.

```bash
(
  set -euo pipefail
  install_dir=$(mktemp -d "${TMPDIR:-/tmp}/opengui-workbuddy.XXXXXXXX")
  installer_commit='d6a5f5ce240cdd6ca393ea516206b8a329411ac0'
  installer_sha='b3581c8d928068e7bf7a8a886f75c1c436efdb71ae2c5bf97b220b36bf9f0239'
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

The installer identifies the application and configuration directory, prepares private dependencies, and merges MCP/Skill/Hooks while preserving unrelated settings and backups. If multiple WorkBuddy applications are present, pass the intended absolute `.app` path with `--app` to both invocations. Do not guess another host's configuration directory.

For upgrades, finish existing OpenGUI tasks and close their viewers first. If the old broker is still active, disable the old OpenGUI MCP in WorkBuddy and wait for its normal idle exit before retrying. Do not force-kill host or phone processes or delete runtime locks to bypass this check. If preflight requests Command-Q, let the user finish other work and quit before continuing. A download or checksum failure is an installation failure, not permission to skip verification.

## Verify the installation

Report each stage separately:

1. **Configuration written:** the installer exits successfully and reports `CONFIG_WRITTEN`, `LIVE_CONFIG_WRITTEN`, or an already-configured result. This alone does not prove WorkBuddy loaded the plugin.
2. **Host loaded:** check that the `opengui` Skill and MCP server are enabled. If either is off, use the host's supported enable action or available UI control within the user's installation request, then verify the new state. If both are already enabled, or you enable them successfully, continue without asking the user to visit settings. Only when a required switch cannot be enabled by the assistant, show the relevant screenshot and directions from [manual enablement help](#manual-enablement-help). An enabled Skill or “14/14 tools enabled” label does not prove the MCP server's master switch is on. Complete normal trust prompts and review external Hook changes in `/hooks` if requested. A new chat may be needed to refresh discovery. If the configuration is present but the MCP manager still does not list OpenGUI, finish other work and quit/reopen WorkBuddy once, then recheck the native manager. This was needed in the 5.7.6 retest; do not reinstall or toggle an already-enabled server merely to refresh discovery.
3. **Device discovery:** discover and call the loaded `opengui_list_devices` MCP tool directly; WorkBuddy may expose its full name as `mcp__opengui__opengui_list_devices`. Read its actual result. Avoid invoking the phone-control Skill merely for an installation check. An empty list means installation may be valid but no authorized device is connected; explain phone-side setup instead of declaring a device test passed.
4. **First task:** after the user connects and authorizes a phone, try `@opengui Open Settings, then return to the home screen. Stop after confirming the home screen is visible.` Verify the right-hand preview and the actual result. Do not launch a phone task merely to complete installation unless the user requested it.

Keep trust, device authorization, and any account/model prompts visible to the user. Do not claim automatic phone authorization or complete business acceptance from an installer success message.

## State-directory permission error

If tools are discoverable but a call returns `WorkBuddy state directory must be private, owned by this user, and not a symlink`, check OpenGUI's state directory, normally `~/.workbuddy/opengui`. This is separate from a host file-policy refusal. The runtime requires an owner-only directory and rejects symlinks or a different owner.

The pinned installer above now tightens an existing OpenGUI state directory to mode `0700` after checking ownership and redirected paths. Earlier installers used `umask 077` for new directories but did not repair an already-existing `0755` cache directory. The fix does not change `~/.workbuddy` permissions, weaken runtime checks, or recursively change dependency permissions. Follow the normal active-broker upgrade precautions before rerunning an installer; do not force an upgrade merely to repair permissions. An authorized local maintainer can inspect and tighten this one directory, then retry the read-only call without reinstalling. Never apply a blind recursive chmod or chmod a symlink target.

## Manual enablement help

This is a conditional fallback, not a checklist every user must perform. Installation output that mentions enablement is a reminder to verify state; do not forward it as an unconditional manual task. Do not edit undocumented host trust/permission storage to simulate enablement.

When the host offers no usable enable action, or reserves the action for the user:

- Identify the specific unresolved switch: **Skill** or **MCP server**. A tool discovery failure alone does not prove either switch is off. If state is unknown, say it is unverified and ask the user to check, turning it on only if it is off.
- Open the relevant native page if your available tools support navigation. Give the exact path and **embed the relevant screenshot in the conversation**, not just a link to documentation. The ready-to-use messages below use public image URLs that work without a repository checkout.
- Show only the unresolved step. If both switches are verified on but tools remain unavailable, investigate connection/discovery errors instead of asking the user to toggle them again.
- After the user confirms the change, recheck discovery and call `opengui_list_devices`. Do not report success solely from the user's confirmation.

### Skill switch fallback

Use only if the Skill still needs manual enablement. Screenshot: WorkBuddy 5.7.6, Chinese UI, **already enabled** example. The switch is at the top-right of the `opengui` card. Clear the installed-skills search field if the card shows an installed checkmark instead of its switch.

```markdown
还需要在 WorkBuddy 中启用 OpenGUI 技能，我当前无法代你打开这个开关。请进入「专家·技能·连接器 → 技能 → 已安装」，找到 opengui，把卡片右上角的开关打开。下图绿色是已开启状态；如果你这里已经是绿色，请保持不变。完成后告诉我，我会继续验证。

![OpenGUI 技能开关：位于 opengui 卡片右上角，绿色表示已启用](https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/docs/images/workbuddy-skill-enabled.jpg)
```

### MCP server switch fallback

Use only if the MCP server still needs manual enablement. The Skill switch is separate. In the screenshot, the `opengui` row's far-right switch is on and the status dot beside its name is green.

```markdown
还需要在 WorkBuddy 中启用 OpenGUI 的 MCP 连接器，我当前无法代你打开这个开关。请进入「专家·技能·连接器 → 连接器」，点击右上角「自定义连接器」。

![连接器入口：点击右上角的自定义连接器](https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/docs/images/workbuddy-connectors-entry.jpg)

在「MCP 服务管理」中，把 opengui 行最右侧的开关打开，等待名称旁的状态点变绿。下图展示已开启状态；如果已经开启，请保持不变。完成后告诉我，我会继续验证工具调用。

![OpenGUI MCP 总开关：位于 opengui 行最右侧，图中开关和连接状态均为绿色](https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/docs/images/workbuddy-mcp-enabled.jpg)
```

Adapt the message to the user's language and the observed blocker; do not claim the switch is off when you could not inspect it. If inline images cannot render, provide the [illustrated guide](https://github.com/Core-Mate/OpenGUI/blob/main/workbuddy-plugin/docs/enable-opengui.md) and the same exact navigation path. These are reference screenshots, not proof of the user's current state. See the [illustrated guide](docs/enable-opengui.md) for both switches.

## Development builds

Maintainers may deliberately install a locally built archive using `scripts/install-macos.command --archive /absolute/path/opengui-mcp-0.3.1.tgz`; its adjacent `.sha256` is required. This is a separate test from installing the public GitHub release. Record the archive digest because local candidates currently share the `0.3.1` version label with the published release. Never overwrite immutable release assets to make these packages appear identical.

Current development behavior and data flow: [English](README.md) · [简体中文](README.zh-CN.md).

### Rebuilding the installer ZIP

Maintainers can run `python3 workbuddy-plugin/scripts/test-installer-handoff.py` from the repository root; it runs isolated launcher tests and builds the ZIP with executable permissions. To build alone, use `python3 workbuddy-plugin/scripts/build-installer-handoff.py`. Outputs are in `workbuddy-plugin/dist/` with an adjacent SHA-256 file. The builder refuses a changed installer payload until its pinned digest is deliberately reviewed and updated.

Publish the ZIP and checksum under a new installer-only prerelease tag, such as `opengui-workbuddy-installer-v1.0.0`, without marking it latest. Keep its version distinct from the plugin runtime, attach both files, and verify the downloaded asset against this guide. Never overwrite an existing release asset or the plugin's original 0.3.1 assets. When changing the launcher or payload, bump the installer version and update the download URL and digest together. Record real Terminal and WorkBuddy acceptance separately from automated fixture tests; see the [verification record](docs/install-prompt-verification.zh-CN.md).
