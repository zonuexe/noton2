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

// 任意の時間範囲 (例: '10:00'〜'19:00') を 1時間区切りの枠に分割
export function splitIntoHourlySlots(
  startTime: string,
  endTime: string
): Array<{ start: string; end: string }> {
  const result: Array<{ start: string; end: string }> = []
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  let curH = startHour
  let curM = startMin

  while (curH < endHour || (curH === endHour && curM < endMin)) {
    const nextH = curH + 1
    const nextM = curM

    if (nextH > endHour || (nextH === endHour && nextM > endMin)) {
      const s = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`
      const e = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
      if (s < e) result.push({ start: s, end: e })
      break
    }

    const s = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`
    const e = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`
    result.push({ start: s, end: e })

    curH = nextH
    curM = nextM
  }

  return result
}

// ある日付と特定時間（例: '10'）に対応するスロットを検索
export function findSlotForHour(
  slots: TimeSlot[],
  dateStr: string,
  hourStr: string
): TimeSlot | undefined {
  // '24' は '00:00' / '24:00' に対応
  const hourNum = hourStr === '24' ? 0 : Number(hourStr)
  const hourTimeStr = `${String(hourNum).padStart(2, '0')}:00`

  return slots.find((s) => {
    if (s.slotDate !== dateStr) return false
    // 完全一致 (1時間区切り: startTime === '10:00')
    if (s.startTime === hourTimeStr || s.startTime === `${hourStr}:00`) return true

    // 範囲包含 (例: 10:00〜18:00 のスロットが10時セルを含む場合)
    const [slotStartH] = s.startTime.split(':').map(Number)
    const [slotEndH, slotEndM] = s.endTime.split(':').map(Number)
    const slotEndRealH = slotEndM > 0 ? slotEndH + 1 : slotEndH
    if (hourNum >= slotStartH && hourNum < slotEndRealH) {
      return true
    }

    return false
  })
}
