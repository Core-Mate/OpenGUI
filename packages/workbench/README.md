# Phone workbench

`src/page.ts` defines the shared workbench shell, `src/styles.ts` carries the V6
visual tokens and responsive layouts, and `src/script.ts` binds the real task API. Codex and
WorkBuddy open it in their browser panels; DSH embeds it in its native panel through
an explicit loopback frame-ancestor grant. State, task actions and screenshots come
from the same local PhoneRuntime. There is no simulated execution path in this UI.

The browser fixture uses a synthetic H.264 stream and a controlled executor to test
submission, actual decoding, steering, stopping, history, page closure and narrow
layout. Run `pnpm test:workbench` in `plugins/opengui`; this does not replace physical
phone or installed-host acceptance.

## V6 page contract

- Home: one task draft, automatic branch planning and phone assignment, device summary,
  task examples that only populate the draft, and recent tasks.
- Devices: authorization and connection states, opt-in real live previews, enlarged
  viewing, and a shortcut to create a task on the selected phone.
- Tasks: all/active/ended filters, current state and origin, durable detail links.
- Task detail: visible video, sticky stop control, instructions, action journal,
  success criteria, real screenshot evidence, export, and reuse as a new draft.
- Settings: current host execution mode and local connection guidance,
  local runtime semantics, and connection guidance.
- Guide: install, configure, connect, authorize, observe, submit, stop, inspect results.

The production UI deliberately excludes the prototype's simulated devices,
step-advance buttons and fake results. The current accepted contract uses the
host model for real planning and screenshot decisions. Each execution branch remains bound to one phone. A durable parent goal owns
planning, business clarification, assignment, collective stop and result aggregation.
New tasks use host decisions; production does not expose user model configuration. The task text itself
is the completion criterion; the runtime still requires terminal evidence.

Dynamic values use DOM text nodes. Evidence images remain same-origin. Exports
contain task results and evidence metadata, never model credentials or viewer URLs.
Navigation preserves the composer DOM and its draft; polling does not replace it.

Drafts are stored in the current host runtime, including across page reopening.
A branch waiting for human login remains on its original phone. The user can
continue or stop; continuation invalidates the old observation and requires a
fresh one. The other independent branches continue while it waits.
