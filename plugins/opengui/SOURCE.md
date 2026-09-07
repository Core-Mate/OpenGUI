# Source and production boundary

This standalone Codex package is maintained only in `Core-Mate/OpenGUI/plugins/opengui`.
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
as part of Codex work. Never import a parent checkout or install DSH dependencies.
Do not run DSH package scripts or replace/reload the production runtime.

The Codex package owns its own version, lockfile, artifacts, state and release
workflows. ADB and the physical phone are still machine-wide resources: production
co-host/device concurrency is not a supported isolation guarantee. Real-device QA
must use a dedicated non-production environment.
