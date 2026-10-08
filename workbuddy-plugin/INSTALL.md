# Install OpenGUI into WorkBuddy

This guide installs the published OpenGUI 0.4.0 WorkBuddy connector on macOS. It uses the [official public-testing release](https://github.com/Core-Mate/OpenGUI/releases/tag/opengui-workbuddy-v0.4.0); no source checkout, system Node installation, full backend deployment, or DSH installation is needed.

## Download and run the installer

The complete download, authorization and first-task instructions are in the [root README](../README.md#use-opengui-in-workbuddy) ([中文](../README.zh-CN.md#workbuddy-安装)). Open macOS Terminal and run this command to download and execute the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/install.sh | bash
```

Alternatively, [download install.sh](https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/install.sh) and run `bash /actual/path/install.sh`. Installation runs on the Mac; WorkBuddy is used afterward for authorization and connection verification.

The repository entry and its pinned installer/authorization guide are published together. The 0.4.0 public-testing assets were replaced with the refreshed installer, authorization guide and host-only execution runtime. Use the current downloads and their adjacent SHA-256 files. The [manual installation guide](resources/OpenGUI-安装指南.html) remains available as an alternative.

The entry downloads the installer and a self-contained [authorization guide](resources/OpenGUI-授权指南.html), verifies their SHA-256 pins, and runs installation without a Terminal confirmation or Finder step. After successful configuration it opens the guide in the default browser and prints `AUTHORIZATION_GUIDE` and `INSTALLATION_RESULT` paths. WorkBuddy can display that same HTML if browser opening is unavailable. Browser failure does not mean installation failed; do not reinstall just to reopen the instructions.

The user completes both Skill and connector authorization, then starts or opens a WorkBuddy chat to request connection verification. The assistant checks this attempt's receipt and makes a native read-only MCP call. Do not approve trust on the user's behalf or bypass WorkBuddy's normal security review.

## What installation changes

Installation downloads a private Node runtime and the published OpenGUI package, adds the `opengui` MCP server and Skill, and registers seven lifecycle Hooks: `UserPromptSubmit`, `PreToolUse`, `Stop`, `SubagentStop`, `FinalStop`, `SessionEnd`, and `StopFailure`. These local commands bind tasks and handle stopping and cleanup; review them in `/hooks` when prompted. Affected settings are backed up and unrelated plugins are retained.

No phone is required during installation. Later Android use requires USB debugging authorization. SMS login uses the official CoreMate account service; tasks and screenshots are handled by the current WorkBuddy model. No online model catalog is read. Local preview video is not sent frame by frame.

## Requirements

- macOS on Apple Silicon or Intel, with WorkBuddy 5.5.3 or newer installed.
- Network access to GitHub and runtime downloads.
- WorkBuddy may stay open. If an active old OpenGUI service blocks an upgrade, finish its tasks, close its viewers, disable the old MCP and wait for it to exit before retrying.

The script entry stores each attempt's log, receipt and guide in `~/.workbuddy/opengui/installations/install.*`. Only `status=configuration_written` establishes that configuration was written; host loading remains unverified. `--check` performs the core preflight, with bootstrap downloads and its own receipt, but does not install or open authorization instructions. The core installer's direct `--check` remains read-only.

## Manual alternative

The existing [OpenGUI installation guide](resources/OpenGUI-安装指南.html) retains the ZIP download and manual launcher. Use it when the user explicitly prefers a manual installation. Its embedded archive is built ahead of time; do not generate another guide during installation. The manual launcher's receipt is in its `installation-result.*` directory.

## Verify the installation

Installation has three distinct results:

1. **Configuration written:** this attempt's returned `INSTALLATION_RESULT` file (or the manual launcher's `installation-result.*/result.txt`) reports `status=configuration_written`, and its `install.log` contains the corresponding successful configuration result. `status=running`, a failed receipt, or an older receipt does not establish completion.
2. **Host loaded:** OpenGUI appears in MCP management and its trust/enablement is complete. Skill authorization and MCP trust are separate. Hook changes may require review in `/hooks`.
3. **Read-only tool call:** a native `opengui_list_devices` call succeeds. WorkBuddy may expose it as `mcp__opengui__opengui_list_devices`. An empty device list can still confirm that the plugin is loaded; connecting a phone is a later step.

The connection-check request starts verification; it is not proof that the host loaded the plugin. The installer itself records `hostLoaded=unverified`. A phone-control task is not needed for installation verification.

## MCP enablement reminder

If Skill or connector authorization remains incomplete, reopen the authorization guide:

打开 WorkBuddy 的“专家·技能·连接器 → 技能”，找到 OpenGUI，按提示完成授权；之后在连接器中，找到OpenGUI，再次授权。

**注意：技能 和 连接器，都需要授权哦！**

[查看原始授权动图与说明](resources/OpenGUI-授权指南.html)。已经启用、状态为绿色的连接器保持不变。

## MCP missing after installation

The published 0.4.0 installer can write configuration while newer WorkBuddy versions are running, but that does not establish live reload. In a WorkBuddy 5.7.6 retest, normal Command-Q and reopening made a missing OpenGUI row appear. Keep WorkBuddy open during installation. Only if OpenGUI is missing or the new configuration has not taken effect afterward, finish other tasks and use Command-Q to quit and reopen WorkBuddy; then continue Skill authorization and MCP trust. Do not treat every connection error as a reason to restart; inspect the actual error when configuration is already loaded.

If the row appears with a first-use trust prompt, the remaining step is the native **Trust** action. `disabled: false` in `mcp.json` does not grant trust. If a current conversation still lacks the tools after the server connects, a new conversation may refresh its tool list. The receipt and actual native tool-call result distinguish configuration, discovery, and connection failures.

## Installation success message

After receipt and native tool-call verification, Android setup and task examples are:

把 Android 手机打开 USB 调试，连上电脑并在手机上允许 USB 调试授权。在 WorkBuddy 输入 `/opengui`，再输入需要给手机的执行指令，即可控制手机执行。

[试一试：用小红书发帖](workbuddy://task?action=start&prompt=%E5%B8%AE%E6%88%91%E6%B5%8B%E8%AF%95%E3%80%90%E5%BA%94%E7%94%A8%EF%BC%8F%E9%A1%B5%E9%9D%A2%E3%80%91%E7%9A%84%E3%80%90%E5%8A%9F%E8%83%BD%E6%88%96%E6%93%8D%E4%BD%9C%E6%B5%81%E7%A8%8B%E3%80%91%EF%BC%8C%E9%87%8D%E7%82%B9%E6%A3%80%E6%9F%A5%E3%80%90%E5%85%B3%E6%B3%A8%E7%9A%84%E9%97%AE%E9%A2%98%E3%80%91%E3%80%82%E5%A6%82%E6%9E%9C%E5%8F%91%E7%8E%B0%E5%BC%82%E5%B8%B8%EF%BC%8C%E8%AE%B0%E5%BD%95%E6%93%8D%E4%BD%9C%E6%AD%A5%E9%AA%A4%E5%92%8C%E6%88%AA%E5%9B%BE%EF%BC%8C%E5%BD%93%E5%81%9A%E5%88%B0%E3%80%90%E7%BB%93%E6%9D%9F%E6%9D%A1%E4%BB%B6%E3%80%91%E5%B0%B1%E5%81%9C%E3%80%82)

[试一试：Vibe Testing](workbuddy://task?action=start&prompt=%2Fopengui%20%E5%B8%AE%E6%88%91%E6%B5%8B%E8%AF%95%E3%80%90%E5%BA%94%E7%94%A8%EF%BC%8F%E9%A1%B5%E9%9D%A2%E3%80%91%E7%9A%84%E3%80%90%E5%8A%9F%E8%83%BD%E6%88%96%E6%93%8D%E4%BD%9C%E6%B5%81%E7%A8%8B%E3%80%91%EF%BC%8C%E9%87%8D%E7%82%B9%E6%A3%80%E6%9F%A5%E3%80%90%E5%85%B3%E6%B3%A8%E7%9A%84%E9%97%AE%E9%A2%98%E3%80%91%E3%80%82%E5%A6%82%E6%9E%9C%E5%8F%91%E7%8E%B0%E5%BC%82%E5%B8%B8%EF%BC%8C%E8%AE%B0%E5%BD%95%E6%93%8D%E4%BD%9C%E6%AD%A5%E9%AA%A4%E5%92%8C%E6%88%AA%E5%9B%BE%EF%BC%8C%E5%BD%93%E5%81%9A%E5%88%B0%E3%80%90%E7%BB%93%E6%9D%9F%E6%9D%A1%E4%BB%B6%E3%80%91%E5%B0%B1%E5%81%9C%E3%80%82)

These links open task drafts without sending them. Edit the placeholders before submitting. Device and model confirmation still apply.

## State-directory permission error

`WorkBuddy state directory must be private, owned by this user, and not a symlink` refers to OpenGUI's state directory, normally `~/.workbuddy/opengui`. The published installer checks ownership and redirected paths before setting this directory to mode `0700`. It does not change permissions on the WorkBuddy root directory. This error is separate from a host permission refusal; its actual cause should be checked before retrying installation.

## npm reports `EPERM: operation not permitted, uv_cwd`

This error occurs when npm cannot read the Terminal process's current directory. `npm --prefix` does not change that working directory. The current installer runs npm from its own verified private package directory, including when the launch directory is inaccessible or has been deleted. Download the current script and retry; for an older installer, first run `cd "$HOME"` in Terminal.
