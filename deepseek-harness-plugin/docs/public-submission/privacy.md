# OpenGUI Plugin Privacy Notice

OpenGUI controls Android devices attached to the user's own computer. The plugin does not provide an OpenGUI account, hosted control gateway, telemetry service, or advertising tracker.

Device discovery, ADB commands, session locks, and the read-only device wall run locally. Phone screenshots are returned to the active Codex or DeepSeek Harness conversation so the selected model can reason about the visible interface. The model provider and host product may retain that conversation under their own settings and policies.

The Skills-only CLI fallback writes observed JPEG screenshots to `~/.codex/opengui/observations` with user-only filesystem permissions. Users may delete that directory when the files are no longer needed. Local session identifiers, owned ADB-forward records, and pinned scrcpy files may also be stored under `~/.codex/opengui` to support cleanup and Unicode input.

OpenGUI never reads contacts, messages, files, or application data through a private Android API. It sees only screenshots and foreground-package metadata returned by ADB and performs only the documented allowlisted input actions. No credentials are required by OpenGUI itself.

Privacy questions may be filed through the public support channel documented in [support.md](./support.md).
