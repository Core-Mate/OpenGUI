# Provenance and runtime boundary

The Android command validation, execution queue, device discovery, owned-forward inventory, safe ZIP extraction, scrcpy clipboard transport, session API, and associated baseline tests were ported from the public OpenGUI repository at commit `674e35893219f47b03508ba58b84a13e57f31c57` (DSH release v0.1.13).

These are independent copies under the accompanying OpenGUI license. This package does not import, build, install, upgrade, reconfigure, or share state with the DSH or Codex plugins. Changes here do not patch those production packages. The native DSH UI, browser agent, host commands, model routing, and Codex installer/daemon are not included. The WorkBuddy broker, MCP adapter, device-wall access checks, packaging, and lifecycle fixes are maintained here separately.

Android Platform Tools binaries and their upstream notices are in `assets/platform-tools/`. `MANIFEST.md` records their fixed version and SHA-256 hashes. The scrcpy 4.1 archives are downloaded only on first Unicode input from the official Genymobile GitHub release, checked against fixed byte counts and SHA-256 hashes, and cached privately. No DSH/Codex cache is inspected or migrated. scrcpy is licensed under Apache-2.0; its upstream license and notices remain in the downloaded archive.

The MCP SDK, sharp, Ajv, tar, and yauzl are installed as version-pinned npm dependencies, with a committed lockfile for development and CI. This is GitHub tarball distribution, not an npm publication.
