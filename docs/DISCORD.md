<p align="center">
  <strong>Language:</strong> <a href="./DISCORD.md">English</a> | <a href="./DISCORD.zh-CN.md">简体中文</a> | <a href="./DISCORD.ja-JP.md">日本語</a>
</p>

# Discord Remote Control

Discord can be used as an optional remote command entry for OpenGUI. The bot
receives commands in a Discord channel, the backend creates or runs OpenGUI
tasks, and a standby Android phone executes them.

Discord is only the command surface. The bot does not control the Discord app UI.

```text
Discord channel
  -> Discord bot
  -> OpenGUI backend
  -> standby Android phone
  -> result back to the same Discord channel
```

## Before You Start

This feature turns a Discord channel into a remote command surface for OpenGUI.

When you send:

```text
!opengui do open browser and search OpenGUI
```

the backend receives the text, creates an OpenGUI task, and dispatches it to a
standby Android phone.

This feature does not:

- automate the Discord web, Mac, or Windows client UI.
- replace the OpenGUI Android app. The Android client still performs phone actions.
- require a Discord-specific Android APK.

You need:

- a Discord account.
- a Discord server that you can manage. You can create a private test server.
- a running local OpenGUI backend.
- at least one Android phone connected to the backend in standby mode.

## 1. Create Or Prepare A Discord Server

Skip this section if you already have a test server.

To create one:

1. Open Discord.
2. Click `+` in the left server list.
3. Select **Create My Own**.
4. Select **For me and my friends**, or the closest available option.
5. Enter a server name, such as `opengui-test`.
6. Open the default text channel, usually named `general`.

The bot will be invited into this server and will receive commands from a text
channel there.

## 2. Create A Discord Application

1. Open https://discord.com/developers/applications.
2. Click **New Application**.
3. Enter a name, such as `OpenGUITest`.
4. Accept the terms and click **Create**.

The application is the Discord-side project that owns the bot, client ID, and
OAuth2 invite URL.

## 3. Copy The Application ID

1. In the application page, open **General Information**.
2. Find **Application ID**.
3. Click **Copy**.
4. Put this value into:

```env
DISCORD_CLIENT_ID=your_application_id
```

Use **Application ID** here. Do not use Public Key, server ID, or channel ID.

## 4. Create The Bot And Copy The Token

1. Open **Bot** in the left sidebar.
2. If Discord asks you to create a bot, click **Add Bot** or the equivalent button.
3. Find the **Token** section.
4. Click **Reset Token** or **Copy**.
5. Discord may ask for verification.
6. Put the copied token into:

```env
DISCORD_BOT_TOKEN=your_bot_token
```

The token is the bot password:

- Do not commit it to Git.
- Do not write it into README files.
- Do not share it with untrusted people.
- If it leaks, open the Bot page and click **Reset Token**.

## 5. Enable Message Content Intent

Still on the **Bot** page, scroll to **Privileged Gateway Intents**.

Enable only:

```text
Message Content Intent
```

This allows prefix commands such as:

```text
!opengui help
!opengui devices
!opengui do ...
```

You do not need:

```text
Presence Intent
Server Members Intent
```

The OpenGUI command flow does not read member lists or presence status.

## 6. Generate The Invite URL

1. Open **OAuth2** in the left sidebar.
2. Open **URL Generator**.
3. In **Scopes**, select:

```text
bot
applications.commands
```

Both scopes are needed:

- `bot` lets the bot join the server and send messages.
- `applications.commands` enables `/opengui` slash commands.

4. Scroll to **Bot Permissions**.
5. Select:

```text
View Channels
Send Messages
Read Message History
Use Slash Commands
```

Permission meaning:

- View Channels: the bot can see the channel.
- Send Messages: the bot can reply.
- Read Message History: the bot can read message context.
- Use Slash Commands: the bot can provide `/opengui` commands.

Do not use **Administrator** as the default setup. It works for quick testing but
grants more permission than OpenGUI needs.

6. Copy the generated URL at the bottom of the page.
7. Open it in a browser.
8. Select your test server.
9. Click **Authorize**.
10. Complete the verification.

When the bot appears in the server member list, the invite succeeded.

The bot may be offline immediately after being invited. That is normal. It comes
online only after the backend logs into Discord with the bot token.

## 7. Enable Discord Developer Mode

You need to copy server, channel, and user IDs. Discord may hide **Copy ID** by
default.

To enable it:

1. Open Discord.
2. Click the gear icon near your profile in the lower-left corner.
3. Open **Advanced**.
4. Enable **Developer Mode**.

After this, right-click menus for servers, channels, and users should include
**Copy ID**.

## 8. Copy Server ID, Channel ID, And User ID

You need three IDs for `.env`.

### Server ID

1. In the left server list, right-click your test server icon.
2. Click **Copy Server ID** or **Copy ID**.
3. Put it into:

```env
DISCORD_ALLOWED_GUILD_IDS=your_server_id
```

Discord calls servers "guilds" in the API, so the environment variable uses
`GUILD_IDS`.

### Channel ID

1. Right-click the text channel where you will send commands, such as `#general`.
2. Click **Copy Channel ID** or **Copy ID**.
3. Put it into:

```env
DISCORD_ALLOWED_CHANNEL_IDS=your_channel_id
```

### User ID

1. Find yourself in the server member list.
2. Right-click your avatar or username.
3. Click **Copy User ID** or **Copy ID**.
4. Put it into:

```env
DISCORD_ALLOWED_USER_IDS=your_user_id
```

This allowlist prevents other users from triggering phone tasks.

## Environment Variables

Add these values to `server/apps/backend/.env`:

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_ALLOWED_GUILD_IDS=
DISCORD_ALLOWED_CHANNEL_IDS=
DISCORD_ALLOWED_USER_IDS=
DISCORD_COMMAND_PREFIX=!opengui
DISCORD_REGISTER_COMMANDS=false
```

For the first slash-command test, set:

```env
DISCORD_REGISTER_COMMANDS=true
```

This lets the backend register `/opengui` commands in your configured guild on
startup.

After slash commands have been registered, you can set it back to:

```env
DISCORD_REGISTER_COMMANDS=false
```

Allowlist behavior:

- Empty allowlist means that dimension is not restricted.
- Non-empty allowlist means the guild, channel, or user must match.
- For production or shared testing, set at least `DISCORD_ALLOWED_GUILD_IDS`
  and `DISCORD_ALLOWED_CHANNEL_IDS`.
- `DISCORD_REGISTER_COMMANDS=true` requires `DISCORD_CLIENT_ID` and
  `DISCORD_ALLOWED_GUILD_IDS`.

ID reference:

| Variable | Discord source |
|---|---|
| `DISCORD_CLIENT_ID` | Developer Portal -> General Information -> Application ID |
| `DISCORD_ALLOWED_GUILD_IDS` | Discord server ID |
| `DISCORD_ALLOWED_CHANNEL_IDS` | Discord text channel ID |
| `DISCORD_ALLOWED_USER_IDS` | Discord user ID |

Local test example:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_ALLOWED_GUILD_IDS=your_server_id
DISCORD_ALLOWED_CHANNEL_IDS=your_channel_id
DISCORD_ALLOWED_USER_IDS=your_user_id
DISCORD_COMMAND_PREFIX=!opengui
DISCORD_REGISTER_COMMANDS=true
```

Multiple IDs can be comma-separated:

```env
DISCORD_ALLOWED_CHANNEL_IDS=channel_id_1,channel_id_2
DISCORD_ALLOWED_USER_IDS=user_id_1,user_id_2
```

## 9. Restart The Backend

After changing `.env`, restart the backend. Environment variables are usually
read once when the process starts.

If the backend is running, press:

```bash
Ctrl + C
```

Then start it again:

```bash
cd server
pnpm backend
```

or:

```bash
cd server
./start.sh
```

Successful logs should include:

```text
IM channel: Discord bot registered
[DiscordBot] Connected as OpenGUITest#3874
```

If `DISCORD_REGISTER_COMMANDS=true`, you should also see:

```text
[DiscordBot] Slash commands registered for guild 1234567890
```

If you see:

```text
Discord bot not configured, skipping
```

the backend did not read `DISCORD_BOT_TOKEN`, or `.env` is not in the expected
place.

## 10. Confirm The Android Phone Is Online

Discord is only the entry point. The Android phone performs the actual actions.

Before sending a task, confirm:

- the OpenGUI backend is running.
- the OpenGUI Android app is open.
- the phone is connected to the backend.
- backend logs include something like `Device registered`.

You can also run:

```text
!opengui devices
```

If a device model appears, such as:

```text
OPPO PGEM10
```

the phone is online and waiting for tasks.

## Commands

Prefix commands:

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

Slash commands:

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

Slash commands are guild-scoped. They are registered only when
`DISCORD_REGISTER_COMMANDS=true`.

## Verification

Recommended order:

1. Confirm the bot can reply:

```text
!opengui help
```

2. Confirm the bot can see online phones:

```text
!opengui devices
```

3. Confirm slash commands are available:

```text
/opengui help
```

4. Dispatch a real phone task:

```text
!opengui do open browser and search OpenGUI
```

or:

```text
/opengui do task:open browser and search OpenGUI
```

Expected result:

- `help` returns the command list.
- `devices` lists the standby Android phone.
- `do` creates an OpenGUI task, starts an execution, and posts progress back to
  the same Discord channel.

During execution, Discord should show messages like:

```text
Created task: ...
Starting execution: ...
Device: ...
Planning...
Executing...
```

The phone should perform the matching action, such as opening the browser,
tapping the search box, and typing the query.

## Troubleshooting

### The Bot Stays Offline

Common causes:

- the backend is not running.
- `DISCORD_BOT_TOKEN` is missing or incorrect.
- `.env` was changed but the backend was not restarted.
- the backend process cannot reach Discord.

Check backend logs first. If there is no `[DiscordBot] Connected as ...`, the
bot did not log in.

### Backend Logs `Connect Timeout Error`

This is usually a network issue, not a code issue.

Browser access to Discord does not guarantee that the Node.js backend process can
reach the Discord API. Some proxies only affect the browser.

Try:

- enabling global or TUN mode in your proxy tool.
- configuring `HTTP_PROXY`, `HTTPS_PROXY`, or `ALL_PROXY` for the terminal.
- restarting the backend after changing network settings.

### `!opengui help` Does Not Reply

Check:

- the bot is online.
- the bot is in the server.
- the channel ID is included in `DISCORD_ALLOWED_CHANNEL_IDS`.
- your user ID is included in `DISCORD_ALLOWED_USER_IDS`.
- **Message Content Intent** is enabled on the Bot page.
- the bot has View Channels, Send Messages, and Read Message History permissions.

### `/opengui` Does Not Appear

Check:

- `.env` has `DISCORD_REGISTER_COMMANDS=true`.
- `DISCORD_CLIENT_ID` is configured.
- `DISCORD_ALLOWED_GUILD_IDS` is configured.
- the bot invite included the `applications.commands` scope.
- backend logs say slash command registration succeeded.

Slash commands may take a few seconds to appear. Refresh Discord or restart the
client if needed.

### `!opengui devices` Shows No Phone

The Discord bot works, but no Android phone is online in standby mode.

Check:

- the phone app is open.
- the phone can reach the Mac/backend network.
- backend logs include `Device registered`.
- the web console shows the phone online.

### Permission Or Allowlist Problems

When allowlists are configured, only matching server, channel, and user IDs can
trigger tasks.

Recheck:

```env
DISCORD_ALLOWED_GUILD_IDS=
DISCORD_ALLOWED_CHANNEL_IDS=
DISCORD_ALLOWED_USER_IDS=
```

Common mistakes:

- using Application ID as the server ID.
- using server ID as the channel ID.
- not enabling Developer Mode before copying IDs.
- sending commands in a channel that is not allowlisted.

## Notes

- If `DISCORD_BOT_TOKEN` is empty, the backend starts normally and skips Discord.
- Android does not need a Discord-specific change.
- Discord web, Mac, and Windows clients all work because the bot connects to the
  Discord API, not to a specific client app.
- If the bot fails with a connection timeout, check whether the backend process
  can access Discord. Browser proxy settings may not apply to Node.js processes.
