// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { AnswerStatus, Participant, TimeSlot } from './types'

export type AnswerTool = 'toggle' | AnswerStatus

/**
 * トントン仕様の3段階ループ順次切替
 * available(◯) -> maybe(△) -> unavailable(✕) -> available(◯)
 * ※ 旧来の favorite(◎) は available と同等に扱い、次は maybe に遷移
 */
export function getNextToggleStatus(current?: AnswerStatus | null): AnswerStatus {
  if (current === 'available' || current === 'favorite') {
    return 'maybe'
  }
  if (current === 'maybe') {
    return 'unavailable'
  }
  return 'available'
}

/**
 * ツール選択に応じた対象ステータスの解決
 * ツールが 'toggle' の場合は現在のステータスから次のステータスを計算し、
 * それ以外（'available' / 'maybe' / 'unavailable'）は指定ステータスをそのまま返す
 */
export function resolveTargetStatus(
  tool: AnswerTool,
  currentStatus?: AnswerStatus | null
): AnswerStatus {
  if (tool === 'toggle') {
    return getNextToggleStatus(currentStatus)
  }
  return tool
}

/**
 * 単一スロットの回答更新 (イミュータブル)
 */
export function updateSlotAnswer(
  currentAnswers: Record<string, AnswerStatus>,
  slotId: string,
  newStatus: AnswerStatus
): Record<string, AnswerStatus> {
  return {
    ...currentAnswers,
    [slotId]: newStatus,
  }
}

/**
 * 全スロットまたは特定日付スロットの一括更新 (イミュータブル)
 */
export function bulkUpdateAnswers(
  slots: TimeSlot[],
  currentAnswers: Record<string, AnswerStatus>,
  targetStatus: AnswerStatus,
  filterDate?: string
): Record<string, AnswerStatus> {
  const next = { ...currentAnswers }
  const targetSlots = filterDate ? slots.filter((s) => s.slotDate === filterDate) : slots
  targetSlots.forEach((s) => {
    next[s.id] = targetStatus
  })
  return next
}

export interface SlotSummary {
  okCount: number // available + favorite
  maybeCount: number // maybe
  unavailableCount: number // unavailable
  totalParticipants: number
  statusLevel: 'empty' | 'single' | 'sufficient'
}

/**
 * スロットごとの出欠人数の過不足集計
 */
export function calculateSlotSummary(
  participants: Participant[],
  slotId: string
): SlotSummary {
  let okCount = 0
  let maybeCount = 0
  let unavailableCount = 0

  participants.forEach((p) => {
    const st = p.answers ? p.answers[slotId] : undefined
    if (st === 'favorite' || st === 'available') {
      okCount++
    } else if (st === 'maybe') {
      maybeCount++
    } else if (st === 'unavailable') {
      unavailableCount++
    }
  })

  let statusLevel: SlotSummary['statusLevel'] = 'sufficient'
  if (okCount === 0) {
    statusLevel = 'empty'
  } else if (okCount === 1) {
    statusLevel = 'single'
  }

  return {
    okCount,
    maybeCount,
    unavailableCount,
    totalParticipants: participants.length,
    statusLevel,
  }
}

/**
 * 指定されたスロットが開催確定スロットかどうかを判定する
 */
export function isSlotConfirmed(slotId: string, confirmedSlotId?: string | null): boolean {
  return Boolean(confirmedSlotId && slotId === confirmedSlotId)
}
