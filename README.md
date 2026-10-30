# noton2

**Cloudflare で完結する超高速・日程調整 Web アプリケーション**。

---

## 特徴

* 🛡️ **主催者の GitHub 身元確認**: イベント作成者は GitHub アカウントで身元を明示。参加者が「誰が立てた調整表か」を安心して確認できます。
* 🐷 **回答者は完全登録不要**: 日程に回答するメンバーはログインや登録は一切不要。名前とステータスを選ぶだけで即座に回答できます。
* ⏱️ **カレンダー×時間帯で直感設定**: カレンダー上の日付クリックと「終日」「夜間」「ランチ」「カスタム」などのプリセットで候補枠をサクサク作成。
* 🎯 **直感的な 3 段階回答 & 塗りツール**: `[◯ 参加可能]` `[△ 未定]` `[✕ 不可]` の3段階。セルタップでの順次切替に加え、ドラッグ塗りや「すべて◯/✕にする」一括操作に対応。
* 👑 **タイムライン出欠集計表**: トントン標準の24時間軸タイムラインで全員の空き時間を可視化。スロットごとの参加可能人数と過不足を自動集計。
* 🔑 **主催者管理機能**: 開催日時の決定（確定バナーの表示・解除）、候補日時の追加、イベント情報編集、LINE / Slack 連絡用定型メッセージのワンクリック生成・コピー。作成者はログイン中であればURLパラメータなしでも管理可能。
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

`SESSION_SECRET` は開発環境でも推測困難な値にしておくことを推奨します（本番ビルドのプレビューではサンプル値が拒否されます）。

```bash
openssl rand -base64 48
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
| `pnpm test` | ユニット・ロジックテストを実行 (Vitest) |
| `pnpm test:e2e` | ブラウザE2Eテストを実行 (Playwright) |
| `pnpm run typecheck` | TypeScript 型チェックを実行 |
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

`SESSION_SECRET` は推測不可能な十分長い値にしてください（例: `openssl rand -base64 48`）。
`.dev.vars.example` に記載されたサンプル値や 32 文字未満の値は、本番環境では起動時に拒否されます。

### 4. デプロイ

```bash
mise run deploy
```

---

## セキュリティについて

本プロジェクトでは以下の対策を実装しています。

* **セッション / OAuth**: `HttpOnly` / `Secure` / `SameSite=Lax` Cookie、HTTPS 時の `__Host-` プレフィックス、OAuth `state` 検証
* **CSRF**: `Origin` / `Sec-Fetch-Site` の検証、JSON API の `Content-Type` 強制
* **XSS**: JSX / Vue によるエスケープ、CSP（本番は外部スクリプト・`unsafe-inline` なし）、data 属性への安全な JSON 埋め込み
* **認可**: 主催者トークン / 作成者アカウント / 参加者編集トークンの検証、定時間比較
* **入力検証**: 文字数・配列長・日時形式・リクエストサイズの上限、内部エラーメッセージの秘匿
* **ヘッダー**: HSTS、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、COOP/CORP
* **レート制限**: Cloudflare Rate Limiting binding（書き込み・回答・認証）

### 運用上の注意

* **管理者の指定は GitHub のユーザー名ではなく数値 ID (`ADMIN_GITHUB_IDS`) を推奨します。** GitHub のユーザー名は変更・再利用可能なため、ユーザー名による管理者指定はアカウント乗っ取りのリスクがあります。
* 主催者用の `?admin=<token>` URL は、共有・ブックマークすると URL がログ等に残ります。継続利用する場合は GitHub ログインで主催者としてアクセスしてください。
* Cloudflare 側でも WAF の Managed Rules、Bot Fight Mode、必要に応じて Access による `/admin` の保護を有効化することを推奨します。
* 依存関係の脆弱性は定期的に `pnpm audit --prod` で確認してください。

---

## ライセンス

本プロジェクトは [Mozilla Public License 2.0 (MPL-2.0)](./LICENSE) のもとで公開されています。
