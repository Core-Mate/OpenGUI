# WorkBuddy 0.4.0 release verification

The release is based on main commit `5cdcbaaaff3622b9afd0aec2fc11f26898710548`, with aligned runtime, connector, launcher and payload versions. It ships the task home, account/model configuration, workbench, history, and report export already merged into main.

## Verification

- `npm run pack:release`: 485 tests across 61 files, TypeScript build and release validation passed.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities after updating MCP SDK to 1.32.1.
- `npm run smoke:packed`: first and offline cached stdio startup, 25 tools, isolated ADB discovery, read-only iOS simulator parity, installer configuration and rollback checks passed.
- `python3 scripts/test-installer-handoff.py`: 12 tests passed, including direct download URLs, checksum failure, paths with spaces, confirmation/cancellation and per-attempt receipts.
- `node scripts/test-publish.mjs`: all ten immutable assets included; stable publication remains blocked by unresolved acceptance gates.
- `node scripts/test-rollback.mjs <installed-0.3.1-package>`: old/new/old/new configuration cycle passed with unrelated settings preserved.
- `node scripts/test-workbuddy-host.mjs`: WorkBuddy 5.7.6 bundled headless ACP discovered all 25 tools and declared image support; zero model prompts and zero device tool calls. This does not prove desktop loading.
- Both installation completion links decode to the exact requested template text and contain only `action=start` and `prompt`. WorkBuddy 5.7.6's task link coordinator prepares a new task input. Actual link clicking in chat remains unverified: the browser security policy blocked the local test page.

No real device control was performed for this packaging release. Physical-device, full desktop chat, overseas-host and long-running acceptance gaps remain recorded in `release-readiness.json`; publish only as a prerelease.
