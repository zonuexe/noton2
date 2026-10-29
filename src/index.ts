// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { api } from './server/routes/api'
import { auth } from './server/routes/auth'
import { pages } from './server/routes/pages'
import { renderer } from './server/renderer'
import { authMiddleware, type AuthBindings, type AuthVariables } from './server/middleware/auth'

const app = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

// セキュリティヘッダーおよびキャッシュ制御ミドルウェア
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  // 動的ルートでの認証トークン・個人回答のキャッシュ汚染防止
  if (!c.res.headers.has('Cache-Control')) {
    c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
  }
})

// CSRF 保護 (状態変更リクエストの Origin / Sec-Fetch-Site 検証)
app.use(
  '*',
  csrf({
    origin: (origin, c) => {
      if (origin === new URL(c.req.url).origin) return true
      const host = c.req.header('host')
      if (host && (origin === `http://${host}` || origin === `https://${host}`)) return true
      return false
    },
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

export default app
