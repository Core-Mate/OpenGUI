<p align="center">
  <strong>言語:</strong> <a href="./get-started.md">English</a> | <a href="./get-started.zh-CN.md">简体中文</a> | <a href="./get-started.ja-JP.md">日本語</a>
</p>

# OpenGUI スタートガイド

このリポジトリには、実行可能なバックエンドと Android クライアントが含まれています。

## 方法 1：Claude Code、Codex、または OpenCode でブートストラップする

まず Bootstrap Skill を使用します。

- [`skills/open-gui-bootstrap/SKILL.md`](../skills/open-gui-bootstrap/SKILL.md)

推奨プロンプト：

```text
Read ./skills/open-gui-bootstrap/SKILL.md and help me run OpenGUI. Only ask me for phone-side actions.
```

同じプロンプトを OpenCode でも使用できます。このリポジトリでは Skill をトップレベルの `skills/` ディレクトリに配置しているため、上記のようにパスを明示してください。OpenCode の自動検出では `.opencode/skills/` や `.agents/skills/` などが検索されます。詳細は [Agent Skills ドキュメント](https://opencode.ai/docs/skills/)を参照してください。OpenGUI 固有の OpenCode 設定は必要ありません。

Skill はリポジトリのスクリプトを直接使用します。

- `server/start.sh`
- `client/start.sh`

## 方法 2：手動セットアップ

### 1. バックエンドを起動する

```bash
cd server
./start.sh
```

`server/start.sh` が行うこと：

- Node.js 22+、pnpm、Docker を確認する
- Docker で PostgreSQL と Redis を起動する
- 初回実行時に `.env.example` から `server/apps/backend/.env` を作成する
- 依存関係をインストールする
- Prisma client を生成する
- schema を反映し、バックエンドの初期データを投入する
- ポート `7777` でバックエンドを起動する

初回のデフォルト設定では、モデル API キーだけを追加します。

- `VLM_API_KEY`

現在のバックエンドでは、`VLM_*` 変数を graph agent 共通の OpenAI 互換モデル設定として使用します。これらは、プランニング、監督、要約、および executor のビジョン処理で使用されます。

`VLM_BASE_URL` と `VLM_MODEL` には `.env.example` でデフォルト値が設定されています。別の OpenAI 互換プロバイダーまたはモデルを使用する場合にだけ変更してください。

例：

```env
VLM_API_KEY=your_api_key
VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VLM_MODEL=qwen3.6-plus
```

`VLM_API_KEY` がなくてもバックエンドは起動できますが、graph がモデルを呼び出す段階で実際のタスク実行は失敗します。初回実行では LangSmith tracing と IM channel の認証情報は任意です。

起動後に利用できるエンドポイント：

- API：`http://localhost:7777/api`
- ドキュメント：`http://localhost:7777/docs`

### 2. 端末を接続して Android クライアントをインストールする

root 権限やブートローダーのアンロックは不要です。OpenGUI は Android 標準の `AccessibilityService` API を使ってスクリーンショットを取得し、ジェスチャーを実行します。ADB は APK のインストールと起動、およびローカルバックエンド用の `adb reverse` の設定にだけ使用され、Android システムを root 化したり変更したりすることはありません。

現在の Android クライアントには Android 11（API 30）以降が必要です。Android 9（API 28）など、それ以前のバージョンは現在のスクリーンショットベースの実行パスをサポートしていません。現在のクライアントは Android 15（API 35）をターゲットにしています。

```bash
cd client
./start.sh
```

`client/start.sh` が行うこと：

- `adb` と Java を確認する
- 接続済みの Android 端末を確認する
- `adb reverse tcp:7777 tcp:7777` を実行する
- debug APK をビルドする
- APK をインストールする
- `com.coremate.opengui/.login.SplashActivity` を起動する

`adb reverse` のマッピングは現在の ADB 端末接続に紐づいています。端末を切断して再接続した場合、端末を再起動した場合、または ADB サーバーを再起動した場合は、マッピングが失われることがあります。Android クライアントからローカルバックエンドへ接続できなくなった場合は、端末を再接続して次を実行してください。

```bash
adb reverse tcp:7777 tcp:7777
```

`client/start.sh` を再実行してもマッピングを再作成できます。

### 3. 端末側の権限設定を完了する

アプリを開き、次を有効にします。

- USB デバッグの承認
- ユーザー補助サービス
- オーバーレイ権限
- 必要に応じて OpenGUI をバッテリー最適化の対象外にする

## 現在のソース公開ビルドの動作

現在のソース公開ビルドでは、Android アプリは以前のログイン処理をスキップし、直接 `HomeActivity` を開きます。

ローカル実行では、バックエンドの task controller もデフォルトで `userId = 1` を使用するため、初回セットアップは以前の OTP フローに依存しません。

## 詳細情報

- バックエンド：[`server/apps/backend/README.md`](../server/apps/backend/README.md)
- Discord リモートコントロール：[`docs/DISCORD.ja-JP.md`](./DISCORD.ja-JP.md)
- Android クライアント：[`client/README.md`](../client/README.md)
