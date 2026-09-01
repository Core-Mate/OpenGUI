# OpenGUI 0.1.11 Plugin Release Notes

- OpenGUI now supports DSH `0.1.0-rc.7`, `0.1.0-rc.8`, `0.1.1-rc.1`, and `0.1.1-rc.2`, with `0.1.1-rc.2` as the default; `0.1.2-alpha.4` remains unsupported.
- The macOS installer can select any supported DSH version, keeps each managed runtime isolated, and falls back only to an existing compatible runtime when the default download fails.
- The OpenGUI header now identifies unsupported or unknown DSH Host versions and shows the supported version list without reporting a model or device error.
