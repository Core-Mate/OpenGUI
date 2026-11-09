# OpenGUI 开放平台提交前草稿

更新日期：2026-10-15。本次仅更新连接器介绍和两条推荐提问，停在最终提交之前；没有重新安装、授权连接器或操作手机。

## 平台资料

| 字段 | 草稿内容 |
| --- | --- |
| 业务类型 | 连接器，MCP + Skill，本地 stdio |
| 展示名称 | OpenGUI 手机助手 |
| 英文名称 | OpenGUI Android Assistant |
| source | opengui |
| 连接器 ID | oc_56c9daceb0e362fa |
| 本次提交前资料包版本 | 0.4.3 |
| MCP 运行时 / Skill 版本 | 0.4.0 |
| 最低 WorkBuddy 版本 | 5.5.3 |
| 服务类目 | 工具 - 设备管理 |
| 图标 | 仓库现有 icon.svg，平台已解析 |

[打开当前提交前草稿](https://open.workbuddy.cn/connector/publish/oc_56c9daceb0e362fa?action=create&step=3)。查看页面不代表提交审核。

### 中文介绍

自动操作你的手机，处理日常事务、测试 App、运营、聊天……说出你的需求，它来动手。 首次安装并授权后，即插即用。把繁琐操作交给 AI，把时间留给自己，释放你的想象力。

### 英文介绍

Automate your phone for everyday tasks, app testing, content operations, chat and more. Say what you need, and let it take action. After initial setup and authorization, just plug in your phone and go. Leave repetitive tasks to AI, take back your time, and unleash your imagination.

### 使用示例

1. `/opengui 在小红书App中搜索“美食”，帮我获取前3篇贴子的内容整理给我。`
2. `/opengui 帮我打开微信App，查看有哪些未读的好友或群消息，告诉我好友/群的名字和未读条数。`

中英文各两条示例均已打入 ZIP，内容见[通用元信息](../connector/connector-meta.json)。本轮仅修改示例文字，没有执行示例中的手机任务。

## 能力配置和版本区别

- 只配置一个 `opengui` MCP Server，stdio + npx，Node 要求为 `^22.19.0 || >=24`，连接超时 120 秒。
- MCP 引用已发布的 `opengui-workbuddy-v0.4.0/opengui-mcp-0.4.0.tgz`。本轮已确认该公开下载地址可达。
- ZIP 包含元信息、图标、MCP 配置、控制 Skill、工具参考和安装 / 授权指南。
- 本地完整安装仍需要 Node、ADB、scrcpy 和宿主 Hook；当前支持范围为 macOS。介绍保留“首次安装并授权后”的前提，完整的环境要求、USB 调试和账号 / 数据处理说明仍保留在安装指南及插件 README 中。市场安装是否自动覆盖全部依赖与 Hook 仍需验收。

平台要求更新资料包时版本递增。本轮包内连接器版本为 `0.4.3`；源码元信息、MCP 运行时、安装器和 Skill 仍为 `0.4.0`，没有发布新的运行时。提交用 ZIP 的元信息除平台版本号外与当前源码一致，其余条目逐项与 `connector/` 源文件核对一致。

2026-10-15 当前 Chrome 选中的连接器 ID 为 `oc_56c9daceb0e362fa`，本轮沿用该资产更新。连接器列表仍显示原 `0.4.1` 草稿；不能把上传和提交前预览等同于新版已持久保存、送审或发布。请保留提交前页面和本地 ZIP，离开后如恢复旧内容，需重新上传对应资料包。

提交用 ZIP 位于 `workbuddy-plugin/dist/opengui-workbuddy-connector-open-platform-0.4.3.zip`，大小 12,686,001 字节，SHA-256：

```text
fb8f386eba1deb7c3a3a11cc934e5f43cb1956fe2883e701b9b4a4407a5a0c01
```

包及相邻 `.sha256` 保存在本地忽略的 `dist/` 中，没有上传 GitHub Release。

## 已完成的验证

| 验证 | 结果及范围 |
| --- | --- |
| 本机卸载核对（2026-10-14） | 当时核对 WorkBuddy 用户配置无 OpenGUI MCP、Skill、Hook、连接器记录或相关运行进程；旧卸载备份保留。本轮没有重新安装。 |
| 企业认证 | 平台显示认证完成；未修改认证信息。 |
| 插件测试 / 构建（2026-10-14） | `npm run pack:release`：61 个文件、496 项测试通过，TypeScript 构建、包校验、打包通过。 |
| 文案更新后的校验（2026-10-15） | `node scripts/validate.mjs` 通过；ZIP 完整性、介绍精确匹配、两条中英文示例和其他源文件条目一致性检查通过。 |
| 原生宿主协议（2026-10-14） | WorkBuddy 5.7.7 隔离 ACP 识别全部 25 个工具，声明图像支持；零工具执行、零模型提示词，没有注册到用户桌面配置。 |
| 平台资料包 | ZIP 完整性通过；仅元信息版本区别，其他条目与通用包一致；小于平台 20 MB 限制；平台解析及必填类目校验通过。 |
| 页面状态（2026-10-15） | 已在当前连接器的“提交审核”确认页核对 `0.4.3`、新介绍和两条示例；最后的“提交”按钮未点击。此处为当前页面暂存预览，不代表列表草稿已更新或送审。 |

## 送审前仍需完成或确认

1. **草稿原生安装调试。** 当前连接器配置流程只展示资料预览，没有可见的测试环境安装入口。需要平台提供草稿测试方法，确认实际桌面安装、工具调用、首帧展示和卸载流程。
2. **Hook 与本地依赖契约。** 原安装器写入七个宿主 Hook；连接器公开规范未说明这些 Hook 是否会随市场安装自动注册。需确认安装、停止、恢复和结束清理行为，不应以工具目录可发现替代验证。
3. **真机完整流程。** 本轮没有进行真实手机控制、中文输入、人工接管、恢复、报告导出及长时运行验收。[现有 release-readiness.json](../release-readiness.json)中的未验收项保留。

无需为了创建此连接器提供新的 WorkBuddy OAuth clientId / clientSecret。若后续需要短信登录、USB 调试授权或桌面信任，应由用户在对应界面完成，不能把这些凭据写进包或聊天。

官方接入依据及本轮平台更新规则见[接入核对](open-platform-onboarding-research.zh-CN.md)。本轮准备完成不等于完整接入或真机验收完成，下一步先由用户检查资料，再决定后续调试与送审。
