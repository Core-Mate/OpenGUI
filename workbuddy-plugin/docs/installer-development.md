# Local installer testing

This is a maintainer workflow for an explicitly selected, reviewed local checkout. It is not the published installation path and is not applicable to an empty WorkBuddy workspace. The preferred user-facing flow is the curl entry described in [INSTALL.md](../INSTALL.md). Run only a deliberately selected local candidate when testing unpublished changes.

The current local candidate allows WorkBuddy to stay open during installation without assuming that MCP configuration reloads live. It requires fully quitting with Command-Q and reopening WorkBuddy once afterward, and retains the separate active OpenGUI service upgrade guard. It still installs the official 0.4.1 runtime. This release publishes new versioned assets and checksums without replacing earlier releases.

For a deliberate local test, set `OPENGUI_INSTALLER_SOURCE` to the absolute `workbuddy-plugin` directory of this checkout, after reviewing its scripts. The following preparation copies only the reviewed scripts, verifies both source digests, and prepares a separate folder with the existing HTML guide. It does not execute or preview either script, open Finder, or change host permissions.

```bash
(
  set -euo pipefail
  umask 077
  : "${OPENGUI_INSTALLER_SOURCE:?Set this to the absolute path of the reviewed workbuddy-plugin checkout}"
  case "$OPENGUI_INSTALLER_SOURCE" in /*) ;; *) echo 'Installer source must be absolute.' >&2; exit 1 ;; esac
  handoff_dir=$(mktemp -d "$PWD/OpenGUI-local-installer.XXXXXXXX")
  cd "$handoff_dir"
  cp "$OPENGUI_INSTALLER_SOURCE/scripts/installer-handoff.command" OpenGUI-安装.command
  cp "$OPENGUI_INSTALLER_SOURCE/scripts/install-macos.command" installer.sh
  cp "$OPENGUI_INSTALLER_SOURCE/resources/OpenGUI-安装指南.html" OpenGUI-安装指南.html
  printf '%s  %s\n' \
    '62b16e4ddd35c59766c297fcf206b8e6ec0061ed16c117a12b88f0753afa4873' OpenGUI-安装.command \
    '6df60779059deedb5a60bb9f5b481637912eddc332bacad04591c05898f2d17a' installer.sh \
    | shasum -a 256 -c -
  chmod 700 OpenGUI-安装.command
  printf 'INSTALLER_FILES_READY: %s/\n' "$handoff_dir"
)
```

This preparation is the manual alternative to the new curl entry. For guide testing, run `python3 scripts/build-installer-handoff.py` ahead of time, then open `resources/OpenGUI-安装指南.html`; its embedded download must match the generated ZIP. A missing source directory or digest mismatch is a failed preparation; an unrelated local script is not a replacement.

Validation: `python3 scripts/test-installer-handoff.py`, `node scripts/test-preflight.mjs`, and the isolated macOS `node scripts/test-release-installer.mjs` exercise handoff, installation with WorkBuddy open, receipts, and idempotency. They do not establish real-host trust or GIF playback.

A future release needs its own version, checksums, and download URLs. Existing release assets must not be replaced with locally revised bytes. `npm run pack:release` builds the plugin and standalone installers; `scripts/publish.mjs` enforces asset immutability. Stable publication also requires the real-device gates in `release-readiness.json`.

## Curl entry validation

`install.sh` downloads the source installer and standalone authorization guide from the public repository, verifies the embedded hashes, runs installation and opens the guide only after `CONFIG_WRITTEN`. The source installer still downloads the official 0.4.1 runtime. The 0.4.1 public-testing assets are published under a new immutable version tag. Keep the entry and its pinned files in the same commit when updating the public command.

Run `python3 scripts/build-authorization-guide.py` after reviewing changes to the core installer or the authorization copy/GIF. It rebuilds the existing static authorization page and refreshes the entry's two pins. `node scripts/validate.mjs` rejects stale pins or stale packaged guides. Build and package normally before integration testing.

- `python3 scripts/test-curl-installer.py` exercises piped execution, checksum/download failures, failed installs, receipts, browser failure and redirected paths with isolated fixtures.
- `node scripts/test-release-installer.mjs --curl` pipes the real entry into Bash with a synthetic WorkBuddy bundle, isolated HOME and mocked source downloads/browser opening; the actual installer and package still perform installation and idempotency checks.
- These checks do not prove that WorkBuddy has loaded the configuration or that the user has granted MCP trust. Native host approvals remain user-controlled.
