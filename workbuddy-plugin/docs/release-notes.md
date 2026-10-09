# OpenGUI for WorkBuddy 0.4.0 — refreshed public testing

This update replaces the earlier 0.4.0 public-testing assets. Download the current files and verify their adjacent SHA-256 checksums; previously downloaded files have different checksums.

- Execution now only follows the current WorkBuddy model. No online model catalog is read, and legacy model preferences no longer block task startup.
- Refreshed task home with OpenGUI login/registration copy, clearer device spacing, content-review options and a centered task/screen layout.
- One-command macOS installation, with a self-contained authorization guide and editable first-task examples.
- Recognizes WorkBuddy and WorkBuddy AI bundle identities; standard WorkBuddy is preferred when both are installed.
- Node/npm downloads default to npmmirror with official fallback and an explicit official-source option. Video archives support a separately verified mirror.
- Installation and authorization guides prominently require one complete WorkBuddy quit/reopen after installation.
- Task steps, takeover/resume, content review, history and PDF/Word/Markdown/evidence reports remain available.

Install with `curl -fsSL https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/install.sh | bash`, fully quit WorkBuddy with Command-Q and reopen it once, then complete both Skill and connector authorization. See the [installation instructions](https://github.com/Core-Mate/OpenGUI/blob/main/workbuddy-plugin/INSTALL.md). `OpenGUI-Install.command` and `installer.sh` are also provided for manual installation. Release attachments use ASCII filenames (`OpenGUI-Installation.html` and `OpenGUI-Authorization.html`) to avoid GitHub filename normalization; the guides and their embedded installer keep Chinese content and local filenames.

WorkBuddy may stay open during installation; fully quit and reopen it once afterward to load the new configuration. Finish active OpenGUI tasks before upgrading; if an old service blocks replacement, disable its MCP and wait for it to exit. The installer preserves unrelated settings and keeps backups. Configuration written alone is not native host acceptance.

SMS login and automatic registration use the official CoreMate account service at https://cm2backend.dmyh.tech. The account service receives login data and the session; task prompts and screenshots use WorkBuddy's normal model/tool loop. Local preview video is not uploaded frame by frame. `OPENGUI_ACCOUNT_SERVICE_URL` supports another account service.

An empty home waits for human Start in the current WorkBuddy turn. New tasks from an ended report must be initiated in WorkBuddy; the webpage cannot independently wake an ended conversation.

This remains a prerelease. Automated tests and isolated package/installer checks do not replace physical-device action, dual-device conflict, long-running video, overseas-host or complete business acceptance. Unresolved gates remain in `release-readiness.json`.
