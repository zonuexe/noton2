// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi } from 'vitest'
import {
  generateShortId,
  generateToken,
  verifyOrganizerPermission,
} from '@/server/db/client'

describe('server/db/client - ヘルパー関数と権限検証', () => {
  describe('generateShortId: URL用短縮ID生成', () => {
    it('デフォルトで8文字の文字列が生成されること', () => {
      const id = generateShortId()
      expect(id).toHaveLength(8)
      expect(typeof id).toBe('string')
    })

    it('指定した長さの文字列が生成されること', () => {
      expect(generateShortId(6)).toHaveLength(6)
      expect(generateShortId(12)).toHaveLength(12)
    })

    it('紛らわしい文字 (0, o, 1, l) が含まれず、安全な文字種のみで構成されていること', () => {
      const allowedChars = /^[abcdefghjkmnpqrstuvwxyz23456789]+$/
      for (let i = 0; i < 50; i++) {
        const id = generateShortId(8)
        expect(id).toMatch(allowedChars)
        expect(id).not.toMatch(/[01olIO]/)
      }
    })

    it('複数回生成した際に異なる値が得られること（ランダム性）', () => {
      const ids = new Set(Array.from({ length: 20 }, () => generateShortId()))
      expect(ids.size).toBe(20)
    })
  })

  describe('generateToken: 認証用セキュアUUID生成', () => {
    it('有効なUUID形式の文字列が返ること', () => {
      const token = generateToken()
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      expect(token).toMatch(uuidRegex)
    })
  })

  describe('verifyOrganizerPermission: 主催者権限チェック', () => {
    const createMockDb = (mockEvent: { id: string; admin_token: string; creator_user_id: string | null } | null) => {
      return {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockEvent),
          }),
        }),
      } as any
    }

    it('イベントが存在しない場合、isAuthorized: false, event: null を返すこと', async () => {
      const db = createMockDb(null)
      const result = await verifyOrganizerPermission(db, 'non-existent', 'token123')
      expect(result.isAuthorized).toBe(false)
      expect(result.event).toBeNull()
    })

    it('adminToken が一致する場合、ログインしていなくても isAuthorized: true を返すこと', async () => {
      const db = createMockDb({
        id: 'ev1',
        admin_token: 'secret-token-abc',
        creator_user_id: 'user-xyz',
      })
      const result = await verifyOrganizerPermission(db, 'ev1', 'secret-token-abc', null)
      expect(result.isAuthorized).toBe(true)
      expect(result.event?.id).toBe('ev1')
    })

    it('adminToken が無くても、作成者の currentUserId が一致する場合 isAuthorized: true を返すこと', async () => {
      const db = createMockDb({
        id: 'ev1',
        admin_token: 'secret-token-abc',
        creator_user_id: 'user-xyz',
      })
      const result = await verifyOrganizerPermission(db, 'ev1', undefined, 'user-xyz')
      expect(result.isAuthorized).toBe(true)
    })

    it('adminToken も currentUserId も一致しない場合、isAuthorized: false を返すこと', async () => {
      const db = createMockDb({
        id: 'ev1',
        admin_token: 'secret-token-abc',
        creator_user_id: 'user-xyz',
      })
      const result = await verifyOrganizerPermission(db, 'ev1', 'wrong-token', 'other-user')
      expect(result.isAuthorized).toBe(false)
    })
  })
})
