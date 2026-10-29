// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from 'vitest'
import {
  getNextToggleStatus,
  resolveTargetStatus,
  updateSlotAnswer,
  bulkUpdateAnswers,
  calculateSlotSummary,
  isSlotConfirmed,
} from '@/shared/state'
import type { AnswerStatus, Participant, TimeSlot } from '@/shared/types'

describe('shared/state - 状態遷移と操作ロジック', () => {
  describe('getNextToggleStatus: 順次切替の3段階ループ', () => {
    it('◯ (available) の次は △ (maybe) に遷移すること', () => {
      expect(getNextToggleStatus('available')).toBe('maybe')
    })

    it('△ (maybe) の次は ✕ (unavailable) に遷移すること', () => {
      expect(getNextToggleStatus('maybe')).toBe('unavailable')
    })

    it('✕ (unavailable) の次は ◯ (available) に遷移すること', () => {
      expect(getNextToggleStatus('unavailable')).toBe('available')
    })

    it('3回連続で切り替えると元の状態に戻る（循環すること）', () => {
      const step1 = getNextToggleStatus('available') // maybe
      const step2 = getNextToggleStatus(step1) // unavailable
      const step3 = getNextToggleStatus(step2) // available
      expect(step3).toBe('available')
    })

    it('旧データや互換用ステータス favorite (◎) は maybe (△) に遷移すること', () => {
      expect(getNextToggleStatus('favorite')).toBe('maybe')
    })

    it('未設定 (undefined / null) や異常値の場合はデフォルトの available (◯) になること', () => {
      expect(getNextToggleStatus(undefined)).toBe('available')
      expect(getNextToggleStatus(null)).toBe('available')
      expect(getNextToggleStatus('unknown' as any)).toBe('available')
    })
  })

  describe('resolveTargetStatus: 選択中ツールによる対象ステータスの決定', () => {
    it('ツールが toggle の場合、現在のステータスから順次切替されること', () => {
      expect(resolveTargetStatus('toggle', 'available')).toBe('maybe')
      expect(resolveTargetStatus('toggle', 'maybe')).toBe('unavailable')
      expect(resolveTargetStatus('toggle', 'unavailable')).toBe('available')
    })

    it('固定ステータスツールの場合、現在の状態に関係なく指定ステータスを返すこと', () => {
      expect(resolveTargetStatus('available', 'unavailable')).toBe('available')
      expect(resolveTargetStatus('available', 'maybe')).toBe('available')
      expect(resolveTargetStatus('maybe', 'available')).toBe('maybe')
      expect(resolveTargetStatus('unavailable', 'available')).toBe('unavailable')
    })
  })

  describe('updateSlotAnswer: 単一スロットの回答更新 (イミュータブル)', () => {
    const initialAnswers: Record<string, AnswerStatus> = {
      slot1: 'available',
      slot2: 'maybe',
    }

    it('対象スロットのみが新しいステータスに更新されること', () => {
      const updated = updateSlotAnswer(initialAnswers, 'slot1', 'unavailable')
      expect(updated.slot1).toBe('unavailable')
      expect(updated.slot2).toBe('maybe')
    })

    it('元のオブジェクトを変更せず新しいオブジェクトを返すこと (参照の非破壊性)', () => {
      const updated = updateSlotAnswer(initialAnswers, 'slot1', 'unavailable')
      expect(updated).not.toBe(initialAnswers)
      expect(initialAnswers.slot1).toBe('available') // 元は不変
    })

    it('未登録のスロットを新しく追加できること', () => {
      const updated = updateSlotAnswer(initialAnswers, 'slot3', 'available')
      expect(updated.slot3).toBe('available')
      expect(Object.keys(updated)).toHaveLength(3)
    })
  })

  describe('bulkUpdateAnswers: 一括更新ロジック', () => {
    const mockSlots: TimeSlot[] = [
      { id: 's1', eventId: 'e1', slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00', sortOrder: 0 },
      { id: 's2', eventId: 'e1', slotDate: '2026-10-29', startTime: '11:00', endTime: '12:00', sortOrder: 1 },
      { id: 's3', eventId: 'e1', slotDate: '2026-10-30', startTime: '10:00', endTime: '11:00', sortOrder: 2 },
    ]

    it('全スロットを一括で特定ステータスに更新できること', () => {
      const initial: Record<string, AnswerStatus> = { s1: 'maybe', s2: 'unavailable', s3: 'available' }
      const result = bulkUpdateAnswers(mockSlots, initial, 'available')

      expect(result).toEqual({
        s1: 'available',
        s2: 'available',
        s3: 'available',
      })
      // 元のオブジェクトは変更されないこと
      expect(initial.s1).toBe('maybe')
    })

    it('特定の日付のみを一括更新し、別の日付のスロットは維持されること', () => {
      const initial: Record<string, AnswerStatus> = {
        s1: 'available',
        s2: 'available',
        s3: 'available',
      }
      // 2026-10-29 のみ unavailable に一括設定
      const result = bulkUpdateAnswers(mockSlots, initial, 'unavailable', '2026-10-29')

      expect(result.s1).toBe('unavailable')
      expect(result.s2).toBe('unavailable')
      expect(result.s3).toBe('available') // 2026-10-30 は維持
    })

    it('スロット一覧が空の場合でも安全に動作すること', () => {
      const initial = { s1: 'maybe' } as Record<string, AnswerStatus>
      const result = bulkUpdateAnswers([], initial, 'available')
      expect(result).toEqual({ s1: 'maybe' })
    })
  })

  describe('calculateSlotSummary: スロットごとの出欠集計と過不足判定', () => {
    const mockParticipants: Participant[] = [
      {
        id: 'p1',
        eventId: 'e1',
        name: 'Alice',
        createdAt: '',
        updatedAt: '',
        answers: { slotA: 'available', slotB: 'unavailable', slotC: 'maybe' },
      },
      {
        id: 'p2',
        eventId: 'e1',
        name: 'Bob',
        createdAt: '',
        updatedAt: '',
        answers: { slotA: 'available', slotB: 'unavailable', slotC: 'unavailable' },
      },
      {
        id: 'p3',
        eventId: 'e1',
        name: 'Charlie',
        createdAt: '',
        updatedAt: '',
        answers: { slotA: 'favorite', slotB: 'unavailable' }, // slotCは未回答
      },
    ]

    it('参加可能者が2名以上いる場合、statusLevel が sufficient になること', () => {
      // slotA: Alice(available), Bob(available), Charlie(favorite) -> okCount: 3
      const summary = calculateSlotSummary(mockParticipants, 'slotA')
      expect(summary.okCount).toBe(3)
      expect(summary.maybeCount).toBe(0)
      expect(summary.unavailableCount).toBe(0)
      expect(summary.totalParticipants).toBe(3)
      expect(summary.statusLevel).toBe('sufficient')
    })

    it('参加可能者が0名の場合、statusLevel が empty (人手不足) になること', () => {
      // slotB: 全員 unavailable
      const summary = calculateSlotSummary(mockParticipants, 'slotB')
      expect(summary.okCount).toBe(0)
      expect(summary.maybeCount).toBe(0)
      expect(summary.unavailableCount).toBe(3)
      expect(summary.statusLevel).toBe('empty')
    })

    it('参加可能者が1名の場合、statusLevel が single になること', () => {
      const singleParticipantList: Participant[] = [
        {
          id: 'p1',
          eventId: 'e1',
          name: 'Dave',
          createdAt: '',
          updatedAt: '',
          answers: { slotX: 'available' },
        },
      ]
      const summary = calculateSlotSummary(singleParticipantList, 'slotX')
      expect(summary.okCount).toBe(1)
      expect(summary.statusLevel).toBe('single')
    })

    it('未回答の参加者が存在する場合でも、正しく各ステータスが集計されること', () => {
      // slotC: Alice(maybe), Bob(unavailable), Charlie(未回答)
      const summary = calculateSlotSummary(mockParticipants, 'slotC')
      expect(summary.okCount).toBe(0)
      expect(summary.maybeCount).toBe(1)
      expect(summary.unavailableCount).toBe(1)
      expect(summary.totalParticipants).toBe(3)
      expect(summary.statusLevel).toBe('empty')
    })

    it('参加者が0名の場合はすべて0で empty になること', () => {
      const summary = calculateSlotSummary([], 'slotAny')
      expect(summary.okCount).toBe(0)
      expect(summary.maybeCount).toBe(0)
      expect(summary.unavailableCount).toBe(0)
      expect(summary.totalParticipants).toBe(0)
      expect(summary.statusLevel).toBe('empty')
    })

    it('isSlotConfirmed: 確定スロットIDと一致する場合のみ true を返すこと', () => {
      expect(isSlotConfirmed('slot1', 'slot1')).toBe(true)
      expect(isSlotConfirmed('slot1', 'slot2')).toBe(false)
      expect(isSlotConfirmed('slot1', null)).toBe(false)
      expect(isSlotConfirmed('slot1', undefined)).toBe(false)
    })
  })
})
