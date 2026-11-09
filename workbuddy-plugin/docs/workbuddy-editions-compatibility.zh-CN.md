# 国内与国际 WorkBuddy 兼容性核对

核查日期：2026-10-15。范围为腾讯 WorkBuddy 桌面工作台、OpenGUI 本地接入与连接器发布。本文区分官方公开说明、仓库现状和待客户端验证事项；没有注册账号、发送咨询、提交审核或发布市场资产。

## 结论

两版都提供本地 AI 工作台、技能与 MCP 扩展，OpenGUI 可以优先复用现有 MCP 工具和宿主跟随模型的执行方式。已从国际客户端实包确认身份、配置目录和 Hook 声明；登录后的工具、Skill、Hook 与设备执行仍需验收，国际用户还需满足 OpenGUI 自身账号条件。不能把“本地能接入”推导为“已能在国际市场上架”。[国际版概述](https://www.workbuddy.ai/docs/)、[国际版 MCP](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)、[国内连接器规范](https://open.workbuddy.cn/docs/connector)

国际产品的正式称呼仍是 **Tencent WorkBuddy**，官网为 [workbuddy.ai](https://www.workbuddy.ai/)。`CodeBuddy IDE`、`CodeBuddy Code / CLI` 是同站文档里的其他产品；其插件规范只能作为共享引擎的参考，不能直接代替 WorkBuddy 桌面客户端的兼容验证。`docs.work-buddy.ai` 等带连字符的同名产品不属于此次调查。[WorkBuddy 概述](https://www.workbuddy.ai/docs/)、[CodeBuddy 产品概述](https://www.workbuddy.ai/docs/ide/)

## 产品与接入对比

| 项目 | 国内版 | 国际版 | 对 OpenGUI 的影响 |
| --- | --- | --- | --- |
| 官网和文档 | `workbuddy.cn`，部分文档仍在 `codebuddy.cn/docs/workbuddy/` | `workbuddy.ai/docs/workbuddy/` | 下载和支持链接应指向对应版本的 WorkBuddy 页面。 |
| 普通用户登录 | 国内 Mac 安装指南列出微信扫码，以及手机号、邮箱、SSO | 国际 Quick Start 和 FAQ 明确 Google、GitHub OAuth | WorkBuddy 登录由宿主负责，OpenGUI 不应接管或改写登录流程。[国内 Mac 安装](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Installation-Mac-Guide)、[国际 Quick Start](https://www.workbuddy.ai/docs/workbuddy/Quickstart)、[国际 FAQ](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/FQA) |
| 企业登录 | 取决于企业身份与管理员配置 | 国际企业文档另列 Google、GitHub、X、Tencent OneID、邮箱密码和 SSO，并要求管理员添加成员、授权客户端 | 企业文档的账号方式不能全部推广为国际个人版注册方式。[国际企业登录](https://intl.cloud.tencent.com/zh/document/product/1316/84514) |
| 扩展能力 | 官方 WorkBuddy 插件页列出 Skill、MCP、Hook、Agent、Rule，可添加第三方插件市场 | 官方 WorkBuddy 专页确认自定义 MCP、OAuth、技能市场与连接器 | MCP 层具有可复用基础；Hook 与具体安装格式仍需当前客户端验证。[国内插件系统](https://www.codebuddy.cn/docs/workbuddy/Plugins)、[国际 MCP](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)、[国际技能市场](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market) |
| 常见服务生态 | 官方产品页强调腾讯文档、会议、邮箱、微信、企微、ima 等 | 国际连接器页列出 GitHub、GitLab、Jira、Confluence、Google Drive、Gmail、Notion、Slack | 面向国际用户的安装说明和示例宜使用英文并覆盖通用手机操作；不用改变手机控制协议。[国内产品介绍](https://cloud.tencent.com/product/workbuddy)、[国际连接器](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector) |
| 模型 | 国内任务栏文档列出 MiniMax、GLM、Kimi、DeepSeek、混元 | 国际模型页支持内置模型、Auto、自定义模型，并明确名单随版本、账号和服务可用性变化 | 继续跟随用户当前宿主模型；不能靠国家或站点硬编码模型名单。[国内任务栏](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Task-Bar)、[国际模型设置](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Model) |
| 远程助理 | 国内有微信等生态入口 | 国际 FAQ 强调 Slack、Telegram、Discord，但专用 Assistant 页还列出企微、飞书、钉钉、QQ、元宝派、微信助理 | 文档之间粒度不同，不能据 FAQ 宣称国际版仅支持三种 IM；以实际客户端列表为准。[国际 FAQ](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/FQA)、[国际 Assistant](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Assistant) |

国际个人版隐私政策的运营主体按地区区分，并且明确不适用于企业版；其第三方 Skill / MCP 连接器也有各自的数据处理条款。OpenGUI 的说明应同时披露宿主模型链路和自身账号服务链路。[国际隐私政策](https://www.workbuddy.ai/document/privacy-policy)

## 开发者注册、送审与市场分发

### 国内：已有明确公开流程

国内开放平台将开发者资质认证、资产配置、测试、审核、发布列为不同步骤。管理员和个人认证需要大陆二代居民身份证、本人实名手机号、邮箱及人脸识别，公开文档注明暂不支持港澳台及外籍证件。企业需提交营业执照、核对统一社会信用代码和法人信息，可选择法人核验、腾讯云主体快速认证、微信公众号/小程序主体快速认证。[平台流程](https://open.workbuddy.cn/docs/what-is-open-platform)、[认证要求](https://open.workbuddy.cn/docs/onboarding)

连接器支持 MCP + Skill 或 CLI + Skill；OpenGUI 可沿用本地 stdio MCP，不必为了送审改成远程服务。元信息要求中英文名称、说明和示例，一个连接器只配置一个 MCP Server。准备完成后打包交给 WorkBuddy 团队审核，通过才进入市场；更新重新送审。文档所写“10～15 分钟”指审核通过后的同步生效时间，**不是审核处理时长承诺**。[连接器规范](https://open.workbuddy.cn/docs/connector)

### 国际：不能确认与国内审核和资产互通

本次查看国际官网、WorkBuddy 专用文档、MCP、技能市场、连接器和账号说明，能够确认普通用户安装与授权自定义扩展的能力；**没有找到可核实的国际专用开发者入驻、连接器上传送审、审核 SLA、外国主体认证规则或国内资产自动同步到国际市场的公开说明**。这是公开证据缺口，不表示国际平台必然不存在，也不能据此宣称国际版无需审核。[国际文档入口](https://www.workbuddy.ai/docs/)、[国际 MCP](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)、[国际技能市场](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)

`open.workbuddy.cn/en/docs/onboarding` 是国内开放平台的英文版，仍要求大陆身份证和国内企业主体信息；不能把 `/en/` 当成独立国际开发者平台。[开放平台英文认证说明](https://open.workbuddy.cn/en/docs/onboarding)

因此，本次国际适配可以完成本地兼容及可分发安装包，国际市场发布需要另行核实平台入口、主体资格和发布区域。现有国内未送审草稿的状态与版本记录保留在[接入核对](open-platform-onboarding-research.zh-CN.md)和[提交前草稿](open-platform-submission-draft.zh-CN.md)中，不因本次研究发生变化。

## 配置格式和客户端验证边界

国际 WorkBuddy 专页只说明 Settings → MCP 添加服务及 OAuth，没有列出 macOS bundle ID、用户数据目录、内置引擎路径或 Hook 自动注册契约。国际站的 CodeBuddy CLI 参考列出 `.codebuddy-plugin/plugin.json`，并兼容 `.workbuddy-plugin/`、`.claude-plugin/`；这些仍是 CLI/共享引擎规范，不能据其 `~/.codebuddy/` 示例直接把国际 WorkBuddy 安装到该目录。[国际 MCP](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)、[CLI 插件参考](https://www.workbuddy.ai/docs/zh/cli/plugins-reference)、[CLI 设置](https://www.workbuddy.ai/docs/cli/settings)

国际 WorkBuddy 的自定义 Skill 实践页将示例结构描述为 `skill.yml`，与国内开放平台和共享引擎的 `SKILL.md` 说明不同；这也说明不能单靠概览页宣称格式完全一致。已有 OpenGUI 资产应保留其实际使用的 `SKILL.md`，由目标国际客户端验证加载，而非依据该实践页重写整个插件。[国际自定义 Skill 实践](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Create-Skills)、[国内 Skill 规范](https://open.workbuddy.cn/docs/skill)

适配验证应读取实际国际 WorkBuddy 应用包的 `Info.plist` 和 `product.json`，按已验证产品标识选择目录；使用其内置引擎和隔离配置发现 OpenGUI 工具，分别核验图像能力、Skill 和 Hook。工具发现成功不等于登录后真机执行通过，也不等于市场连接器能自动安装全部本地依赖。

## OpenGUI 自身的国际用户限制

OpenGUI 当前账号不是 WorkBuddy 账号的单点登录。`src/coremate-client.ts` 的 `sendOtp` / `login` 只接受 `^1[3-9][0-9]{9}$` 中国大陆手机号，登录请求固定传 `region: 'CN'`。国际 WorkBuddy 支持 Google/GitHub，并不会让 OpenGUI 自动拥有海外手机号、邮箱或 OAuth 登录。修改这项限制需要后端账号能力配合，不能仅放宽客户端正则。[当前账号客户端](../src/coremate-client.ts)、[账号与数据流说明](../README.zh-CN.md#账号登录与-workbuddy-模型)

插件依仓库既定规则继续连接官方 CoreMate 账号服务，也允许 `OPENGUI_ACCOUNT_SERVICE_URL` 覆盖。账号服务接收手机号、验证码和会话；手机任务文字及截图通过 WorkBuddy 的模型/工具链路处理。宿主兼容完成后，仍应清楚标出大陆手机号前提与真实设备验收范围，不能宣称国际新用户注册和手机控制已完整打通。[服务配置](../src/service-config.ts)、[插件 README](../README.md#account-and-workbuddy-model)

## 本轮源码适配与实包验证

2026-10-15，从国际官网首页实际使用的只读[更新接口](https://www.workbuddy.ai/v2/update?platform=workbuddy-darwin-arm64)取得 macOS ARM64 5.7.6.40488862 的[官方 ZIP 地址](https://codebuddy-1328495429.cos.accelerate.myqcloud.com/workbuddy/saas/darwin-arm64/WorkBuddy-darwin-arm64-5.7.6.40488862-3e43260f.zip)。通过 HTTP Range 读取并解压目标 `Info.plist`、`cli/product.json` 和完整内置 CLI，ZIP 条目解压时校验 CRC；未校验整个 ZIP 的 SHA-256，未安装或启动国际桌面 App。

| 实包字段 | 验证结果 |
| --- | --- |
| 应用目录 / 名称 | `WorkBuddy AI.app` / `WorkBuddy AI` |
| `CFBundleIdentifier` | `com.workbuddy.workbuddy-ai` |
| `CFBundleShortVersionString` | `5.7.6` |
| `applicationName` | `workbuddy-ai` |
| `dataFolderName` / `config.customUserDataDir` | 均为 `.workbuddy-ai` |
| 内置入口 | `Contents/Resources/app.asar.unpacked/cli/bin/codebuddy` |
| 生命周期 Hook 声明 | 预检确认七个所需事件均存在；不等于真实事件已触发验收 |

适配保留原 MCP + Skill 格式和运行时，新增 `--edition auto|cn|international`，支持两版共存时明确选择国际版，并拒绝 `--app` 与所选版本冲突。国际版 Node/npm 默认官方源，可用显式参数或环境变量覆盖；国内默认镜像源及原有自动选择优先级保留。安装器从目标产品元信息取配置目录，不用应用名称猜路径；OpenGUI 自身运行时继续共享 `~/.workbuddy/opengui`，按配置根目录分别保留安装回执。[安装器](../scripts/install-macos.command)、[安装说明](../INSTALL.md#international-workbuddy)

实际国际包已通过只读安装预检，选择 `~/.workbuddy-ai` 和官方源。国际原生 ACP 初始化成功并声明图像支持，`session/new` 返回 `Authentication required`，因此没有获得国际版的工具目录，也未执行手机工具或发送模型提示词。国内已安装的 WorkBuddy 5.7.7 通过同一隔离检查，收到全部 25 个工具、声明图像支持，零工具执行、零模型提示词。[原生验证脚本](../scripts/test-workbuddy-host.mjs)

后续仍需使用已正常登录的国际 WorkBuddy，完成 Skill 授权、MCP 信任/启用、Hook 审阅，调用 `opengui_list_devices`，再验收首帧、任务开始、截图操作、停止清理与报告。不要把当前预检和国内工具目录测试宣传为国际桌面/真机验收通过。本轮源码及本地候选包尚未发布到 GitHub 或任何市场。

### 自动验证结果

- `npm run check`：61 个测试文件、496 项测试通过，TypeScript/native 构建及清单/隔离/ADB 校验通过。
- `test-host-discovery.mjs`、`test-download-sources.mjs`、`test-preflight.mjs`、`test-install.mjs`：两版共存选择、版本冲突拒绝、源覆盖、目录及原配置保留、重复安装和只读预检通过。
- `test-curl-installer.py` / `test-installer-handoff.py`：11 + 14 项通过；bootstrap、手动 ZIP、内嵌安装指南及维护文档的校验和同步。
- 本地包生成通过；`test-release-installer.mjs --curl` 在隔离 HOME 和国际版模拟应用中执行真实下载/依赖安装：首次 167695 ms、重复安装 913 ms，配置进入 `.workbuddy-ai`，保留其他 MCP/Hook，不写国内 MCP 配置，旧服务占用时拒绝升级。此测试使用模拟宿主，不代表真实国际桌面加载。
- 国际官方包只读预检与原生 ACP 初始化通过；后续会话因未登录被拒绝。国内 5.7.7 原生 MCP 目录检查通过。国际登录后验收仍未通过，`release-readiness.json` 保持 `verified: false`。

## 2026-10-17：海外市场上架路径复核

本次目标是确认如何进入海外 WorkBuddy 的原生连接器市场。复核仅查看官方公开网站、文档和联系渠道，没有发送邮件、登录后台核实资产、更改现有草稿或提交审核。

### 已确认的入口与证据边界

| 项目 | 本次核实结果 | 实际可采取的下一步 |
| --- | --- | --- |
| 国际产品咨询 | 国际 WorkBuddy 的 Contact Us 页面公开 `workbuddy_ai@tencent.com`，可用于产品问题和请求咨询。页面目标为 7 个工作日内回复，属于普通支持目标。 | 询问国际连接器市场的提交入口，请求转接生态合作或发布团队；不能把该邮箱描述为已公布的上架受理专线，也不能把普通支持回复目标当成审核 SLA。[国际联系渠道](https://www.workbuddy.ai/docs/workbuddy/Contact) |
| 国内开放平台咨询 | 国内开放平台 Contact 页面公开 `openworkbuddy@tencent.com`；专家/技能文档将其称作运营联系方式，并提供官网二维码社群。 | 询问现有国内认证、`source` 和草稿资产能否用于海外发布，以及是否由国内后台指定区域；不能据此假定国内运营已承诺受理国际上架。[开放平台联系渠道](https://open.workbuddy.cn/docs/contact)、[运营联系说明](https://open.workbuddy.cn/docs/expert) |
| 国际自助开发者后台 | 国际官网及其 WorkBuddy 文档导航、站点地图中未发现明确的开发者注册或连接器送审入口。`https://open.workbuddy.ai/` 本次直访未能建立可用 HTTPS 页面，也未找到官方文档对它的引用。 | 不把猜测域名作为已确认的开发者后台；向国际支持索取正式入口。这只能说明本次没有核实到，不能断言后台不存在。[国际文档](https://www.workbuddy.ai/docs/)、[国际 WorkBuddy 文档站点地图](https://www.workbuddy.ai/docs/sitemap-workbuddy-workbuddy.xml) |
| 国内后台到国际市场的关系 | 国内连接器规范写明打包、提交 WorkBuddy 团队审核、通过后进入连接器市场，未说明海外发布区域、两站市场互通或国内资产自动同步。英文 `/en/docs/` 仍在同一国内平台。 | 先取得官方对目标市场和复用方式的答复，再选择具体送审路径；不要为猜测的国际发布重复创建同名资产。[国内连接器规范](https://open.workbuddy.cn/docs/connector)、[英文开放平台](https://open.workbuddy.cn/en/docs/onboarding) |

国际公开文档支持用户添加自定义 MCP 和安装技能；这证明有本地使用入口，并不等于提供官方市场收录入口。[国际 MCP 配置](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)、[国际技能市场](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)

国际服务 AUP 第 4 节将开发与服务互操作的插件、外部组件等列为需要事先明确书面许可的情形。建议在上述咨询中确认官方连接器送审/合作流程是否涵盖所需的开发与分发许可，以及如何取得或记录该许可；目前没有依据推断另有一套审批步骤，也不把公开 MCP 文档视为已取得特定市场发布许可。[国际 AUP 第 4 节](https://www.workbuddy.ai/document/acceptable-use-policy)

### 建议执行顺序

1. 先向国际产品支持确认原生连接器市场的正式提交入口、负责团队，以及本地 stdio MCP + Skill 的收录方式；同时向国内运营核实能否复用已认证主体和 `source: opengui`。
2. 按官方答复确定使用现有资产新增发布范围、迁移/关联资产，还是单独入驻。现阶段这三种只是待确认的可能路径，尚无公开证据可选定其中一种。
3. 准备可审阅的英文说明、权限与数据流、安装/卸载说明、测试证据和包下载地址；完成海外账号登录方案、英文工作台，以及原生市场安装时 Hook 和本地依赖的验证。以上是针对当前 OpenGUI 缺口的准备建议，不声称均为国际平台已公布的硬性资料要求。
4. 使用官方明确指定的渠道送审，核对目标为国际市场，并在获准后由已登录的国际客户端验证发现、安装、授权、手机任务和卸载。国内提交成功或本地安装成功均不代替这一步。

OpenGUI 当前可说明的事实是：已有 MCP + Skill 方案和国际客户端身份/目录适配证据；依赖七个宿主 Hook，其随原生市场安装的行为未验收；账号仍为 CoreMate 大陆手机号登录，工作台已提供中英文切换，安装与授权指南仍为中文，国际登录后真机流程尚未验收。国内企业认证和 `source: opengui` 草稿来自 **2026-10-15 的接入记录**，本次没有实时查看后台，不将该历史记录描述为 2026-10-17 的后台实况。[历史接入记录](open-platform-onboarding-research.zh-CN.md)、[历史提交前草稿](open-platform-submission-draft.zh-CN.md)、[当前账号实现](../src/coremate-client.ts)、[宿主 Hook 声明](../src/installation.ts)

### 可复制咨询短稿（未发送）

主题：申请将 OpenGUI 手机助手接入国际版 WorkBuddy 连接器市场

WorkBuddy 团队您好：

我们希望将 OpenGUI 手机助手上架国际版 WorkBuddy 的原生连接器市场。OpenGUI 通过本地 stdio MCP + Skill，在用户授权后连接电脑上的手机执行任务，并提供可查看的设备画面、人工接管与停止入口。目前已准备国际客户端的身份/目录适配；原生市场安装、宿主 Hook、国际登录后手机流程仍待与平台一起确认和验收。

根据我们 2026-10-15 的接入记录，国内开放平台已完成企业认证，并创建 `source: opengui` 的连接器草稿，尚未提交审核。本次尚未重新查询后台状态。希望确认：

- 国际市场是否开放此类本地 MCP + Skill 连接器收录？正式申请/上传入口和负责团队是什么？
- 能否复用国内企业认证和现有 `source` / 草稿资产？是否需要单独指定国际发布区域、关联资产或重新入驻？
- 原生连接器安装是否支持注册生命周期 Hook，并准备 Node、ADB、scrcpy 等本地依赖？送审前的国际客户端草稿调试方式是什么？
- 国际提交需要哪些英文材料、账号/隐私说明和验收证据？目前产品自身仅支持大陆手机号登录，这是否影响收录，平台建议的海外账号接入方式是什么？
- 国际 AUP 第 4 节涉及插件互操作的事先书面许可，连接器审核/合作流程是否涵盖相关开发和分发许可，应如何确认？

我们可提供源码仓库、固定版本安装包、权限与数据流说明、演示视频及验证记录。烦请告知正式流程，或协助转交国际生态合作/连接器发布团队。谢谢。

此段为咨询草稿，不表示已与腾讯联系、取得许可或得到收录承诺；尚未附带任何账号凭证、验证码或私人日志。


## 2026-10-17：本机国际版安装记录

本次用户说明已安装并运行国际版，并要求通过国际版安装当前工程。实际观察到 `/Applications/WorkBuddy AI.app` 正在运行，原生界面已登录、版本为 5.8.4。原生 **Experts · Skills · Connectors → Connectors → Custom connectors → Add MCP** 编辑器显示配置路径为 `~/.workbuddy-ai/mcp.json`。这些是本机当前界面证据，不依赖市场是否收录 OpenGUI。

已从当前工作区重新构建、运行 `scripts/validate.mjs` 并生成本地包；通过源码安装器的 `--edition international --app ... --archive ...` 安装该包。安装耗时约 45 秒，写入国际版的 MCP、Skill 和七个生命周期 Hook，保留原设置备份；没有修改国内版 MCP 配置、提交审核或操作手机。运行时归档 SHA-256 为 `a520d72237f74f75c6eecb5fe79b5416849746ec2b3613bf526ef462559258ac`。安装回执为 `~/.workbuddy/opengui/local-install-adb8d037427d0e5d.json`。

安装后已正常退出并重新打开国际版。原生 Custom connectors 列表出现 `opengui`，显示首次连接前需要 **Trust**，开关未启用。该提示留给用户亲自确认，未点击 Trust、未改写宿主信任状态。单独对已安装 stdio 进程执行 MCP 握手、tools/list 和 ping 成功，共 25 个工具；工具执行和模型提示词均为零。此结果只证明安装包可启动，尚不证明 WorkBuddy 原生工具调用已经通过。

安装完成时等待用户在原生界面确认 MCP Trust/启用及 Skill 授权。用户随后明确回复已完成授权；以下为后续原生调用验证结果。完整命令和可粘贴的只读验证请求见[当前工程本地安装](../INSTALL.md#install-the-current-checkout-without-marketplace-publication)。


### 用户授权后的原生调用验证

2026-10-17，用户明确确认已信任并完成授权。国际版 Skills 的已安装列表显示自定义 `opengui` 已启用。在原生新聊天中发送仅调用一次 `opengui_list_devices` 的连接验证请求，明确不打开工作台/投屏、不截图、不创建控制会话、不操作手机、不安装或修改配置。

原生任务 **Verify OpenGUI MCP connection** 显示已完成（约 32 秒），报告调用成功，返回 17 个本地 iOS 模拟器条目，均为 `shutdown`、`connected: false`，无已连接 Android 真机。这些是已配置的可用模拟器条目，不是 17 台已连接手机。安装与国际版原生只读工具调用验证通过；未验收手机截图、首帧、控制、接管、完整 Hook 生命周期或报告，`overseasNativeViewer.verified` 继续为 `false`。

### GitHub 公开入口核对

同日直接从 GitHub 下载 `main/workbuddy-plugin/install.sh` 与其引用的安装器，确认内嵌安装器 SHA-256 与下载内容一致。公开安装器指定运行时 `0.4.1`，对应 TGZ 与 `.sha256` 可访问；公开参数支持 `--app`、`--download-source official`、`--check`，尚无本工作区的 `--edition`。用实际公开安装器对本机国际版 5.8.4 运行 `--check --app ... --download-source official` 成功，配置路径正确解析为 `.workbuddy-ai`，未写配置或升级本机运行时。

已扩充[从 GitHub 安装的完整流程](install-from-github.zh-CN.md)，提供 WorkBuddy 聊天提示词、公开终端安装命令、重启/授权/原生验证与当前源码安装步骤。文档公开命令使用已验证的 `--app`，不依赖尚未发布的 `--edition`；本机依旧是本工作区构建安装的 `0.4.0`，没有因核对 GitHub 而升级为 `0.4.1`。
