# Install OpenGUI into WorkBuddy

This guide installs the published OpenGUI 0.4.2 WorkBuddy connector on macOS. It uses the [official public-testing release](https://github.com/Core-Mate/OpenGUI/releases/tag/opengui-workbuddy-v0.4.2); no source checkout, system Node installation, full backend deployment, or DSH installation is needed.

> [!IMPORTANT]
> **Restart WorkBuddy once after installation.** Finish other tasks, **fully quit with ⌘Q**, then reopen WorkBuddy before authorizing the Skill and connector. Closing its window is not enough.

For copyable WorkBuddy chat prompts and the full Chinese flow, see [install from GitHub](docs/install-from-github.zh-CN.md). China and international WorkBuddy use the same OpenGUI 0.4.2 package and version.

## Download and run the installer

The complete download, authorization and first-task instructions are in the [root README](../README.md#use-opengui-in-workbuddy) ([中文](../README.zh-CN.md#workbuddy-安装)). Open macOS Terminal and select the target application explicitly.

**China edition — WorkBuddy.app:**

```sh
cd "$HOME" && curl -fsSL https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v0.4.2/install.sh | bash -s -- --app "/Applications/WorkBuddy.app" --download-source cn
```

**International edition — WorkBuddy AI.app:**

```sh
cd "$HOME" && curl -fsSL https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v0.4.2/install.sh | bash -s -- --app "/Applications/WorkBuddy AI.app" --download-source official
```

Install separately if you use both editions. Replace the application path if it has been moved or renamed. Alternatively, [download install.sh](https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v0.4.2/install.sh) and run `bash /actual/path/install.sh` with the same `--app` and `--download-source` arguments. Restart the selected WorkBuddy once afterward, then authorize OpenGUI and verify the connection.

The entry, installer and authorization guide are immutable assets of the 0.4.2 release, so the reviewed command and the files users run stay identical. They install the public-testing 0.4.2 runtime with adjacent SHA-256 sidecars; earlier releases remain unchanged. The [manual installation guide](resources/OpenGUI-安装指南.html) remains available as an alternative.

The entry downloads the installer and a self-contained [authorization guide](resources/OpenGUI-授权指南.html), verifies their SHA-256 pins, and runs installation without a Terminal confirmation or Finder step. After successful configuration it opens the guide in the default browser and prints `AUTHORIZATION_GUIDE` and `INSTALLATION_RESULT` paths. WorkBuddy can display that same HTML if browser opening is unavailable. Browser failure does not mean installation failed; do not reinstall just to reopen the instructions.

The user completes both Skill and connector authorization, then starts or opens a WorkBuddy chat to request connection verification. The assistant checks this attempt's receipt and makes a native read-only MCP call. Do not approve trust on the user's behalf or bypass WorkBuddy's normal security review.

## Download sources

Node.js and npm dependencies default to [npmmirror](https://npmmirror.com/): `https://npmmirror.com/mirrors/node` and `https://registry.npmmirror.com`. If a Node mirror request fails or npm installation fails, the installer retries the official source. Node archives retain the pinned SHA-256 checks; a checksum mismatch stops installation. Registry selection is passed to the private npm process and does not change global npm settings.

Choose official Node.js and npm sources for one installation:

```sh
bash /actual/path/install.sh --download-source official
```

For the streamed entry, use `curl -fsSL https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v0.4.2/install.sh | bash -s -- --download-source official`. `--download-source cn` selects the default explicitly. `OPENGUI_DOWNLOAD_SOURCE=cn|official` also sets the default; command-line arguments take priority.

The roughly 13 MB video component is a scrcpy release archive hosted on GitHub. It is separate from Node.js and npm; changing the npm registry does not accelerate it. GitHub bootstrap files and OpenGUI release packages also retain their official URLs.

If you have a video archive mirror, pass `--video-mirror https://your-mirror.example/scrcpy/v4.1` or set `OPENGUI_VIDEO_MIRROR` to that directory. It must contain the original release filenames, such as `scrcpy-macos-aarch64-v4.1.tar.gz`. The mirror attempt is limited to 60 seconds; failed requests, size mismatches and checksum mismatches fall back to the official archive. Original sizes and SHA-256 pins are always verified before extraction. Cancellation stops installation instead of starting a fallback download. Video mirrors require a package built with this feature; older packages report `VIDEO_MIRROR_UNSUPPORTED` rather than ignoring the option. Cached resources are reused regardless of the selected source.

## What installation changes

Installation downloads a private Node runtime and the published OpenGUI package, adds the `opengui` MCP server and Skill, and registers seven lifecycle Hooks: `UserPromptSubmit`, `PreToolUse`, `Stop`, `SubagentStop`, `FinalStop`, `SessionEnd`, and `StopFailure`. These local commands bind tasks and handle stopping and cleanup; review them in `/hooks` when prompted. Affected settings are backed up and unrelated plugins are retained.

No phone is required during installation. Later Android use requires USB debugging authorization. The official CoreMate account service handles SMS sign-in and automatic registration, currently requiring a mainland-China phone number. Execution follows the current WorkBuddy conversation model. Task screenshots go through WorkBuddy’s model/tool loop; local preview video is not sent frame by frame.

## Requirements

- macOS on Apple Silicon or Intel, with WorkBuddy 5.5.3 or newer installed.
- Network access to GitHub and runtime downloads.
- WorkBuddy may stay open during installation, but must be fully quit and reopened once afterward. If an active old OpenGUI service blocks an upgrade, finish its tasks, close its viewers, disable the old MCP and wait for it to exit before retrying.

The script entry stores each attempt's log, receipt and guide in `~/.workbuddy/opengui/installations/install.*`. Only `status=configuration_written` establishes that configuration was written; host loading remains unverified. `--check` performs the core preflight, with bootstrap downloads and its own receipt, but does not install or open authorization instructions. The core installer's direct `--check` remains read-only.

Automatic discovery recognizes `com.workbuddy.workbuddy`, `com.workbuddy.workbuddy-ai`, and legacy `com.tencent.workbuddy.*` bundles. WorkBuddy (including legacy bundles) takes priority over WorkBuddy AI. If multiple bundles remain at the preferred priority, choose one with `--app /absolute/path/WorkBuddy.app`. Use `--app` to select WorkBuddy AI explicitly even when WorkBuddy is installed. The installer reads the selected application's product metadata to resolve its configuration directory and prints the selected application and directory during preflight.

## International WorkBuddy

Custom MCP installation does not require a marketplace listing. Select **WorkBuddy AI.app** with `--app` and use `--download-source official`, as shown above. The OpenGUI 0.4.2 installer supports `--app`.

The installer reads the selected application’s product metadata. Current international builds use `~/.workbuddy-ai` for MCP, Skill and Hook configuration; China builds use their own configuration root, normally `~/.workbuddy`. OpenGUI keeps shared private runtime/account/device state under `~/.workbuddy/opengui`, with separate installation receipts for each configuration root. Do not operate the same phone through both hosts concurrently.

OpenGUI’s SMS account is separate from WorkBuddy’s Google/GitHub account. OpenGUI currently requires a mainland-China phone number. The workbench UI supports Chinese/English and follows WorkBuddy’s display language by default.

In international WorkBuddy AI, authorize and enable OpenGUI under **Experts · Skills · Connectors → Skills**. Then open **Connectors → Custom connectors**, find `opengui`, click **Trust**, and enable it. The user completes both authorizations. An update may trigger another Trust prompt when the runtime path changes. The [official MCP guide](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide) also covers custom servers.

See [install from GitHub](docs/install-from-github.zh-CN.md) for chat installation, read-only verification and installing an explicitly selected local archive.

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

- 国内版：在“专家·技能·连接器 → 技能”中授权 OpenGUI；再到“连接器 → 自定义连接器”，为 `opengui` 完成信任并开启开关。
- International edition: authorize OpenGUI under **Experts · Skills · Connectors → Skills**, then click **Trust** for `opengui` under **Connectors → Custom connectors** and enable it.

**注意：技能 和 连接器，都需要授权哦！**

[查看原始授权动图与说明](resources/OpenGUI-授权指南.html)。已经启用、状态为绿色的连接器保持不变。

## MCP missing after installation

The published 0.4.2 installer can write configuration while newer WorkBuddy versions are running, but that does not establish live reload. A local WorkBuddy 5.7.6 comparison found that neither external in-place writing nor atomic replacement updated the custom MCP list. Saving the same configuration through WorkBuddy's built-in MCP editor updated the list without restarting. See the [local verification record](docs/mcp-config-reload-verification.zh-CN.md).

The standard installation flow requires one restart: finish other tasks, fully quit WorkBuddy with Command-Q, reopen it, then continue Skill authorization and MCP trust. If OpenGUI is still missing after that, open **Experts · Skills · Connectors → Connectors → Custom connectors → Add MCP** and check for the `opengui` entry in the expected configuration file. If it is absent, inspect the installer receipt and configuration path. The built-in editor's **Save** action is a verified manual refresh option; it is not the default onboarding step. If configuration is already loaded but a connection fails, inspect the actual error before restarting again.

If the row appears with a first-use trust prompt, the remaining step is the native **Trust** action. `disabled: false` in `mcp.json` does not grant trust. If a current conversation still lacks the tools after the server connects, a new conversation may refresh its tool list. The receipt and actual native tool-call result distinguish configuration, discovery, and connection failures.

## Installation success message

After receipt and native tool-call verification, Android setup and task examples are:

Android 手机开启 USB 调试、连接电脑并允许调试授权，也可使用工作台中的本地 Android 模拟器。在 WorkBuddy 输入 `/opengui`，打开右侧任务首页并登录 OpenGUI，填写目标、确认设备，点击“开始执行”。执行模型跟随当前 WorkBuddy 对话。

[试一试：用小红书发帖](workbuddy://task?action=start&prompt=%E5%B8%AE%E6%88%91%E6%B5%8B%E8%AF%95%E3%80%90%E5%BA%94%E7%94%A8%EF%BC%8F%E9%A1%B5%E9%9D%A2%E3%80%91%E7%9A%84%E3%80%90%E5%8A%9F%E8%83%BD%E6%88%96%E6%93%8D%E4%BD%9C%E6%B5%81%E7%A8%8B%E3%80%91%EF%BC%8C%E9%87%8D%E7%82%B9%E6%A3%80%E6%9F%A5%E3%80%90%E5%85%B3%E6%B3%A8%E7%9A%84%E9%97%AE%E9%A2%98%E3%80%91%E3%80%82%E5%A6%82%E6%9E%9C%E5%8F%91%E7%8E%B0%E5%BC%82%E5%B8%B8%EF%BC%8C%E8%AE%B0%E5%BD%95%E6%93%8D%E4%BD%9C%E6%AD%A5%E9%AA%A4%E5%92%8C%E6%88%AA%E5%9B%BE%EF%BC%8C%E5%BD%93%E5%81%9A%E5%88%B0%E3%80%90%E7%BB%93%E6%9D%9F%E6%9D%A1%E4%BB%B6%E3%80%91%E5%B0%B1%E5%81%9C%E3%80%82)

[试一试：Vibe Testing](workbuddy://task?action=start&prompt=%2Fopengui%20%E5%B8%AE%E6%88%91%E6%B5%8B%E8%AF%95%E3%80%90%E5%BA%94%E7%94%A8%EF%BC%8F%E9%A1%B5%E9%9D%A2%E3%80%91%E7%9A%84%E3%80%90%E5%8A%9F%E8%83%BD%E6%88%96%E6%93%8D%E4%BD%9C%E6%B5%81%E7%A8%8B%E3%80%91%EF%BC%8C%E9%87%8D%E7%82%B9%E6%A3%80%E6%9F%A5%E3%80%90%E5%85%B3%E6%B3%A8%E7%9A%84%E9%97%AE%E9%A2%98%E3%80%91%E3%80%82%E5%A6%82%E6%9E%9C%E5%8F%91%E7%8E%B0%E5%BC%82%E5%B8%B8%EF%BC%8C%E8%AE%B0%E5%BD%95%E6%93%8D%E4%BD%9C%E6%AD%A5%E9%AA%A4%E5%92%8C%E6%88%AA%E5%9B%BE%EF%BC%8C%E5%BD%93%E5%81%9A%E5%88%B0%E3%80%90%E7%BB%93%E6%9D%9F%E6%9D%A1%E4%BB%B6%E3%80%91%E5%B0%B1%E5%81%9C%E3%80%82)

These links open task drafts without sending them. Edit the placeholders before submitting. Device and model confirmation still apply.

## State-directory permission error

`WorkBuddy state directory must be private, owned by this user, and not a symlink` refers to OpenGUI's state directory, normally `~/.workbuddy/opengui`. The published installer checks ownership and redirected paths before setting this directory to mode `0700`. It does not change permissions on the WorkBuddy root directory. This error is separate from a host permission refusal; its actual cause should be checked before retrying installation.

## npm reports `EPERM: operation not permitted, uv_cwd`

This error occurs when npm cannot read the Terminal process's current directory. `npm --prefix` does not change that working directory. The current installer runs npm from its own verified private package directory, including when the launch directory is inaccessible or has been deleted. Download the current script and retry; for an older installer, first run `cd "$HOME"` in Terminal.
