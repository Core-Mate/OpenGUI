---
name: opengui-coremate-install
description: Install the pinned OpenGUI v0.1.5 release into a DeepSeek Harness web profile on macOS. Use when the user asks to download, install, update, open, or verify OpenGUI for DSH.
---

# Install OpenGUI

Install and verify the signed-off `v0.1.5` release without replacing unrelated DSH plugins or settings.

## Run the installer

1. Confirm the host is macOS. Do not improvise a Linux or Windows install.
2. Run `scripts/install-macos.sh` from this skill directory.
3. Report the installed package version, profile path, runtime URL, and whether an existing DSH process still needs a manual restart.

The script checks the host Node version, pins DSH to `0.1.0-rc.7`, downloads both the release tarball and checksum from the public GitHub Release, verifies SHA-256, installs only `dsh-coremate-mobile` into the `web` profile, and validates the package, bundle, Client entry, and `/opengui` command. GitHub authentication is not required.

If port 3080 already belongs to DSH, the script preserves that process. Do not kill or restart it automatically. Explain that the plugin is installed and the existing DSH process must be restarted when the user is ready. When DSH is not running, the script starts it and verifies `http://127.0.0.1:3080`.

## First-run handoff

Tell the user to add or select a DSH workspace, then connect and select an authorized phone. Opening DSH, selecting phones, and manually opening mirrors do not require separate model setup. `/opengui <task>` prefers the current DSH conversation model. A model that explicitly supports images runs without a prompt; an unknown model asks once for permission to reuse it; an explicitly incompatible model enters the dedicated visual-model fallback. An empty `/opengui` only prints usage. The legacy `/coremate` alias remains available for compatibility.

The dedicated fallback still requires image input and tool calling. Its setup explains Base URL, API protocol, model ID, and API Key before asking for missing values.

For setup help, direct the user to `https://discord.gg/pqHHw7XgJ3`. The WeChat entry is an explicit non-scannable placeholder in this release, so do not invent or generate a QR code.

## Safety boundaries

- Preserve every unrelated profile dependency, bundle, setting, credential, session, and cache.
- Never expose or request an API Key outside the built-in DSH credential question.
- Never bypass a checksum mismatch or a DSH/Node compatibility failure.
- Never terminate an existing DSH process.
- Do not claim phone runtime validation unless an authorized Android device was actually connected and exercised.
