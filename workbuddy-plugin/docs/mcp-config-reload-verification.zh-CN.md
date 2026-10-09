# WorkBuddy MCP 配置刷新本机验证

验证日期：2026-10-09。环境：macOS，WorkBuddy 5.7.6，应用标识 `com.tencent.workbuddy.mac`。全程保持同一个 WorkBuddy 进程运行，没有重启，也没有创建或发送对话任务。

## 方法

使用 WorkBuddy 内置 MCP 编辑器显示的实际配置路径 `~/.workbuddy/mcp.json`。测试前自定义 `mcpServers` 为空；列表中的一个既有 MCP 来自插件。先备份原文件字节与权限，每次外部写入前比较文件摘要，防止覆盖同时发生的编辑。

临时条目使用 `command: /usr/bin/false`、`args: []` 和 `disabled: true`。没有点击信任或启用，没有启动临时 MCP，也没有向其授予访问权限。

## 结果

| 操作 | 文件结果 | 运行中的 MCP 列表 |
| --- | --- | --- |
| 外部原地写入第一个临时条目 | inode 不变；内置编辑器能读到新内容 | 未出现临时条目；返回列表仍未出现 |
| 写临时文件，再原子替换 `mcp.json` | inode 改变；配置内容已替换 | 未出现临时条目；关闭并重新打开管理面板仍未出现 |
| 在 WorkBuddy 内置编辑器中给同一配置添加空行，点击保存 | 显示“配置保存成功”；文件字节核对一致 | 立即出现临时条目，状态为禁用、待信任 |
| 在已有临时条目加载后，再次外部原地写入另一个条目 | inode 不变；文件已更新 | 约一分钟后的观察仍显示原条目，未切换到新条目 |
| 在内置编辑器保存测试前的原内容 | 原文件字节和权限均核对一致 | 临时条目消失，既有插件 MCP 保留 |

## 判断与安装指引

本次测试没有证据表明外部原地保存比原子替换更容易触发刷新。两种外部写入方式都没有更新 MCP 列表，而 WorkBuddy 内置编辑器的保存操作有效。

只读检查本机应用包可见：`UserMcpProvider.readConfiguration()` 直接读取文件；`collect()` 返回内存快照；`replaceConfiguration()` 会主动提交新快照并写文件。因此，“编辑器能看到新配置”和“运行中的 MCP 已重新加载”是两个不同状态。应用内保存包含主动更新快照的行为，不能等同于外部编辑器保存文件。

安装后条目缺失时，可先打开“专家·技能·连接器 → 连接器 → 自定义连接器 → 添加 MCP”，检查编辑器里的配置路径和 `opengui` 条目，添加空行使保存按钮可用，再保存并返回列表。随后按提示完成信任确认。若编辑器没有 `opengui`，先排查配置路径或安装结果；若保存后仍未加载，再在任务结束后正常退出并重开 WorkBuddy。

此测试验证的是配置发现与列表刷新，未验证 OpenGUI 服务连接、工具调用或进行中会话的工具列表更新。结果限定于本机这个 WorkBuddy 5.7.6 构建，不能据此保证其他版本或发行渠道采用相同机制。

## 保存按钮的内部调用链

随后对同一本机应用包进行了只读检查，定位到前端 `renderer/assets/skills-panel-CHvDTK8-.js`、共享前端核心 `renderer/assets/ui-docs-viewer-Dd1SFfvf.js` 和后台 `main/server.js`。以下为调用关系摘要，没有复制应用实现代码，也没有调用内部接口。

1. 保存按钮先解析、清理和验证 JSON，然后调用前端应用核心的 `mcp.saveConfiguration(content)`。
2. 后台 MCP 门面把文本包装为 `{ content }`，交给 `McpManager.saveConfiguration()`，再调用 `UserMcpProvider.replaceConfiguration()`。
3. Provider 在串行操作队列中准备配置，保留旧快照，先通过 `commit()` 更新 `lastGoodServers` 和 `lastGood`，并调用 `notify()`。随后写入 `mcp.json`；写入失败时重新提交旧快照。
4. `McpManager.register()` 已订阅 Provider 的变更通知，因此 `notify()` 会触发 `recompute()`。管理器重新合并各配置来源，按连接配置指纹决定复用、创建或停止连接控制器；禁用和未信任的条目不会建立控制器。
5. 后台生命周期队列完成连接状态协调、路由同步和变更通知，并安排新控制器的探测。运行状态变更通过 `wb.mcp.changed` 事件传播；前端 MCP 面板订阅该事件并强制重新查询服务列表。保存成功的前端回调也会触发列表重读。
6. 配置目录变化还会通知会话运行时更新配置。应用包中可见两条会话路径：活动 Conversation 的 `refreshLiveRuntimeConfigs()`，以及 SessionManager 的 `refreshMcpConfig()`。后者会标记待刷新配置，在会话空闲时处理，避免在进行中的 prompt 内切换；可能重建会话后台，而非重启整个 WorkBuddy。此次未创建会话，因而这一部分仅为代码检查结果。

另有独立刷新方法：前端应用核心 `mcp.refresh()` → `McpManager.refresh()` → `UserMcpProvider.refreshFromDisk()` → 读取 `mcp.json` → `commit()`。旧 IPC 注册表中也存在 `mcp:refresh` 通道，处理器会转发到同一管理器。它从文件读取后走上述通知与重算流程，不需要修改文件内容。

这些是应用内部接口。此次没有确认官方公开的命令行或外部刷新协议，也没有验证安装器在应用进程外调用这些接口的可行性。不能仅凭发现方法名，就把它当作稳定、可发布的安装器集成方式。

## 进程外调用试验

同日继续对正在运行的 WorkBuddy 5.7.6 进行了真实连接测试。使用 `~/.workbuddy/wbipc/endpoint.json` 中的本机连接描述，按应用实现中的握手协议验证服务端证明并完成客户端鉴权。凭据仅用于本机握手，没有输出、写入报告或发送到远端。

| 实际请求 | 实际返回 | 判断 |
| --- | --- | --- |
| 本机 WBIPC 握手 | 握手成功；可见管道为 `wb.entitlement` 和 `wb.request` | 连接与鉴权有效 |
| `broker/GetPipe`，管道名 `mcp` | `E_PIPE_UNKNOWN`：`unknown pipe: mcp` | 没有暴露该管道 |
| `broker/GetPipe`，管道名 `wb.mcp` | `E_PIPE_UNKNOWN`：`unknown pipe: wb.mcp` | 没有暴露该管道 |
| 直接发送方法名 `mcp:refresh` | `E_BAD_REQUEST`：`malformed method: mcp:refresh` | 桌面内部通道不能直接当作 WBIPC 方法使用 |

应用包代码表明：常规桌面后台 RPC 通过父子进程的标准输入/输出和桌面桥接转发；前述本机 WBIPC 是另一套接口，已注册的管道分别用于订阅检查和服务端 HTTP 请求代理。内部存在 `mcp:refresh` 处理器，不代表这套进程外管道会转发它。只读检查还确认本机 HTTP 探测端口仅提供 `/workbuddy/probe`，没有 MCP 刷新路由。

同时尝试了应用内开发工具快捷键，并检查查看、帮助菜单；此发行构建没有提供可用的开发工具入口。没有开启调试模式、改写应用包、重启应用或对运行进程注入代码。

结论：本次确实尝试了进程外调用，但没有成功到达 MCP 刷新处理器，因此不能验证刷新方法执行后的效果，也不能把这条路径作为安装器免重启方案。此前通过 WorkBuddy 内置编辑器保存触发刷新的实测结果仍有效。由于候选入口已拒绝请求，本次无需写入临时 MCP；结束时核对 `mcp.json` 仍与上次恢复后的原文件字节一致。
