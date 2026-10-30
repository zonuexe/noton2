// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { api } from '@/server/routes/api'
import type { User } from '@/shared/types'

describe('server/api - 追加のセキュリティ強化', () => {
  const createApp = (mockUser: User | null = null) => {
    const app = new Hono<{
      Bindings: { DB: any }
      Variables: { user: User | null }
    }>()

    app.use('*', async (c, next) => {
      c.set('user', mockUser)
      // バリデーションで弾かれることを検証するため、DB は空のモック
      c.env = { DB: {} as any }
      await next()
    })

    app.route('/api', api)
    return app
  }

  const mockUser: User = {
    id: 'u1',
    githubId: 12345,
    username: 'testuser',
    createdAt: '',
    updatedAt: '',
  }

  const validEventBody = {
    title: 'テストイベント',
    organizerName: '主催者',
    slots: [{ slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' }],
  }

  it('JSON 以外の Content-Type でのイベント作成を 415 で拒否すること', async () => {
    const res = await createApp(mockUser).request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validEventBody),
    })

    expect(res.status).toBe(415)
  })

  it('壊れた JSON でのイベント作成を 400 で拒否すること', async () => {
    const res = await createApp(mockUser).request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":',
    })

    expect(res.status).toBe(400)
  })

  it('スロット配列にオブジェクト以外の値が含まれる場合に 400 で拒否すること', async () => {
    const res = await createApp(mockUser).request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validEventBody,
        slots: [null, 'invalid'],
      }),
    })

    expect(res.status).toBe(400)
  })

  it('PATCH で上限を超える所要時間を 400 で拒否すること', async () => {
    const res = await createApp(mockUser).request('/api/events/test-event-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMinutes: 99999 }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toContain('15分〜1440分')
  })

  it('回答の answers が配列でない場合に 400 で拒否すること', async () => {
    const res = await createApp(null).request('/api/events/test-event-id/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '回答者',
        answers: 'not-an-array',
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toBe('回答の形式が不正です')
  })

  it('過剰に長い participantId を 400 で拒否すること', async () => {
    const res = await createApp(null).request('/api/events/test-event-id/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '回答者',
        participantId: 'a'.repeat(65),
        answers: [],
      }),
    })

    expect(res.status).toBe(400)
  })

  it('DELETE で JSON 以外の Content-Type が指定された場合も 415 で拒否すること', async () => {
    const res = await createApp(mockUser).request('/api/events/test-event-id', {
      method: 'DELETE',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ adminToken: 'x' }),
    })

    expect(res.status).toBe(415)
  })

  it('GET /api/events/:id はクエリ文字列の admin トークンを無視し、ヘッダーのみ受け付けること', async () => {
    const calls: Array<string | undefined> = []
    const app = new Hono<{ Bindings: { DB: any }; Variables: { user: User | null } }>()
    app.use('*', async (c, next) => {
      c.set('user', null)
      await next()
    })
    app.route('/api', api)

    // getEventById は DB を叩くため、admin トークンの伝播だけを観測できるよう DB を最小モックする
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM events e')) {
              calls.push(String(args[0]))
              return {
                id: 'ev1',
                admin_token: 'secret',
                title: 't',
                organizer_name: 'o',
                creator_user_id: null,
              }
            }
            return null
          },
          all: async () => ({ results: [] }),
        }),
      }),
    }

    const viaQuery = await app.request('/api/events/ev1?admin=secret', {}, { DB: db })
    expect(((await viaQuery.json()) as any).isOrganizer).toBe(false)

    const viaHeader = await app.request(
      '/api/events/ev1',
      { headers: { 'X-Admin-Token': 'secret' } },
      { DB: db }
    )
    expect(((await viaHeader.json()) as any).isOrganizer).toBe(true)
    expect(calls).toHaveLength(2)
  })
})
