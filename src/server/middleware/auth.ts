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
}

export type AuthVariables = {
  user: User | null
}

export const SESSION_COOKIE_NAME = 'noton2_session'
export const DEFAULT_SESSION_SECRET = 'noton2-default-development-secret-key-32chars'
export const DEV_EXAMPLE_SECRET = 'local-development-session-secret-change-me-in-production'

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
    const userId = await getSignedCookie(c, secret, SESSION_COOKIE_NAME)
    if (userId) {
      const user = await getUserById(c.env.DB, userId)
      c.set('user', user)
    } else {
      c.set('user', null)
    }
  } catch (err) {
    // Cookie改ざんや破損時は未ログイン扱い
    c.set('user', null)
  }

  await next()
})
