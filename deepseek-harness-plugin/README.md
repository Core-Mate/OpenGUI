# OpenGUI

English | [中文](README.zh.md)

`dsh-coremate-mobile` is the OpenGUI plugin for DeepSeek Harness. It uses restricted child tasks to control authorized Android phones and a plugin-managed local browser. It provides `/opengui` and the `phone_agent` and `browser_agent` delegation tools. OpenGUI prefers the model already selected in the receiving DSH conversation; a separate visual model is only a compatibility fallback. The legacy `/coremate` command remains available for compatibility.

The plugin does not modify DeepSeek Harness and does not depend on CoreMateDesktop2, system Chrome, Python, or Hermes CLI. Chromium is installed on demand only after the first browser task receives user approval.

## Codex plugin

The same source directory is also a Codex plugin named `opengui`. Its repo marketplace entry is [`../.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json), and its local stdio MCP exposes these interfaces:

- `opengui_list_devices`
- `opengui_open_session`
- `opengui_observe`
- `opengui_act`
- `opengui_status`
- `opengui_cancel`
- `opengui_close_session`

Use the `opengui:control` Skill for Android tasks. It freezes one to four authorized phones, requires the latest screenshot observation for every mutation, asks again before send/publish/purchase/delete effects, and closes the session after the task. Open the returned loopback `deviceWallUrl` in the native Codex Browser for a read-only multi-device wall. Website-only work should use the native Codex Browser instead of the Android adapter.

The repo marketplace loads the Skill and local MCP together. The public-directory template under [`codex-public`](./codex-public) is intentionally Skills-only and does not introduce a hosted phone-control gateway.

Install the local Codex plugin from the OpenGUI repository root:

```sh
codex plugin marketplace add /absolute/path/to/OpenGUI
codex plugin add opengui@opengui-local
```

Before a public-directory submission, run `pnpm run build`, then use `pnpm codex:stage-public -- /absolute/path/to/an/empty/output-directory` to stage a Skills-only review bundle without MCP configuration.

## Requirements and support

Before installing, confirm that:

- The official DeepSeek Harness is installed and starts successfully. The current verified baseline is `0.1.0-rc.7`.
- Node.js is `^22.19.0` or `>=24`.
- The installation machine can access the public GitHub Releases for this repository.
- The DSH conversation model should support image input and tool calling. If it does not, OpenGUI can guide the user through configuring a separate OpenAI-compatible visual-model fallback.
- Every non-empty `/opengui` or `@OpenGUI` task requires at least one authorized and selected Android phone, including tasks that the router later sends only to the browser.
- The host is macOS arm64/x64, Linux x64, or Windows x64. Bundled ADB is not currently available for Linux arm64 or Windows arm64.

Chinese-speaking users who are not comfortable with terminals, Git, or YAML can follow the [beginner installation guide](docs/install-for-beginners.zh.md).

## Install the plugin (shared by both setup paths)

The examples use the `web` profile and the default `$DSH_HOME=~/.dsh`. Substitute your profile or custom `DSH_HOME` where needed.

### macOS: install with the Codex Skill

Ask Codex to install the repository skill from [`deepseek-harness-plugin/skills/opengui-coremate-install`](./skills/opengui-coremate-install), then invoke `$opengui-coremate-install`. The Skill downloads and verifies the pinned `v0.1.7` package from the public OpenGUI Release, preserves the rest of the `web` profile, and installs a per-user LaunchAgent so DSH returns after a crash or login. GitHub login is not required.

If port 3080 belongs to an OpenGUI-managed DSH, the installer safely reloads that LaunchAgent. It never terminates an unowned DSH process; in that case the new LaunchAgent takes over after the next login. The manual package flow below remains available on every supported host.

### 1. Download the release package

Download these files from the [public OpenGUI Release](https://github.com/Core-Mate/OpenGUI/releases/tag/dsh-coremate-mobile-v0.1.7):

- `dsh-coremate-mobile-0.1.7.tgz`
- `dsh-coremate-mobile-0.1.7.tgz.sha256`

Do not extract the `.tgz`, and do not use GitHub's automatically generated source archives.

From the directory containing both files, verify the package:

```sh
# Linux
sha256sum -c dsh-coremate-mobile-0.1.7.tgz.sha256

# macOS
shasum -a 256 -c dsh-coremate-mobile-0.1.7.tgz.sha256
```

On Windows PowerShell, run `Get-FileHash .\dsh-coremate-mobile-0.1.7.tgz -Algorithm SHA256` and `Get-Content .\dsh-coremate-mobile-0.1.7.tgz.sha256`, then confirm that the displayed hashes match.

### 2. Install into a Harness profile

```sh
dsh plugin --profile web add /absolute/path/dsh-coremate-mobile-0.1.7.tgz
```

If you run the official CLI through `npx`, replace `dsh` in the commands with:

```text
npx @deepseek-ai/dsh@0.1.0-rc.7
```

If the first installation stops with `ERR_PNPM_IGNORED_BUILDS`, merge these decisions into the existing `$DSH_HOME/profiles/web/pnpm-workspace.yaml`, then rerun the same installation command:

```yaml
allowBuilds:
  '@google/genai': false
  protobufjs: false
```

Do not replace the entire file with those three lines.

After installation, start with the Web UI. A separate model configuration is optional and is used only as a fallback or when explicitly selected.

## Current-model-first setup in the Web GUI (recommended)

### 1. Start Harness

```sh
dsh web
```

### 2. Verify the command

Send this in the Web UI:

```text
/opengui
```

An empty command always returns the usage text. It never opens model setup:

```text
Usage: /opengui <task>
```

Opening DSH, selecting phones, and manually opening one or more mirror windows also never requires an OpenGUI model configuration.

Run the first task with text after the command:

```text
/opengui Open Settings and report the Android version
```

You can also choose the native `@OpenGUI` candidate and type the same task. A bare `@OpenGUI` behaves like an empty `/opengui` and only shows usage. Both paths delegate to the same command lifecycle.

OpenGUI reuses the current DSH provider, model, and output-token limit. A model that explicitly declares image input runs without a prompt. When a custom model merely omits its capability declaration, OpenGUI asks whether it supports image input and tool calling; confirmation patches only that exact provider/model and resumes the original task. A model that explicitly declares text-only input enters the dedicated fallback setup. Switching provider or model always triggers a fresh capability decision.

Skipping the capability question or any setup step cancels the task normally: OpenGUI makes no model call or device action and stores no partial setup. The phone canvas and manual mirror remain available, and the next task asks again.

If the inherited model later returns an image- or tool-capability error, OpenGUI does not retry the task because that could repeat phone or browser side effects. It offers to configure the fallback and asks the user to resubmit after configuration.

## Optional dedicated visual-model fallback

Configure this only when the current DSH model is incompatible or when `modelStrategy` is explicitly set to `dedicated`.

The recommended user configuration is `$DSH_HOME/settings.yaml`:

```yaml
coremate-mobile:
  baseURL: https://gateway.example/v1
  api: openai-responses
  model: vision-model
```

Change `api` to `openai-completions` only when the provider explicitly requires the Chat Completions protocol.

Store the API key in `$DSH_HOME/.credentials.yaml`. Do not put it in `settings.yaml` or commit it to Git:

```yaml
COREMATE_MOBILE_API_KEY: sk-...
```

After manually creating the credential file on macOS or Linux, run:

```sh
chmod 600 "${DSH_HOME:-$HOME/.dsh}/.credentials.yaml"
```

When `DSH_HOME` is unset, the command above uses `~/.dsh/.credentials.yaml`.

## Verify installation and loading

First inspect the profile's composed configuration:

```sh
dsh --profile web --dump-config
```

The output should contain a `dsh-coremate-mobile` layer and an `id: coremate-mobile` row. This proves that the bundle is in the configuration, but it does not prove that the plugin loaded at runtime.

Start Harness:

```sh
dsh web
```

Send the following as a standalone message in the Web UI:

```text
/opengui
```

Expected response:

```text
Usage: /opengui <task>
```

This confirms that the plugin module and command loaded successfully. No model configuration is read for an empty command.

## Run the first phone task

Keep the phone unlocked and authorized for USB debugging, then send:

```text
/opengui Open Settings and report the Android version
```

The native **OpenGUI** tab owns phone selection and status. One authorized phone is selected automatically. With multiple phones, check any subset in that workbench before sending `/opengui` or `@OpenGUI`. A non-empty task resolves the current-model choice or dedicated fallback setup before it waits for a phone, but it sends no provider request until the selected-device snapshot is ready. Device selection remains editable while waiting, then locks after detection until the whole batch finishes.

The native **OpenGUI** tab is a full-width device wall. It renders every visible phone in Host order and appends one connection guide, without reserving empty slots. A connected phone shows an uncropped JPEG preview immediately while OpenGUI prepares its low-latency H.264 view in the background, then switches automatically. Unsupported browsers and stream failures keep the screenshot preview available with a retry action. Each phone can also be opened in an optional independent mirror window.

Selecting `@OpenGUI` opens the native input menu with free-form, QA, operations, and game-assistant choices. A scene only fills the composer and never submits automatically. A non-empty OpenGUI submission releases the composer immediately while the task continues in its owner session. Starting another DSH session opens a genuinely blank conversation; the original task keeps running there, with a compact link back from the new session.

`/opengui` starts a restricted routing child that can call only `phone_agent`, `browser_agent`, or both sequentially when the task truly spans both targets. Phone work still creates one fixed-device child per selected phone. Only one OpenGUI task runs at a time, including tasks started through the legacy `/coremate` alias.

While it runs, the outer `phone_agent` / `browser_agent` card streams nested `phone_control` / `browser_control` calls and their visible results. Hidden reasoning, system prompts, and model configuration are not projected into the parent conversation.

While an OpenGUI task is active, a square **Stop OpenGUI operation** button appears at the right side of the composer. It cancels routing, phone or browser children, in-flight ADB work, browser downloads, and browser operations. Manually opened mirrors remain independent.

After a successful direct OpenGUI task, one turn-tail card may show 2–3 validated follow-up prompts. Clicking one only fills an `@OpenGUI` draft. The same card links to the [use-case guide](docs/use-cases.md) and OpenGUI GitHub. Failed, cancelled, empty, configuration-only, and ordinary tasks do not show it.

## On-demand browser control

The plugin checks for its managed Chromium only when a task actually calls `browser_agent`. If absent, the **OpenGUI** tab shows the pinned version, download size, approval actions, and installation progress; Chat only directs the user to that tab. After approval, the same task downloads the archive, verifies its SHA-256, installs it atomically, and opens a visible browser. Declining or pressing Stop ends that task. Later tasks reuse `$DSH_HOME/cache/coremate-mobile/browser` and its isolated profile.

`browser_control` is intentionally limited to HTTP/HTTPS navigation, observation, clicking, Unicode text insertion, selected keys, scrolling, back, reload, and bounded waits. It does not expose arbitrary CDP or JavaScript execution. The binary lifecycle and control implementation are wholly contained in this plugin.

## Configuration reference

| Key | Meaning |
|---|---|
| `modelStrategy` | `current-first` (default) reuses the receiving DSH model; `dedicated` always uses the fallback below. |
| `trustUnknownCurrentModels` | Deprecated compatibility switch. On first use after upgrading, it migrates trust only for the exact active provider/model and then turns itself off. |
| `baseURL` | Optional dedicated fallback's OpenAI-compatible HTTP/HTTPS endpoint. Prefer HTTPS because requests contain credentials, prompts, and screenshots. |
| `api` | Dedicated fallback protocol: `openai-responses` (default) or `openai-completions`. |
| `model` | Dedicated fallback model; it must support image input and tool calling. |
| `apiKeyEnv` | Harness credential reference; default `COREMATE_MOBILE_API_KEY`. |
| `commandTimeoutMs` | Base timeout for local ADB processes and browser actions; default 15 seconds. |
| `maxOperations` | Maximum `phone_control` or `browser_control` calls in one child task; default 100. |
| `maxParallelDevices` | Maximum selected phones processed concurrently by one OpenGUI task; default 4, range 1–16. |
| `contextWindow` | Declared model context capacity; default 262,144 tokens. |
| `maxTokens` | Declared maximum model output; default 32,768 tokens. |
| `streamIdleTimeoutMs` | Maximum interval without a model stream event; default 300 seconds. |
| `adbPath` | Development/test override only; release packages always use bundled ADB. |

For profile-specific isolation, you can instead add this to `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: coremate-mobile
  config:
    baseURL: https://gateway.example/v1
    api: openai-responses
    model: vision-model
```

This is an advanced option: a profile patch replaces the target row's entire `config`, and a matching section in `$DSH_HOME/settings.yaml` still has higher precedence. Never put the API key in the patch.

## Install from a source checkout (development)

Production installations should use the prebuilt release package above. For development, clone the public OpenGUI release tag and install the plugin directory:

```sh
git clone --branch dsh-coremate-mobile-v0.1.7 --depth 1 https://github.com/Core-Mate/OpenGUI.git
cd OpenGUI/deepseek-harness-plugin
dsh plugin --profile web add "$(pwd)"
```

The public repository can be fetched without GitHub authentication. Source installation runs the package's `prepare` build, so the profile allowlist must also contain `dsh-coremate-mobile: true`. Only grant installation-script permission to reviewed, pinned source. See the [developer integration and verification record](docs/research/deepseek-harness-plugin-integration.md) for the full semantics.

```yaml
allowBuilds:
  dsh-coremate-mobile: true
  '@google/genai': false
  protobufjs: false
```

## Troubleshooting

- **`ERR_PNPM_IGNORED_BUILDS`**: merge the `allowBuilds` decisions from the installation step and retry; do not replace the whole YAML file.
- **`/opengui` is not recognized**: confirm installation succeeded, fully stop and restart Harness, then inspect `--dump-config`.
- **Dedicated fallback API key, 401, or model unauthorized**: check the credential, endpoint, and protocol. This is separate from phone USB authorization.
- **No available device or device unauthorized**: unlock and reconnect the phone, then accept the USB debugging prompt.
- **The current model can chat but does not operate the phone**: confirm that it supports both image input and tool calling, or accept OpenGUI's offer to configure a dedicated fallback. The failed task is never retried automatically.
- **The task makes no progress**: check tool-calling reliability, authorization prompts on the phone, and the complete terminal error output.

When requesting help, include the host OS and architecture, Harness version, plugin version, steps taken, and complete error text. Never send an API key or credential file.

## On-demand phone mirror

Every connected phone has an always-visible eye button beside its device label. No OpenGUI task or operation selection is required. Clicking one eye opens an independent read-only scrcpy window for that device on the **computer running Harness**; clicking it again closes the window. Click several eyes to display several phones at once. If the Web UI is open on another computer, the native windows do not appear on that browser computer.

On the first embedded view, mirror, or Unicode phone-text action, the plugin downloads the pinned, reviewed official scrcpy v4.1 asset for the Harness Host (about 11–18 MB), verifies its built-in SHA-256, and atomically installs it in the current user's OpenGUI cache. macOS uses `~/Library/Caches/OpenGUI/scrcpy`; Linux follows `$XDG_CACHE_HOME` (or `~/.cache`), and Windows uses `%LOCALAPPDATA%`. Verified legacy `$DSH_HOME/cache/coremate-mobile/scrcpy` installations remain reusable without copying or downloading again. The mirror client is forced to use the plugin's managed ADB, the eye button's device serial, `--no-control`, and `--no-audio`.

Official prebuilt clients cover macOS arm64/x64, Linux x64, and Windows x64. Other Host architectures show an unsupported state. A failed download can be retried; checksum-mismatched content is never executed. To reclaim the cache, stop Harness completely and remove the platform-specific OpenGUI cache above.

## Uninstall

macOS Skill installations can use the matching lifecycle script:

```sh
./skills/opengui-coremate-install/scripts/uninstall-macos.sh
```

It removes only the matching plugin and LaunchAgent. Settings, credentials, and caches are preserved.

```sh
dsh plugin --profile web remove dsh-coremate-mobile
```

If you used the recommended settings configuration, remove the `coremate-mobile` section from `$DSH_HOME/settings.yaml`; remove the credential only after confirming it is no longer used.

Uninstall does not delete downloaded phone-view or Chromium caches. To reclaim them, stop Harness and remove the platform-specific OpenGUI `scrcpy` cache, any legacy `$DSH_HOME/cache/coremate-mobile/scrcpy`, and `$DSH_HOME/cache/coremate-mobile/browser`.

If you used a profile patch, also remove its `coremate-mobile` row. Leave `[]` when the file has no other rows. A stale patch causes `entry "coremate-mobile" not found` on the next start.

## Safety behavior and known limitations

- The plugin ignores offline and unauthorized devices. The browser receives only process-local opaque ids, models, and display labels—never ADB serials. One phone is auto-selected; multiple phones are selected below the input.
- A batch freezes its selected-device set and binds one child task to each device; selection cannot change while the task runs.
- `phone_control` does not accept arbitrary shell or ADB commands, app installation/removal, file transfer, permission changes, reboot, or arbitrary intents.
- Every mutation must reference the latest observation; repeated no-progress actions and operations beyond the budget are rejected.
- Phone text accepts up to 500 Unicode characters. Safe ASCII uses `adb input text`; Chinese, emoji, and other Unicode text uses scrcpy's standard UTF-8 clipboard control message and must receive the matching device ACK. This is independent of the phone vendor and active input method, and never silently falls back to simulated keyboard typing.
- `browser_control` exposes no arbitrary CDP, JavaScript execution, filesystem access, or non-HTTP(S) URL. Page mutations require the latest observation.
- The current DSH route is proxied without copying credentials. Provider requests keep tool schemas, cancellation, streaming, and at most the latest phone screenshot.
- Model-facing phone screenshots are JPEG quality 65 with preserved aspect ratio and a maximum 2048px long edge. Smaller frames are never enlarged; tap and swipe coordinates are mapped from that bounded screenshot back to the Android logical display size.
- A capability failure never automatically retries a task that may already have caused phone or browser side effects.
- Direct `/opengui` results are text-only; screenshots remain in the phone child session.
- Native mirroring is view-only and opens only on the graphical computer running Harness; a headless Host cannot display the window.

See the [runtime manifest](assets/platform-tools/MANIFEST.md) for bundled ADB versions, checksums, and upstream notices. See [Model Interaction](docs/model-experience.md) for the complete tool, screenshot-history, token, and KV-cache behavior.

## Development

The repository builds without a DeepSeek Harness source checkout:

```sh
corepack enable
pnpm install
pnpm run check
npm pack
```

The [GitHub Release workflow](.github/workflows/release.yml) performs publishing. A tag must be `v` followed by the exact `package.json` version; never reuse an existing version tag. Compatibility is defined by `peerDependencies` in `package.json`.

See the [developer integration and verification record](docs/research/deepseek-harness-plugin-integration.md) for official Harness source setup, isolated-profile installation, configuration precedence, runtime verification, and removal evidence.
