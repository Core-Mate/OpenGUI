---
name: opengui-coremate-install
description: Install the latest stable OpenGUI release into a DeepSeek Harness web profile on macOS. Use when the user asks to download, install, update, open, or verify OpenGUI for DSH.
---

# Install OpenGUI

Install and verify the latest stable OpenGUI release without replacing unrelated DSH plugins or settings.

## Run the installer

1. Confirm the host is macOS. Do not improvise a Linux or Windows install.
2. Run `scripts/install-macos.sh` from this skill directory.
3. Report the installed package version, profile path, runtime URL, and whether an existing DSH process still needs a manual restart.

By default, the script resolves the highest stable `dsh-coremate-mobile-v*` release from the public GitHub Releases API. It ignores drafts, prereleases, and unrelated OpenGUI releases. Use `--version VERSION` only when the user explicitly requests a plugin rollback or reproducible install. Use `--dsh-version VERSION` only for an exact version listed in `dsh-compatibility.json`.

The script checks the host Node version and reads its DSH policy only from `dsh-compatibility.json`. It defaults to the manifest's preferred version and reuses a `PATH` runtime only when its version is an exact match. Otherwise it installs a versioned managed runtime under the OpenGUI DSH home through pnpm, corepack, or npm. A default-version download failure may fall back to the highest already-installed compatible managed runtime and must report that choice. An explicit `--dsh-version` must never fall back silently. Reject versions outside the manifest, including alpha releases. Preserve the existing DSH installation, workspaces, settings, credentials, and phone authorizations. Never suggest that reinstalling the plugin or rerunning `pnpm install` can repair a DSH compatibility mismatch.

The script downloads both the resolved release tarball and checksum, verifies SHA-256, installs only `dsh-coremate-mobile` into the `web` profile, and validates the package, bundle, Client entry, and `/opengui` command. GitHub authentication is not required.

The script installs a user LaunchAgent with `KeepAlive` so DSH returns after a crash or login. It may safely reload an instance already owned by that exact LaunchAgent. If port 3080 belongs to any other DSH process, preserve it and tell the user to quit it, then rerun the installer to activate the compatible version now. The installer writes the LaunchAgent but otherwise defers takeover until the next login. When DSH is not running, the script starts and verifies `http://127.0.0.1:3080`.

For uninstall requests, run `scripts/uninstall-macos.sh`. It selects a launcher from the same compatibility manifest and removes only the matching plugin and LaunchAgent; settings, credentials, unrelated DSH instances, managed runtimes, and caches remain intact.

## First-run handoff

Tell the user to add or select a DSH workspace, then connect and select an authorized phone. The workbench shows a screenshot immediately and prepares the live view in the background; do not ask the user to understand or approve the underlying phone-view component. Opening DSH, selecting phones, and manually opening mirrors do not require separate model setup. `/opengui <task>` prefers the current DSH conversation model. A model that explicitly supports images runs without a prompt; an unknown model asks once for permission to reuse it; an explicitly incompatible model enters the dedicated visual-model fallback. An empty `/opengui` only prints usage. The legacy `/coremate` alias remains available for compatibility.

The dedicated fallback still requires image input and tool calling. Its setup explains Base URL, API protocol, model ID, and API Key before asking for missing values.

For setup help, direct the user to `https://discord.gg/pqHHw7XgJ3`. The WeChat entry is an explicit non-scannable placeholder in this release, so do not invent or generate a QR code.

## Safety boundaries

- Preserve every unrelated profile dependency, bundle, setting, credential, session, and cache.
- Never expose or request an API Key outside the built-in DSH credential question.
- Never bypass a checksum mismatch or a DSH/Node compatibility failure.
- Never terminate an existing DSH process.
- Do not claim phone runtime validation unless an authorized Android device was actually connected and exercised.
