// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { TimeSlot } from './types'

// トントン標準の24時間軸 (朝06:00〜翌朝05:00)
export const TIMELINE_HOURS = [
  '06', '07', '08', '09', '10', '11', '12', '13', '14', '15',
  '16', '17', '18', '19', '20', '21', '22', '23', '24', '01',
  '02', '03', '04', '05',
] as const

// 日付フォーマット: 'YYYY-MM-DD' -> 'YYYY/M/D(曜日)'
export function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const d = new Date(year, month - 1, day)
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  return `${year}/${month}/${day}(${dayNames[d.getDay()]})`
}

// 時間フォーマット: 'HH:mm'
export function formatTimeHM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// 任意の開始〜終了時間帯を intervalMinutes (30 or 60分) 刻みの独立スロットに分割
export function splitIntoSlots(
  startTime: string,
  endTime: string,
  intervalMinutes: number = 60
): Array<{ start: string; end: string }> {
  const result: Array<{ start: string; end: string }> = []
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  let curH = startHour
  let curM = startMin

  const step = intervalMinutes > 0 ? intervalMinutes : 60

  while (curH < endHour || (curH === endHour && curM < endMin)) {
    let nextTotalMin = curH * 60 + curM + step
    let nextH = Math.floor(nextTotalMin / 60)
    let nextM = nextTotalMin % 60

    if (nextH > endHour || (nextH === endHour && nextM > endMin)) {
      const s = formatTimeHM(curH, curM)
      const e = formatTimeHM(endHour, endMin)
      if (s < e) result.push({ start: s, end: e })
      break
    }

    const s = formatTimeHM(curH, curM)
    const e = formatTimeHM(nextH, nextM)
    result.push({ start: s, end: e })

    curH = nextH
    curM = nextM
  }

  return result
}

// 後方互換 alias
export const splitIntoHourlySlots = (s: string, e: string) => splitIntoSlots(s, e, 60)

// 日付と時間帯（厳密な開始時刻）から、唯一のスロットを検索 (1:1 紐付け)
export function findSlotByExactTime(
  slots: TimeSlot[],
  dateStr: string,
  startTimeStr: string
): TimeSlot | undefined {
  return slots.find((s) => s.slotDate === dateStr && s.startTime === startTimeStr)
}

// 1時間表示用: その時間のスロット一覧を取得 (30分刻みなら2コマ、1時間刻みなら1コマ)
export function getSlotsForHour(
  slots: TimeSlot[],
  dateStr: string,
  hourStr: string
): TimeSlot[] {
  const hourNum = hourStr === '24' ? 0 : Number(hourStr)
  const prefix = `${String(hourNum).padStart(2, '0')}:`
  return slots
    .filter((s) => s.slotDate === dateStr && s.startTime.startsWith(prefix))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

// 任意のスロットIDが確定スロットと一致しているか
export function isSlotConfirmed(slotId: string, confirmedSlotId?: string | null): boolean {
  return Boolean(confirmedSlotId && slotId === confirmedSlotId)
}
