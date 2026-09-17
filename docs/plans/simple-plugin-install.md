# Codex / WorkBuddy 简化安装方案

目标：macOS 用户下载对应宿主的安装脚本并运行一次，自动取得固定版本预构建包、校验 SHA-256、准备私有 Node、安装并给出首次使用指引。普通安装不需要源码、Git、pnpm、编译器或测试工具。

每个插件维护自己的安装脚本和发布资产；不共享运行时、配置、版本或设备服务。沿用 DSH 已验证的机制：版本化包、HTTPS 下载、校验、独立目录、配置备份。保留现有发布验收，不把候选产物声称为正式发布。

流程：GitHub Release -> 对应宿主安装脚本 -> 私有版本目录 -> 宿主原生插件安装 / WorkBuddy 配置合并。

- Codex：使用独立 opengui-standalone 来源，保持仓库旧 marketplace 不变；拒绝同时安装其他来源的同名插件。通过 codex plugin 命令注册、安装和核验，保留配置备份。沿用已固定的 Node 22.23.2 和独立缓存。
- WorkBuddy：先检查宿主退出，再使用私有 Node/npm 安装校验过的 tgz（禁用安装脚本），从包内运行既有配置安装器，统一处理 MCP、Skill 和 Hooks。保留新旧包目录和回退日志。
- 发布：为两种插件新增带版本的安装脚本及校验文件；CI 同时验证脚本、归档和安装行为。正式发布仍要求原有人工验收证据。
- 开发验收：支持显式本地 archive + SHA-256 文件，不需要先发布；测试使用临时 HOME / CODEX_HOME，不操作真实手机和生产宿主配置。

新增公开入口仅为两种宿主各一个安装脚本，参数 --archive 用于本地候选验证，--help 展示说明。下载版本来自脚本所属版本，避免解析全仓 Latest 错装 DSH。没有发布资产就退出，不自动回落源码编译。新版本下载对应脚本，旧版本脚本用于回退。

验证：成功安装、坏校验、无发布、同名插件冲突、配置保留、重复安装、带空格目录、安装失败和回退；运行双方完整 check/package 和 WorkBuddy packed smoke。最脆弱前提是宿主原生安装接口和 macOS 下载执行权限；以实际临时配置安装核实前者，桌面首次运行和手机验收单独记录。需要公共 GitHub、nodejs.org、npm 网络，无新增账户/API key。不增加常驻服务。

涉及超过八个文件；源码和发布流程作为一个可审阅变更交付。回滚通过恢复对应宿主配置备份并重新安装旧版本实现，不删除用户数据、不修改 DSH、不自动强停手机任务。

## 实现验证命令

- `plugins/opengui`: `pnpm check`、`pnpm package`、`node scripts/test-installer.mjs`。
- `workbuddy-plugin`: `npm run pack:release`、`npm run smoke:packed`、使用官方 Node 发行包执行 `node scripts/test-release-installer.mjs`（该测试需要发行包内的 npm）。
- 安装 Skill：Skill Creator 的 `quick_validate.py skills/opengui-plugin-install`。
- macOS 人工安装验收：使用临时 HOME / CODEX_HOME 和真实 Codex CLI 验证首装、重复安装；WorkBuddy 使用空 HOME 和不含 Node 的 PATH 验证私有运行时下载及三个配置入口。宿主桌面和真实手机验收仍沿用原发布清单。


2026-09-17 implementation update: Codex and WorkBuddy share build-time source in
`packages/device-runtime`; runtime instances, configuration, versions, device
services and rollback remain independent.
