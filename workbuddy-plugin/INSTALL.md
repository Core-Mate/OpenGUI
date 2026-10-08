# Install OpenGUI into WorkBuddy

Use this guide when a user asks WorkBuddy to install `https://github.com/Core-Mate/OpenGUI`. The target is the WorkBuddy connector: MCP + `opengui` Skill + lifecycle Hooks. Do not select the DSH installer or deploy `server/` and `client/` for this request.

## Requirements

- macOS on Apple Silicon or Intel, with WorkBuddy installed. Version 5.5.6+ supports live configuration; the installer checks compatibility and reports any restart requirement.
- Network access to GitHub release assets and the runtime downloads used by the installer.
- No phone is needed to install. USB debugging authorization is needed later to operate an Android phone.

## Recommended installation

Download the two standalone files from the immutable **WorkBuddy 0.4.0 public-testing release**. The launcher, installer payload, connector, and plugin runtime all use version **0.4.0**, including the task home, account/model selection, takeover controls, and report export. No ZIP download or extraction is required during preparation. The installer later downloads and unpacks its verified runtime and plugin dependencies in the user's Terminal.

The old standalone installer attached to plugin 0.3.1 checks only `codebuddy.js` and can fail with `HOST_HOOKS` on newer WorkBuddy layouts. The pinned payload below includes the compatibility fix. Do not use GitHub's generic `/releases/latest`, substitute a development package, or execute the launcher inside WorkBuddy.

### Prepare the files

An installation request covers ordinary downloads, verification, and preparation within the host's normal permissions. Use a new directory in the current workspace. Keep both files together; `OpenGUI-Install.command` verifies and invokes its adjacent `installer.sh`. Explain the scope briefly: private runtime, MCP, Skill, seven lifecycle Hooks, configuration backups, and no phone operation.

Show this checklist and update it from actual results:

1. Download the two files from the fixed URLs below.
2. Verify both SHA-256 values. Stop on any failure.
3. Set the verified launcher's executable permission and confirm both files are present together.
4. Open the directory through the host's supported Open folder / Show in Finder action and display the exact handoff link below.
5. Wait for the user to run the installer and reply “已安装完成”; then verify this attempt's receipt and host loading.

The following block downloads and verifies the files, then requests Finder to open their directory. It does not execute either script or write plugin configuration. Run it from the intended workspace; retain its actual directory path for the chat link. If a host permission is required, use its normal authorization flow. Do not change host security settings or retry through a different tool to evade a refusal.

```bash
(
  set -euo pipefail
  umask 077
  handoff_dir=$(mktemp -d "$PWD/OpenGUI-installer.XXXXXXXX")
  source_url='https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v0.4.0'
  cd "$handoff_dir"
  fetch() {
    curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location \
      --connect-timeout 15 --max-time 240 --retry 2 "$1" -o "$2"
  }
  fetch "$source_url/OpenGUI-Install.command" OpenGUI-Install.command
  fetch "$source_url/installer.sh" installer.sh
  printf '%s  %s\n' \
    '56727163435285a72f7471ba7127b05e6545587f50d7c5dad873511baa5f52e0' OpenGUI-Install.command \
    'cd54d28c78666f3fe31869b979e480c95450da74096c6b54d20fe433e43aba14' installer.sh \
    | shasum -a 256 -c -
  chmod 700 OpenGUI-Install.command
  test -x OpenGUI-Install.command && test -f installer.sh
  printf 'INSTALLER_FILES_READY: %s/\n' "$handoff_dir"
  if open -a Finder "$handoff_dir"; then
    printf 'FOLDER_OPEN_REQUESTED: %s/\n' "$handoff_dir"
  else
    printf 'FOLDER_OPEN_FAILED: Files are ready; use the directory link or Finder Go to Folder.\n' >&2
  fi
)
```

If the host provides a native directory action instead of the `open` command, use that action on the same verified directory. Do not run the launcher, open it with Terminal automatically, fabricate a TTY, or feed Return to the installer. The user's Finder double-click and Terminal confirmation remain manual.

### Handoff message

Replace `ABSOLUTE_INSTALLER_FOLDER` with the actual directory reported above, retaining the trailing slash and angle brackets for paths with spaces. Send the following as rendered Markdown in chat, not a code block. Always include the hyperlink even if the directory was already opened. The successful handoff final response must contain only these two paragraphs. The second paragraph is the end of the reply and of this turn:

```markdown
[打开安装脚本目录，双击OpenGUI-Install.command进行安装](<ABSOLUTE_INSTALLER_FOLDER/>)

安装完成后请回复 **“已安装完成”**
```

Do not call `present_files`, `open_result_view`, attachment delivery, or any artifact-registration/display tool for the installer scripts, their directory, logs, or verification output. Do not attach or link the individual scripts as chat deliverables, create a README/audit report to present, or add a generated-artifact summary. Downloaded installation inputs are not user-facing output artifacts. Use only the directory hyperlink above for this handoff.

After the completion prompt, stop: no extra text, blockquotes, file cards, tool calls, checklists, or explanations about TTY, `exit 73`, `CODEBUDDY_BROKER_DENY`, permission design, or why the assistant did not execute the installer. Keep routine implementation details out of the successful reply. If preparation actually fails, report the concrete blocker instead of using the successful handoff. If folder-opening help is needed, give it before the final two paragraphs so the completion prompt remains last. Wait for the user's next message before verification or installation-success guidance. These instructions govern assistant output; they cannot remove file cards a host independently injects or already displayed in an earlier turn.

The link targets the **folder containing the scripts**. It does not run the launcher. WorkBuddy controls local-link handling and may open a preview; Markdown alone cannot guarantee Finder dispatch. Only if opening is unavailable, fails, or enters a preview, add its supported Open folder action or Finder's `Command-Shift-G` steps with the actual path. Do not invent executable links or claim the folder opened without evidence. Do not generate an audit report or README attachment for this handoff.

Report “Installer files ready; waiting for manual execution” until the user runs the launcher. In Terminal, Return starts installation; `q` followed by Return cancels. If macOS blocks opening, use the normal system prompt without removing quarantine attributes or disabling Gatekeeper.

After the user replies “已安装完成”, read the **current attempt's** `installation-result.*/result.txt` and `install.log` when accessible, then follow the verification steps below. A reply alone, missing receipt, `status=running`, cancellation, or a stale earlier success is not installation success. `status=configuration_written` confirms only configuration writing; `hostLoaded=unverified` still requires native MCP verification. Report the actual error on failure; do not infer rollback without evidence.

WorkBuddy's tested default permissions have refused direct configuration writes. Preparing these files leaves installation to the user's own Terminal and does not weaken host permissions. If download, chmod, or directory opening is denied, report that specific operation and use the normal authorization flow; do not mark the blocked step complete.

Before upgrading, finish existing phone tasks, close their viewers, and follow the launcher's request to quit WorkBuddy. Allow the old broker to exit normally. Do not force-kill host or phone processes or remove runtime locks. The underlying installer retains compatibility, ownership, checksum, and active-broker checks.

## Verify the installation

Report each stage separately:

1. **Configuration written:** the installer exits successfully and reports `CONFIG_WRITTEN`, `LIVE_CONFIG_WRITTEN`, or an already-configured result. This alone does not prove WorkBuddy loaded the plugin.
2. **Host loaded:** check that the `opengui` Skill and MCP server are enabled. If either is off, use the host's supported enable action or available UI control within the user's installation request, then verify the new state. If both are already enabled, or you enable them successfully, continue without asking the user to visit settings. Only when a required switch cannot be enabled by the assistant, show the relevant screenshot and directions from [manual enablement help](#manual-enablement-help). An enabled Skill or “14/14 tools enabled” label does not prove the MCP server's master switch is on. Complete normal trust prompts and review external Hook changes in `/hooks` if requested. A new chat may be needed to refresh discovery. If the configuration is present but the MCP manager still does not list OpenGUI, finish other work and quit/reopen WorkBuddy once, then recheck the native manager. This was needed in the 5.7.6 retest; do not reinstall or toggle an already-enabled server merely to refresh discovery.
3. **Device discovery:** discover and call the loaded `opengui_list_devices` MCP tool directly; WorkBuddy may expose its full name as `mcp__opengui__opengui_list_devices`. Read its actual result. Avoid invoking the phone-control Skill merely for an installation check. An empty list means installation may be valid but no authorized device is connected; explain phone-side setup instead of declaring a device test passed.
4. **First task:** after the user connects and authorizes a phone, try `@opengui Open Settings, then return to the home screen. Stop after confirming the home screen is visible.` Verify the right-hand preview and the actual result. Do not launch a phone task merely to complete installation unless the user requested it.

Keep trust, device authorization, and any account/model prompts visible to the user. Do not claim automatic phone authorization or complete business acceptance from an installer success message.

## Installation success message

Only after the current installation receipt and a native MCP discovery call verify success, finish the chat with the following message and both clickable links. An empty device list does not block this setup guidance. If verification fails, report the blocker instead of claiming success.

把 Android 手机打开 USB 调试，连上电脑并在手机上允许 USB 调试授权。在 WorkBuddy 输入 `/opengui`，再输入需要给手机的执行指令，即可控制手机执行。

[试一试：用小红书发帖](workbuddy://task?action=start&prompt=%E5%B8%AE%E6%88%91%E6%B5%8B%E8%AF%95%E3%80%90%E5%BA%94%E7%94%A8%EF%BC%8F%E9%A1%B5%E9%9D%A2%E3%80%91%E7%9A%84%E3%80%90%E5%8A%9F%E8%83%BD%E6%88%96%E6%93%8D%E4%BD%9C%E6%B5%81%E7%A8%8B%E3%80%91%EF%BC%8C%E9%87%8D%E7%82%B9%E6%A3%80%E6%9F%A5%E3%80%90%E5%85%B3%E6%B3%A8%E7%9A%84%E9%97%AE%E9%A2%98%E3%80%91%E3%80%82%E5%A6%82%E6%9E%9C%E5%8F%91%E7%8E%B0%E5%BC%82%E5%B8%B8%EF%BC%8C%E8%AE%B0%E5%BD%95%E6%93%8D%E4%BD%9C%E6%AD%A5%E9%AA%A4%E5%92%8C%E6%88%AA%E5%9B%BE%EF%BC%8C%E5%BD%93%E5%81%9A%E5%88%B0%E3%80%90%E7%BB%93%E6%9D%9F%E6%9D%A1%E4%BB%B6%E3%80%91%E5%B0%B1%E5%81%9C%E3%80%82)

[试一试：Vibe Testing](workbuddy://task?action=start&prompt=%2Fopengui%20%E5%B8%AE%E6%88%91%E6%B5%8B%E8%AF%95%E3%80%90%E5%BA%94%E7%94%A8%EF%BC%8F%E9%A1%B5%E9%9D%A2%E3%80%91%E7%9A%84%E3%80%90%E5%8A%9F%E8%83%BD%E6%88%96%E6%93%8D%E4%BD%9C%E6%B5%81%E7%A8%8B%E3%80%91%EF%BC%8C%E9%87%8D%E7%82%B9%E6%A3%80%E6%9F%A5%E3%80%90%E5%85%B3%E6%B3%A8%E7%9A%84%E9%97%AE%E9%A2%98%E3%80%91%E3%80%82%E5%A6%82%E6%9E%9C%E5%8F%91%E7%8E%B0%E5%BC%82%E5%B8%B8%EF%BC%8C%E8%AE%B0%E5%BD%95%E6%93%8D%E4%BD%9C%E6%AD%A5%E9%AA%A4%E5%92%8C%E6%88%AA%E5%9B%BE%EF%BC%8C%E5%BD%93%E5%81%9A%E5%88%B0%E3%80%90%E7%BB%93%E6%9D%9F%E6%9D%A1%E4%BB%B6%E3%80%91%E5%B0%B1%E5%81%9C%E3%80%82)

These are WorkBuddy task draft links: they open a new task input with the URL-encoded prompt, without sending it. Preserve the supplied labels and prompt text exactly, including the first label's test template. Do not add auto-send, skills, permission-mode or execution parameters. The user edits the placeholders and sends the request; normal model/device confirmation still applies. If a host version cannot open the native link, show its decoded prompt for copying and report that automatic filling is unavailable.

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

Maintainers may deliberately install a locally built archive using `scripts/install-macos.command --archive /absolute/path/opengui-mcp-0.4.0.tgz`; its adjacent `.sha256` is required. This is a separate test from installing the public GitHub release. Record the archive digest; never identify a local candidate solely by its version label. Never overwrite immutable release assets to make these packages appear identical.

Current development behavior and data flow: [English](README.md) · [简体中文](README.zh-CN.md).

### Release artifacts

Run `npm run pack:release` to build and validate the runtime, connector, standalone payload, and `OpenGUI-Install.command`, with an adjacent SHA-256 file for each. `scripts/publish.mjs` publishes all ten assets under the same plugin version tag and refuses to replace existing bytes. `python3 scripts/test-installer-handoff.py` checks confirmation, cancellation, integrity failures, progress, and receipts without installing into the real host.

The optional `python3 scripts/build-installer-handoff.py` ZIP is a manual distribution fallback. The documented WorkBuddy flow downloads the two standalone files and never extracts this ZIP. Bump the plugin version, installer version string, launcher payload pin, manifest versions, and documentation download URLs/checksums together. Stable publication still requires the real-device gates in `release-readiness.json`; public-testing releases preserve the remaining acceptance gaps.
