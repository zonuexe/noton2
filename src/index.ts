// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import { api } from './server/routes/api'
import { pages } from './server/routes/pages'
import { renderer } from './server/renderer'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// レンダラーミドルウェア (SSR HTML)
app.use('*', renderer)

// API ルート
app.route('/api', api)

// ページルート
app.route('/', pages)

export default app
