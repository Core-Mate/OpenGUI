# Device runtime

Shared build-time source for the standalone Codex and WorkBuddy packages. This is
not a separately installed service or npm package. Host runtimes retain their own
state, processes, configuration, versions and rollback boundaries.

Source: extracted from the two adapters at 737c6255c893a2c6a5779866f60f2bfee6efca3c.
Preserve LICENSE and VIDEO-NOTICE.md in consuming distributions.

The core may import Node built-ins and its own source only. Host resources,
codecs, model decisions and lifecycle events belong to the adapters. Device locks
are per instance, not a machine-wide guarantee across hosts.
