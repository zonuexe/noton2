// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie, setSignedCookie } from 'hono/cookie'
import { upsertUser } from '../db/client'
import {
  type AuthBindings,
  type AuthVariables,
  getSessionSecret,
  SESSION_COOKIE_NAME,
} from '../middleware/auth'

export const auth = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

const OAUTH_STATE_COOKIE = 'noton2_oauth_state'
const RETURN_TO_COOKIE = 'noton2_return_to'

/**
 * オープンリダイレクト攻撃を防ぐため、安全な同一オリジンの相対パスのみを許可する
 */
export function sanitizeReturnTo(url?: string | null): string {
  if (!url || typeof url !== 'string') return '/'
  const trimmed = url.trim()
  // / から始まり、// や /\ やコロン（例: javascript:, http:）を含まない相対パスのみ許可
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes(':')
  ) {
    return trimmed
  }
  return '/'
}

// 1. GitHub 認可画面へのリダイレクト
auth.get('/github', (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID
  const returnTo = sanitizeReturnTo(c.req.query('returnTo'))

  // GitHub OAuth App が未設定の場合の案内
  if (!clientId) {
    // 開発モードであれば、Dev Login への案内画面または Dev Login を提案
    const isDev = !import.meta.env.PROD
    if (isDev) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="utf-8">
          <title>GitHub OAuth 未設定 - noton2 開発環境</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-stone-50 min-h-screen flex items-center justify-center p-4">
          <div class="bg-white max-w-lg w-full p-6 sm:p-8 rounded-2xl shadow-sm border border-stone-200 text-stone-800 space-y-5">
            <div class="flex items-center gap-2 text-rose-500 font-bold text-lg">
              <span>⚠️</span>
              <span>GITHUB_CLIENT_ID が設定されていません</span>
            </div>
            <p class="text-sm text-stone-600 leading-relaxed">
              ローカル開発で本物の GitHub ログインを行うには、GitHub Developer Settings で OAuth App を作成し、
              <code>.dev.vars</code> に <code>GITHUB_CLIENT_ID</code> と <code>GITHUB_CLIENT_SECRET</code> を設定してください。
            </p>
            <div class="bg-rose-50 p-4 rounded-xl text-xs space-y-2 border border-rose-100">
              <div class="font-bold text-rose-900">クイック設定方法 (.dev.vars.example をコピー):</div>
              <pre class="bg-white p-2 rounded border border-rose-200 overflow-x-auto text-stone-700">cp .dev.vars.example .dev.vars</pre>
              <div class="text-stone-600">Callback URL: <code>http://localhost:5173/auth/github/callback</code></div>
            </div>
            <div class="border-t border-stone-100 pt-4 flex flex-col gap-2">
              <div class="text-xs text-stone-500 font-bold">開発用テストログイン（GitHub連携なし）:</div>
              <a href="/auth/dev-login?returnTo=${encodeURIComponent(returnTo)}" class="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white font-bold text-sm rounded-xl text-center transition-colors">
                🧑‍💻 開発用テストユーザーとしてログイン
              </a>
              <a href="/" class="text-center text-xs text-stone-500 hover:underline mt-2">トップへ戻る</a>
            </div>
          </div>
        </body>
        </html>
      `)
    }

    return c.text('GITHUB_CLIENT_ID is not configured in server environment.', 500)
  }

  const state = crypto.randomUUID()
  const origin = new URL(c.req.url).origin
  const redirectUri = `${origin}/auth/github/callback`

  const isHttps = c.req.url.startsWith('https')
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600, // 10分
  })

  setCookie(c, RETURN_TO_COOKIE, returnTo, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  })

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize')
  githubAuthUrl.searchParams.set('client_id', clientId)
  githubAuthUrl.searchParams.set('redirect_uri', redirectUri)
  githubAuthUrl.searchParams.set('scope', 'read:user')
  githubAuthUrl.searchParams.set('state', state)

  return c.redirect(githubAuthUrl.toString())
})

// 2. GitHub コールバック
auth.get('/github/callback', async (c) => {
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const savedState = getCookie(c, OAUTH_STATE_COOKIE)
    const returnTo = sanitizeReturnTo(getCookie(c, RETURN_TO_COOKIE))

    // 状態検証
    if (!code || !state || state !== savedState) {
      return c.text('OAuth state mismatch or missing authorization code.', 400)
    }

    deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' })
    deleteCookie(c, RETURN_TO_COOKIE, { path: '/' })

    const clientId = c.env.GITHUB_CLIENT_ID
    const clientSecret = c.env.GITHUB_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return c.text('GitHub OAuth credentials are not properly configured.', 500)
    }

    const origin = new URL(c.req.url).origin
    const redirectUri = `${origin}/auth/github/callback`

    // 2-1. トークン交換
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'noton2-app',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      return c.text('Failed to exchange GitHub authorization code.', 500)
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string }
    if (!tokenData.access_token) {
      return c.text(`GitHub token error: ${tokenData.error || 'Unknown error'}`, 400)
    }

    // 2-2. ユーザー情報取得
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'noton2-app',
      },
    })

    if (!userRes.ok) {
      return c.text('Failed to fetch user profile from GitHub API.', 500)
    }

    const ghUser = (await userRes.json()) as {
      id: number
      login: string
      name: string | null
      avatar_url: string
      html_url: string
    }

    // 2-3. D1 にユーザーを保存
    const user = await upsertUser(c.env.DB, {
      githubId: ghUser.id,
      username: ghUser.login,
      displayName: ghUser.name || ghUser.login,
      avatarUrl: ghUser.avatar_url,
      profileUrl: ghUser.html_url,
    })

    // 2-4. セッション Cookie 発行
    const secret = getSessionSecret(c.env)
    const isHttps = c.req.url.startsWith('https')
    await setSignedCookie(c, SESSION_COOKIE_NAME, user.id, secret, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'Lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30日
    })

    return c.redirect(returnTo)
  } catch (err: any) {
    console.error('OAuth callback error:', err)
    return c.text(`GitHub認証処理中にエラーが発生しました: ${err.message || 'Unknown error'}`, 500)
  }
})

// 3. 開発用モックログイン (ローカル開発限定)
auth.get('/dev-login', async (c) => {
  if (import.meta.env.PROD) {
    return c.text('Not found', 404)
  }

  const returnTo = sanitizeReturnTo(c.req.query('returnTo'))
  const user = await upsertUser(c.env.DB, {
    githubId: 99999999,
    username: 'dev-user',
    displayName: '開発用ユーザー',
    avatarUrl: 'https://github.com/ghost.png',
    profileUrl: 'https://github.com',
  })

  const secret = getSessionSecret(c.env)
  await setSignedCookie(c, SESSION_COOKIE_NAME, user.id, secret, {
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return c.redirect(returnTo)
})

// 4. ログアウト
auth.all('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
  return c.redirect('/')
})

// 5. ログイン状態確認 API
auth.get('/me', (c) => {
  const user = c.get('user')
  return c.json({ user })
})
