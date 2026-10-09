# OpenGUI 开关位置 / Enablement screenshots

HTML 安装指南会在步骤2展示 MCP 信任提示和下方图片；完成后再回复“已安装完成”，让助手验证连接。下方动图帮助定位开关。Skill 与 MCP 是两个独立开关；Skill 只在需要时手动开启。已经开启且状态为绿色的 MCP 保持不变，不要再次点击关闭。

The installation chat shows MCP trust instructions and the image below in step 2, before the completion reply and native verification. Use the animation below to locate the controls. Skill and MCP switches are separate; manual Skill enablement is needed only when indicated. Leave an already-enabled MCP with a green status dot on.

下方使用原始“Skill和MCP授权.gif”，连续演示两项授权。不同版本的文字或布局可能略有差异。不要替换成旧的全屏截图；保留 GIF 动画和图片原始宽高比。

Use the original combined Skill and MCP authorization GIF below at its intrinsic aspect ratio. Preserve animation; do not substitute old full-window screenshots. Labels may vary by version.

安装时可以保持 WorkBuddy 打开。只有配置写入完成后仍找不到 OpenGUI 或新配置未生效，才先结束其他任务，用 ⌘Q 退出并重新打开 WorkBuddy，再继续授权和信任。只打开新的聊天不一定会刷新 MCP 服务列表。

Keep WorkBuddy open during installation. Quit and reopen it only if OpenGUI is missing or the new configuration has not taken effect afterward. A new conversation alone may not refresh the server catalog.

## Skill：技能卡片右上角

从左侧 **专家·技能·连接器 → 技能 → 已安装** 进入，找到 `opengui`。把 **卡片右上角的开关**打开。下面的 GIF 演示操作；若你的开关已经为绿色，保持不变。

Go to **Experts · Skills · Connectors → Skills → Installed**. Turn on the switch at the **top-right of the `opengui` card**. The original GIF demonstrates the operation; leave an already-green switch on.

![Skill 和 MCP 授权](../resources/Skill和MCP授权.gif)

如果搜索后只显示“已安装”勾选标记，请清空搜索框，回到已安装技能列表查看开关。“已安装”不等于“已启用”。

If searching replaces the switch with an installed checkmark, clear the search field to see the switch in the installed-skills list. Installed does not necessarily mean enabled.

## MCP：连接器管理中该行最右侧

从左侧 **专家·技能·连接器 → 连接器** 进入，点击页面**右上角的「自定义连接器」**。

Go to **Experts · Skills · Connectors → Connectors**, then click **Custom connector** at the top-right.

在「MCP 服务管理」中找到 `opengui`。如果提示“首次连接此 MCP 服务需要您的信任确认”，点击**信任**并完成原生授权提示，再确认**这一行最右侧的开关**已打开，等待名称旁的状态点变绿。上方动图包含首次连接的「信任」操作。

In **MCP service management**, complete **Trust** if the row shows a first-use trust prompt, then confirm the **far-right switch for `opengui`** is on and wait for its status dot to turn green.


“14/14 个工具已启用”是工具级别的设置，不能代替右侧服务总开关；工具数量也可能随版本变化。如果开关已开、状态仍不是绿色，请把实际状态告诉安装助手，无需反复开关或重新安装。

The tool count does not replace the server switch and may vary by version. If the switch is on but the connection indicator is not green, report that state to the assistant rather than repeatedly toggling or reinstalling.

完成后返回安装对话，让助手重新发现并调用 `opengui_list_devices` 验证。这个检查只列出设备，不操作手机。

Return to the installation conversation so the assistant can rediscover and call `opengui_list_devices`. This check lists devices without operating them.
