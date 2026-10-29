// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import { api } from './server/routes/api'
import { auth } from './server/routes/auth'
import { pages } from './server/routes/pages'
import { renderer } from './server/renderer'
import { authMiddleware, type AuthBindings, type AuthVariables } from './server/middleware/auth'

const app = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

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
