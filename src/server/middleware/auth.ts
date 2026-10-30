// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createMiddleware } from 'hono/factory'
import { getSignedCookie } from 'hono/cookie'
import { getUserById } from '../db/client'
import type { User } from '@/shared/types'

export type AuthBindings = {
  DB: D1Database
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  SESSION_SECRET?: string
  ADMIN_GITHUB_USERNAMES?: string
  ADMIN_GITHUB_IDS?: string
  // Cloudflare Rate Limiting bindings (optional)
  WRITE_RATE_LIMITER?: RateLimit
  RESPONSE_RATE_LIMITER?: RateLimit
  AUTH_RATE_LIMITER?: RateLimit
}

export type AuthVariables = {
  user: User | null
  isAdmin?: boolean
}

export const SESSION_COOKIE_NAME = 'noton2_session'
export const DEFAULT_SESSION_SECRET = 'noton2-default-development-secret-key-32chars'
export const DEV_EXAMPLE_SECRET = 'local-development-session-secret-change-me-in-production'

/**
 * 環境変数 (ADMIN_GITHUB_USERNAMES / ADMIN_GITHUB_IDS) に基づき、
 * 指定されたユーザーがシステム管理者かどうかを判定する。
 * ハードコードを一切行わず、未設定時は常に false (フェイルセーフ) とする。
 */
export function isAdminUser(
  user: User | null | undefined,
  env?: Pick<AuthBindings, 'ADMIN_GITHUB_USERNAMES' | 'ADMIN_GITHUB_IDS'> | null
): boolean {
  if (!user || !env) return false

  if (env.ADMIN_GITHUB_USERNAMES) {
    const allowedUsernames = env.ADMIN_GITHUB_USERNAMES.split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (allowedUsernames.includes(user.username.toLowerCase())) {
      return true
    }
  }

  if (env.ADMIN_GITHUB_IDS) {
    const allowedIds = env.ADMIN_GITHUB_IDS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (allowedIds.includes(String(user.githubId)) || allowedIds.includes(user.id)) {
      return true
    }
  }

  return false
}

export function getSessionSecret(env: AuthBindings): string {
  const secret = env.SESSION_SECRET
  if (import.meta.env.PROD) {
    if (!secret || secret === DEFAULT_SESSION_SECRET || secret === DEV_EXAMPLE_SECRET) {
      throw new Error(
        'FATAL: A secure, unique SESSION_SECRET must be configured in production environment.'
      )
    }
    if (secret.length < 32) {
      throw new Error('FATAL: SESSION_SECRET must be at least 32 characters long.')
    }
    return secret
  }
  return secret || DEFAULT_SESSION_SECRET
}

export const authMiddleware = createMiddleware<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>(async (c, next) => {
  const secret = getSessionSecret(c.env)
  try {
    // HTTPS では __Host- プレフィックス付き Cookie のみを受け付ける。
    // これによりサブドメインからの Cookie 注入 (cookie tossing) を防ぐ。
    const isHttps = c.req.url.startsWith('https')
    const userId = await getSignedCookie(
      c,
      secret,
      SESSION_COOKIE_NAME,
      isHttps ? 'host' : undefined
    )
    if (userId) {
      const user = await getUserById(c.env.DB, userId)
      c.set('user', user)
      c.set('isAdmin', isAdminUser(user, c.env))
    } else {
      c.set('user', null)
      c.set('isAdmin', false)
    }
  } catch (err) {
    // Cookie改ざんや破損時は未ログイン扱い
    c.set('user', null)
    c.set('isAdmin', false)
  }

  await next()
})
