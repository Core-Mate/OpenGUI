# OpenGUI for WorkBuddy 0.4.2 — pinned installer and bilingual workbench

- The installation command, its installer and the authorization guide are now immutable assets of this release; nothing is downloaded from a branch. The connector Skill references the same versioned command.
- The workbench supports Chinese and English, follows WorkBuddy's display language by default and keeps task text, review drafts and recorded results in their original language.
- The emulator dropdown is replaced with a keyboard-accessible picker that adapts to narrow panels.
- `--edition cn|international` selects China or international WorkBuddy explicitly; international WorkBuddy AI defaults to official Node/npm sources.

Install with `curl -fsSL https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v0.4.2/install.sh | bash`, adding `--app` and `--download-source` for your edition as shown in [INSTALL.md](../INSTALL.md). Finish active tasks before upgrading, then fully quit and reopen WorkBuddy once and complete Skill/MCP authorization. Installation preserves unrelated settings and keeps backups.

This remains a public-testing prerelease. Automated checks do not replace the real WorkBuddy and physical-device acceptance gates in `release-readiness.json`.
