# Phone agent

Shared build-time source for independently installed macOS host runtimes. No npm
service, private repository or shared daemon is required. Host adapters provide
raw phone hardware and host lifecycle adapters. Production uses HostExecutor; the
Pi/BYOK adapter remains deferred and is not selected by production factories.

- `host.ts`: four public task tools, host next/decide transport and daemon lifetime.
- `host-executor.ts`: owner-bound decision mailbox with real screenshots, replay
  protection and fresh-observation recovery. It never calls a model API.
- `goals.ts`: durable parent goals, automatic branch assignment, business clarification,
  collective stop/steer and evidence-based child result aggregation.
- `planner.ts`: Pi planning with validated independent branches and authorized devices;
  planning tools cannot operate phones.
- `runtime.ts`: idempotent admission, per-phone scheduling (four devices maximum),
  first-frame gate, frozen model, evidence and explicit stop/steer/resume.
  User-help waits retain the assigned phone and require a fresh observation after resume.
- `executor.ts`: restricted phone tools registered with Pi; no custom model loop.
- `store.ts`: versioned append-only local journal, interruption recovery without replay.
- `credentials.ts`: macOS Keychain references; credentials do not enter journals.
- `confirmation.ts`: existing one-action consequential-operation confirmation.
- `workbench.ts`: authenticated loopback UI/API using the common workbench page,
  with a durable host-local draft.

The standard entry accepts a goal and request ID. The host model plans
independent branches and the runtime assigns devices; users do not select or
configure an execution model. Model configuration writes are rejected in host mode.
A parent succeeds only when every branch succeeds. Interrupted work remains in
history as unknown and is never automatically replayed.

Tests run through `plugins/opengui`: `pnpm check`, `pnpm test:workbench` and
`pnpm test:viewer`. Each host also builds this source in its own production package.
See [candidate evidence and limits](../../docs/plans/2026-09-19-phone-agent-workbench.md).
