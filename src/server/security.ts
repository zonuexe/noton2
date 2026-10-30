// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createMiddleware } from 'hono/factory'
import type { AuthBindings } from './middleware/auth'

/**
 * 本番環境向けの Content-Security-Policy。
 * 外部スクリプトを一切読み込まず、必要なリソースだけを明示的に許可する。
 * (Google Fonts と GitHub のアバター画像のみ許可)
 */
export function buildContentSecurityPolicy(isProduction: boolean): string {
  if (!isProduction) {
    // 開発時は Vite の HMR (WebSocket / eval) と、
    // OAuth 未設定時に表示する開発用ページの Tailwind CDN を許可する。
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss: http: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https://avatars.githubusercontent.com https://*.githubusercontent.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

/**
 * すべてのレスポンスに付与するセキュリティヘッダー。
 * エラーレスポンスでもヘッダーが欠落しないよう finally で設定する。
 */
export const securityHeaders = createMiddleware(async (c, next) => {
  try {
    await next()
  } finally {
    const url = new URL(c.req.url)
    const pathname = url.pathname

    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-DNS-Prefetch-Control', 'off')
    c.header('Content-Security-Policy', buildContentSecurityPolicy(import.meta.env.PROD))
    c.header('X-Permitted-Cross-Domain-Policies', 'none')
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    c.header('Cross-Origin-Resource-Policy', 'same-origin')
    c.header(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    )

    // 管理トークンを URL に含む画面では、Referer からのトークン漏洩を防ぐ
    c.header(
      'Referrer-Policy',
      c.req.query('admin') ? 'no-referrer' : 'strict-origin-when-cross-origin'
    )

    // HTTPS でのみ HSTS を付与する
    if (url.protocol === 'https:') {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    // サーチエンジン制御
    const isSearchEngineAllowed =
      pathname === '/' ||
      pathname === '/terms' ||
      pathname === '/privacy' ||
      pathname === '/robots.txt' ||
      pathname.startsWith('/static/')
    if (!isSearchEngineAllowed) {
      c.header('X-Robots-Tag', 'noindex, nofollow')
    }

    // 動的ルートでの認証トークン・個人回答のキャッシュ汚染防止
    const isStaticAsset = pathname.startsWith('/static/')
    if (!isStaticAsset && !(c.res?.headers.has('Cache-Control') ?? false)) {
      c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    }
  }
})

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * 書き込み系リクエストと認証エンドポイントに対するレート制限。
 * Cloudflare の Rate Limiting binding が設定されている場合のみ有効。
 * ローカル開発 (vite / wrangler dev) では無効化して開発体験を損なわない。
 */
export const rateLimit = createMiddleware<{ Bindings: AuthBindings }>(async (c, next) => {
  if (!import.meta.env.PROD) {
    return next()
  }

  const path = c.req.path
  const isAuthEndpoint =
    path === '/auth/github' || path === '/auth/github/callback' || path === '/auth/dev-login'
  const isWrite = !SAFE_METHODS.has(c.req.method.toUpperCase())

  if (!isAuthEndpoint && !isWrite) {
    return next()
  }

  const isResponseEndpoint = /^\/api\/events\/[^/]+\/responses\/?$/.test(path)
  const limiter = isAuthEndpoint
    ? c.env.AUTH_RATE_LIMITER
    : isResponseEndpoint
      ? c.env.RESPONSE_RATE_LIMITER
      : c.env.WRITE_RATE_LIMITER

  // binding 未設定時はフェイルオープン (サイト全体を停止させない)
  if (!limiter) {
    return next()
  }

  // Cloudflare 上では cf-connecting-ip が常に付与される。
  // X-Forwarded-For はクライアントが自由に偽装できるため、レート制限のキーには使わない。
  const ip = c.req.header('cf-connecting-ip') || 'unknown'
  // 書き込み系はパスごとに分けると、イベント ID / 参加者 ID を変えるだけで
  // 制限を回避できてしまうため、IP 単位で集約する。
  // 回答送信のみ、複数人が同一 NAT 配下から回答するケースを考慮してイベント単位とする。
  const bucket = isAuthEndpoint
    ? 'auth'
    : isResponseEndpoint
      ? `responses:${path}`
      : 'write'

  const { success } = await limiter.limit({ key: `${bucket}:${ip}`.slice(0, 256) })
  if (!success) {
    c.header('Retry-After', '60')
    if (path.startsWith('/api/')) {
      return c.json(
        { error: 'リクエスト回数が上限に達しました。しばらく待ってからお試しください' },
        429
      )
    }
    return c.text('Too Many Requests', 429)
  }

  await next()
})
