// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi } from 'vitest'
import { sanitizeReturnTo } from '@/server/routes/auth'
import { getEventById } from '@/server/db/client'
import {
  getSessionSecret,
  DEFAULT_SESSION_SECRET,
  DEV_EXAMPLE_SECRET,
} from '@/server/middleware/auth'

describe('server/auth - セキュリティと情報漏洩防止', () => {
  describe('sanitizeReturnTo: オープンリダイレクト攻撃対策', () => {
    it('安全な同一オリジンの相対パスはそのまま許可されること', () => {
      expect(sanitizeReturnTo('/')).toBe('/')
      expect(sanitizeReturnTo('/new')).toBe('/new')
      expect(sanitizeReturnTo('/events/xyz123')).toBe('/events/xyz123')
      expect(sanitizeReturnTo('/events/xyz123?admin=token')).toBe('/events/xyz123?admin=token')
    })

    it('外部絶対URL (http:// や https://) はルート / にフォールバックすること', () => {
      expect(sanitizeReturnTo('https://evil.example.com')).toBe('/')
      expect(sanitizeReturnTo('http://evil.example.com/phishing')).toBe('/')
    })

    it('プロトコル相対URL (//evil.com) はルート / にフォールバックすること', () => {
      expect(sanitizeReturnTo('//evil.example.com')).toBe('/')
      expect(sanitizeReturnTo('//evil.example.com/path')).toBe('/')
    })

    it('バックスラッシュを含むバイパス試行 (/\\evil.com) はルート / にフォールバックすること', () => {
      expect(sanitizeReturnTo('/\\evil.example.com')).toBe('/')
      expect(sanitizeReturnTo('/\\\\evil.example.com')).toBe('/')
    })

    it('javascript: や data: などの危険なURIスキームは拒否されること', () => {
      expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/')
      expect(sanitizeReturnTo('/javascript:alert(1)')).toBe('/')
    })

    it('null / undefined / 空文字の場合はルート / になること', () => {
      expect(sanitizeReturnTo(null)).toBe('/')
      expect(sanitizeReturnTo(undefined)).toBe('/')
      expect(sanitizeReturnTo('')).toBe('/')
      expect(sanitizeReturnTo('   ')).toBe('/')
    })
  })

  describe('getEventById: 非主催者に対する機密トークン非漏洩の検証', () => {
    const mockDb = {
      prepare: vi.fn().mockImplementation((query: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (query.includes('FROM events')) {
              return {
                id: 'event-123',
                admin_token: 'secret-admin-token-xyz',
                title: '重要会議',
                organizer_name: '主催者A',
                creator_user_id: 'user-creator',
                duration_minutes: 60,
                slot_interval_minutes: 60,
              }
            }
            return null
          }),
          all: vi.fn().mockImplementation(async () => {
            if (query.includes('FROM time_slots')) {
              return {
                results: [
                  { id: 's1', event_id: 'event-123', slot_date: '2026-10-29', start_time: '10:00', end_time: '11:00', sort_order: 0 },
                ],
              }
            }
            if (query.includes('FROM participants')) {
              return {
                results: [
                  { id: 'p1', event_id: 'event-123', name: '参加者B', comment: null, edit_token: 'secret-edit-token-123' },
                ],
              }
            }
            if (query.includes('FROM slot_answers')) {
              return { results: [] }
            }
            return { results: [] }
          }),
        }),
      })),
    } as any

    it('一般参加者（非主催者）には adminToken も参加者の editToken も返さない（undefined）こと', async () => {
      // adminToken 未指定、未ログイン
      const event = await getEventById(mockDb, 'event-123', undefined, null)

      expect(event).not.toBeNull()
      expect(event?.isOrganizer).toBe(false)
      // 主催者用 adminToken が隠蔽されていること
      expect(event?.adminToken).toBeUndefined()
      // 参加者の editToken も隠蔽されていること
      expect(event?.participants[0].editToken).toBeUndefined()
    })

    it('正しい adminToken を持っている場合は isOrganizer: true となり、adminToken と editToken が返ること', async () => {
      const event = await getEventById(mockDb, 'event-123', 'secret-admin-token-xyz', null)

      expect(event).not.toBeNull()
      expect(event?.isOrganizer).toBe(true)
      expect(event?.adminToken).toBe('secret-admin-token-xyz')
      expect(event?.participants[0].editToken).toBe('secret-edit-token-123')
    })

    it('作成者本人としてログインしている場合も isOrganizer: true となること', async () => {
      const event = await getEventById(mockDb, 'event-123', undefined, 'user-creator')

      expect(event).not.toBeNull()
      expect(event?.isOrganizer).toBe(true)
      expect(event?.adminToken).toBe('secret-admin-token-xyz')
    })
  })

  describe('getSessionSecret: セッション秘密鍵の安全性検証', () => {
    it('開発環境では未設定時にデフォルト秘密鍵を返すこと', () => {
      const secret = getSessionSecret({ DB: {} as any })
      expect(secret).toBe(DEFAULT_SESSION_SECRET)
    })

    it('開発環境で明示的に設定されている場合はその秘密鍵を返すこと', () => {
      const custom = 'my-custom-dev-secret-key-12345678'
      const secret = getSessionSecret({ DB: {} as any, SESSION_SECRET: custom })
      expect(secret).toBe(custom)
    })
  })
})
