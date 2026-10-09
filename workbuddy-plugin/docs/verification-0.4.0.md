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


## 2026-10-09 public-testing refresh

This maintainer-requested replacement merges the complete local work with main `3d0f6d2d4799b48c885536dd7909789c96242b2c`. It retains WorkBuddy-model execution and adds standard/AI bundle discovery, standard-host preference, Node/npm mirror selection with official fallback, a verified optional video mirror, and the mandatory post-install WorkBuddy restart. Previous release assets and metadata were backed up and their GitHub SHA-256 digests verified before replacement.

Verified locally:

- 496 unit tests across 61 files passed; TypeScript build, independent package validation and release packaging passed.
- Production dependency audit reported zero vulnerabilities.
- Host-discovery and download-source fixtures passed, covering explicit AI selection, same-tier ambiguity, mirror fallback, checksum refusal and cache reuse.
- Curl-entry tests: 11 passed. Interactive handoff tests: 14 passed. Caller-directory access regression tests: 3 passed.
- Fresh and offline packed stdio startup discovered all 25 tools, isolated ADB and 17 read-only iOS simulators; no control session was opened.
- WorkBuddy 5.7.6 bundled headless ACP discovered 25 tools and declared image content, with zero model prompts and zero tool executions.
- The real installer with synthetic 5.5.3/5.7.6 hosts passed initial installation, cached idempotency, foreign-setting preservation and active-service upgrade refusal, both directly and through the streamed curl entry.
- Isolated previous/new/previous/new 0.4.0 package switching preserved foreign MCP settings and Hook configuration. Publication checks retained prerelease status and the unresolved stable-release gates.
- All eight release attachments and eight adjacent checksum files were verified together. Both HTML guide pairs and the stream entry's pinned installer/authorization hashes match.

This remains a prerelease. No new physical-device control or complete desktop trust/authorization acceptance is claimed. The restart instruction is based on the [local MCP reload comparison](mcp-config-reload-verification.zh-CN.md); a configuration-write receipt alone is not native host acceptance.
