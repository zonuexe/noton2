// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { buildContentSecurityPolicy, securityHeaders } from '@/server/security'
import { serializeForHtmlAttribute } from '@/server/html'
import { timingSafeEqual } from '@/server/crypto'
import { RequestError, readJson } from '@/server/http'
import app from '@/index'

describe('server/security - セキュリティヘッダーと入力処理', () => {
  describe('buildContentSecurityPolicy', () => {
    it('本番環境では外部スクリプト・eval・インラインスクリプトを許可しないこと', () => {
      const csp = buildContentSecurityPolicy(true)
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self'")
      expect(csp).not.toContain("'unsafe-inline'")
      expect(csp).not.toContain("'unsafe-eval'")
      expect(csp).not.toContain('cdn.tailwindcss.com')
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("form-action 'self'")
      expect(csp).toContain("base-uri 'self'")
    })

    it('開発環境では Vite HMR 用の接続だけを追加で許可すること', () => {
      const csp = buildContentSecurityPolicy(false)
      expect(csp).toContain("connect-src 'self' ws: wss: http: https:")
      expect(csp).toContain('https://cdn.tailwindcss.com')
    })
  })

  describe('securityHeaders', () => {
    const createApp = () => {
      const app = new Hono()
      app.use('*', securityHeaders)
      app.get('/', (c) => c.text('ok'))
      app.get('/events/:id', (c) => c.text('ok'))
      app.get('/static/client.js', (c) => c.text('js'))
      return app
    }

    it('HTTPS では HSTS を付与し、通常の Referrer-Policy を設定すること', async () => {
      const res = await createApp().request('https://example.com/')
      expect(res.headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains'
      )
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('x-frame-options')).toBe('DENY')
      expect(res.headers.get('content-security-policy')).toBe(
        buildContentSecurityPolicy(false)
      )
    })

    it('HTTP では HSTS を付与しないこと', async () => {
      const res = await createApp().request('http://localhost/')
      expect(res.headers.get('strict-transport-security')).toBeNull()
    })

    it('管理トークンを含む URL では Referer を完全に送らないこと', async () => {
      const res = await createApp().request('https://example.com/events/abc?admin=secret')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    })

    it('イベント画面は noindex でキャッシュ禁止、トップページは index 許可であること', async () => {
      const app = createApp()

      const eventRes = await app.request('https://example.com/events/abc')
      expect(eventRes.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      expect(eventRes.headers.get('cache-control')).toContain('no-store')

      const homeRes = await app.request('https://example.com/')
      expect(homeRes.headers.get('x-robots-tag')).toBeNull()
      expect(homeRes.headers.get('cache-control')).toContain('no-store')

      const staticRes = await app.request('https://example.com/static/client.js')
      expect(staticRes.headers.get('x-robots-tag')).toBeNull()
      expect(staticRes.headers.get('cache-control')).toBeNull()
    })

    it('例外が発生したレスポンスにもセキュリティヘッダーを付与すること', async () => {
      const app = new Hono()
      app.use('*', securityHeaders)
      app.get('/boom', () => {
        throw new Error('boom')
      })
      app.onError((_err, c) => c.text('error', 500))

      const res = await app.request('https://example.com/boom')
      expect(res.status).toBe(500)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('content-security-policy')).toBe(
        buildContentSecurityPolicy(false)
      )
      expect(res.headers.get('cache-control')).toContain('no-store')
    })
  })

  describe('CSRF 保護とエラーハンドリング (実アプリ)', () => {
    const env = { DB: {} as any, SESSION_SECRET: 'test-session-secret-0123456789abcdef' }

    it('不正オリジンのフォーム POST は 403 で拒否され、セキュリティヘッダーも付くこと', async () => {
      const res = await app.request(
        '/auth/logout',
        {
          method: 'POST',
          headers: {
            Origin: 'https://evil.example.com',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'x=1',
        },
        env
      )

      expect(res.status).toBe(403)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('content-security-policy')).toBe(buildContentSecurityPolicy(false))
    })

    it('正当な同一オリジンのフォーム POST は通ること (logout 302)', async () => {
      const res = await app.request(
        '/auth/logout',
        {
          method: 'POST',
          headers: {
            Origin: 'http://localhost',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'x=1',
        },
        env
      )

      expect(res.status).toBe(302)
    })

    it('Origin / Sec-Fetch-Site が無いフォーム POST はフェイルクローズで 403 になること', async () => {
      const res = await app.request(
        '/auth/logout',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'x=1',
        },
        env
      )

      expect(res.status).toBe(403)
    })
  })

  describe('readJson: Content-Type とサイズの検証', () => {
    const createApp = () => {
      const app = new Hono()
      app.post('/json', async (c) => {
        try {
          const body = await readJson(c)
          return c.json({ body })
        } catch (err) {
          if (err instanceof RequestError) {
            return c.json({ error: err.message }, err.status)
          }
          throw err
        }
      })
      return app
    }

    it('application/json 以外の Content-Type を拒否すること (415)', async () => {
      const res = await createApp().request('/json', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"a":1}',
      })
      expect(res.status).toBe(415)
    })

    it('壊れた JSON を 400 で拒否すること', async () => {
      const res = await createApp().request('/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"a":',
      })
      expect(res.status).toBe(400)
    })

    it('Content-Length が上限を超える場合は 413 で拒否すること', async () => {
      const res = await createApp().request('/json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '1000001',
        },
        body: '{}',
      })
      expect(res.status).toBe(413)
    })

    it('正しい JSON は読み取れること', async () => {
      const res = await createApp().request('/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: '{"a":1}',
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ body: { a: 1 } })
    })
  })

  describe('serializeForHtmlAttribute: data 属性への安全な埋め込み', () => {
    it('HTML 特殊文字を Unicode エスケープし、JSON として復元できること', () => {
      const value = { title: '</script><img src=x onerror=alert(1)> & \'quote\'' }
      const serialized = serializeForHtmlAttribute(value)

      expect(serialized).not.toContain('<')
      expect(serialized).not.toContain('>')
      expect(serialized).toContain('\\u003c')
      expect(JSON.parse(serialized)).toEqual(value)
    })

    it('undefined は null としてシリアライズすること', () => {
      expect(serializeForHtmlAttribute(undefined)).toBe('null')
    })
  })

  describe('timingSafeEqual', () => {
    it('同一の文字列のみ true を返すこと', () => {
      expect(timingSafeEqual('secret-token', 'secret-token')).toBe(true)
      expect(timingSafeEqual('secret-token', 'secret-tokem')).toBe(false)
      expect(timingSafeEqual('short', 'longer-value')).toBe(false)
      expect(timingSafeEqual(undefined, 'value')).toBe(false)
      expect(timingSafeEqual('value', null)).toBe(false)
    })
  })
})
