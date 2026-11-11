# Privacy — OpenGUI for Codex

OpenGUI does not require an OpenGUI account, separate model API key, hosted phone
gateway, or telemetry service. Android commands run locally through ADB; HarmonyOS commands use your local SDK HDC and device UiTest. The
device wall binds only to loopback and requires an unguessable path token.

Screenshots, visible app content, foreground package names, and task results can
enter your Codex conversation. They are then subject to your Codex host and model
provider's data policies. Local device execution does not mean that screenshots
remain offline. Do not expose passwords, credentials, or unrelated private data.

The standalone package uses its own local directory:
`~/.codex/opengui-codex` (or the explicitly configured
`OPENGUI_CODEX_DATA_DIR`). Session screenshots and complete observation JSON are owner-readable files under
`observations/`. Normal close/cancel removes that session's images and JSON. Leftovers
older than 24 hours are pruned at daemon startup; if the plugin never starts again,
they remain until you remove them. Runtime downloads remain cached for offline
reuse. No production DSH configuration or cache is read or migrated.

Initial setup downloads a pinned Node archive from nodejs.org after a native
confirmation. First Unicode use downloads a pinned scrcpy archive from the
official Genymobile GitHub release. Both downloads are checksum-verified.
These hosts receive ordinary network request metadata. macOS security and Codex
permission prompts may also appear; this plugin does not bypass them.

Support: [GitHub issues](https://github.com/Core-Mate/OpenGUI/issues). Redact phone
screens, serials, account identifiers, and secrets before sharing diagnostics.

HarmonyOS observations also include bounded UI text, hints, node bounds and window
identities, which may include hidden app content. Treat them as device data.
UiTest screenshots/layout files use unique temporary names on the phone and Mac
and are deleted after collection, including attempted cleanup after cancellation.
A disconnected phone or abrupt process death may leave those files behind; only
remove verified `opengui-<UUID>.png/json` artifacts belonging to the interrupted run.
The host does not download HDC or install a phone agent. Unicode input can replace
the system clipboard and trigger its permission prompt; original clipboard contents
are not read or restored automatically.
