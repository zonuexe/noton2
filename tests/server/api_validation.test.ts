// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { api } from '@/server/routes/api'
import type { User } from '@/shared/types'

describe('server/api - 入力バリデーションと認可チェック', () => {
  // テスト用アプリケーションのセットアップ
  const createApp = (mockUser: User | null = null) => {
    const app = new Hono<{
      Bindings: { DB: any }
      Variables: { user: User | null }
    }>()

    // 認証ミドルウェアのモック（必要に応じてログイン中ユーザーを注入）
    app.use('*', async (c, next) => {
      c.set('user', mockUser)
      // DBモック（DB呼び出し前にバリデーションで弾かれることを検証）
      c.env = { DB: {} as any }
      await next()
    })

    app.route('/api', api)
    return app
  }

  describe('POST /api/events - イベント作成時の入力検証', () => {
    it('未ログイン状態でのリクエストは 401 と requireAuth: true を返すこと', async () => {
      const app = createApp(null) // 未ログイン
      const res = await app.request('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'テストイベント',
          organizerName: 'テスト主催者',
          slots: [{ slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' }],
        }),
      })

      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.requireAuth).toBe(true)
      expect(data.error).toContain('GitHub ログインが必要です')
    })

    it('タイトルが空の場合、400 エラーを返すこと', async () => {
      const mockUser: User = {
        id: 'u1',
        githubId: 12345,
        username: 'testuser',
        createdAt: '',
        updatedAt: '',
      }
      const app = createApp(mockUser)

      const res = await app.request('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '   ',
          organizerName: '主催者',
          slots: [{ slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('イベント名を入力してください')
    })

    it('主催者名が空の場合、400 エラーを返すこと', async () => {
      const mockUser: User = {
        id: 'u1',
        githubId: 12345,
        username: 'testuser',
        createdAt: '',
        updatedAt: '',
      }
      const app = createApp(mockUser)

      const res = await app.request('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '有効なタイトル',
          organizerName: '',
          slots: [{ slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('主催者名を入力してください')
    })

    it('候補スロットが空配列の場合、400 エラーを返すこと', async () => {
      const mockUser: User = {
        id: 'u1',
        githubId: 12345,
        username: 'testuser',
        createdAt: '',
        updatedAt: '',
      }
      const app = createApp(mockUser)

      const res = await app.request('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '有効なタイトル',
          organizerName: '有効な主催者名',
          slots: [],
        }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('候補日時を1つ以上選択してください')
    })
  })

  describe('POST /api/events/:id/responses - 回答登録時の入力検証', () => {
    it('名前（ニックネーム）が空の場合、400 エラーを返すこと', async () => {
      const app = createApp(null) // 回答は未ログインで可能

      const res = await app.request('/api/events/test-event-id/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '   ',
          answers: [{ slotId: 's1', status: 'available' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('お名前（ニックネーム）を入力してください')
    })
  })

  describe('DELETE /api/events/:id/slots-by-date - 日付スロット削除時の入力検証', () => {
    it('date クエリパラメータが指定されていない場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/slots-by-date', {
        method: 'DELETE',
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('日付が指定されていません')
    })
  })
})
