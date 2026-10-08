# OpenGUI for WorkBuddy 0.4.0 — public testing

This release ships the newer WorkBuddy runtime that was previously available only in source/local candidates. Installer 1.0.2 still installs plugin 0.3.1; use the 0.4.0 files below to get these features.

- Editable task home opened with `@opengui`, account/model/device selection, and explicit start confirmation.
- A workbench with task steps, progress events, execution limits, human takeover/resume, and content review.
- Persistent task history and PDF, Word, Markdown, screenshot, and ZIP report export.
- Android device discovery, emulator preparation, connection diagnostics, and supported local iOS simulators.
- Installation completion chat includes Android USB debugging guidance and two editable WorkBuddy task-draft shortcuts; no automatic task submission.
- Direct download of `OpenGUI-Install.command` and `installer.sh`: verify both, keep them in one folder, make the launcher executable, then double-click it and press Return in Terminal. No installer ZIP extraction is needed.

The launcher, payload, connector, and runtime use version 0.4.0. Downloads are immutable and have adjacent SHA-256 files. See [installation instructions](https://github.com/Core-Mate/OpenGUI/blob/main/workbuddy-plugin/INSTALL.md) for pinned checksums and the WorkBuddy handoff.

Before upgrading, finish phone tasks, close their viewers, quit WorkBuddy as the launcher requests, and allow the old broker to exit. The installer retains backups, unrelated MCP/Hook settings, and prior packages. After replying “已安装完成”, verify the current receipt, host loading, and a native `opengui_list_devices` call; configuration written alone is not host acceptance.

Accounts and configured models use the official CoreMate service at https://cm2backend.dmyh.tech by default. Sign-in uses its existing account endpoints; task screenshots and prompts go to the selected execution model. Local video is not uploaded frame by frame. `OPENGUI_ACCOUNT_SERVICE_URL` supports self-hosting. Do not include credentials in reports.

This is a prerelease, not a stable or marketplace-approved release. Automated tests and isolated package/installer checks do not replace physical-device action, dual-device conflict, long-running video, overseas-host, or complete business acceptance. The unresolved gates remain in `release-readiness.json`.
