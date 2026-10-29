// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { api } from '@/server/routes/api'
import { pages } from '@/server/routes/pages'
import { renderer } from '@/server/renderer'
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
      const data = (await res.json()) as any
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
      const data = (await res.json()) as any
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
      const data = (await res.json()) as any
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
      const data = (await res.json()) as any
      expect(data.error).toBe('候補日時を1つ以上選択してください')
    })

    it('イベント名が100文字を超える場合、400 エラーを返すこと', async () => {
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
          title: 'a'.repeat(101),
          organizerName: '主催者',
          slots: [{ slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('イベント名は100文字以内で入力してください')
    })

    it('候補スロットが500件を超える場合、400 エラーを返すこと', async () => {
      const mockUser: User = {
        id: 'u1',
        githubId: 12345,
        username: 'testuser',
        createdAt: '',
        updatedAt: '',
      }
      const app = createApp(mockUser)

      const slots = Array.from({ length: 501 }, () => ({
        slotDate: '2026-10-29',
        startTime: '10:00',
        endTime: '11:00',
      }))

      const res = await app.request('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '大量スロットイベント',
          organizerName: '主催者',
          slots,
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('候補日時は最大500件まで指定できます')
    })

    it('開始時刻が終了時刻以降のスロットが含まれる場合、400 エラーを返すこと', async () => {
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
          title: '時刻逆転テスト',
          organizerName: '主催者',
          slots: [{ slotDate: '2026-10-29', startTime: '15:00', endTime: '12:00' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('終了時刻は開始時刻より後に設定してください')
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
      const data = (await res.json()) as any
      expect(data.error).toBe('お名前（ニックネーム）を入力してください')
    })

    it('名前が50文字を超える場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'あ'.repeat(51),
          answers: [{ slotId: 's1', status: 'available' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('お名前は50文字以内で入力してください')
    })

    it('コメントが500文字を超える場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '正常な名前',
          comment: 'あ'.repeat(501),
          answers: [{ slotId: 's1', status: 'available' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('コメントは500文字以内で入力してください')
    })

    it('不正な回答ステータスが含まれる場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '正常な名前',
          answers: [{ slotId: 's1', status: 'hacked_status' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('回答のステータス形式が不正です')
    })
  })

  describe('DELETE /api/events/:id/slots-by-date - 日付スロット削除時の入力検証', () => {
    it('date クエリパラメータが指定されていない場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/slots-by-date', {
        method: 'DELETE',
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('日付が指定されていません')
    })

    it('date クエリパラメータの形式が不正な場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/slots-by-date?date=invalid-date', {
        method: 'DELETE',
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('日付の形式が正しくありません (YYYY-MM-DD)')
    })
  })

  describe('PATCH /api/events/:id - イベント基本情報更新時の入力検証', () => {
    it('タイトルを空文字に更新しようとした場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '   ',
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('イベント名を入力してください')
    })

    it('主催者名を空文字に更新しようとした場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizerName: '',
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('主催者名を入力してください')
    })
  })

  describe('POST /api/events/:id/slots - 候補スロット追加時の入力検証', () => {
    it('スロット配列が空の場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: [],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('追加する候補枠を指定してください')
    })

    it('日付形式が不正なスロットが含まれる場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: [{ slotDate: 'bad-date', startTime: '10:00', endTime: '11:00' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('スロットの日付形式が不正です (YYYY-MM-DD)')
    })

    it('終了時刻が開始時刻以前のスロットが含まれる場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: [{ slotDate: '2026-10-29', startTime: '18:00', endTime: '12:00' }],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('終了時刻は開始時刻より後に設定してください')
    })

    it('日程名が50文字を超える場合、400 エラーを返すこと', async () => {
      const app = createApp(null)

      const res = await app.request('/api/events/test-event-id/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: [
            {
              slotDate: '2026-10-29',
              startTime: '10:00',
              endTime: '12:00',
              dateTitle: 'あ'.repeat(51),
            },
          ],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toBe('日程の名称は50文字以内で入力してください')
    })
  })

  describe('GET /mypage - マイページ表示と認可', () => {
    const createPageTestApp = (mockUser: User | null = null, mockResults: any[] = []) => {
      const app = new Hono<{
        Bindings: { DB: any }
        Variables: { user: User | null }
      }>()

      app.use('*', async (c, next) => {
        c.set('user', mockUser)
        c.env = {
          DB: {
            prepare: () => ({
              bind: () => ({
                all: async () => ({ results: mockResults, success: true }),
              }),
            }),
          } as any,
        }
        await next()
      })
      app.use('*', renderer)
      app.route('/', pages)
      return app
    }

    it('未ログイン時は /auth/github?returnTo=/mypage へリダイレクトされること', async () => {
      const app = createPageTestApp(null)
      const res = await app.request('/mypage')

      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/auth/github?returnTo=/mypage')
    })

    it('ログイン済み時は 200 OK でマイページが表示され、ユーザー名とイベント一覧が含まれること', async () => {
      const mockUser: User = {
        id: 'gh_9999',
        githubId: 9999,
        username: 'mypage_tester',
        displayName: 'MyPage Test User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/9999',
        profileUrl: 'https://github.com/mypage_tester',
        createdAt: '2026-10-29T10:00:00Z',
        updatedAt: '2026-10-29T10:00:00Z',
      }
      const mockEvents = [
        {
          id: 'test-ev-1',
          title: 'テスト作成イベント',
          description: 'テスト説明文',
          organizer_name: 'MyPage Test User',
          confirmed_slot_id: 'slot-1',
          confirmed_slot_date: '2026-11-10',
          confirmed_start_time: '19:00',
          confirmed_end_time: '21:00',
          confirmed_date_title: '本番',
          created_at: '2026-10-29 10:00:00',
          updated_at: '2026-10-29 10:00:00',
          slot_count: 3,
          participant_count: 5,
        },
      ]

      const app = createPageTestApp(mockUser, mockEvents)
      const res = await app.request('/mypage')

      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('MyPage Test User')
      expect(html).toContain('@mypage_tester')
      expect(html).toContain('テスト作成イベント')
      expect(html).toContain('開催決定')
      expect(html).toContain('【本番】')
      expect(html).toContain('class="dt-start"')
      expect(html).toContain('datetime="2026-11-10T19:00"')
      expect(html).toContain('class="dt-end"')
      expect(html).toContain('datetime="2026-11-10T21:00"')
      expect(html).toContain('/events/test-ev-1')
      // ヘッダーのリンク先が /mypage であること
      expect(html).toContain('href="/mypage"')
    })
  })

  describe('GET /admin (システム管理画面)', () => {
    function createAdminTestApp(
      mockUser: User | null,
      envConfig: { ADMIN_GITHUB_USERNAMES?: string; ADMIN_GITHUB_IDS?: string } = {}
    ) {
      const app = new Hono<{ Bindings: any; Variables: { user: User | null } }>()
      app.use('*', async (c, next) => {
        c.set('user', mockUser)
        c.env = {
          ...envConfig,
          DB: {
            prepare: () => ({
              first: async () => ({
                total_events: 5,
                confirmed_events: 2,
                total_users: 3,
                total_participants: 12,
              }),
              all: async () => ({ results: [], success: true }),
            }),
          } as any,
        }
        await next()
      })
      app.use('*', renderer)
      app.route('/', pages)
      return app
    }

    it('未ログイン時は /auth/github?returnTo=/admin へリダイレクトされること', async () => {
      const app = createAdminTestApp(null, { ADMIN_GITHUB_USERNAMES: 'megurine' })
      const res = await app.request('/admin')

      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/auth/github?returnTo=/admin')
    })

    it('ログイン済みでも管理者リストに含まれない場合は 403 Forbidden を返すこと', async () => {
      const normalUser: User = {
        id: 'gh_2000',
        githubId: 2000,
        username: 'normal_user',
        displayName: 'Normal User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/2000',
        profileUrl: 'https://github.com/normal_user',
        createdAt: '2026-10-29T10:00:00Z',
        updatedAt: '2026-10-29T10:00:00Z',
      }
      const app = createAdminTestApp(normalUser, { ADMIN_GITHUB_USERNAMES: 'megurine' })
      const res = await app.request('/admin')

      expect(res.status).toBe(403)
      const html = await res.text()
      expect(html).toContain('管理者権限がありません')
      // 非管理者のヘッダーには /admin リンクが出ないこと
      expect(html).not.toContain('href="/admin"')
    })

    it('環境変数で許可された管理者の場合は 200 OK で管理画面が表示されること', async () => {
      const adminUser: User = {
        id: 'gh_1000',
        githubId: 1000,
        username: 'megurine',
        displayName: 'Megurine Admin',
        avatarUrl: 'https://avatars.githubusercontent.com/u/1000',
        profileUrl: 'https://github.com/megurine',
        createdAt: '2026-10-29T10:00:00Z',
        updatedAt: '2026-10-29T10:00:00Z',
      }
      const app = createAdminTestApp(adminUser, { ADMIN_GITHUB_USERNAMES: 'megurine' })
      const res = await app.request('/admin')

      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('システム管理画面')
      expect(html).toContain('@megurine')
      expect(html).toContain('href="/admin"')
    })
  })
})
