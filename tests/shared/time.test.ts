// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from 'vitest'
import {
  splitIntoSlots,
  getSlotsForHour,
  formatDateLabel,
  formatDateISO,
  isValidSlotDate,
  isValidTimeHM,
  formatTimeHM,
  findSlotByExactTime,
  TIMELINE_HOURS,
} from '@/shared/time'
import type { TimeSlot } from '@/shared/types'

describe('shared/time - 日時・スロット計算ロジック', () => {
  describe('splitIntoSlots: 時間帯のスロット分割', () => {
    it('60分刻みで10:00〜19:00を9コマに等分割できること', () => {
      const slots = splitIntoSlots('10:00', '19:00', 60)
      expect(slots).toHaveLength(9)
      expect(slots[0]).toEqual({ start: '10:00', end: '11:00' })
      expect(slots[8]).toEqual({ start: '18:00', end: '19:00' })
    })

    it('30分刻みで10:00〜12:00を4コマに分割できること', () => {
      const slots = splitIntoSlots('10:00', '12:00', 30)
      expect(slots).toHaveLength(4)
      expect(slots[0]).toEqual({ start: '10:00', end: '10:30' })
      expect(slots[1]).toEqual({ start: '10:30', end: '11:00' })
      expect(slots[2]).toEqual({ start: '11:00', end: '11:30' })
      expect(slots[3]).toEqual({ start: '11:30', end: '12:00' })
    })

    it('intervalMinutes を省略した場合、デフォルトで60分刻みになること', () => {
      const slots = splitIntoSlots('13:00', '15:00')
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual({ start: '13:00', end: '14:00' })
      expect(slots[1]).toEqual({ start: '14:00', end: '15:00' })
    })

    it('開始時刻と終了時刻が同じ場合、空配列を返すこと', () => {
      const slots = splitIntoSlots('10:00', '10:00', 60)
      expect(slots).toEqual([])
    })

    it('終了時刻が開始時刻より前の場合、空配列を返すこと（安全な処理）', () => {
      const slots = splitIntoSlots('15:00', '12:00', 60)
      expect(slots).toEqual([])
    })

    it('端数がある時間帯でも終了時刻を超えない範囲で正しくスロットを生成すること', () => {
      // 10:00〜11:45 を 60分刻みで分割
      const slots = splitIntoSlots('10:00', '11:45', 60)
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual({ start: '10:00', end: '11:00' })
      expect(slots[1]).toEqual({ start: '11:00', end: '11:45' })
    })

    it('深夜00:00（または24:00）終了を正しく24時として分割できること', () => {
      const slots = splitIntoSlots('22:00', '00:00', 60)
      expect(slots).toHaveLength(2)
      expect(slots[0]).toEqual({ start: '22:00', end: '23:00' })
      expect(slots[1]).toEqual({ start: '23:00', end: '00:00' })
    })
  })

  describe('getSlotsForHour: タイムラインの特定時間に対するスロット抽出', () => {
    const mockSlots: TimeSlot[] = [
      { id: '1', eventId: 'e1', slotDate: '2026-10-29', startTime: '10:00', endTime: '10:30', sortOrder: 0 },
      { id: '2', eventId: 'e1', slotDate: '2026-10-29', startTime: '10:30', endTime: '11:00', sortOrder: 1 },
      { id: '3', eventId: 'e1', slotDate: '2026-10-29', startTime: '11:00', endTime: '12:00', sortOrder: 2 },
      { id: '4', eventId: 'e1', slotDate: '2026-10-30', startTime: '10:00', endTime: '11:00', sortOrder: 3 },
      { id: '5', eventId: 'e1', slotDate: '2026-10-29', startTime: '00:00', endTime: '01:00', sortOrder: 4 },
    ]

    it('30分刻みで2コマある場合、正しい順序（昇順）で2コマ返却されること', () => {
      const slots = getSlotsForHour(mockSlots, '2026-10-29', '10')
      expect(slots).toHaveLength(2)
      expect(slots[0].startTime).toBe('10:00')
      expect(slots[1].startTime).toBe('10:30')
    })

    it('別の日付のスロットは除外されること', () => {
      const slotsDay1 = getSlotsForHour(mockSlots, '2026-10-29', '10')
      const slotsDay2 = getSlotsForHour(mockSlots, '2026-10-30', '10')

      expect(slotsDay1.every((s) => s.slotDate === '2026-10-29')).toBe(true)
      expect(slotsDay2).toHaveLength(1)
      expect(slotsDay2[0].id).toBe('4')
    })

    it('該当する時間帯にスロットがない場合、空配列を返すこと', () => {
      const slots = getSlotsForHour(mockSlots, '2026-10-29', '15')
      expect(slots).toEqual([])
    })

    it('24時（深夜00:00）のスロットが「24」時間キーで正しく取得できること', () => {
      const slots = getSlotsForHour(mockSlots, '2026-10-29', '24')
      expect(slots).toHaveLength(1)
      expect(slots[0].id).toBe('5')
      expect(slots[0].startTime).toBe('00:00')
    })
  })

  describe('formatDateLabel: 日付フォーマット', () => {
    it('YYYY-MM-DD から YYYY/M/D(曜日) に変換できること', () => {
      // 2026年10月29日は木曜日
      const label = formatDateLabel('2026-10-29')
      expect(label).toBe('2026/10/29(木)')
    })

    it('1桁の月や日もゼロパディングされずに自然に表示されること', () => {
      // 2026年1月5日は月曜日
      const label = formatDateLabel('2026-01-05')
      expect(label).toBe('2026/1/5(月)')
    })

    it('不正な形式の場合はそのまま文字列を返すこと', () => {
      expect(formatDateLabel('invalid')).toBe('invalid')
    })
  })

  describe('formatTimeHM: 時間フォーマット', () => {
    it('時と分をゼロ埋め2桁の HH:mm に変換できること', () => {
      expect(formatTimeHM(9, 5)).toBe('09:05')
      expect(formatTimeHM(18, 30)).toBe('18:30')
      expect(formatTimeHM(0, 0)).toBe('00:00')
    })
  })

  describe('findSlotByExactTime: 開始時刻完全一致検索', () => {
    const slots: TimeSlot[] = [
      { id: 's1', eventId: 'e', slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00', sortOrder: 0 },
      { id: 's2', eventId: 'e', slotDate: '2026-10-29', startTime: '11:00', endTime: '12:00', sortOrder: 1 },
    ]

    it('日付と開始時刻が一致するスロットを取得できること', () => {
      const found = findSlotByExactTime(slots, '2026-10-29', '10:00')
      expect(found?.id).toBe('s1')
    })

    it('一致しない場合は undefined を返すこと', () => {
      expect(findSlotByExactTime(slots, '2026-10-29', '12:00')).toBeUndefined()
      expect(findSlotByExactTime(slots, '2026-10-30', '10:00')).toBeUndefined()
    })
  })

  describe('TIMELINE_HOURS: トントン24時間定義', () => {
    it('06時から翌05時までの24要素が存在すること', () => {
      expect(TIMELINE_HOURS).toHaveLength(24)
      expect(TIMELINE_HOURS[0]).toBe('06')
      expect(TIMELINE_HOURS[18]).toBe('24')
      expect(TIMELINE_HOURS[19]).toBe('01')
      expect(TIMELINE_HOURS[23]).toBe('05')
    })
  })

  describe('formatDateISO & isValidSlotDate: 安全な日付処理', () => {
    it('ローカル時刻基準で YYYY-MM-DD 文字列を生成できること', () => {
      const d = new Date(2026, 9, 29) // 2026-10-29
      expect(formatDateISO(d)).toBe('2026-10-29')
    })

    it('isValidSlotDate: 正しい YYYY-MM-DD を判定できること', () => {
      expect(isValidSlotDate('2026-10-29')).toBe(true)
      expect(isValidSlotDate('2026-02-28')).toBe(true)
      expect(isValidSlotDate('2026-13-01')).toBe(false)
      expect(isValidSlotDate('invalid')).toBe(false)
      expect(isValidSlotDate(null)).toBe(false)
    })

    it('isValidTimeHM: 正しい HH:mm を判定できること', () => {
      expect(isValidTimeHM('10:00')).toBe(true)
      expect(isValidTimeHM('23:59')).toBe(true)
      expect(isValidTimeHM('24:00')).toBe(true)
      expect(isValidTimeHM('25:00')).toBe(false)
      expect(isValidTimeHM('invalid')).toBe(false)
    })
  })
})
