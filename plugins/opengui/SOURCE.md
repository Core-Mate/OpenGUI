# Source and production boundary

This standalone Codex package is maintained in `Core-Mate/OpenGUI/plugins/opengui`, with shared build-time
source in `packages/device-runtime`.
Its initial phone-control implementation was copied once from this repository's
`deepseek-harness-plugin` at commit `674e35893219f47b03508ba58b84a13e57f31c57`.
The original MIT license is retained in `LICENSE`.

Copied and adapted: adb, concurrency, device-fleet, phone-controller,
phone-execution, forward-registry, the scrcpy control/installer subset,
Codex service/tools/screenshot, and focused phone-controller/service tests.
The source files were not moved or edited. There is no ongoing synchronization.

The maintainer explicitly required production DSH isolation. This standalone
package is an exception to the older dual-host source-location note. Do not edit
that note, any DSH source/configuration/package/workflow, or the root marketplace
as part of Codex work. Only `packages/device-runtime/src` may be imported at build time outside the
adapter. The released bundle must never import a parent checkout. Never install DSH dependencies.
Do not run DSH package scripts or replace/reload the production runtime.

The Codex package owns its own version, lockfile, artifacts, state and release
workflows. ADB and the physical phone are still machine-wide resources: production
co-host/device concurrency is not a supported isolation guarantee. Real-device QA
must use a dedicated non-production environment.

## Autonomous phone task refactor (2026-09-19)

The approved three-host refactor supersedes the Codex-only scope above. Build-time imports may target `packages/device-runtime/src`, `packages/phone-agent/src`, and `packages/workbench/src`; none may import another host adapter. All three host packages pin Pi 0.85.1 and own independent background processes, model settings, Keychain services, task journals and rollback. The public plugin owns the phone model loop. DSH phone tasks migrate to the same contract; its browser path remains separate. Do not reload or overwrite an installed production host as part of development.
