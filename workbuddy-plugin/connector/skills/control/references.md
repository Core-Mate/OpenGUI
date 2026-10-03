# Detailed interfaces and installation

The default display is opengui_open_viewer → present_files → opengui_viewer_status. It is real video, not the legacy screenshot wall. Video failure before first readiness blocks control; subsequent video failure affects watching only.

## Compatibility tools

Use `opengui_start`, `opengui_open_mirror`, `opengui_close_mirror`, `opengui_resume_mirror` only for an explicit request for a separate native scrcpy window. These are not the normal task display path. Native window readiness cannot authorize browser-first control.

## Allowed actions

| Action | Additional parameters |
| --- | --- |
| `tap` | `targetBBox: {left, top, right, bottom}` tightly enclosing the visible target |
| `swipe` | `x1`, `y1`, `x2`, `y2`; optional `durationMs` from 50 to 2000 |
| `text` | `text`, 1–500 characters; Unicode uses the verified scrcpy clipboard transport |
| `key` | `key`: `Back`, `Home`, `Enter`, or `AppSwitch` |
| `launch` | `packageName`, a known Android package such as `com.android.settings` |
| `wait` | `waitMs`, 100–10000 |

## Recovery without human relay

- Read structured errors: `code`, `executionState`, `recovery`. `not_executed` means no phone action was sent; fix invalid parameters or observe again. `outcome_unknown` means an action may already have happened: inspect current state before deciding, never replay it automatically.
- For `screen_changed` or `observation_required`, obtain and read a new `opengui_observe` image; discard old coordinates and IDs. A newer ID is still only useful after you read its image.
- A lost MCP/broker connection revokes old control ownership. The next independent call can reconnect. Open a NEW control session for the same frozen device selection, then observe. Preserve the task goal and budget. Do not restore old control authority with a mirror token.
- Wait at most thirty seconds for the same physical phone to return or a conflicting lock to clear. Do not silently substitute another phone or forcibly unlock another task. If it remains unavailable, finish as blocked with the exact reason.
- Connection, discovery and screenshot transient failures have at most two internal retries. Do not stack unbounded model retries on them. Three unchanged repeated actions require replanning; each device has one hundred observe/action operations per logical task across control-session recovery.
- Native Hooks can continue unfinished work for at most ten rounds and clean up on final stop. They never execute phone actions or bypass host policy. If `automation.available` is false, explicitly report that automatic continuation is unavailable; do not pretend Hooks ran.
- Honor a user stop immediately. Never use a Hook continuation, new session or changed parameters to evade cancellation, budgets, a genuine host restriction or an unresolved task-scope ambiguity.

## Host-driven phone tasks (macOS candidate)

The host model owns planning and screenshot decisions. No model endpoint or credential is configured in this mode. Submit `opengui_run_task` with a stable requestId and goal; omit deviceId unless it was freshly resolved in the current runtime and an explicit device constraint requires it. Never reuse cached device IDs across plugin upgrades.

Open the returned workbenchUrl. Repeatedly call `opengui_manage_task` with action `next`, then answer its decision ID with action `decide` and a decision object. Planning returns independent branches with current eligibleDeviceIds. Execution returns `observe`, `act`, `help` or `finish`; the mailbox includes action and completion contracts. Screenshots arrive as image content (or a Codex imagePath); inspect them before deciding. A rejected/unknown action requires a fresh observation and reassessment, never automatic replay. User help waits resume through `resume` or `steer`.

The homepage can submit work for the active host to claim. It does not independently wake an ended host turn. Keep the host working until all branches finish or require the user. Closing a page is not a stop, but host termination can interrupt work. Explicit stop waits for cleanup. Do not mix legacy actions with a host-driven task. Missing host model usage/cost remains unknown.

Use `opengui_list_tasks` to inspect durable task history and actual terminal status; an empty decision mailbox is not completion.
