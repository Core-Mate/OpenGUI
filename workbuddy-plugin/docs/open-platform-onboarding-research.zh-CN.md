# WorkBuddy 开放平台连接器接入核对

核对日期：2026-10-14。本文依据腾讯官方公开文档、当前仓库源码，以及本次协作中的平台页面和隔离测试记录。公开规范、页面实测和待确认事项分别说明；本次目标是准备、配置并验证草稿，停在提交审核之前。

## 接入方向

OpenGUI 已有本地 MCP 服务和配套 Skill，可以沿用开放平台的连接器路线。官方允许本地进程使用 stdio，不要求全部连接器改成远程服务。[连接器规范](https://open.workbuddy.cn/docs/connector)

第三方应用接入用于外部应用取得用户授权后调用 WorkBuddy Open API，例如向本地助理发消息或管理云端任务；它与 WorkBuddy 调用 OpenGUI 的连接器方向不同。仅注册当前 MCP 连接器，不需要因此创建第三方应用的 `client_id` / `client_secret`。[第三方应用接入](https://open.workbuddy.cn/docs/third-party-app)

现有[插件安装参考](workbuddy-plugin-installation-references.zh-CN.md)讨论第三方 GitHub 插件市场，本文只补充开放平台注册与审核的官方约束，不将社区安装说明作为平台规范。

## 官方已说明的要求

| 项目 | 要求与依据 |
| --- | --- |
| 入驻 | 先完成个人或企业认证，再创建资产、配置、测试和送审。[总览](https://open.workbuddy.cn/docs/what-is-open-platform)、[认证说明](https://open.workbuddy.cn/docs/onboarding) |
| 连接器包 | MCP 方案包含 `connector-meta.json`、`mcp.json`、图标；可包含 `skills/<skill-name>/SKILL.md`。只配置一个 MCP Server。[连接器规范](https://open.workbuddy.cn/docs/connector) |
| 传输与运行时 | 本地 stdio；远程 HTTPS SSE 或 streamableHttp。`runtime`、`staticEnv` 等字段从 5.0.0 支持，最低客户端版本须覆盖所用能力。[连接器规范](https://open.workbuddy.cn/docs/connector) |
| 元信息 | 名称、说明和示例需中英文完整；`source` 为全局唯一的小写字母、数字、连字符标识；更新版本号建议递增。[连接器规范](https://open.workbuddy.cn/docs/connector) |
| Skill | `SKILL.md` 使用 YAML frontmatter 与 Markdown 正文；必填说明、中英文说明、版本和作者。辅助参考、脚本、模板可另放目录。[技能规范](https://open.workbuddy.cn/docs/skill) |
| 安全与异常 | 不硬编码真实凭证，申请最小权限，覆盖超时、授权失效和参数错误；单次响应建议控制在 30 秒内。[连接器规范](https://open.workbuddy.cn/docs/connector) |
| 市场发布 | 连接器目录打包送审，通过后进入市场，后续更新重新送审。[连接器规范](https://open.workbuddy.cn/docs/connector) |

图标建议使用 SVG，位图建议 64×64，透明背景、小尺寸可辨识。官方说明字符长度和超时属于建议值，不能据此自行推断平台上传器的硬限制。[连接器规范](https://open.workbuddy.cn/docs/connector)

## 当前仓库的对应情况

- [连接器目录](../connector/connector-meta.json)、[MCP 配置](../connector/mcp.json)、[图标](../connector/icon.svg)和[Skill](../connector/skills/control/SKILL.md)已经存在；当前版本为 `0.4.0`，`source` 为 `opengui`，最低 WorkBuddy 版本为 `5.5.3`。MCP 使用一个 stdio Server，声明 Node 运行时并引用固定版本 GitHub Release TGZ。
- [打包脚本](../scripts/package.mjs)生成 `opengui-workbuddy-connector-0.4.0.zip` 和 MCP TGZ；ZIP 内有 `opengui/` 顶层目录。平台首次上传已解析成功，因此此顶层布局已有本次页面实证；不据此推断所有 ZIP 布局都受支持。
- 本轮元信息已补充 macOS 公测范围、本地运行环境、USB 调试授权和数据流说明。当前任务文字、手机截图经 WorkBuddy 模型与工具链路处理；CoreMate 账号服务接收手机号、验证码和登录会话，具体行为见[插件 README](../README.zh-CN.md#账号登录与-workbuddy-模型)及[账号服务配置](../src/service-config.ts)。
- 原安装器除了注册 MCP 和 Skill，还写入宿主 Hook。来源为[安装脚本](../scripts/install-local.mjs)、[Hook 配置](../src/installation.ts)和[Hook 实现](../src/host-hook.ts)。`PreToolUse` 注入的 `hostContext` 负责绑定宿主任务，结束事件负责收尾，不能将只上传连接器包等同于完成这些安装步骤。

## 本轮页面与测试记录

本次协作确认账号企业认证已完成，初次 ZIP 已创建未送审的 OpenGUI 草稿，类目选择“工具—设备管理”。包中的元信息在配置页以只读字段展示，调整文案需要重新上传对应包。本地 OpenGUI 的 MCP、Skill、Hook 和相关进程已核对为未安装状态；后续隔离协议检查不等同于重新安装桌面连接器。

主任务本轮运行 `npm run pack:release`：496 个测试、61 个测试文件通过，构建、校验、打包通过；使用 WorkBuddy 5.7.7 隔离 ACP 检查，识别 25 个工具并支持图像内容，工具执行和模型提示词均为零。这证明包和宿主协议发现可工作，不能证明模型读取真机截图、完整控制手机或平台草稿可直接安装。

[发布验收记录](../release-readiness.json)仍将完整 WorkBuddy 图像工具流程、真机 Unicode 输入、双机冲突、连续执行与停止、重启清理及各桌面打包启动列为未验收。应保留这些事实，不由本次单元测试或零调用协议检查替代。

## 尚未公开说明或需要实测的部分

### 已有 source 的重传和 assetId

首次草稿创建后，再从“创建”入口上传相同 `source`，平台解析器提示：连接器 `source` 已存在，需携带其 `assetId` 发布新版本。这是本次登录页面的直接反馈。

截至核对日，中英文官方连接器文档的示例和字段表均没有 `assetId` 或 `asset_id`，也未说明未送审草稿的同版本重传规则。[中文规范](https://open.workbuddy.cn/docs/connector)、[英文规范](https://open.workbuddy.cn/en/docs/connector)

本轮后续页面实测已确认：把 `assetId` 放进 `connector-meta.json` 不能解决这个冲突，该临时包已清理。使用现有资产的发布路径 `/connector/publish/<assetId>?action=create&step=1` 上传，平台能识别该资产，并进一步要求包内版本号严格大于最新版本；未提交的 `0.4.0` 草稿也计入此检查。只把提交用 ZIP 的连接器元信息版本递增为 `0.4.1` 后解析成功，仍使用相同连接器 ID 和 `source`。这些是本轮页面实证，不是公开文档已说明的契约；账号资产 ID 不写入通用连接器源码，也没有删除草稿或更换 `source`。

通用源码及 MCP 运行时仍为 `0.4.0`，平台资料包为 `0.4.1`；运行时 TGZ、MCP 配置、Skill 和安装指南未改动。最终提交前资料及检查结果见[草稿准备说明](open-platform-submission-draft.zh-CN.md)。

### 连接器送审前调试入口

平台总览把测试环境调试放在审核之前，但连接器专页没有给出专门的预览链接、调试客户端或测试账号操作步骤。[平台总览](https://open.workbuddy.cn/docs/what-is-open-platform)、[连接器规范](https://open.workbuddy.cn/docs/connector)

Buddy 应用专页明确有“预览调试”模块和预览态客户端，这是另一种资产类型；不能据此宣称连接器草稿也有相同入口。[Buddy 应用配置](https://open.workbuddy.cn/docs/buddy-app)

应继续以当前连接器草稿实际可见的测试入口核对。若页面没有入口，只能记录已经完成的包验证与宿主协议检查，并向官方确认如何在送审前从市场资产安装测试；不能把上传成功描述为端到端测试通过。

### 市场安装是否覆盖 Hook 和本地依赖

官方 WorkBuddy 插件文档列出 Hook 类型，但开放平台连接器规范只规定 MCP/CLI、Skill 等文件，没有 Hook 自动注册字段。[WorkBuddy 插件系统](https://www.codebuddy.cn/docs/workbuddy/Plugins)、[连接器规范](https://open.workbuddy.cn/docs/connector)

需要实测或向平台确认：安装这个市场连接器后，是否会自动安装 OpenGUI 所需的宿主 Hook；Node 之外的 ADB、scrcpy 与原有本地运行环境如何准备；连接器卸载时如何清理这些配置。当前包文案已明确需要本地运行环境，应在完整原生安装验证之前保留该前置条件。

## 本轮停止位置

最终停在现有连接器 `0.4.1` 草稿的“提交审核”确认页；页面完整显示名称、类目、介绍和示例，最后的“提交”按钮未点击。保留未送审草稿、可审阅的连接器包、说明和已完成测试结果；不声称市场发布、草稿客户端安装或真机执行已完成。后续需要的平台补充信息主要是连接器草稿测试入口及 Hook/本地依赖安装契约；已完成的企业认证无需重复要求用户提供。

## 2026-10-15 文案更新与当前预览

以上停止位置记录的是 2026-10-14 的操作。2026-10-15 根据用户要求缩短介绍开头，保留“首次安装并授权后”的前提，并将推荐提问改为两条 `/opengui` 指令：小红书搜索“美食”并整理前三篇内容、查看微信好友和群的未读条数。英文元信息同步更新，完整运行要求和数据流说明仍保留在安装指南及插件 README 中。

本轮沿用 Chrome 当前选中的 OpenGUI 连接器资产，在 `0.4.3` 提交前页面核对新介绍及两条示例，未点击最终提交；两个示例已经过平台解析和该页必填校验。本地 `node scripts/validate.mjs`、ZIP 完整性及条目一致性检查通过；没有重新运行手机任务或把旧的真机验收缺口标为通过。

平台连接器列表仍显示原 `0.4.1` 草稿，离开提交前预览后可能恢复原资料。因此只确认当前页面和本地 ZIP 包含新文案，不把预览描述为新版已持久保存、送审或发布。当前资产、文案、包版本及校验值以[提交前准备说明](open-platform-submission-draft.zh-CN.md)为准。
