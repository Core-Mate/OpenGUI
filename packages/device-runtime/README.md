# Device runtime

Shared build-time source for the Codex, WorkBuddy and DSH packages. This is
not a separately installed service or npm package. Host runtimes retain their own
state, processes, configuration, versions and rollback boundaries.

Source: extracted from the two adapters at 737c6255c893a2c6a5779866f60f2bfee6efca3c.
Preserve LICENSE and VIDEO-NOTICE.md in consuming distributions.

The core may import Node built-ins and its own source only. Host resources,
codecs and host lifecycle events belong to the adapters. The autonomous model loop
lives in `../phone-agent`. `device-lease.ts` supplies a conservative machine-local
admission lock used by autonomous and legacy control paths; only lease ownership
metadata is shared. Crashed-owner locks require verified cleanup, never timed theft.
