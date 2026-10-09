# WorkBuddy 插件安装参考

> **2026-10-08 客户端核对补充：** 用户截图及本机 WorkBuddy 5.7.6 显示“专家·技能·连接器”；实际查看“添加技能”菜单只有查找、上传、创建技能，“自定义连接器”打开 MCP 服务管理。本次未发现文档所称的 GitHub 插件市场添加入口。以下仓库安装说明仍作为作者声明保留，不能直接当作此客户端可执行步骤；原生市场路线暂不作为已验证的主入口。尚未确认差异原因。

核对日期：2026-10-08。以下为原作者文档与源码的只读核对，未安装这些插件、未在 WorkBuddy 中验证导入或授权弹窗。社区仓库的安装声明不能代替当前 WorkBuddy 版本的端到端测试。

## 官方支持的入口

WorkBuddy 官方文档支持在插件页面点击“+”添加第三方市场，并列出 Skill、MCP、Hook、Agent、Rule 等扩展类型。因此，原生市场是有官方依据的分发入口；具体 manifest 兼容性与当前客户端 UI 仍应实测。[官方插件系统](https://www.codebuddy.cn/docs/workbuddy/Plugins)

## Qwen-MM-Plugins：最接近 OpenGUI 的 Skill + MCP 整包参考

[QwenLM/Qwen-MM-Plugins](https://github.com/QwenLM/Qwen-MM-Plugins)是 QwenLM 组织维护、采用 Apache-2.0 的项目。本次源码固定到 `e469e92dcd662ab0c4adc798fc50a094c832bfc0`。[README](https://github.com/QwenLM/Qwen-MM-Plugins/blob/e469e92dcd662ab0c4adc798fc50a094c832bfc0/README.md)

**已核对事实：**

- WorkBuddy 专属说明要求在 Plugins 页面点击“+”，添加 `https://github.com/QwenLM/Qwen-MM-Plugins.git`；作者声明 WorkBuddy 读取 `.claude-plugin/marketplace.json`，以完整插件包安装，并在同页更新、卸载。[WorkBuddy 安装说明](https://github.com/QwenLM/Qwen-MM-Plugins/blob/e469e92dcd662ab0c4adc798fc50a094c832bfc0/docs/en/manual_harnesses.md#workbuddy-plugins-page)
- 市场文件按能力列出插件，每项指向仓库子目录及发布 tag。以 core 为例，其 `.claude-plugin/plugin.json` 同时声明 `skills` 和 `mcpServers`，MCP 通过 `uvx` 启动，Git 包地址固定到相同发布版本。[市场 manifest](https://github.com/QwenLM/Qwen-MM-Plugins/blob/e469e92dcd662ab0c4adc798fc50a094c832bfc0/.claude-plugin/marketplace.json)、[core 插件 manifest](https://github.com/QwenLM/Qwen-MM-Plugins/blob/e469e92dcd662ab0c4adc798fc50a094c832bfc0/src/capabilities/core/.claude-plugin/plugin.json)
- README 要求 `uv`，由 `uvx` 按需准备 Python 依赖；部分流程还需要系统应用。它也提供 curl 安装器，但列举的自动安装宿主未包含 WorkBuddy，而是将 WorkBuddy 指向单独的桌面入口说明，不能混为一谈。[依赖与安装器范围](https://github.com/QwenLM/Qwen-MM-Plugins/blob/e469e92dcd662ab0c4adc798fc50a094c832bfc0/README.md)

**对 OpenGUI 的启发（推断）：**先验证让原生插件包管理 Skill 与 MCP 的安装、更新和卸载；独立脚本负责 Node、ADB、scrcpy 等运行依赖。此方案可能减少直接维护宿主配置的工作，但原生导入是否支持 OpenGUI 现有连接器、Hooks、私有 Node 路径和升级行为，仍需验证。

## DCC-MCP Agent Plugins：插件市场入口与独立 Skill ZIP

[项目仓库](https://github.com/dcc-mcp/dcc-mcp-agent-plugins)面向多个 Agent 宿主，明确包含 WorkBuddy；这里的“官方”是 DCC-MCP 项目官方，不是腾讯官方。

**已核对事实：**

- 作者给 WorkBuddy 的路径是“Plugins → +”添加仓库 URL，或者将 Release 中的独立 Skill ZIP 上传至“Skills → Add skill → Upload skill”。同一 README 的 `codebuddy plugin marketplace add` 命令列在 CodeBuddy 小节，不能据此宣称 WorkBuddy 桌面端提供同一 CLI。[README](https://github.com/dcc-mcp/dcc-mcp-agent-plugins/blob/cd4cf8ece8ffcc8e53a5b93cb40d957392d2ac2a/README.md)
- `.codebuddy-plugin/marketplace.json` 将 `dcc-mcp` 指向 `./plugins/dcc-mcp`；对应 plugin manifest 提供名称、版本、作者等元数据。这是可读的市场目录和插件结构参考。[市场 manifest](https://github.com/dcc-mcp/dcc-mcp-agent-plugins/blob/cd4cf8ece8ffcc8e53a5b93cb40d957392d2ac2a/.codebuddy-plugin/marketplace.json)、[插件 manifest](https://github.com/dcc-mcp/dcc-mcp-agent-plugins/blob/cd4cf8ece8ffcc8e53a5b93cb40d957392d2ac2a/plugins/dcc-mcp/.codebuddy-plugin/plugin.json)
- 发布产物包括整套插件包和多个独立技能包；已核对的最新 Release 是 `v0.19.107`，发布日期为 2026-09-29。[Release](https://github.com/dcc-mcp/dcc-mcp-agent-plugins/releases/tag/v0.19.107)、[打包脚本](https://github.com/dcc-mcp/dcc-mcp-agent-plugins/blob/cd4cf8ece8ffcc8e53a5b93cb40d957392d2ac2a/scripts/build-packages.ps1)
- 尽管名字包含 MCP，此分发仓库的插件主要交付 Skills，README 明确说不附带公共 MCP server。技能优先调用 `dcc-mcp-cli`，还需要目标应用及其 DCC-MCP adapter。缺 CLI 时，技能说明要求取得安装授权后调用 `check_cli.py --ensure-cli`；声明从官方 release manifest 下载并核验 SHA-256。CLI 已存在但健康检查失败时应诊断，而非重复安装。[Skill 入口](https://github.com/dcc-mcp/dcc-mcp-agent-plugins/blob/cd4cf8ece8ffcc8e53a5b93cb40d957392d2ac2a/plugins/dcc-mcp/skills/dcc-mcp/SKILL.md)、[CLI 检查脚本](https://github.com/dcc-mcp/dcc-mcp-agent-plugins/blob/cd4cf8ece8ffcc8e53a5b93cb40d957392d2ac2a/plugins/dcc-mcp/skills/dcc-mcp/scripts/check_cli.py)

**对 OpenGUI 的启发（推断）：**可参考“一套 Skill 内容、多宿主薄 manifest、整包和单技能双产物”的分发结构，并区分安装缺依赖与诊断已有依赖。不过它不能证明“导入后自动注册 OpenGUI 的 MCP”，也不能证明可以跳过 WorkBuddy 的技能/连接器授权。

## WorkBuddy Skill Hub：精选 Skill ZIP 与发布校验

[sandbaseai/workbuddy-skill](https://github.com/sandbaseai/workbuddy-skill)是社区维护的技能目录及适配包仓库，不是 WorkBuddy 官方插件市场。

**已核对事实：**

- 主安装流程是下载 Release 中的指定 ZIP 与 `SHA256SUMS`，校验后进入 WorkBuddy“专家 · Skills · Connectors → Skills → 添加 Skill”上传原始 ZIP。依赖连接器的技能仍需单独启用相应服务。[README](https://github.com/sandbaseai/workbuddy-skill/blob/04a4c69ea9925cccf133f890c61703f349b05675/README.md)、[快速开始](https://github.com/sandbaseai/workbuddy-skill/blob/04a4c69ea9925cccf133f890c61703f349b05675/docs/quickstart.zh-CN.md)
- `scripts/package_skill.sh` 先验证技能，逐目录生成 `*-workbuddy-skill.zip`，并检查 ZIP 根目录存在 `SKILL.md`。它是维护者的打包脚本，不是替用户配置 MCP 的安装器。已核对的最新 Release 为 `v4.66.0`，发布日期为 2026-09-06。[打包源码](https://github.com/sandbaseai/workbuddy-skill/blob/04a4c69ea9925cccf133f890c61703f349b05675/scripts/package_skill.sh)、[Release](https://github.com/sandbaseai/workbuddy-skill/releases/tag/v4.66.0)
- 具体示例 `code-reviewer` 提供 `name`、中英文描述、版本、作者等 frontmatter，正文是代码审查流程；该 Skill 本身没有配置 MCP 服务。它适合参考技能内容与元数据，而非 OpenGUI 的 Node/ADB/MCP 安装。[code-reviewer/SKILL.md](https://github.com/sandbaseai/workbuddy-skill/blob/04a4c69ea9925cccf133f890c61703f349b05675/skills/code-reviewer/SKILL.md)
- 适配文档说明技能 ZIP 与连接器包是不同契约：后者另有 `connector-meta.json` 和 `mcp.json`/`cli.json`；适配产物还附带 `SOURCE.json` 记录来源。此处只是作者的适配方法，平台要求需以 WorkBuddy 官方文档为准。[适配教程](https://github.com/sandbaseai/workbuddy-skill/blob/04a4c69ea9925cccf133f890c61703f349b05675/docs/adapting-skills.zh-CN.md)
- 文档也列举 `gh skill install --dir .workbuddy/skills`，但明确区分这类宿主侧安装器与 WorkBuddy 桌面 ZIP 导入；不能把此命令当成已验证的 WorkBuddy 原生安装命令。[快速开始：安装路径](https://github.com/sandbaseai/workbuddy-skill/blob/04a4c69ea9925cccf133f890c61703f349b05675/docs/quickstart.zh-CN.md#先选择安装路径)

**对 OpenGUI 的启发（推断）：**README 可以只留下入口与一条使用示例，详细依赖与授权放专门指南；发布包固定版本、提供校验和，并让技能 ZIP 和完整安装包的用途清楚。这个仓库证明了社区在维护可导入 WorkBuddy 的技能包，但本次未实测，不能断言每个目录条目都可直接使用。

## 对 OpenGUI 的建议与证据边界

当前先沿用 OpenGUI 安装器路线；“原生插件包 + 本机依赖准备”保留为候选方案，需先解决上述客户端入口不一致并完成验证。Qwen 提供 Skill + MCP 一起分发的直接参考；DCC-MCP 提供技能与本机工具分层的参考；SandBase 提供 ZIP 打包、校验和及导入说明的参考。这是基于上述源码的设计判断，不是已完成迁移的结论。

三个仓库都明确以 WorkBuddy 为安装目标，并非让其他 Agent 通过 MCP 反向操控 WorkBuddy 的同名工具。本次没有在 WorkBuddy 中安装这些项目，也没有验证其授权弹窗。现有证据不足以证明 OpenGUI 的依赖准备、Hooks、MCP 注册、安装后打开授权指南整条流程都能由原生市场自动覆盖；该部分仍需 OpenGUI 的隔离测试和实际宿主验证。

本次仅维护参考与安装文档，没有修改 OpenGUI 安装器、提交代码或发布。
