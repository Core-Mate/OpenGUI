# OpenGUI 0.1.13 Plugin Release Notes

- The macOS installer now detects the versioned credential store written by DSH `0.1.1` RCs and refuses an incompatible downgrade to DSH `0.1.0-rc.7` or `0.1.0-rc.8` before changing any files.
- Documentation now distinguishes plugin API compatibility from DSH user-state compatibility and recommends a separate DSH home when an older RC must be retained.
- Restart-safe LaunchAgent replacement and stale plugin dependency recovery from OpenGUI `0.1.12` remain enabled.
