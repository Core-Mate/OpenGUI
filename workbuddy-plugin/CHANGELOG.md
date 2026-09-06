# OpenGUI for WorkBuddy 0.1.0

## 中文

- 首个独立的 WorkBuddy MCP + Skill 连接器，支持本机 Android 手机控制和最多四台手机的只读设备墙。
- 十一个工具覆盖默认持续投屏、设备发现、会话、截图、单步操作、状态、取消和关闭。
- 首次投屏验证通过后，最小化、遮挡和关窗不暂停手机任务；真机断线仍撤销观察凭据。
- 跨 MCP 进程共享 WorkBuddy 内部设备锁；断线只清理自己的会话。
- 操作绑定最新截图，限制重复无进展动作；发送、发布、购买、删除需要确认表单。
- 独立 GitHub 安装包、连接器 ZIP 和 SHA-256，不更改 DSH/Codex 生产插件。

## English

- First independent WorkBuddy MCP + Skill connector for local Android control and a read-only wall of up to four phones.
- Eleven tools cover default persistent mirroring, discovery, sessions, observation, single-step actions, status, cancellation, and closure.
- After initial display verification, minimization, occlusion and closure do not pause phone tasks; physical disconnection still invalidates observations.
- WorkBuddy processes share device leases; disconnection cleans only the owning connection's sessions.
- Actions require the latest observation, repeated no-progress actions are bounded, and classified consequential actions require confirmation forms.
- Independent GitHub runtime tarball, connector ZIP, and SHA-256 assets. DSH and Codex production plugins remain unchanged.

First installation requires network access. The selected WorkBuddy model must support tools and images. Do not automate the same physical phone concurrently from another host.
