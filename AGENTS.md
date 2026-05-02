# AGENTS.md

`CLAUDE.md` is the single source of truth for AI collaboration rules in this repository.

All agents should read the root `CLAUDE.md` before starting work.

Rules:

- Repository-level architecture notes, public-release boundaries, allowed change scope, and validation requirements are defined by `CLAUDE.md`.
- If `README`, old comments, historical docs, or this file conflict with `CLAUDE.md`, follow `CLAUDE.md`.
- If a subdirectory adds its own `CLAUDE.md` later, it may only add implementation details for that subtree; repository-level rules still come from the root `CLAUDE.md`.
- For source-available public-release work, keep code comments, KDoc/JSDoc, and test `describe` / `it` names in English.
- Chinese and other localized text may remain in localized docs, user-visible product copy, real-app UI matching strings, mock/sample data, and other runtime content where the language is part of the behavior.
