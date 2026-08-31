# OpenGUI 0.1.7 Plugin Release Notes

- Adds a Codex plugin manifest, repo marketplace entry, and `opengui:control` Skill beside the existing DeepSeek Harness plugin.
- Adds seven local stdio MCP interfaces and the equivalent persistent local CLI transport.
- Shares one phone execution controller across DSH, MCP, and CLI for observation freshness, action allowlisting, screenshot bounds, per-device serialization, repeated-no-progress detection, and 100-operation limits.
- Adds a loopback-only read-only device wall and explicit confirmation for send, publish, purchase, and delete actions.
- Keeps the public directory package Skills-only; no hosted device gateway, account, relay, or extra model credential is introduced.
