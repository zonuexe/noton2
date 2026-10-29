// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, computed, ref, onMounted } from 'vue'
import type { AnswerStatus, EventDetail } from '@/shared/types'
import { TIMELINE_HOURS, formatDateLabel, getSlotsForHour } from '@/shared/time'
import { calculateSlotSummary } from '@/shared/state'

export const MatrixTable = defineVaporComponent({
  props: {
    event: {
      type: Object as () => EventDetail,
      required: true,
    },
    adminToken: {
      type: String,
      default: '',
    },
    onReload: {
      type: Function as unknown as () => () => void,
      required: true,
    },
  },
  setup(props) {
    const isDeleting = ref(false)
    const storedResponse = ref<{ participantId?: string; editToken?: string; name?: string } | null>(null)

    const syncStoredResponse = () => {
      try {
        if (typeof window === 'undefined') return
        const stored = localStorage.getItem(`noton2_resp_${props.event.id}`)
        storedResponse.value = stored ? JSON.parse(stored) : null
      } catch (e) {
        storedResponse.value = null
      }
    }

    onMounted(() => {
      syncStoredResponse()
      window.addEventListener('noton2-response-changed', syncStoredResponse)
    })

    // ユニーク日付一覧
    const uniqueDates = computed(() => {
      const dateSet = new Set<string>()
      props.event.slots.forEach((s) => dateSet.add(s.slotDate))
      return Array.from(dateSet).sort()
    })

    const isOrganizer = computed(() => Boolean(props.event.isOrganizer))

    // 参加者削除処理
    const handleDeleteParticipant = async (participantId: string) => {
      if (!confirm('この参加者の回答を削除してもよろしいですか？')) return

      isDeleting.value = true
      try {
        const isMe = storedResponse.value?.participantId === participantId
        const token = isOrganizer.value
          ? props.adminToken
          : isMe
            ? storedResponse.value?.editToken || ''
            : ''

        const res = await fetch(
          `/api/events/${props.event.id}/participants/${participantId}?token=${encodeURIComponent(token)}`,
          { method: 'DELETE' }
        )

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || '削除に失敗しました')
          return
        }

        if (isMe) {
          localStorage.removeItem(`noton2_resp_${props.event.id}`)
          storedResponse.value = null
          window.dispatchEvent(new CustomEvent('noton2-response-changed'))
        }

        props.onReload()
      } catch (e: any) {
        alert(e.message || '通信エラーが発生しました')
      } finally {
        isDeleting.value = false
      }
    }

    // 特定日の全スロット削除 (主催者専用)
    const handleDeleteDateSlots = async (slotDate: string) => {
      if (
        !confirm(
          `${formatDateLabel(slotDate)} のすべての枠を削除してもよろしいですか？この操作は取り消せません。`
        )
      ) {
        return
      }

      isDeleting.value = true
      try {
        const query = props.adminToken ? `&admin=${encodeURIComponent(props.adminToken)}` : ''
        const res = await fetch(
          `/api/events/${props.event.id}/slots-by-date?date=${encodeURIComponent(slotDate)}${query}`,
          { method: 'DELETE' }
        )

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || '削除に失敗しました')
          return
        }

        props.onReload()
      } catch (e: any) {
        alert(e.message || '通信エラーが発生しました')
      } finally {
        isDeleting.value = false
      }
    }

    const scrollToAnswerForm = () => {
      const el = document.getElementById('answer-form-section')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      }
    }

    return (
      <div class="bg-white rounded-2xl border border-stone-200 shadow-md overflow-hidden">
        {/* 灰色のタイトルバー (tonton スタイル) */}
        <div class="bg-[#9c9c9c] px-4 py-2.5 flex items-center gap-2.5 shadow-xs">
          <div class="w-6 h-6 rounded-md bg-[#f06292] flex items-center justify-center shrink-0 shadow-2xs">
            <svg class="w-4 h-4 fill-white" viewBox="0 0 24 24">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </div>
          <h2 class="text-white font-bold text-sm sm:text-base tracking-wide font-['M_PLUS_Rounded_1c']">
            みんなの予定
          </h2>
        </div>

        {/* サブ説明文 ＆ 凡例 */}
        <div class="px-4 py-3 bg-white border-b border-stone-100 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-[13px] text-stone-700">
          <div>
            主催者が設定した日付と時間です。参加者の方は
            <button
              type="button"
              onClick={scrollToAnswerForm}
              class="text-blue-600 hover:text-blue-800 underline font-normal cursor-pointer mx-0.5"
            >
              あなたの予定を追加する
            </button>
            から予定を追加してください。
          </div>

          {/* 凡例バッジ */}
          <div class="flex items-center gap-3 text-xs flex-wrap">
            <span class="flex items-center gap-1 font-medium text-stone-700">
              <span class="w-3.5 h-3.5 rounded-xs bg-[#58b4ff] text-white text-[10px] flex items-center justify-center font-bold">
                •
              </span>
              ◯（参加可能）
            </span>
            <span class="flex items-center gap-1 font-medium text-stone-700">
              <span class="w-3.5 h-3.5 rounded-xs bg-[#f5a623] text-white text-[8px] flex items-center justify-center font-bold">
                ▲
              </span>
              △（未定）
            </span>
            <span class="flex items-center gap-1 font-medium text-stone-700">
              <span class="w-3.5 h-3.5 rounded-xs bg-[#d4d4d4] text-stone-600 text-[10px] flex items-center justify-center font-bold">
                ×
              </span>
              ✕（不可）
            </span>
            <span class="flex items-center gap-1 font-medium text-stone-500">
              <span class="w-3.5 h-3.5 rounded-xs bg-[#dedede] border border-stone-300"></span>
              枠外
            </span>
          </div>
        </div>

        <div class="p-3 sm:p-4 md:p-5">
          {props.event.slots.length === 0 ? (
            <div class="py-12 text-center text-stone-400 text-sm space-y-2">
              <p>候補日時がまだ登録されていません。</p>
              {isOrganizer.value ? (
                <p class="text-xs text-amber-700 font-bold">
                  上部の「📅 日時・枠を追加」から候補枠を追加してください。
                </p>
              ) : null}
            </div>
          ) : (
            /* 日付ごとのタイムラインブロック一覧 */
            <div class="space-y-3">
              {uniqueDates.value.map((dateStr) => {
                const dateSlots = props.event.slots.filter((s) => s.slotDate === dateStr)

                return (
                  <div
                    key={dateStr}
                    class="bg-white rounded-lg border border-stone-300 p-2.5 sm:p-3 shadow-2xs"
                  >
                    <div class="overflow-x-auto overflow-y-hidden">
                      <div class="min-w-[700px] flex flex-col gap-1.5">
                        {/* 1行目: 日付ラベル ＆ 24時間ヘッダー */}
                        <div class="flex items-center gap-2">
                          {/* 左側: 日付ボックス */}
                          <div class="w-28 sm:w-32 md:w-36 shrink-0 h-6 sm:h-7 border border-stone-300 rounded bg-white px-2 py-0.5 text-xs font-bold text-stone-800 flex items-center justify-between">
                            <span class="truncate font-['M_PLUS_Rounded_1c']">
                              {formatDateLabel(dateStr)}
                            </span>
                            {isOrganizer.value ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteDateSlots(dateStr)}
                                class="text-[10px] text-stone-400 hover:text-rose-600 font-bold cursor-pointer ml-1"
                                title="この日の枠を削除"
                              >
                                ✕
                              </button>
                            ) : null}
                          </div>

                          {/* 右側: 24時間ヘッダー列 (06〜05) */}
                          <div class="flex items-center h-6 sm:h-7 border-b border-stone-200">
                            {TIMELINE_HOURS.map((hour) => {
                              const slotsInHour = getSlotsForHour(dateSlots, dateStr, hour)
                              const hasSlots = slotsInHour.length > 0

                              return (
                                <div
                                  key={hour}
                                  class={`w-[24px] sm:w-[28px] h-full flex flex-col justify-between items-center text-[11px] font-mono select-none border-r border-white/60 ${
                                    hasSlots
                                      ? 'bg-white text-stone-700'
                                      : 'bg-[#dedede] text-stone-400'
                                  }`}
                                  title={`${hour}:00`}
                                >
                                  <span class="leading-none pt-1">{hour}</span>
                                  <span class="w-[1px] h-[3px] bg-stone-300"></span>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* 参加者なしの場合 */}
                        {props.event.participants.length === 0 ? (
                          <div class="flex items-center gap-2 text-xs text-stone-400 py-1 pl-1">
                            <span>回答者がまだいません。「あなたの予定を追加する」からご登録ください。</span>
                          </div>
                        ) : null}

                        {/* 2行目以降: 各参加者の回答行 */}
                        {props.event.participants.map((p) => {
                          const isMe = storedResponse.value?.participantId === p.id
                          const canDelete =
                            isOrganizer.value || (isMe && Boolean(storedResponse.value?.editToken))

                          return (
                            <div key={p.id} class="flex items-center gap-2">
                              {/* 左側: メンバー名ボックス */}
                              <div class="w-28 sm:w-32 md:w-36 shrink-0 h-6 sm:h-7 border border-stone-300 rounded bg-white px-2 py-0.5 text-xs text-stone-800 flex items-center justify-between">
                                {isMe ? (
                                  <button
                                    type="button"
                                    onClick={scrollToAnswerForm}
                                    class="text-left truncate cursor-pointer underline text-sky-700 font-extrabold"
                                    title="あなたの予定（タップして編集）"
                                  >
                                    {p.name}
                                  </button>
                                ) : (
                                  <span class="truncate text-stone-700 font-medium" title={p.name}>
                                    {p.name}
                                  </span>
                                )}
                                {canDelete ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteParticipant(p.id)}
                                    class="text-stone-300 hover:text-rose-500 text-xs font-bold p-0.5 cursor-pointer ml-1"
                                    title="回答を削除"
                                  >
                                    ✕
                                  </button>
                                ) : null}
                              </div>

                              {/* 右側: タイムライン回答バー */}
                              <div class="flex items-center h-6 sm:h-7">
                                {TIMELINE_HOURS.map((hour) => {
                                  const slotsInHour = getSlotsForHour(dateSlots, dateStr, hour)

                                  // スロット未設定時間はグレー一面
                                  if (slotsInHour.length === 0) {
                                    return (
                                      <div
                                        key={hour}
                                        class="w-[24px] sm:w-[28px] h-full bg-[#dedede] border-r border-white/60"
                                      />
                                    )
                                  }

                                  const cellWidthClass =
                                    slotsInHour.length > 1
                                      ? 'w-[12px] sm:w-[14px]'
                                      : 'w-[24px] sm:w-[28px]'

                                  return (
                                    <div key={hour} class="flex h-full">
                                      {slotsInHour.map((slot) => {
                                        const status: AnswerStatus | undefined = p.answers
                                          ? p.answers[slot.id]
                                          : undefined

                                        let cellBg = 'bg-stone-100 text-stone-400'
                                        let symbol = '-'
                                        let title = `${slot.startTime}〜${slot.endTime} 未回答`

                                        if (status === 'favorite' || status === 'available') {
                                          cellBg = 'bg-[#58b4ff] text-white font-bold'
                                          symbol = '•'
                                          title = `${slot.startTime}〜${slot.endTime} 参加可能`
                                        } else if (status === 'maybe') {
                                          cellBg = 'bg-[#f5a623] text-white font-bold text-[9px]'
                                          symbol = '▲'
                                          title = `${slot.startTime}〜${slot.endTime} 未定`
                                        } else if (status === 'unavailable') {
                                          cellBg = 'bg-[#d4d4d4] text-stone-600 font-bold text-xs'
                                          symbol = '×'
                                          title = `${slot.startTime}〜${slot.endTime} 不可`
                                        }

                                        return (
                                          <div
                                            key={slot.id}
                                            class={`${cellWidthClass} h-full flex items-center justify-center text-xs select-none border-r border-white/60 cursor-default ${cellBg}`}
                                            title={`${p.name} - ${title}`}
                                          >
                                            <span>{symbol}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}

                        {/* 最下部: 人数集計行 */}
                        {props.event.participants.length > 0 ? (
                          <div class="flex items-center gap-2 pt-1 border-t border-stone-200">
                            {/* 左側: 人数ラベル */}
                            <div class="w-28 sm:w-32 md:w-36 shrink-0 h-6 border border-stone-200 bg-stone-50 rounded px-2 py-0.5 text-[11px] font-bold text-stone-600 flex items-center justify-center">
                              人数
                            </div>

                            {/* 右側: 人数集計セル列 */}
                            <div class="flex items-center h-6">
                              {TIMELINE_HOURS.map((hour) => {
                                const slotsInHour = getSlotsForHour(dateSlots, dateStr, hour)

                                if (slotsInHour.length === 0) {
                                  return (
                                    <div
                                      key={hour}
                                      class="w-[24px] sm:w-[28px] h-full bg-transparent"
                                    />
                                  )
                                }

                                const cellWidthClass =
                                  slotsInHour.length > 1
                                    ? 'w-[12px] sm:w-[14px]'
                                    : 'w-[24px] sm:w-[28px]'

                                return (
                                  <div key={hour} class="flex h-full">
                                    {slotsInHour.map((slot) => {
                                      const summary = calculateSlotSummary(props.event.participants, slot.id)

                                      let summaryClass = 'text-[11px] font-bold'
                                      let displayText = String(summary.okCount)

                                      if (summary.statusLevel === 'empty') {
                                        summaryClass +=
                                          ' bg-rose-100 text-rose-700 font-extrabold rounded-xs'
                                        displayText = '0'
                                      } else if (summary.statusLevel === 'single') {
                                        summaryClass += ' bg-sky-50 text-sky-800 rounded-xs'
                                      } else {
                                        summaryClass +=
                                          ' bg-sky-100 text-sky-900 font-extrabold rounded-xs'
                                      }

                                      const tooltip = `${slot.startTime}〜${slot.endTime} 参加可能: ${summary.okCount}名 (未定: ${summary.maybeCount}名)`

                                      return (
                                        <div
                                          key={slot.id}
                                          class={`${cellWidthClass} h-full flex items-center justify-center ${summaryClass} border-r border-white/60`}
                                          title={tooltip}
                                        >
                                          <span>{displayText}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* コメント一覧カード */}
          {props.event.participants.some((p) => p.comment) ? (
            <div class="bg-stone-50 rounded-xl p-3 sm:p-4 border border-stone-200 space-y-2 mt-4">
              <h3 class="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <span>💬</span> 参加者からのコメント・連絡事項
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {props.event.participants
                  .filter((p) => p.comment)
                  .map((p) => (
                    <div
                      key={`comm-${p.id}`}
                      class="bg-white p-2.5 rounded-lg border border-stone-200 shadow-2xs flex items-start gap-2"
                    >
                      <span class="font-bold text-stone-800 shrink-0">{p.name}:</span>
                      <span class="text-stone-600 break-words">{p.comment}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  },
})
