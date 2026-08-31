# OpenGUI 接入官方 DeepSeek Harness 的安装语义

## 结论

`dsh-coremate-mobile` 已经是官方 DeepSeek Harness 所定义的外部 **bundle**：它的 [`package.json`](../../package.json) 声明 `dsh.bundle.patch: ./cordis.patch.yml`，而 [`cordis.patch.yml`](../../cordis.patch.yml) 插入名为 `dsh-coremate-mobile` 的 Loader 行。因此应使用 `dsh plugin --profile <name> add <spec>` 把它安装到某个 profile，而不是把插件源码复制进 Harness 仓库，也不需要修改 Harness 的 `packages/`、内置 bundle、根 `package.json` 或锁文件。

安装命令只改写 `$DSH_HOME/profiles/<name>` 下由用户拥有的 profile：pnpm 管理其中的依赖，Harness 在成功安装后把声明了 `dsh.bundle` 的依赖追加到 profile 的 `dsh.profile.bundles`。官方源码把 profile 定义为 `$DSH_HOME/profiles/<name>`，默认 `$DSH_HOME` 是 `~/.dsh`；外部 bundle 从 profile 自己的 `node_modules` 解析。[官方插件发布教程](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/docs/user/develop/basic/publish.zh.md)；[官方 profile 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/boot/app-boot/src/profile.ts)；本地官方源码：`/Users/panda/Documents/Projects/Deepseek-harness/packages/boot/app-boot/src/profile.ts`。

当前插件的 peer dependency 基线是 DeepSeek Harness `0.1.0-rc.7`。Harness 仍处于开发者预览期，后续版本可能破坏兼容性，因此安装前应核对插件 [`package.json`](../../package.json) 的 `peerDependencies` 与目标 Harness 版本。

## 前置条件

- Node.js `^22.19.0 || >=24.0.0`。
- pnpm；官方 `dsh-v0.1.0-rc.7` 源码固定 `pnpm@11.7.0`，应通过 Corepack 使用该版本。
- 从 Git 安装私有仓库时，安装机器必须已有对应的 GitHub HTTPS 或 SSH 凭据。
- 真正执行手机任务还需要：受支持的主机平台、已连接且授权 USB 调试的 Android 设备，以及支持图片输入和工具调用的 OpenAI 兼容模型端点。

Node 与 pnpm 版本来自[官方根 package.json](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/package.json)；源码运行步骤来自[官方 README](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7#从源码运行)。

## 准备官方 Harness 源码

如果 `/Users/panda/Documents/Projects/Deepseek-harness` 尚不存在：

```sh
cd /Users/panda/Documents/Projects
git clone --branch dsh-v0.1.0-rc.7 --depth 1 \
  https://github.com/deepseek-ai/deepseek-harness.git Deepseek-harness
cd Deepseek-harness
corepack enable
pnpm install
pnpm run build
```

官方源码模式必须先构建，再用 `pnpm dsh ...`；`pnpm dsh` 本身启动 TypeScript CLI，不会自动刷新 Host 或 Web 构建产物。[官方源码执行参考](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/apps/cli/reference/README.zh.md#源码执行)。

如果使用已经发布的 CLI，官方最小启动方式是 `npx @deepseek-ai/dsh web`；下文把源码 checkout 作为验证基准，因此命令统一写作 `pnpm dsh ...`。安装版 CLI 中对应命令去掉前面的 `pnpm` 即可。

为避免测试污染现有 `~/.dsh`，可以在同一终端固定一个隔离目录：

```sh
export DSH_HOME=/Users/panda/Documents/Projects/.dsh-coremate-validation
```

该目录属于验证数据，不属于 Harness 源码；测试结束后是否保留由使用者决定。

## 方案一：安装本地发布 tarball（推荐与已验证路径）

从插件 checkout 生成与 npm 发布内容等价的 tarball：

```sh
cd /Users/panda/Documents/Projects/Deepseek-ai
corepack enable
pnpm install
pnpm run check
npm pack
```

这里必须使用 `npm pack`，不能替换为 `pnpm pack`。当前 `pnpm pack` 会把包内 macOS 和 Linux ADB 文件的可执行位从 `0755` 归一化为 `0644`；`npm pack` 会保留可执行位，发布到 npm 时也使用相同的 npm 打包语义。

然后从 Harness 根目录把 tarball 安装到 `web` profile：

```sh
cd /Users/panda/Documents/Projects/Deepseek-harness
pnpm dsh plugin --profile web add \
  /Users/panda/Documents/Projects/Deepseek-ai/dsh-coremate-mobile-0.1.1.tgz
```

首次 add 可能因 `ERR_PNPM_IGNORED_BUILDS` 停止，并在 profile 的 `pnpm-workspace.yaml` 中写入占位值。这两个传递依赖不参与 OpenGUI 的 OpenAI 兼容路由；当前插件自己的工作区也明确拒绝它们的安装脚本。把占位值改成以下决定并原样重试 add：

```yaml
# $DSH_HOME/profiles/web/pnpm-workspace.yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false

allowBuilds:
  '@google/genai': false
  protobufjs: false
```

预构建 tarball 不需要允许 `dsh-coremate-mobile` 自己的 `prepare`。本次实测证明，在上述两个传递依赖保持 `false` 时，插件仍能完成配置组合、模块装载和命令注册，随包 ADB 也能直接执行。

## 方案二：从本地插件 checkout 安装

先构建独立插件。它的 `lib/` 是忽略的生成物，因此一个全新 checkout 在本地链接前需要单独构建：

```sh
cd /Users/panda/Documents/Projects/Deepseek-ai
corepack enable
pnpm install
pnpm run build
```

然后从 Harness 根目录安装到官方 `web` profile：

```sh
cd /Users/panda/Documents/Projects/Deepseek-harness
pnpm dsh plugin --profile web add ../Deepseek-ai
```

`dsh plugin --profile web` 会先初始化 `$DSH_HOME/profiles/web`，再以该 profile 为 pnpm 工作目录转发 `add ../Deepseek-ai`。官方 CLI 会先把相对路径锚定到命令调用目录，所以这里最终指向 `/Users/panda/Documents/Projects/Deepseek-ai`，不会错误地解析成 profile 内部路径。成功后，profile 的 `package.json` 应同时出现：

- `dependencies.dsh-coremate-mobile`，通常是一个指向本地 checkout 的链接；
- `dsh.profile.bundles` 中的 `dsh-coremate-mobile`，位于官方 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 之后。

本地 checkout 安装不需要授权插件自己的 `prepare`；但必须保证 checkout 中已有可加载的 `lib/index.js`。如果 pnpm 同样要求处理 `@google/genai` 和 `protobufjs`，沿用方案一的两个 `false` 决定。相对路径锚定、初始化和安装后 bundle 对账由[官方 CLI 插件实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/apps/cli/src/plugin.ts)定义；本地 checkout 无需允许插件自己的构建脚本由[官方 CLI 行为参考](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/apps/cli/reference/README.zh.md#插件管理)明确说明。

## 方案三：从公开 tag 的源码 checkout 安装

插件迁入 OpenGUI monorepo 后，不应把仓库根目录当作插件包直接交给 DSH。开发验证应固定插件 release tag，checkout 后安装其中的 `deepseek-harness-plugin` 目录：

```sh
git clone --branch dsh-coremate-mobile-v0.1.7 --depth 1 \
  https://github.com/Core-Mate/OpenGUI.git
cd OpenGUI/deepseek-harness-plugin
pnpm build
dsh plugin --profile web add "$(pwd)"
```

源码 checkout 不包含预先生成的 `lib/`，所以应先完成本地构建。若改用会触发 `prepare` 的安装方式，pnpm 10 及以上默认可能阻止安装期脚本。失败后，把 pnpm 输出的**确切包键**合并到这个 profile 的工作区文件，不要覆盖原有字段：

```yaml
# $DSH_HOME/profiles/web/pnpm-workspace.yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false

allowBuilds:
  dsh-coremate-mobile: true
  '@google/genai': false
  protobufjs: false
```

然后原样重试 `add`。`dsh-coremate-mobile: true` 意味着在 agent 沙箱之外以当前用户身份运行仓库的安装期代码；只应对已审查并固定版本的源码授权。两个 `false` 则明确拒绝无关传递依赖的安装脚本。官方教程还指出，预构建 npm 包或 tarball 不需要允许插件自己的构建脚本。[官方 Git 安装与构建授权说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/docs/user/develop/basic/publish.zh.md#从-github-安装构建脚本这道坎)。

源码安装成功前必须现场确认以下事实：远端确实包含指定 tag、本地构建能在没有相邻 Harness 源码的临时环境中完成、安装后的 profile 能实际装载插件。源码与 manifest 能证明设计意图，但不能替代这三项实时检查。

## 配置、settings 与凭据

官方 base bundle已经挂载 settings、credentials、commands、LLM、tools、subagents、system prompt 和 attachment 等插件依赖。OpenGUI bundle 自己只插入一行：

```yaml
- id: coremate-mobile
  name: dsh-coremate-mobile
```

有两种合法的配置位置。

### 推荐：用户 settings 文档

写入 `$DSH_HOME/settings.yaml`：

```yaml
coremate-mobile:
  baseURL: https://gateway.example/v1
  api: openai-responses
  model: vision-model
  apiKeyEnv: COREMATE_MOBILE_API_KEY
```

插件注册了 `coremate-mobile` settings namespace。官方 settings 的解析优先级是 schema 默认值，然后是组合层 Loader 行的 `config`，最后是 `$DSH_HOME/settings.yaml` 中的同名用户 section；用户 section 可以热更新。相关实现位于插件 [`src/index.ts`](../../src/index.ts)，settings 层语义见[官方 settings README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/settings/settings/README.md)。

### 备选：profile 自己的 patch 层

也可以写入 `$DSH_HOME/profiles/web/cordis.patch.yml`：

```yaml
- id: coremate-mobile
  config:
    baseURL: https://gateway.example/v1
    api: openai-responses
    model: vision-model
    apiKeyEnv: COREMATE_MOBILE_API_KEY
```

该 patch 按 `id` 覆盖 bundle 插入的行。注意 Harness 的 profile patch 替换目标行的整个 `config`，不是对该 `config` 做深度合并；如果以后在这一层增加其他字段，覆盖时需要完整保留。profile 层之后仍会应用 `$DSH_HOME/settings.yaml` 中的 `coremate-mobile` 用户 section。[官方层顺序与替换语义](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/apps/cli/reference/README.zh.md#profile-启动)。

API key 不应写进任一配置文件。默认凭据引用是 `COREMATE_MOBILE_API_KEY`，可选来源及优先级为：

1. 当前进程继承的环境变量；
2. `$DSH_HOME/.credentials.yaml`；
3. 启动 Harness 时所在目录的 `.env`；
4. `$DSH_HOME/.env`。

受管凭据文件示例：

```yaml
COREMATE_MOBILE_API_KEY: sk-...
```

在 POSIX 系统上，手工创建后必须限制为当前用户可读写，否则官方 provider 会拒绝加载：

```sh
chmod 600 "$DSH_HOME/.credentials.yaml"
```

路径、优先级及权限校验来自[官方 credentials-local 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/credentials/credentials-local/src/index.ts)；settings 默认路径来自[官方 settings-file 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/packages/settings/settings-file/src/index.ts)。

## 安装与装载验证

先验证 pnpm 依赖与 bundle 清单：

```sh
cd /Users/panda/Documents/Projects/Deepseek-harness
pnpm dsh plugin --profile web why dsh-coremate-mobile
sed -n '1,200p' "$DSH_HOME/profiles/web/package.json"
```

再验证最终配置组合而不启动进程：

```sh
pnpm dsh --profile web --dump-config > /tmp/coremate-web-config.yml
rg -n 'dsh-coremate-mobile|coremate-mobile' /tmp/coremate-web-config.yml
```

`--dump-config` 应显示 `# == dsh-coremate-mobile` 层和 `id: coremate-mobile` 行。它使用与启动相同的 bundle/patch 组合逻辑，但**不会加载插件模块、运行应用参数处理器或连接模型和手机**，所以通过 dump 只能证明 bundle 已加入最终配置，不能证明运行时成功。

接着做真正的装载验证：

```sh
pnpm dsh web
```

进程应启动 Web UI 且不报告 `dsh-coremate-mobile` 模块解析、peer dependency、注入或配置 schema 错误。Web 默认监听 `http://127.0.0.1:3080`。把 `/opengui` 作为单独消息发送，命令应被识别；空参数应返回：

```text
Usage: /opengui <task>
```

最后的端到端验证需要真实外部条件，必须现场执行，不能由配置 dump 代替：

```text
/opengui 打开设置并报告 Android 版本
```

需要确认模型端点认证、所选协议、图片输入、工具调用、随包 ADB 的主机架构、USB 授权和目标设备状态全部可用。没有 API key 或设备时，可以完成“安装、组合、模块装载、命令注册”验证，但不能声称手机任务链路已通过。

## 移除

pnpm 的 remove 参数是安装后的包名，不是 Git spec：

```sh
cd /Users/panda/Documents/Projects/Deepseek-harness
pnpm dsh plugin --profile web remove dsh-coremate-mobile
# 审查并删除 cordis.patch.yml 中的 coremate-mobile 行；没有其他行时保留 []
pnpm dsh --profile web --dump-config | rg -n 'dsh-coremate-mobile|coremate-mobile'
```

成功移除后，`dsh-coremate-mobile` 会同时离开 profile 的 `dependencies` 与 `dsh.profile.bundles`。profile 自己的 `cordis.patch.yml`、用户 `$DSH_HOME/settings.yaml` 和凭据文件是用户数据，CLI 不会替用户删除。残留的 `coremate-mobile` patch 会让下次组合配置时报 `entry "coremate-mobile" not found`，所以必须审查并删除该 patch 行；如果删除后没有其他行，文件内容应保留 `[]`，因为仅含注释的文件不是顶层 YAML 数组。settings section 和凭据只在不再共享或使用时清理。清理 patch 后，最后一条命令应成功且无匹配。[官方 remove 语义](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.7/docs/user/develop/basic/publish.zh.md#安装进-profile)。

## 对官方源码的影响范围

外部插件安装不会改动 `/Users/panda/Documents/Projects/Deepseek-harness` 的受版本控制文件。即使从源码 checkout 执行 `pnpm dsh plugin ...`，CLI 仍把依赖与 bundle 顺序写入 `$DSH_HOME/profiles/web`。上面的隔离路径位于 Harness checkout 之外；最好在验证前后用 `git -C /Users/panda/Documents/Projects/Deepseek-harness status --short` 证明官方工作树保持不变。

插件的更新和删除同样只影响对应 profile。Harness 的官方代码、内置 bundle 版本及根 lockfile 只有在开发者主动编辑或在 Harness 根目录执行依赖变更时才会变化，不是 `dsh plugin` 的行为。

## 2026-08-18 实测记录

验证基线是官方 Harness `dsh-v0.1.0-rc.7`（commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`）和插件 `0.1.1`。Harness checkout 位于 `/Users/panda/Documents/Projects/Deepseek-harness`；验证 profile 使用临时 `DSH_HOME=/tmp/dsh-coremate-integration.jaJi3n`，没有写入用户现有的 `~/.dsh`。

- 官方 checkout 的 `pnpm install` 和 `pnpm run build` 均成功，验证结束后 `git status --short` 无输出。
- 使用 `npm pack` 生成的 tarball 安装成功；profile manifest 同时出现 dependency 和 bundle，`--dump-config` 显示 `# == dsh-coremate-mobile` 与 `id: coremate-mobile`。
- 当时的 `pnpm dsh web --port 0` 验证记录中，Host 的 `commands/list` 返回旧命令 `coremate`；当前主命令已迁移为 `opengui`，并保留 `coremate` 兼容别名。
- 当前应通过 Host 的 `commands/execute` 执行空参数 `/opengui`，并确认返回 `Usage: /opengui <task>`，证明命令 handler 已装载和分派。
- 安装后的托管 macOS arm64 ADB 可执行，并报告 Android Debug Bridge `1.0.41`、Platform Tools `37.0.1-15733141`。
- `pnpm dsh plugin --profile web remove dsh-coremate-mobile` 成功；随后删除测试 profile 中的 `coremate-mobile` patch，`--dump-config` 成功且无插件匹配。
- 另用 npm 已发布的 `npx @deepseek-ai/dsh@0.1.0-rc.7` 按[普通用户安装指南](../install-for-beginners.zh.md)复测：首次安全确认、两个 `false` 决定、tarball 重试安装、`settings.yaml`、受管凭据和 `web --port 0` 启动均成功。首次 `npx` 下载官方 Harness 依赖约三分钟且中途没有进度输出，缓存后的命令在数秒内完成。

验证中使用的是示例模型 URL，没有提供真实 API key，也没有对 Android 设备执行动作。因此本次结果严格覆盖“发布包、安装、配置组合、模块装载、命令注册、空参数分派、随包 ADB 可执行、移除”，不覆盖真实模型请求和手机 UI 操作。

## 验证清单

- [x] 官方 Harness checkout 在当前机器上完成 `pnpm install` 与 `pnpm run build`。
- [x] tarball 安装后，profile manifest 和 `--dump-config` 都出现 `dsh-coremate-mobile`。
- [x] `pnpm dsh web` 实际加载插件；当前需确认 `/opengui` 主命令与 `/coremate` 兼容别名均已注册且 handler 能响应。
- [x] 随包 macOS arm64 ADB 保留可执行位并能报告版本。
- [x] 移除命令清理 profile dependency 和 bundle；手工清理用户 patch 后最终配置成功且无插件匹配。
- [ ] GitHub 私有仓库可访问，目标 SHA/tag 存在，Git 安装的 `prepare` 在 allowlist 授权后成功。
- [ ] 目标模型端点支持配置的 OpenAI 协议、图片输入和工具调用。
- [ ] Android 设备已授权且处于 `device` 状态。
- [ ] `/opengui <任务>` 完成一次真实手机任务。
