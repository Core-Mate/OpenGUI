# OpenGUI for WorkBuddy 0.4.1 — MCP upgrade fix

- Upgrading an earlier OpenGUI HTTP installation now succeeds when its server matches the installation receipt. The public runtime uses stdio and removes the old HTTP URL and authorization headers.
- Unknown or edited opengui servers remain unchanged. Conflict errors provide backup and editing commands, with instructions to preserve the existing server under another name before retrying.

Install with `curl -fsSL https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/install.sh | bash`. Finish active tasks before upgrading, then fully quit and reopen WorkBuddy once and complete Skill/MCP authorization. Installation preserves unrelated settings and keeps backups.

This remains a public-testing prerelease. Automated checks do not replace the real WorkBuddy and physical-device acceptance gates in `release-readiness.json`.
