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

export interface TimePreset {
  key: string
  shortLabel: string
  label: string
  start: string
  end: string
}

// 時間帯プリセット定義（午前 -> 午後 -> 夜 -> 日中 -> 全日 -> 飲み会）
export const TIME_PRESETS: readonly TimePreset[] = [
  { key: 'morning', shortLabel: '午前', label: '午前 (08:00〜12:00)', start: '08:00', end: '12:00' },
  { key: 'afternoon', shortLabel: '午後', label: '午後 (13:00〜18:00)', start: '13:00', end: '18:00' },
  { key: 'evening', shortLabel: '夜', label: '夜 (18:00〜22:00)', start: '18:00', end: '22:00' },
  { key: 'daytime', shortLabel: '日中', label: '日中 (10:00〜19:00)', start: '10:00', end: '19:00' },
  { key: 'all-day', shortLabel: '全日', label: '全日 (08:00〜22:00)', start: '08:00', end: '22:00' },
  { key: 'party', shortLabel: '飲み会', label: '飲み会 (19:00〜23:00)', start: '19:00', end: '23:00' },
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

// ローカル時刻基準で安全に YYYY-MM-DD 文字列を取得 (UTCズレ防止)
export function formatDateISO(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 今日の日付 (ローカル時刻基準 YYYY-MM-DD)
export function getTodayISO(): string {
  return formatDateISO(new Date())
}

// 日付形式チェック (YYYY-MM-DD かつ実在する日付)
export function isValidSlotDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, m - 1, d)
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  )
}

// 時間フォーマット: 'HH:mm'
export function formatTimeHM(hour: number, minute: number): string {
  const h = hour === 24 ? '00' : String(hour).padStart(2, '0')
  return `${h}:${String(minute).padStart(2, '0')}`
}

// 時間形式チェック ('HH:mm')
export function isValidTimeHM(timeStr?: string | null): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return false
  const [h, m] = timeStr.split(':').map(Number)
  return (h >= 0 && h < 24 && m >= 0 && m < 60) || (h === 24 && m === 0)
}

// スロットの開始時刻〜終了時刻の論理整合性チェック (startTime < endTime, 00:00/24:00終了は深夜24時として許可)
export function isValidSlotTimeRange(startTime?: string | null, endTime?: string | null): boolean {
  if (!isValidTimeHM(startTime) || !isValidTimeHM(endTime)) return false
  if (startTime === '24:00') return false
  const [sh, sm] = startTime!.split(':').map(Number)
  const [eh, em] = endTime!.split(':').map(Number)
  const startTotal = sh * 60 + sm
  const endTotal =
    (endTime === '00:00' || endTime === '24:00') && startTotal > 0 ? 24 * 60 : eh * 60 + em
  return startTotal < endTotal
}

// トントン標準24時間軸 (06:00始まり〜翌05:59終わり) に基づくソート用分数計算
export function getTimelineSortMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  const adjustedHour = h < 6 ? h + 24 : h
  return adjustedHour * 60 + (m || 0)
}

// スロット配列の比較関数 (日付昇順 -> トントン24時間軸順)
export function compareSlots(
  a: { slotDate: string; startTime: string },
  b: { slotDate: string; startTime: string }
): number {
  if (a.slotDate !== b.slotDate) {
    return a.slotDate.localeCompare(b.slotDate)
  }
  return getTimelineSortMinutes(a.startTime) - getTimelineSortMinutes(b.startTime)
}

// 外部URLの安全性検証 (http:// または https:// のみ許可)
export function sanitizeHttpUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

// 任意の開始〜終了時間帯を intervalMinutes (30 or 60分) 刻みの独立スロットに分割
// ※ 終了時刻が '00:00' の場合は深夜24:00 (24時間表記) として計算
export function splitIntoSlots(
  startTime: string,
  endTime: string,
  intervalMinutes: number = 60
): Array<{ start: string; end: string }> {
  const result: Array<{ start: string; end: string }> = []
  const [startHour, startMin] = startTime.split(':').map(Number)
  let [endHour, endMin] = endTime.split(':').map(Number)

  // 00:00 または 24:00 終了は深夜24時として扱う
  if ((endTime === '00:00' || endTime === '24:00') && startHour > 0) {
    endHour = 24
    endMin = 0
  }

  let curH = startHour
  let curM = startMin

  const step = intervalMinutes > 0 ? intervalMinutes : 60

  while (curH < endHour || (curH === endHour && curM < endMin)) {
    const nextTotalMin = curH * 60 + curM + step
    const nextH = Math.floor(nextTotalMin / 60)
    const nextM = nextTotalMin % 60

    if (nextH > endHour || (nextH === endHour && nextM > endMin)) {
      const s = formatTimeHM(curH, curM)
      const e = formatTimeHM(endHour, endMin)
      if (s !== e) result.push({ start: s, end: e })
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

// 日程名（日付ラベル）の入力サジェスト候補
export const DATE_TITLE_SUGGESTIONS = [
  'DAY 0',
  'DAY 1',
  'DAY 2',
  'DAY 3',
  '前夜祭',
  '本祭',
  '後夜祭',
  '設営',
  '本番',
  '会場撤収',
  '予備日',
] as const

// 後方互換 alias
export const splitIntoHourlySlots = (s: string, e: string) => splitIntoSlots(s, e, 60)

// 特定の日付のスロットを指定した開始〜終了時間帯で置き換える（他日程のスロットはそのまま維持）
export function replaceSlotsForDate(
  currentSlots: Array<{
    slotDate: string
    startTime: string
    endTime: string
    dateTitle?: string | null
  }>,
  dateStr: string,
  startTime: string,
  endTime: string,
  intervalMinutes: number = 60,
  dateTitle?: string | null
): Array<{ slotDate: string; startTime: string; endTime: string; dateTitle?: string | null }> {
  if (!isValidSlotTimeRange(startTime, endTime)) {
    return currentSlots
  }
  const existingDaySlot = currentSlots.find((s) => s.slotDate === dateStr)
  const resolvedTitle = dateTitle !== undefined ? dateTitle : existingDaySlot?.dateTitle || null

  const otherDateSlots = currentSlots.filter((s) => s.slotDate !== dateStr)
  const newDaySlots = splitIntoSlots(startTime, endTime, intervalMinutes).map((s) => ({
    slotDate: dateStr,
    startTime: s.start,
    endTime: s.end,
    dateTitle: resolvedTitle,
  }))
  return [...otherDateSlots, ...newDaySlots].sort(compareSlots)
}

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
