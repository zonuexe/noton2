# noton2

**Cloudflare で完結する超高速・日程調整 Web アプリケーション**。

---

## 特徴

* 🛡️ **主催者の GitHub 身元確認**: イベント作成者は GitHub アカウントで身元を明示。参加者が「誰が立てた調整表か」を安心して確認できます。
* 🐷 **回答者は完全登録不要**: 日程に回答するメンバーはログインや登録は一切不要。名前とステータスを選ぶだけで即座に回答できます。
* ⏱️ **カレンダー×時間帯で直感設定**: カレンダー上の日付クリックと「終日」「夜間」「ランチ」「カスタム」などのプリセットで候補枠をサクサク作成。
* 🎯 **直感的な 4 段階回答**: `[◎ 希望]` `[◯ 参加可能]` `[△ 未定]` `[✕ 不可]` ＋ 「すべて◯/✕にする」クイック操作。
* 👑 **スコア集計マトリクス表**: 全員の空き時間を一目で把握。スコア算出（◎=2pt, ◯=1pt, △=0.5pt, ✕=0pt）で最適な候補日時を自動ハイライト（第1候補バッジ）。
* 🔑 **主催者管理機能**: 日程確定ボタン、確定マークの付与、LINE / Slack 連絡用定型メッセージのワンクリック生成・コピー。作成者はログイン中であればURLパラメータなしでも管理可能。
* ⚡ **動的 OGP & メタタグ (Hono SSR)**: イベント名や候補日時が URL シェア時にチャットツール上でリッチに展開。
* 🚀 **ゼロ仮想 DOM (Vue JSX Vapor Mode)**: 仮想 DOM を介さず DOM を直接更新する fine-grained なリアクティビティにより、マトリクス表のセル描画も爆速。

---

## 技術スタック

* **サーバー / SSR / API**: [Hono](https://hono.dev/) (`hono/jsx`) on [Cloudflare Workers](https://workers.cloudflare.com/)
* **クライアント (Interactive Island)**: [Vue 3 (Vapor Mode)](https://vuejs.org/) + [`vue-jsx-vapor`](https://github.com/vuejs/vue-jsx-vapor) (TSX)
* **データベース**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (Serverless SQLite)
* **スタイリング**: [Tailwind CSS v4](https://tailwindcss.com/)
* **ビルドツール**: [Vite](https://vitejs.dev/) + [@cloudflare/vite-plugin](https://github.com/cloudflare/workers-sdk)

---

## 開発環境のセットアップ

本プロジェクトは [mise](https://mise.jdx.dev/) によりツールバージョン（Node.js, pnpm）および開発タスクを一元管理しています。

### 1. 初回セットアップ（依存インストール & ローカルDB初期化）

```bash
mise run setup
```

※ `mise` を使わない場合は `pnpm install && pnpm run db:migrate:local` でもセットアップ可能です。

### 2. 環境変数設定（GitHub OAuth）

開発環境用の環境変数ファイル `.dev.vars` を作成します：

```bash
cp .dev.vars.example .dev.vars
```

#### GitHub OAuth App の作成（本物の GitHub ログインを使う場合）
1. [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/applications/new) にアクセス
2. 以下を入力して作成:
   * **Application name**: `noton2 (Local Dev)`
   * **Homepage URL**: `http://localhost:5173`
   * **Authorization callback URL**: `http://localhost:5173/auth/github/callback`
3. 発行された `Client ID` と `Client Secret` を `.dev.vars` に設定します。

> **💡 ヒント（クイック動作確認）:**
> `GITHUB_CLIENT_ID` を空のまま起動した場合、開発環境専用の「🧑‍💻 開発用テストユーザーとしてログイン」機能が利用でき、GitHub OAuth App を作成しなくてもすぐに動作確認を行えます。

### 3. 開発サーバーの起動

```bash
mise run dev
```

ブラウザで `http://localhost:5173` にアクセスして利用できます。

---

## 主な mise タスク一覧

| コマンド | 説明 |
| :--- | :--- |
| `mise run dev` | 開発サーバーを起動 (Vite + Cloudflare Workers) |
| `mise run build` | 本番用ビルド (Vite) |
| `mise run preview` | Wrangler によるローカルプレビュー |
| `mise run db:migrate:local` | ローカル D1 データベースへのマイグレーション |
| `mise run db:migrate:remote` | リモート（本番）D1 データベースへのマイグレーション |
| `mise run deploy` | Cloudflare Workers へビルド＆デプロイ |
| `mise run setup` | 初回セットアップ（依存インストール & ローカルDB初期化） |

---

## Cloudflare へのデプロイ

### 1. Cloudflare D1 データベースの作成（初回のみ）

```bash
npx wrangler d1 create noton2-db
```

発行された `database_id` を `wrangler.jsonc` の `database_id` に設定してください。

### 2. リモート D1 マイグレーションの実行

```bash
mise run db:migrate:remote
```

### 3. シークレット環境変数の設定

本番用の GitHub OAuth App（Callback URL: `https://<あなたのドメイン>/auth/github/callback`）を作成し、Cloudflare Workers にシークレットを登録します：

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

### 4. デプロイ

```bash
mise run deploy
```

---

## ライセンス

本プロジェクトは [Mozilla Public License 2.0 (MPL-2.0)](./LICENSE) のもとで公開されています。
