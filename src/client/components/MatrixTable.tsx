// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, computed, ref } from 'vue'
import type { AnswerStatus, EventDetail } from '@/shared/types'
import { TIMELINE_HOURS, formatDateLabel, getSlotsForHour } from '@/shared/time'

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

    // localStorage から自分の回答情報を取得
    const myResponse = computed(() => {
      try {
        if (typeof window === 'undefined') return null
        const stored = localStorage.getItem(`noton2_resp_${props.event.id}`)
        return stored ? JSON.parse(stored) : null
      } catch (e) {
        return null
      }
    })

    // ユニーク日付一覧
    const uniqueDates = computed(() => {
      const dateSet = new Set<string>()
      props.event.slots.forEach((s) => dateSet.add(s.slotDate))
      return Array.from(dateSet).sort()
    })

    // 参加者削除処理
    const handleDeleteParticipant = async (participantId: string) => {
      if (!confirm('この参加者の回答を削除してもよろしいですか？')) return

      isDeleting.value = true
      try {
        const token =
          props.adminToken ||
          (myResponse.value?.participantId === participantId ? myResponse.value?.editToken : '')

        const res = await fetch(
          `/api/events/${props.event.id}/participants/${participantId}?token=${encodeURIComponent(token)}`,
          { method: 'DELETE' }
        )

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || '削除に失敗しました')
          return
        }

        if (myResponse.value?.participantId === participantId) {
          localStorage.removeItem(`noton2_resp_${props.event.id}`)
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
      <div class="bg-white rounded-3xl p-4 sm:p-6 md:p-8 border border-stone-200 shadow-xl shadow-stone-100/50 space-y-5">
        {/* ヘッダーエリア */}
        <div class="space-y-1.5 border-b border-stone-200 pb-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h2 class="text-lg md:text-xl font-bold text-stone-800 font-['M_PLUS_Rounded_1c'] flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-stone-100 text-base">
                👥
              </span>
              <span>みんなの予定</span>
            </h2>

            <div class="flex items-center gap-4">
              <button
                type="button"
                onClick={scrollToAnswerForm}
                class="text-xs text-sky-600 hover:text-sky-800 font-bold underline cursor-pointer"
              >
                あなたの予定を追加・編集する ↓
              </button>
            </div>
          </div>

          <p class="text-xs text-stone-500 leading-relaxed">
            主催者が設定した日付と時間です。参加者の方は{' '}
            <button
              type="button"
              onClick={scrollToAnswerForm}
              class="text-sky-600 hover:underline font-bold inline"
            >
              あなたの予定を追加する
            </button>{' '}
            から予定を追加してください。
          </p>

          {/* 凡例バッジ */}
          <div class="flex items-center gap-3 pt-2 text-xs flex-wrap">
            <span class="flex items-center gap-1.5 font-bold text-stone-700">
              <span class="w-4 h-4 rounded bg-sky-400 text-white text-[10px] flex items-center justify-center font-bold">
                •
              </span>
              ◯（参加可能）
            </span>
            <span class="flex items-center gap-1.5 font-bold text-stone-700">
              <span class="w-4 h-4 rounded bg-amber-400 text-white text-[9px] flex items-center justify-center font-bold">
                ▲
              </span>
              △（未定）
            </span>
            <span class="flex items-center gap-1.5 font-bold text-stone-700">
              <span class="w-4 h-4 rounded bg-stone-300 text-stone-600 text-[10px] flex items-center justify-center font-bold">
                ×
              </span>
              ✕（不可）
            </span>
            <span class="flex items-center gap-1.5 font-bold text-stone-500">
              <span class="w-4 h-4 rounded bg-stone-200/80 border border-stone-300"></span>
              枠外（未設定）
            </span>
            <span class="flex items-center gap-1.5 font-bold text-emerald-700 ml-auto">
              <span class="w-4 h-4 rounded bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">
                ★
              </span>
              全員参加可能
            </span>
          </div>
        </div>

        {props.event.slots.length === 0 ? (
          <div class="py-12 text-center text-stone-400 text-sm">候補日時がありません</div>
        ) : (
          /* 日付ごとのタイムラインブロック一覧 */
          <div class="space-y-4">
            {uniqueDates.value.map((dateStr) => {
              const dateSlots = props.event.slots.filter((s) => s.slotDate === dateStr)

              return (
                <div
                  key={dateStr}
                  class="bg-stone-50/60 rounded-2xl border border-stone-200 p-3 sm:p-4 transition hover:border-stone-300 shadow-2xs"
                >
                  <div class="flex flex-col md:flex-row md:items-start gap-2 md:gap-4">
                    {/* 左側: 日付 ＆ メンバー名カラム */}
                    <div class="w-full md:w-44 shrink-0">
                      <div class="font-bold text-sm text-stone-900 font-['M_PLUS_Rounded_1c'] border-b border-stone-200 md:border-b-0 pb-1 md:pb-0 mb-1.5">
                        {formatDateLabel(dateStr)}
                      </div>

                      {props.event.participants.length === 0 ? (
                        <div class="text-[11px] text-stone-400 py-1">回答者なし</div>
                      ) : (
                        <div class="space-y-1">
                          {props.event.participants.map((p) => {
                            const isMe = myResponse.value?.participantId === p.id
                            const canDelete =
                              props.adminToken || (isMe && myResponse.value?.editToken)

                            return (
                              <div
                                key={p.id}
                                class="h-7 sm:h-8 flex items-center justify-between text-xs pr-1"
                              >
                                <span
                                  class={`truncate ${
                                    isMe
                                      ? 'text-sky-700 font-extrabold underline'
                                      : 'text-sky-600 hover:text-sky-800'
                                  }`}
                                  title={p.name}
                                >
                                  {p.name}
                                </span>
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
                            )
                          })}

                          {/* 集計行ラベル */}
                          <div class="h-6 sm:h-7 flex items-center text-[11px] font-bold text-stone-500 border-t border-stone-200/80 pt-1">
                            空き状況（全員◯）
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 右側: タイムライングリッド (横スクロール) */}
                    <div class="flex-1 overflow-x-auto overflow-y-hidden pb-1 -mx-2 px-2 md:mx-0 md:px-0">
                      <div class="min-w-[700px]">
                        {/* 24時間ヘッダー行 */}
                        <div class="flex border-b border-stone-200 mb-1">
                          {TIMELINE_HOURS.map((hour) => (
                            <div
                              key={hour}
                              class="w-[28px] sm:w-[32px] text-center text-[11px] text-stone-500 font-mono select-none"
                            >
                              {hour}
                            </div>
                          ))}
                        </div>

                        {/* 各参加者のセル列 */}
                        {props.event.participants.map((p) => (
                          <div key={p.id} class="flex h-7 sm:h-8 items-center mb-1">
                            {TIMELINE_HOURS.map((hour) => {
                              const slotsInHour = getSlotsForHour(dateSlots, dateStr, hour)

                              if (slotsInHour.length === 0) {
                                return (
                                  <div
                                    key={hour}
                                    class="w-[28px] sm:w-[32px] h-full bg-stone-200/70 border-r border-white/60 first:rounded-l last:rounded-r"
                                    title={`${hour}:00 枠外`}
                                  />
                                )
                              }

                              const cellWidthClass =
                                slotsInHour.length > 1
                                  ? 'w-[14px] sm:w-[16px]'
                                  : 'w-[28px] sm:w-[32px]'

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
                                      cellBg = 'bg-sky-400 text-white font-bold'
                                      symbol = '•'
                                      title = `${slot.startTime}〜${slot.endTime} 参加可能`
                                    } else if (status === 'maybe') {
                                      cellBg = 'bg-amber-400 text-white font-bold text-[9px]'
                                      symbol = '▲'
                                      title = `${slot.startTime}〜${slot.endTime} 未定`
                                    } else if (status === 'unavailable') {
                                      cellBg = 'bg-stone-300 text-stone-600 font-bold text-xs'
                                      symbol = '×'
                                      title = `${slot.startTime}〜${slot.endTime} 不可`
                                    }

                                    return (
                                      <div
                                        key={slot.id}
                                        class={`${cellWidthClass} h-full flex items-center justify-center text-xs select-none border-r border-white/40 cursor-default ${cellBg}`}
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
                        ))}

                        {/* 空き状況・集計行 */}
                        {props.event.participants.length > 0 ? (
                          <div class="flex h-6 sm:h-7 items-center border-t border-stone-200/80 pt-1">
                            {TIMELINE_HOURS.map((hour) => {
                              const slotsInHour = getSlotsForHour(dateSlots, dateStr, hour)
                              if (slotsInHour.length === 0) {
                                return (
                                  <div
                                    key={hour}
                                    class="w-[28px] sm:w-[32px] h-full bg-transparent"
                                  />
                                )
                              }

                              const cellWidthClass =
                                slotsInHour.length > 1
                                  ? 'w-[14px] sm:w-[16px]'
                                  : 'w-[28px] sm:w-[32px]'

                              return (
                                <div key={hour} class="flex h-full">
                                  {slotsInHour.map((slot) => {
                                    let okCount = 0
                                    let totalCount = props.event.participants.length
                                    props.event.participants.forEach((p) => {
                                      const st = p.answers ? p.answers[slot.id] : undefined
                                      if (st === 'favorite' || st === 'available') {
                                        okCount++
                                      }
                                    })

                                    const isAllOk = totalCount > 0 && okCount === totalCount

                                    let summaryClass = 'text-[10px] text-stone-400'
                                    if (isAllOk) {
                                      summaryClass =
                                        'bg-emerald-500 text-white font-extrabold rounded-md shadow-xs animate-pulse'
                                    } else if (okCount > 0) {
                                      summaryClass = 'text-sky-700 font-bold bg-sky-50 rounded'
                                    }

                                    return (
                                      <div
                                        key={slot.id}
                                        class={`${cellWidthClass} h-full flex items-center justify-center ${summaryClass}`}
                                        title={`${slot.startTime}〜${slot.endTime} 参加可能 ${okCount}/${totalCount}名`}
                                      >
                                        <span>{isAllOk ? '★' : okCount > 0 ? okCount : ''}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* コメント一覧カード */}
        {props.event.participants.some((p) => p.comment) ? (
          <div class="bg-stone-50 rounded-2xl p-4 border border-stone-200 space-y-2 mt-4">
            <h3 class="text-xs font-bold text-stone-700 flex items-center gap-1.5">
              <span>💬</span> 参加者からのコメント
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {props.event.participants
                .filter((p) => p.comment)
                .map((p) => (
                  <div
                    key={`comm-${p.id}`}
                    class="bg-white p-2.5 rounded-xl border border-stone-200 shadow-2xs flex items-start gap-2"
                  >
                    <span class="font-bold text-stone-800 shrink-0">{p.name}:</span>
                    <span class="text-stone-600 break-words">{p.comment}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  },
})
