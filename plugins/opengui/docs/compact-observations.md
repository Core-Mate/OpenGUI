# Compact observations and complete evidence

Use `--compact` before the interface name:

```sh
node lib/cli.js --compact opengui_observe '{"sessionId":"returned-session-id"}'
```

The compact response preserves the current observation ID, JPEG coordinate space,
layout stability, focused editable nodes and action assessment. It is primarily
useful for HarmonyOS advisory layouts. Non-observation results and results without
layouts remain unchanged. Do not interpret omitted nodes as absent elements.

Complete observations are written to `observationPath` with owner-only read/write
permissions. The JSON references the screenshot file without embedding its base64
bytes. It can contain hidden advisory node text: keep it private and query only
necessary fields. Default CLI output remains complete.

Closing or cancelling a session removes its JPEG and JSON together. Expired
session directories retain the existing pruning policy. Copy authorized evidence
before closing. If the host reports a running process, wait for that same process;
do not parse partial output or repeat an uncertain action.

Before trying a changed source build, finish old sessions and stop its idle daemon;
use a dedicated runtime directory during development. These source changes do not
claim that an already published package has been upgraded.

## Candidate verification

On 2026-10-16, the full suite passed 138 tests across 22 files using two workers,
followed by TypeScript/CLI build, package validation, packaging, installer shell
syntax and isolated packaged-install checks. Local Node.js was 24.15.0 and pnpm
was 10.31.0; the remote three-platform CI and its pinned versions remain a
separate pending gate.

Source commit `386e81e` was checked on TYR-AL00 through a new screenshot session.
The compact observation omitted the 104 non-focused layout nodes while the
complete private JSON retained them. The JSON had mode 0600 and matched the
response's observation ID and screenshot metadata. The screenshot was inspected;
closing the session removed both JPEG and JSON and the task-only daemon was
stopped. This check did not repeat the driver's navigation smoke test or perform
external business actions. Device content is not committed.
