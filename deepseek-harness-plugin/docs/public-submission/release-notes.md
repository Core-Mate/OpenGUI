# OpenGUI 0.1.8 Plugin Release Notes

- Stops now cancel OpenGUI while it prepares a model, waits for a phone, runs an action, or recovers from an error, including work that settles after cancellation.
- The workbench reports stop-request failures, while an accepted stop stays successful even if the follow-up status refresh is slow or unavailable.
- Detects a different DSH version on `PATH`, explains the compatibility boundary, and installs a stable `0.1.0-rc.7` runtime under the OpenGUI DSH home for the `web` profile.
- Preserves the existing DSH installation, workspaces, settings, credentials, phone authorizations, and unowned running processes.
- Tells users to quit an unowned DSH process and rerun the installer when that process prevents the compatible runtime from starting.
