# OpenGUI for Codex

Standalone screenshot-guided Android control for **local Codex on macOS arm64/x64**.
This is a candidate package, not a published or directory-approved release.

It includes a control Skill, local CLI/daemon, macOS ADB executable, and a read-only
device wall. It does not depend on, modify, install, update, or reload DSH.
See [source provenance](SOURCE.md) and [privacy](docs/privacy.md).

## Development and verification

Run commands from this directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm package
```

All package scripts are independent. No DSH checkout is required. The package
command writes a tar.gz, upload ZIP, and SHA-256 sidecars under `.artifacts/`.
Public files are allowlisted; development dependencies and MCP configuration are
excluded. `pnpm stage /absolute/new/path/opengui` creates an unpacked upload tree.
The existing repository marketplace intentionally still points at the legacy
DSH package and must not be rewritten for this implementation.

On macOS, `node scripts/smoke-archive.mjs <plugin.tar.gz> <node-darwin.tar.gz>`
verifies a packaged launcher using the checksum-pinned Node 22.23.2 archive in a
temporary private cache. It does not connect to ADB or install into a Codex profile.

For local Codex installation, stage this package into a separate disposable
marketplace using Plugin Creator. Do not install both the legacy and standalone
`opengui` plugins into the same test task. Installing into your normal Codex
profile or submitting to the public directory requires a separate user decision.

## First use on a dedicated test machine

```sh
sh scripts/opengui --setup
sh scripts/opengui --doctor
sh scripts/opengui --interfaces
```

The launcher asks before downloading pinned Node 22.23.2 (~50 MB), verifies its
archive, and caches it privately. It never changes PATH, runs npm install, or uses
sudo. Cached runtimes work without a download. First Unicode input downloads
verified scrcpy 4.1 (~13–14 MB). Internet is needed only when those caches are absent.

Connect an authorized Android test device with USB debugging enabled. If no ADB
server is running, `--setup-adb-server` starts the bundled server only after a
native confirmation. An incompatible existing server is rejected, not restarted.
ADB is still machine-wide: preflight is not a cross-process lock. Do not use this
plugin on the production DSH host or share a phone with another controller.

```sh
sh scripts/opengui opengui_list_devices '{}'
```

Use returned opaque ids in `opengui_open_session`. Up to four devices can be
frozen in a control session. `mode: "observe"` is read-only and does not reserve
control locks. View the JPEG path returned by `opengui_observe` before issuing
one `opengui_act`, then inspect the new frame. `--interfaces` describes exact
arguments. Consequential actions require conversational confirmation and a native
one-action dialog; caller-supplied approval booleans are rejected.

Finish with `opengui_close_session` or `opengui_cancel`. Recover ids with
`opengui_list_sessions`. Sessions expire after 30 idle minutes; wall polling
does not renew them. An unused daemon exits after five minutes. A CLI interrupted
during phone work cancels that session. Abrupt daemon death loses in-memory
sessions: do not retry an uncertain external action automatically.

CLI session operations require the host-provided `CODEX_THREAD_ID`. Sessions are
owned by that task across short-lived CLI connections; other tasks cannot list,
inspect, act on, or cancel them. Missing identity fails closed. This protects
against task mixups, not malicious same-user processes that can forge environment
variables or read local files. Device-wall tokens are scoped to one session.
Protocol 2 rejects older daemons; finish their sessions and let them exit before
using the updated package. A failed action consumes its old observation, requiring
a new capture before another action. Reconnected devices retain their identity
within the daemon lifetime.

## Troubleshooting and rollback

- Unsupported platform: no Android process is launched.
- Runtime checksum/download failure: setup stops without executing the archive.
- Active older daemon: complete its sessions and wait for idle exit before
  updating; do not force-kill or replace it.
- Interrupted startup lock: inspect the named lock and process on the test machine.
  Locks are not automatically stolen. Retry after the owner finishes; manually
  remove only a verified orphan lock if a process was killed during startup.
- Cleanup never issues global ADB kill/reconnect or removes all forwards.
- Rollback: finish Codex sessions, disable the standalone plugin, then reinstall
  a verified prior standalone archive. DSH needs no rollback or restart.

## Release gates

See [review tests](docs/review-tests.md). Before public submission, verify clean
Mac setup, actual Android tasks on one and two devices, both architectures, final
downloaded archive checksums, public policy URLs, and publisher identity. GitHub
artifact creation is not OpenAI approval. Do not announce publication until the
approved version has actually been published.
