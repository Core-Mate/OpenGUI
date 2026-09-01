# OpenGUI 0.1.12 Plugin Release Notes

- The macOS installer now waits for an existing OpenGUI LaunchAgent to finish stopping before it registers the replacement, preventing an intermittent `Operation already in progress` failure during upgrades.
- Upgrades now quarantine stale plugin-local pnpm dependencies left by older installations, restore them if startup fails, and remove them only after the new runtime is ready.
- DSH support remains `0.1.0-rc.7`, `0.1.0-rc.8`, `0.1.1-rc.1`, and `0.1.1-rc.2`, with `0.1.1-rc.2` as the default.
