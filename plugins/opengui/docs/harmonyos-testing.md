# HarmonyOS driver verification

## Reproduce the automated checks

From `plugins/opengui`, run `pnpm check`, `pnpm package`,
`bash -n scripts/install-macos.command`, and `node scripts/test-installer.mjs`.
The existing CI matrix covers Linux, macOS arm64 and macOS Intel. Local macOS
results do not establish that the remote matrix has passed.

The tests cover Android regressions, HDC failure acknowledgments and argument
quoting, device identity, layout limits and changes, coordinate scaling,
API-dependent text input, permission assessment, cancellation and owned artifact
cleanup. Android still requires video readiness; HarmonyOS explicitly rejects
Android video preparation and opens a screenshot session.

## Device evidence

Historical physical-device verification used a TYR-AL00 at API 24, HDC 3.2.0d,
and UiTest 6.0.2.3. It exercised observation, launch, Unicode input, long press,
navigation, cancellation and session cleanup. Those records predate the current
upstream merge and do not establish verification of this candidate.

On 2026-10-16, source commit `371481a` passed a short physical-device smoke test
on TYR-AL00 with HDC 3.2.0f. The workflow opened a screenshot control session
without an Android video viewer, observed a stable launcher, swiped to the
adjacent home page, inspected the resulting image, swiped back and inspected the
restored home page. Closing the session removed all three runtime screenshots;
the task-only idle daemon was then stopped. No messages or external business
data were created or deleted. This is a narrow navigation check, not a repeat of
the historical Unicode, launch or cancellation scenarios. The current API level
and UiTest version were not separately recorded; capture passed the driver's
capability probe. Raw device content is not committed.

Local validation used Node.js 24.15.0 and the installed pnpm 10.31.0 runner with
the existing locked dependencies. The first suite run passed 134 of 135 tests;
one unchanged launcher fixture exceeded its five-second timeout. All eight
launcher tests passed in a focused rerun with two workers. TypeScript/CLI build,
package validation, packaging, installer shell syntax and isolated packaged
installation passed. The installer uses fixture Codex/private Node hosts and a
verified official scrcpy cache. Its first live download attempt timed out; the
same pinned asset was fetched with curl, checked against its pinned SHA-256 and
validated by the actual cache installer before reuse. This does not establish
that a first-use video download succeeds on every network.

The remote CI matrix uses Node.js 22.23.2 and pnpm 11.19.0 and remains a separate
pending gate. No physical Android check was run in this smoke test.

Suggested short workflow: open a screenshot session, observe the actual phone,
perform ordinary authorized navigation, inspect the returned image, then close
the session and verify that its owned runtime artifacts are removed. Do not send
messages or delete unrelated data to prove driver behavior.

API 17 hardware, physical multi-device operation, landscape/foldable layouts,
actual unplug/reconnect, protected screens and long-running unattended operation
are unverified. These limits should be disclosed rather than expanded into a
claim that every supported phone or business workflow has passed.
