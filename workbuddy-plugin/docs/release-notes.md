# WorkBuddy 0.3.1 candidate

Adds live installation for WorkBuddy 5.5.6 and newer. The host may stay open while the verified installer atomically writes the MCP, Skill, and Hook configuration. WorkBuddy watches the MCP file; the user reviews the external Hook change in `/hooks` and confirms the Skill in `/skills`. Older compatible hosts retain the Command-Q fallback.

Upgrades still stop if an old OpenGUI broker owns tasks or persistent displays. Finish those tasks, close their viewers or mirrors, disable the old OpenGUI MCP, and retry after the broker exits. The installer does not kill WorkBuddy or phone processes. Existing observation safety, host isolation, rollback receipts, and protocol 8 remain unchanged.

This is a public-testing candidate. Stable publication still requires the gates in `release-readiness.json`.
