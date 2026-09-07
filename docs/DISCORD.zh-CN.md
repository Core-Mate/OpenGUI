<p align="center">
  <strong>语言切换：</strong><a href="./DISCORD.md">English</a> | <a href="./DISCORD.zh-CN.md">简体中文</a> | <a href="./DISCORD.ja-JP.md">日本語</a>
</p>

# Discord 远程控制

Discord 可以作为 OpenGUI 的可选远程任务入口。Bot 在 Discord 频道里接收命令，
后端创建或执行 OpenGUI 任务，再把任务下发给待命的 Android 手机执行。

Discord 只是命令入口。Bot 不会直接控制 Discord 客户端界面。

```text
Discord 频道
  -> Discord bot
  -> OpenGUI 后端
  -> 待命 Android 手机
  -> 结果回传到同一个 Discord 频道
```

## 开始前需要知道

这套 Discord 功能只做一件事：把 Discord 频道变成 OpenGUI 的远程命令入口。

你在 Discord 里发：

```text
!opengui do open browser and search OpenGUI
```

后端会收到这句话，创建 OpenGUI 任务，然后下发给已经待命连接的 Android 手机。

它不会做这些事情：

- 不会自动操作 Discord 网页版、Mac 版或 Windows 版界面。
- 不会替代 Android App，真正执行手机动作的仍然是 OpenGUI Android 客户端。
- 不要求重新打一个专门的 Discord APK。

你需要准备：

- 一个 Discord 账号。
- 一个你有管理权限的 Discord server。没有的话可以自己新建一个测试 server。
- 本地 OpenGUI 后端能启动。
- 至少一台 Android 手机已经能连接到 OpenGUI 后端并进入待命状态。

## 1. 创建或准备 Discord Server

如果你已经有自己的测试 server，可以跳过这一节。

如果没有：

1. 打开 Discord。
2. 看左侧 server 列表，点击 `+`。
3. 选择 **Create My Own**。
4. 选择 **For me and my friends** 或类似选项。
5. 输入一个 server 名称，例如 `opengui-test`。
6. 创建完成后，进入默认文字频道，一般叫 `general`、`常规` 或类似名字。

后面 Bot 会被邀请进这个 server，并在这个文字频道里接收命令。

## 2. 创建 Discord Application

1. 打开 https://discord.com/developers/applications。
2. 点击右上角 **New Application**。
3. 输入名字，例如 `OpenGUITest`。
4. 勾选同意条款后点击 **Create**。

这里的 application 可以理解成“Discord 机器人项目”。Bot、Client ID、OAuth2 邀请链接都从这里配置。

## 3. 复制 Application ID

1. 在刚创建的 application 页面里，打开左侧 **General Information**。
2. 找到 **Application ID**。
3. 点击旁边的 **Copy**。
4. 这个值填到：

```env
DISCORD_CLIENT_ID=你的Application ID
```

注意：这里要的是 **Application ID**，不是 Public Key，也不是服务器 ID。

## 4. 创建 Bot 并复制 Token

1. 打开左侧 **Bot** 页面。
2. 如果页面提示创建 bot，点击 **Add Bot** 或类似按钮。
3. 找到 **Token** 区域。
4. 点击 **Reset Token** 或 **Copy**。
5. Discord 可能会要求你输入验证码或二次确认。
6. 复制出来的 token 填到：

```env
DISCORD_BOT_TOKEN=你的Bot Token
```

Token 很重要，等同于机器人密码：

- 不要提交到 Git。
- 不要写进 README。
- 不要发给不可信的人。
- 如果泄露了，到 Bot 页面点击 **Reset Token** 换一个新的。

## 5. 打开 Message Content Intent

还在 **Bot** 页面，往下找到 **Privileged Gateway Intents**。

只需要打开：

```text
Message Content Intent
```

它的作用是让 Bot 能读到普通文字消息内容，也就是支持：

```text
!opengui help
!opengui devices
!opengui do ...
```

不用打开：

```text
Presence Intent
Server Members Intent
```

OpenGUI 的 Discord 命令链路不需要读取成员列表，也不需要读取在线状态。

## 6. 生成邀请链接并邀请 Bot

1. 打开左侧 **OAuth2**。
2. 打开 **URL Generator**。
3. 在 **Scopes** 里勾选：

```text
bot
applications.commands
```

这两个都要选：

- `bot`：让机器人加入 server，并能发消息。
- `applications.commands`：让 `/opengui ...` 这种 Slash 命令可用。

4. 往下找到 **Bot Permissions**。
5. 勾选这些权限：

```text
View Channels
Send Messages
Read Message History
Use Slash Commands
```

这些权限分别是什么意思：

- View Channels：Bot 能看到频道。
- Send Messages：Bot 能回复消息。
- Read Message History：Bot 能读取频道历史，保证命令上下文正常。
- Use Slash Commands：Bot 能提供 `/opengui` 命令。

不建议直接选 **Administrator**。测试时虽然省事，但权限太大，不适合作为默认文档方案。

6. 页面底部会生成一个 URL。
7. 点击 **Copy**，复制这个邀请链接。
8. 在浏览器打开这个链接。
9. 选择你的测试 server。
10. 点击 **Authorize**。
11. 完成人机验证。

回到 Discord server，如果右侧成员列表能看到你的 Bot，说明邀请成功。

注意：刚邀请进来时 Bot 可能显示离线，这是正常的。只有后端用 token 成功连接 Discord 后，它才会在线。

## 7. 打开 Discord Developer Mode

后面要复制 server ID、channel ID、user ID。默认情况下 Discord 可能不显示 **Copy ID**。

开启方式：

1. 打开 Discord。
2. 点击左下角自己的头像旁边的齿轮，也就是 **User Settings**。
3. 找到 **Advanced**。
4. 打开 **Developer Mode**。

打开后，右键 server、频道、用户时，就能看到 **Copy ID**。

## 8. 复制 Server ID、Channel ID、User ID

你需要复制三个 ID，分别填到 `.env`。

### Server ID

1. 回到 Discord。
2. 在左侧 server 列表，右键你的测试 server 图标。
3. 点击 **Copy Server ID** 或 **Copy ID**。
4. 填到：

```env
DISCORD_ALLOWED_GUILD_IDS=你的Server ID
```

Discord 的 server 在 API 里叫 guild，所以这里的变量名是 `GUILD_IDS`。

### Channel ID

1. 右键你准备用来发命令的文字频道，例如 `#general` 或 `#常规`。
2. 点击 **Copy Channel ID** 或 **Copy ID**。
3. 填到：

```env
DISCORD_ALLOWED_CHANNEL_IDS=你的Channel ID
```

### User ID

1. 在 Discord 右侧成员列表里找到你自己。
2. 右键你的头像或名字。
3. 点击 **Copy User ID** 或 **Copy ID**。
4. 填到：

```env
DISCORD_ALLOWED_USER_IDS=你的User ID
```

这个白名单可以防止其他人随便在频道里触发手机任务。

## 环境变量

把这些值写入 `server/apps/backend/.env`：

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_ALLOWED_GUILD_IDS=
DISCORD_ALLOWED_CHANNEL_IDS=
DISCORD_ALLOWED_USER_IDS=
DISCORD_COMMAND_PREFIX=!opengui
DISCORD_REGISTER_COMMANDS=false
```

第一次测试 Slash 命令时，建议先设成：

```env
DISCORD_REGISTER_COMMANDS=true
```

这样后端启动时会把 `/opengui` 命令注册到你的 server。

等命令已经注册成功后，可以改回：

```env
DISCORD_REGISTER_COMMANDS=false
```

这样以后每次启动后端时，就不会重复注册 Slash 命令。

白名单规则：

- 某个白名单为空，表示这一维度不限制。
- 某个白名单非空，guild、channel 或 user 必须匹配。
- 生产环境或多人测试环境，建议至少设置 `DISCORD_ALLOWED_GUILD_IDS` 和
  `DISCORD_ALLOWED_CHANNEL_IDS`。
- `DISCORD_REGISTER_COMMANDS=true` 需要同时配置 `DISCORD_CLIENT_ID` 和
  `DISCORD_ALLOWED_GUILD_IDS`。

ID 对照：

| 变量 | Discord 来源 |
|---|---|
| `DISCORD_CLIENT_ID` | Developer Portal -> General Information -> Application ID |
| `DISCORD_ALLOWED_GUILD_IDS` | Discord server ID |
| `DISCORD_ALLOWED_CHANNEL_IDS` | Discord text channel ID |
| `DISCORD_ALLOWED_USER_IDS` | Discord user ID |

如果右键菜单里看不到 **Copy ID**，先在 Discord 打开开发者模式：
**User Settings -> Advanced -> Developer Mode**。

一个本地测试 `.env` 示例：

```env
DISCORD_BOT_TOKEN=你的Bot Token
DISCORD_CLIENT_ID=你的Application ID
DISCORD_ALLOWED_GUILD_IDS=你的Server ID
DISCORD_ALLOWED_CHANNEL_IDS=你的Channel ID
DISCORD_ALLOWED_USER_IDS=你的User ID
DISCORD_COMMAND_PREFIX=!opengui
DISCORD_REGISTER_COMMANDS=true
```

多个 ID 可以用英文逗号隔开：

```env
DISCORD_ALLOWED_CHANNEL_IDS=频道ID1,频道ID2
DISCORD_ALLOWED_USER_IDS=用户ID1,用户ID2
```

## 9. 重启后端

改完 `.env` 后，需要重启后端。`.env` 通常只会在进程启动时读取一次。

如果后端正在运行，先在终端按：

```bash
Ctrl + C
```

然后重新启动后端，例如：

```bash
cd server
pnpm backend
```

或者使用项目脚本：

```bash
cd server
./start.sh
```

启动成功后，日志里应该看到类似：

```text
IM channel: Discord bot registered
[DiscordBot] Connected as OpenGUITest#3874
```

如果 `DISCORD_REGISTER_COMMANDS=true`，还应该看到类似：

```text
[DiscordBot] Slash commands registered for guild 1234567890
```

如果看到：

```text
Discord bot not configured, skipping
```

说明后端没有读到 `DISCORD_BOT_TOKEN`，或者 `.env` 位置不对。

## 10. 确认 Android 手机在线

Discord 只是入口，真正执行动作的是 Android 手机。

在发任务前，先确认：

- OpenGUI 后端已经启动。
- Android 手机上安装并打开了 OpenGUI App。
- 手机和后端已经连上。
- 后端日志里能看到类似 `Device registered`。

你也可以先在 Discord 里运行：

```text
!opengui devices
```

如果能看到手机型号，例如：

```text
OPPO PGEM10
```

说明手机已经在线待命。

## 命令

前缀命令：

```text
!opengui help
!opengui devices
!opengui do open browser and search OpenGUI
!opengui run 123
!opengui status
!opengui status 456
!opengui cancel 456
!opengui pause 456
!opengui resume 456 continue
```

Slash 命令：

```text
/opengui help
/opengui devices
/opengui do task:open browser and search OpenGUI
/opengui run task_id:123
/opengui status execution_id:456
/opengui cancel execution_id:456
/opengui pause execution_id:456
/opengui resume execution_id:456 feedback:continue
```

Slash 命令默认按 guild 注册，只会在 `DISCORD_REGISTER_COMMANDS=true` 时注册。

## 验证

建议按这个顺序测试：

1. 测试 Bot 是否能回复：

```text
!opengui help
```

2. 测试 Bot 是否能看到在线手机：

```text
!opengui devices
```

3. 测试 Slash 命令是否可用：

```text
/opengui help
```

4. 测试真正下发手机任务：

```text
!opengui do open browser and search OpenGUI
```

或者使用 Slash 命令：

```text
/opengui do task:open browser and search OpenGUI
```

预期结果：

- `help` 返回命令列表。
- `devices` 列出在线待命 Android 手机。
- `do` 创建 OpenGUI 任务、启动执行，并把执行进度回传到同一个 Discord 频道。

任务开始后，Discord 里会看到类似：

```text
Created task: ...
Starting execution: ...
Device: ...
Planning...
Executing...
```

手机上也应该能看到对应操作，例如打开浏览器、点击搜索框、输入关键词。

## 常见问题

### Bot 一直离线

常见原因：

- 后端没有启动。
- `.env` 里的 `DISCORD_BOT_TOKEN` 没填或填错。
- 修改 `.env` 后没有重启后端。
- 终端里的后端进程连不上 Discord。

先看后端日志。如果没有 `[DiscordBot] Connected as ...`，说明 Bot 没有成功登录。

### 后端提示 Connect Timeout Error

这通常不是代码问题，而是网络问题。

很多代理只代理浏览器，不代理终端里的 Node.js 后端进程。Discord 网页能打开，不代表后端一定能连上 Discord API。

解决方式：

- 打开代理软件的全局模式或 TUN 模式。
- 或者给终端配置 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`。
- 配好后重启后端。

### `!opengui help` 没反应

检查这些点：

- Bot 是否在线。
- Bot 是否在这个 server 里。
- 你发命令的频道 ID 是否在 `DISCORD_ALLOWED_CHANNEL_IDS` 白名单里。
- 你的用户 ID 是否在 `DISCORD_ALLOWED_USER_IDS` 白名单里。
- Bot 页面是否打开了 **Message Content Intent**。
- Bot 是否有 View Channel、Send Messages、Read Message History 权限。

### `/opengui` 没出现

检查这些点：

- `.env` 里是否设置了 `DISCORD_REGISTER_COMMANDS=true`。
- 是否配置了 `DISCORD_CLIENT_ID`。
- 是否配置了 `DISCORD_ALLOWED_GUILD_IDS`。
- Bot 邀请时是否选择了 `applications.commands` scope。
- 后端启动日志里是否出现了 slash command 注册成功信息。

Slash 命令有时需要等几秒才显示，也可以重启 Discord 客户端或刷新网页。

### `!opengui devices` 看不到手机

说明 Discord Bot 通了，但 Android 手机没有在线待命。

检查：

- 手机 App 是否打开。
- 手机是否和 Mac/后端在同一网络，或者之前的无线连接是否还有效。
- 后端日志里是否出现 `Device registered`。
- Web 控制台里是否能看到手机在线。

### 提示没有权限或没有反应

如果配置了白名单，只有匹配的 server、channel、user 才能触发任务。

重新复制并检查：

```env
DISCORD_ALLOWED_GUILD_IDS=
DISCORD_ALLOWED_CHANNEL_IDS=
DISCORD_ALLOWED_USER_IDS=
```

最常见的小白错误是：

- 把 Application ID 填成了 Server ID。
- 把 Channel ID 填成了 Server ID。
- 复制 ID 时没有打开 Developer Mode。
- 在一个没有加入白名单的频道里发命令。

## 注意事项

- `DISCORD_BOT_TOKEN` 为空时，后端会正常启动并跳过 Discord。
- Android APK 不需要因为 Discord 功能做专门修改。
- Discord 网页版、Mac 版、Windows 版都可用，因为 Bot 连接的是 Discord API，
  不是某个具体 Discord 客户端。
- 如果 Bot 启动时报连接超时，检查后端进程是否能访问 Discord。浏览器代理不一定
  会自动作用到 Node.js 后端进程。
