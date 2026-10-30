// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { api } from './server/routes/api'
import { auth } from './server/routes/auth'
import { pages } from './server/routes/pages'
import { renderer } from './server/renderer'
import { authMiddleware, type AuthBindings, type AuthVariables } from './server/middleware/auth'
import { rateLimit, securityHeaders } from './server/security'

const app = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

// セキュリティヘッダー / キャッシュ制御 / クロール制御
app.use('*', securityHeaders)

// 書き込み系エンドポイントのレート制限 (本番 + Cloudflare binding 設定時のみ)
app.use('*', rateLimit)

// CSRF 保護 (状態変更リクエストの Origin / Sec-Fetch-Site 検証)
// Host ヘッダー等の外部入力に依存せず、リクエスト URL の origin と完全一致のみ許可する。
app.use(
  '*',
  csrf({
    origin: (origin, c) => origin === new URL(c.req.url).origin,
  })
)

// 認証・セッションミドルウェア
app.use('*', authMiddleware)

// レンダラーミドルウェア (SSR HTML)
app.use('*', renderer)

// 認証ルート
app.route('/auth', auth)

// API ルート
app.route('/api', api)

// ページルート
app.route('/', pages)

// 予期しない例外の詳細 (スタックトレース・SQL エラー等) をクライアントへ漏らさない
// ※ CSRF ミドルウェア等が投げる HTTPException は本来のステータス (403 等) を維持する
//   (セキュリティヘッダーは外側の securityHeaders ミドルウェアの finally で付与される)
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  console.error('Unhandled application error:', err)
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
  return c.text('Internal Server Error', 500)
})

export default app
