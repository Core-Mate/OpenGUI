# Public Label Policy

OpenGUI uses a small public label set so contributors can quickly understand why an issue or pull request exists and where help is useful.

Use labels as a lightweight classification aid, not as a full project-management system. Most issues and pull requests should have one primary label. Add a second label only when it helps outside contributors decide whether they can participate.

## Public labels

| Label | Use when |
| --- | --- |
| `bug` | Something in the released or documented behavior is broken, regressed, crashing, or producing incorrect results. Include reproduction steps or the observed failure when possible. |
| `enhancement` | The issue or pull request proposes a new capability, user-visible improvement, API addition, workflow improvement, or meaningful behavior change. |
| `documentation` | The work changes docs, examples, onboarding material, comments intended for contributors, README content, or public guidance without changing runtime behavior. |
| `test` | The main purpose is adding, fixing, or improving automated tests, test fixtures, CI coverage, or validation around existing behavior. |
| `security` | The report or change concerns vulnerability handling, unsafe defaults, credential exposure, authorization, data leakage, or other security-sensitive behavior. Do not include exploit details in public issues when responsible disclosure is needed; follow [`SECURITY.md`](../SECURITY.md). |
| `good first issue` | The task is small, well-scoped, has clear acceptance criteria, and can be completed without deep knowledge of the OpenGUI architecture. Prefer this label for issues that are suitable for a first external contribution. |
| `help wanted` | Maintainers would welcome outside help, design input, reproduction details, platform testing, documentation review, or implementation support. Use this only when the issue has enough context for someone new to make progress. |

## Combining labels

- Prefer one classification label: `bug`, `enhancement`, `documentation`, `test`, or `security`.
- Add `good first issue` only when the scope is intentionally beginner-friendly.
- Add `help wanted` only when the repository is ready to accept outside contributions on that item.
- For documentation about tests, use `documentation` if the artifact is docs-only; use `test` if the main change is test infrastructure or coverage.
- For security reports, use `security` carefully and avoid public details that would make users less safe before a fix is available.

## Labels to avoid publicly

Avoid labels that expose internal planning mechanics or make the public tracker look like a private project board, including:

- sprint, milestone, roadmap, quarter, or release-train labels that are only meaningful to maintainers
- priority labels such as `P0`, `P1`, or `urgent` unless the project has committed to maintaining that public process
- team, owner, component, or internal queue labels that require private context to interpret
- workflow labels such as `blocked`, `in progress`, `needs sync`, or `waiting on internal review`

Use GitHub Projects, milestones, assignees, or maintainer-only notes for internal planning instead. Public labels should stay understandable to someone seeing the repository for the first time.
