<p align="center">
  <strong>言語:</strong> <a href="./DISCORD.md">English</a> | <a href="./DISCORD.zh-CN.md">简体中文</a> | <a href="./DISCORD.ja-JP.md">日本語</a>
</p>

# Discord リモートコントロール

Discord は OpenGUI の任意のリモートコマンド入口として利用できます。Bot が
Discord チャンネルのコマンドを受け取り、バックエンドが OpenGUI タスクを作成または実行し、
スタンバイ中の Android 端末にディスパッチします。

Discord はコマンド入力面です。Bot が Discord アプリの UI を直接操作するわけではありません。

```text
Discord チャンネル
  -> Discord bot
  -> OpenGUI バックエンド
  -> スタンバイ中の Android 端末
  -> 同じ Discord チャンネルへ結果を返す
```

## はじめる前に

この機能は、Discord チャンネルを OpenGUI のリモートコマンド入口にします。

たとえば Discord で次のように送信します:

```text
!opengui do open browser and search OpenGUI
```

バックエンドがこのコマンドを受け取り、OpenGUI タスクを作成し、スタンバイ中の Android
端末にディスパッチします。

この機能が行わないこと:

- Discord Web、Mac、Windows クライアントの UI を自動操作しません。
- OpenGUI Android アプリを置き換えません。実際の端末操作は Android クライアントが行います。
- Discord 専用の Android APK は不要です。

必要なもの:

- Discord アカウント。
- 管理権限のある Discord server。なければテスト用 server を作成できます。
- 起動できる OpenGUI バックエンド。
- バックエンドにスタンバイ接続している Android 端末。

## 1. Discord Server を作成または準備する

すでにテスト用 server がある場合は、この節をスキップできます。

作成する場合:

1. Discord を開きます。
2. 左側の server 一覧で `+` をクリックします。
3. **Create My Own** を選択します。
4. **For me and my friends**、または近い選択肢を選びます。
5. `opengui-test` などの server 名を入力します。
6. デフォルトのテキストチャンネルを開きます。通常は `general` です。

Bot はこの server に招待され、このテキストチャンネルでコマンドを受け取ります。

## 2. Discord Application を作成する

1. https://discord.com/developers/applications を開きます。
2. **New Application** をクリックします。
3. `OpenGUITest` などの名前を入力します。
4. 利用規約に同意し、**Create** をクリックします。

application は Discord 側の bot プロジェクトです。Bot、Client ID、OAuth2 招待 URL
はここで管理します。

## 3. Application ID をコピーする

1. application ページで **General Information** を開きます。
2. **Application ID** を探します。
3. **Copy** をクリックします。
4. この値を次に設定します:

```env
DISCORD_CLIENT_ID=your_application_id
```

ここで使うのは **Application ID** です。Public Key、server ID、channel ID ではありません。

## 4. Bot を作成し Token をコピーする

1. 左側の **Bot** を開きます。
2. Bot 作成を求められた場合は **Add Bot** などのボタンをクリックします。
3. **Token** セクションを探します。
4. **Reset Token** または **Copy** をクリックします。
5. Discord が認証を求める場合があります。
6. コピーした token を次に設定します:

```env
DISCORD_BOT_TOKEN=your_bot_token
```

Token は bot のパスワードです:

- Git にコミットしないでください。
- README に書かないでください。
- 信頼できない相手に共有しないでください。
- 漏えいした場合は Bot ページで **Reset Token** を実行してください。

## 5. Message Content Intent を有効にする

同じ **Bot** ページで **Privileged Gateway Intents** までスクロールします。

有効にするのはこれだけです:

```text
Message Content Intent
```

これは次のような prefix command を読むために必要です:

```text
!opengui help
!opengui devices
!opengui do ...
```

不要なもの:

```text
Presence Intent
Server Members Intent
```

OpenGUI のコマンドフローではメンバー一覧やオンライン状態を読みません。

## 6. 招待 URL を生成する

1. 左側の **OAuth2** を開きます。
2. **URL Generator** を開きます。
3. **Scopes** で次を選択します:

```text
bot
applications.commands
```

どちらも必要です:

- `bot`: bot を server に参加させ、メッセージ送信を可能にします。
- `applications.commands`: `/opengui` の slash command を有効にします。

4. **Bot Permissions** までスクロールします。
5. 次を選択します:

```text
View Channels
Send Messages
Read Message History
Use Slash Commands
```

権限の意味:

- View Channels: bot がチャンネルを見られます。
- Send Messages: bot が返信できます。
- Read Message History: bot がメッセージ履歴を読めます。
- Use Slash Commands: bot が `/opengui` コマンドを提供できます。

**Administrator** をデフォルト手順として使うのは避けてください。短いテストでは便利ですが、
OpenGUI に必要な権限より大きすぎます。

6. ページ下部の生成 URL をコピーします。
7. ブラウザで開きます。
8. テスト用 server を選択します。
9. **Authorize** をクリックします。
10. 認証を完了します。

server のメンバー一覧に bot が表示されれば招待成功です。

招待直後の bot がオフラインでも正常です。バックエンドが token で Discord にログインすると
オンラインになります。

## 7. Discord Developer Mode を有効にする

server、channel、user ID をコピーする必要があります。Discord は標準では **Copy ID** を
隠していることがあります。

有効化手順:

1. Discord を開きます。
2. 左下のプロフィール付近にある歯車アイコンをクリックします。
3. **Advanced** を開きます。
4. **Developer Mode** を有効にします。

これで server、channel、user の右クリックメニューに **Copy ID** が表示されます。

## 8. Server ID、Channel ID、User ID をコピーする

`.env` には 3 つの ID が必要です。

### Server ID

1. 左側の server 一覧でテスト用 server アイコンを右クリックします。
2. **Copy Server ID** または **Copy ID** をクリックします。
3. 次に設定します:

```env
DISCORD_ALLOWED_GUILD_IDS=your_server_id
```

Discord API では server を guild と呼ぶため、環境変数名は `GUILD_IDS` です。

### Channel ID

1. コマンドを送るテキストチャンネル、たとえば `#general` を右クリックします。
2. **Copy Channel ID** または **Copy ID** をクリックします。
3. 次に設定します:

```env
DISCORD_ALLOWED_CHANNEL_IDS=your_channel_id
```

### User ID

1. server のメンバー一覧で自分を探します。
2. 自分のアバターまたはユーザー名を右クリックします。
3. **Copy User ID** または **Copy ID** をクリックします。
4. 次に設定します:

```env
DISCORD_ALLOWED_USER_IDS=your_user_id
```

この allowlist により、他のユーザーが勝手に端末タスクを実行することを防げます。

## 環境変数

以下を `server/apps/backend/.env` に追加します:

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_ALLOWED_GUILD_IDS=
DISCORD_ALLOWED_CHANNEL_IDS=
DISCORD_ALLOWED_USER_IDS=
DISCORD_COMMAND_PREFIX=!opengui
DISCORD_REGISTER_COMMANDS=false
```

最初に slash command をテストする場合は次にします:

```env
DISCORD_REGISTER_COMMANDS=true
```

これにより、バックエンド起動時に `/opengui` コマンドが設定済み guild に登録されます。

slash command の登録後は、次に戻せます:

```env
DISCORD_REGISTER_COMMANDS=false
```

allowlist の動作:

- 空の allowlist は、その次元では制限しないことを意味します。
- 空でない allowlist では、guild、channel、または user が一致する必要があります。
- 本番環境や共有テスト環境では、少なくとも `DISCORD_ALLOWED_GUILD_IDS` と
  `DISCORD_ALLOWED_CHANNEL_IDS` を設定してください。
- `DISCORD_REGISTER_COMMANDS=true` には `DISCORD_CLIENT_ID` と
  `DISCORD_ALLOWED_GUILD_IDS` が必要です。

ID の対応:

| 変数 | Discord での取得元 |
|---|---|
| `DISCORD_CLIENT_ID` | Developer Portal -> General Information -> Application ID |
| `DISCORD_ALLOWED_GUILD_IDS` | Discord server ID |
| `DISCORD_ALLOWED_CHANNEL_IDS` | Discord text channel ID |
| `DISCORD_ALLOWED_USER_IDS` | Discord user ID |

ローカルテスト例:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_ALLOWED_GUILD_IDS=your_server_id
DISCORD_ALLOWED_CHANNEL_IDS=your_channel_id
DISCORD_ALLOWED_USER_IDS=your_user_id
DISCORD_COMMAND_PREFIX=!opengui
DISCORD_REGISTER_COMMANDS=true
```

複数の ID はカンマ区切りで指定できます:

```env
DISCORD_ALLOWED_CHANNEL_IDS=channel_id_1,channel_id_2
DISCORD_ALLOWED_USER_IDS=user_id_1,user_id_2
```

## 9. バックエンドを再起動する

`.env` を変更した後はバックエンドを再起動してください。環境変数は通常、プロセス起動時に
一度だけ読み込まれます。

バックエンドが起動中なら、ターミナルで次を押します:

```bash
Ctrl + C
```

その後、再起動します:

```bash
cd server
pnpm backend
```

または:

```bash
cd server
./start.sh
```

成功時のログ例:

```text
IM channel: Discord bot registered
[DiscordBot] Connected as OpenGUITest#3874
```

`DISCORD_REGISTER_COMMANDS=true` の場合は、次のようなログも出ます:

```text
[DiscordBot] Slash commands registered for guild 1234567890
```

次のログが出る場合:

```text
Discord bot not configured, skipping
```

バックエンドが `DISCORD_BOT_TOKEN` を読めていないか、`.env` の場所が想定と違います。

## 10. Android 端末がオンラインか確認する

Discord は入口です。実際に操作するのは Android 端末です。

タスク送信前に確認してください:

- OpenGUI バックエンドが起動している。
- OpenGUI Android アプリが開いている。
- 端末がバックエンドに接続している。
- バックエンドログに `Device registered` のような表示がある。

Discord でも確認できます:

```text
!opengui devices
```

次のような端末モデルが出ればオンラインです:

```text
OPPO PGEM10
```

## コマンド

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

Slash commands は guild-scoped で登録されます。登録は
`DISCORD_REGISTER_COMMANDS=true` の場合のみ行われます。

## 検証

おすすめの順序:

1. Bot が返信できるか確認します:

```text
!opengui help
```

2. Bot がオンライン端末を見られるか確認します:

```text
!opengui devices
```

3. Slash command が使えるか確認します:

```text
/opengui help
```

4. 実際の端末タスクを送信します:

```text
!opengui do open browser and search OpenGUI
```

または:

```text
/opengui do task:open browser and search OpenGUI
```

期待される結果:

- `help` がコマンド一覧を返します。
- `devices` がスタンバイ中の Android 端末を表示します。
- `do` が OpenGUI タスクを作成し、実行を開始し、進捗を同じ Discord チャンネルに投稿します。

実行中、Discord には次のようなメッセージが表示されます:

```text
Created task: ...
Starting execution: ...
Device: ...
Planning...
Executing...
```

端末側でも、ブラウザを開く、検索ボックスをタップする、検索語を入力するなどの対応する操作が見えるはずです。

## トラブルシューティング

### Bot がオフラインのまま

よくある原因:

- バックエンドが起動していない。
- `DISCORD_BOT_TOKEN` が未設定または間違っている。
- `.env` を変更した後にバックエンドを再起動していない。
- バックエンドプロセスが Discord に接続できない。

まずバックエンドログを確認してください。`[DiscordBot] Connected as ...` がなければ、
Bot はログインできていません。

### バックエンドに `Connect Timeout Error` が出る

これは通常コードの問題ではなく、ネットワークの問題です。

ブラウザで Discord にアクセスできても、Node.js のバックエンドプロセスが Discord API に
接続できるとは限りません。プロキシがブラウザだけに効いている場合があります。

試すこと:

- プロキシツールで global mode または TUN mode を有効にする。
- ターミナルに `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` を設定する。
- ネットワーク設定を変えた後、バックエンドを再起動する。

### `!opengui help` が返信しない

確認すること:

- Bot がオンラインか。
- Bot が server に参加しているか。
- channel ID が `DISCORD_ALLOWED_CHANNEL_IDS` に含まれているか。
- user ID が `DISCORD_ALLOWED_USER_IDS` に含まれているか。
- Bot ページで **Message Content Intent** が有効か。
- Bot に View Channels、Send Messages、Read Message History 権限があるか。

### `/opengui` が表示されない

確認すること:

- `.env` に `DISCORD_REGISTER_COMMANDS=true` があるか。
- `DISCORD_CLIENT_ID` が設定されているか。
- `DISCORD_ALLOWED_GUILD_IDS` が設定されているか。
- Bot 招待時に `applications.commands` scope を含めたか。
- バックエンドログに slash command 登録成功が出ているか。

Slash command は表示まで数秒かかる場合があります。必要なら Discord を更新または再起動してください。

### `!opengui devices` に端末が出ない

Discord Bot は動いていますが、Android 端末がスタンバイ接続していません。

確認すること:

- 端末アプリが開いているか。
- 端末が Mac/バックエンドのネットワークに到達できるか。
- バックエンドログに `Device registered` があるか。
- Web コンソールで端末がオンラインか。

### 権限または allowlist の問題

allowlist を設定している場合、一致する server、channel、user ID だけがタスクを実行できます。

再確認してください:

```env
DISCORD_ALLOWED_GUILD_IDS=
DISCORD_ALLOWED_CHANNEL_IDS=
DISCORD_ALLOWED_USER_IDS=
```

よくある間違い:

- Application ID を server ID として使っている。
- server ID を channel ID として使っている。
- ID コピー前に Developer Mode を有効にしていない。
- allowlist に入っていないチャンネルでコマンドを送っている。

## 注意事項

- `DISCORD_BOT_TOKEN` が空の場合、バックエンドは通常どおり起動し、Discord をスキップします。
- Android 側に Discord 専用の変更は不要です。
- Discord Web、Mac、Windows クライアントはすべて利用できます。Bot は特定の Discord クライアントではなく Discord API に接続します。
- Bot が connection timeout で起動できない場合は、バックエンドプロセスが Discord にアクセスできるか確認してください。ブラウザのプロキシ設定が Node.js プロセスに適用されないことがあります。
