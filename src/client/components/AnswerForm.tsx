// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import type { AnswerStatus, EventDetail, SubmitResponseInput } from '@/shared/types'
import { TIMELINE_HOURS, formatDateLabel, getSlotsForHour } from '@/shared/time'
import {
  type AnswerTool,
  resolveTargetStatus,
  updateSlotAnswer,
  bulkUpdateAnswers,
} from '@/shared/state'

export const AnswerForm = defineVaporComponent({
  props: {
    event: {
      type: Object as () => EventDetail,
      required: true,
    },
    onSuccess: {
      type: Function as unknown as () => () => void,
      required: true,
    },
  },
  setup(props) {
    const name = ref('')
    const comment = ref('')
    // slotId -> AnswerStatus のマッピング
    const answers = ref<Record<string, AnswerStatus>>({})
    const participantId = ref<string | null>(null)
    const editToken = ref<string | null>(null)

    // 現在選択中の塗りツール ('toggle' または 特定のステータス) - デフォルトは順次切替
    const activeTool = ref<AnswerTool>('toggle')

    // ドラッグ塗り状態
    const isDragging = ref(false)
    const dragTargetStatus = ref<AnswerStatus>('available')

    const isSubmitting = ref(false)
    const errorMessage = ref('')
    const successMessage = ref('')

    // ユニーク日付一覧
    const uniqueDates = computed(() => {
      const dateSet = new Set<string>()
      props.event.slots.forEach((s) => dateSet.add(s.slotDate))
      return Array.from(dateSet).sort()
    })

    // 刻み幅が30分かどうか
    const is30Min = computed(() => props.event.slotIntervalMinutes === 30)

    const handleStorageChange = () => {
      try {
        if (typeof window === 'undefined') return
        const stored = localStorage.getItem(`noton2_resp_${props.event.id}`)
        if (!stored) {
          startNewResponse()
        }
      } catch (e) {
        console.error(e)
      }
    }

    // localStorage から過去の自分の回答を取得
    onMounted(() => {
      try {
        if (typeof window === 'undefined') return
        const stored = localStorage.getItem(`noton2_resp_${props.event.id}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.participantId && parsed.editToken) {
            participantId.value = parsed.participantId
            editToken.value = parsed.editToken
            name.value = parsed.name || ''

            const existing = props.event.participants.find((p) => p.id === parsed.participantId)
            if (existing) {
              name.value = existing.name
              comment.value = existing.comment || ''
              if (existing.answers) {
                answers.value = { ...existing.answers }
              }
            }
          }
        }
      } catch (e) {
        console.error(e)
      }

      // 未回答スロットのデフォルトを 'available' (◯) に
      const initial: Record<string, AnswerStatus> = { ...answers.value }
      props.event.slots.forEach((s) => {
        if (!initial[s.id]) {
          initial[s.id] = 'available'
        }
      })
      answers.value = initial

      // グローバル mouseup でドラッグ終了
      window.addEventListener('mouseup', stopDrag)
      window.addEventListener('touchend', stopDrag)
      window.addEventListener('noton2-response-changed', handleStorageChange)
    })

    const stopDrag = () => {
      isDragging.value = false
    }

    onUnmounted(() => {
      window.removeEventListener('mouseup', stopDrag)
      window.removeEventListener('touchend', stopDrag)
      window.removeEventListener('noton2-response-changed', handleStorageChange)
    })

    // 全スロットを一括設定
    const setAll = (status: AnswerStatus) => {
      answers.value = bulkUpdateAnswers(props.event.slots, answers.value, status)
    }

    // 特定日の全スロットを一括設定
    const setDateAll = (dateStr: string, status: AnswerStatus) => {
      answers.value = bulkUpdateAnswers(props.event.slots, answers.value, status, dateStr)
    }

    // 単一セルのステータスを更新 (immutable代入で確実に再描画)
    const applyStatusToSlot = (slotId: string, status?: AnswerStatus) => {
      const targetStatus = status || resolveTargetStatus(activeTool.value, answers.value[slotId])
      answers.value = updateSlotAnswer(answers.value, slotId, targetStatus)
    }

    // マウスダウン（ドラッグ開始）
    const handleMouseDown = (slotId: string) => {
      isDragging.value = true
      const target = resolveTargetStatus(activeTool.value, answers.value[slotId])
      dragTargetStatus.value = target
      applyStatusToSlot(slotId, target)
    }

    // マウスオーバー（ドラッグ中に塗る）
    const handleMouseEnter = (slotId: string) => {
      if (!isDragging.value) return
      applyStatusToSlot(slotId, dragTargetStatus.value)
    }

    // タッチ操作（スマホ用ドラッグ）
    const handleTouchMove = (e: any) => {
      if (!isDragging.value || !e.touches || e.touches.length === 0) return
      const touch = e.touches[0]
      const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
      const slotId = target?.dataset?.slotId
      if (slotId) {
        applyStatusToSlot(slotId, dragTargetStatus.value)
      }
    }

    const handleSubmit = async () => {
      errorMessage.value = ''
      successMessage.value = ''

      if (!name.value.trim()) {
        errorMessage.value = 'お名前（ニックネーム）を入力してください'
        return
      }

      isSubmitting.value = true
      try {
        const payload: SubmitResponseInput = {
          participantId: participantId.value || undefined,
          editToken: editToken.value || undefined,
          name: name.value.trim(),
          comment: comment.value.trim() || undefined,
          answers: props.event.slots.map((s) => ({
            slotId: s.id,
            status: answers.value[s.id] || 'available',
          })),
        }

        const res = await fetch(`/api/events/${props.event.id}/responses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || '送信に失敗しました')
        }

        const isNew = !participantId.value

        // localStorage に保存
        participantId.value = data.participantId
        editToken.value = data.editToken
        localStorage.setItem(
          `noton2_resp_${props.event.id}`,
          JSON.stringify({
            participantId: data.participantId,
            editToken: data.editToken,
            name: name.value.trim(),
          })
        )
        window.dispatchEvent(new CustomEvent('noton2-response-changed'))

        successMessage.value = isNew ? '回答を登録しました！' : '回答を更新しました！'
        setTimeout(() => (successMessage.value = ''), 4000)

        props.onSuccess()
      } catch (err: any) {
        errorMessage.value = err.message || '送信に失敗しました'
      } finally {
        isSubmitting.value = false
      }
    }

    const startNewResponse = () => {
      participantId.value = null
      editToken.value = null
      name.value = ''
      comment.value = ''
      const next: Record<string, AnswerStatus> = {}
      props.event.slots.forEach((s) => {
        next[s.id] = 'available'
      })
      answers.value = next
    }

    return (
      <div
        id="answer-form-section"
        class="bg-white rounded-3xl p-4 sm:p-6 md:p-8 border border-stone-200 shadow-xl shadow-stone-100/50 space-y-6"
      >
        {/* 見出し */}
        <div class="flex items-center justify-between border-b border-stone-200 pb-4">
          <div>
            <h2 class="text-lg md:text-xl font-bold text-stone-900 font-['M_PLUS_Rounded_1c'] flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-rose-100 text-base">
                ✍️
              </span>
              <span>{participantId.value ? '回答を編集する' : 'あなたの予定を追加する'}</span>
            </h2>
            <p class="text-xs text-stone-500 mt-0.5">
              お名前を入力し、タイムラインの各時間をタップ（またはなぞって）出欠を選択してください。
            </p>
          </div>
          {participantId.value ? (
            <button
              type="button"
              onClick={startNewResponse}
              class="text-xs text-rose-500 hover:text-rose-600 font-bold underline cursor-pointer"
            >
              別名で新規回答
            </button>
          ) : null}
        </div>

        {errorMessage.value ? (
          <div class="p-3 bg-rose-100 border border-rose-300 text-rose-800 rounded-xl text-xs font-medium">
            ⚠️ {errorMessage.value}
          </div>
        ) : null}

        {successMessage.value ? (
          <div class="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold animate-pulse">
            ✅ {successMessage.value}
          </div>
        ) : null}

        {/* 参加者名 & コメント */}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-stone-700 mb-1">
              お名前（ニックネーム） <span class="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="例: たなか、田中（19時以降）"
              value={name.value}
              onInput={(e: any) => (name.value = e.target.value)}
              class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-3.5 py-2 text-sm outline-none font-medium"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-stone-700 mb-1">コメント（任意）</label>
            <input
              type="text"
              placeholder="例: 10分ほど遅れるかもしれません"
              value={comment.value}
              onInput={(e: any) => (comment.value = e.target.value)}
              class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-3.5 py-2 text-sm outline-none font-medium"
            />
          </div>
        </div>

        {/* タイムライン操作ツールバー */}
        <div class="bg-stone-50 p-3 sm:p-4 rounded-2xl border border-stone-200 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold text-stone-700 mr-1">塗りツール:</span>
              <button
                type="button"
                onClick={() => (activeTool.value = 'toggle')}
                class={`px-3 py-1.5 text-xs font-bold rounded-xl transition border flex items-center gap-1 ${
                  activeTool.value === 'toggle'
                    ? 'bg-stone-800 text-white border-stone-800 shadow-sm ring-2 ring-stone-300'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                }`}
              >
                <span>🔄</span>
                <span>順次切替</span>
              </button>
              <button
                type="button"
                onClick={() => (activeTool.value = 'available')}
                class={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1 border ${
                  activeTool.value === 'available'
                    ? 'bg-sky-500 text-white border-sky-500 shadow-sm ring-2 ring-sky-200'
                    : 'bg-white text-sky-700 border-sky-300 hover:bg-sky-50'
                }`}
              >
                <span>•</span>
                <span>◯（可）を塗る</span>
              </button>
              <button
                type="button"
                onClick={() => (activeTool.value = 'maybe')}
                class={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1 border ${
                  activeTool.value === 'maybe'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm ring-2 ring-amber-200'
                    : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                }`}
              >
                <span>▲</span>
                <span>△（未定）を塗る</span>
              </button>
              <button
                type="button"
                onClick={() => (activeTool.value = 'unavailable')}
                class={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1 border ${
                  activeTool.value === 'unavailable'
                    ? 'bg-stone-500 text-white border-stone-500 shadow-sm ring-2 ring-stone-200'
                    : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-100'
                }`}
              >
                <span>×</span>
                <span>✕（不可）を塗る</span>
              </button>
            </div>

            {/* 一括操作ボタン */}
            <div class="flex items-center gap-2">
              <span class="text-xs text-stone-500 font-bold">全枠一括:</span>
              <button
                type="button"
                onClick={() => setAll('available')}
                class="px-2.5 py-1 bg-sky-100 hover:bg-sky-200 text-sky-800 text-xs rounded-lg font-bold transition"
              >
                すべて◯
              </button>
              <button
                type="button"
                onClick={() => setAll('unavailable')}
                class="px-2.5 py-1 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs rounded-lg font-bold transition"
              >
                すべて✕
              </button>
            </div>
          </div>
          <p class="text-[11px] text-stone-500">
            💡 マウスを押したまま横になぞる（ドラッグ）と連続してサクサク塗ることができます。
          </p>
        </div>

        {/* 日付ごとのタイムライン入力リスト */}
        <div class="space-y-4 select-none" onTouchmove={handleTouchMove}>
          {uniqueDates.value.map((dateStr) => {
            const dateSlots = props.event.slots.filter((s) => s.slotDate === dateStr)

            return (
              <div
                key={dateStr}
                class="bg-stone-50/70 p-3 sm:p-4 rounded-2xl border border-stone-200 transition hover:border-stone-300"
              >
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                  <div class="font-bold text-sm text-stone-900 font-['M_PLUS_Rounded_1c']">
                    {formatDateLabel(dateStr)}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] text-stone-400">この日を:</span>
                    <button
                      type="button"
                      onClick={() => setDateAll(dateStr, 'available')}
                      class="px-2 py-0.5 bg-white border border-sky-200 hover:bg-sky-50 text-sky-700 text-[11px] font-bold rounded"
                    >
                      ◯にする
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateAll(dateStr, 'unavailable')}
                      class="px-2 py-0.5 bg-white border border-stone-200 hover:bg-stone-100 text-stone-600 text-[11px] font-bold rounded"
                    >
                      ✕にする
                    </button>
                  </div>
                </div>

                {/* タイムライングリッド */}
                <div class="overflow-x-auto overflow-y-hidden pb-1 -mx-2 px-2 md:mx-0 md:px-0">
                  <div class="min-w-[700px]">
                    {/* 時間軸ヘッダー (06〜05) */}
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

                    {/* セル行 (30分刻みなら1時間あたり2コマ、1時間刻みなら1コマ) */}
                    <div class="flex h-8 sm:h-9 items-center">
                      {TIMELINE_HOURS.map((hour) => {
                        const slotsInHour = getSlotsForHour(dateSlots, dateStr, hour)

                        // その時間のスロットがない（枠外）
                        if (slotsInHour.length === 0) {
                          return (
                            <div
                              key={hour}
                              class="w-[28px] sm:w-[32px] h-full bg-stone-200/70 border-r border-white/60 first:rounded-l last:rounded-r"
                              title={`${hour}:00 枠外`}
                            />
                          )
                        }

                        // スロットが存在する場合 (1〜2コマ)
                        const cellWidthClass =
                          slotsInHour.length > 1
                            ? 'w-[14px] sm:w-[16px]'
                            : 'w-[28px] sm:w-[32px]'

                        return (
                          <div key={hour} class="flex h-full">
                            {slotsInHour.map((slot) => {
                              const status = answers.value[slot.id] || 'available'

                              let cellClass = 'bg-[#58b4ff] text-white font-bold hover:bg-sky-500'
                              let symbol = '•'
                              let title = `${slot.startTime}〜${slot.endTime} ◯（参加可能）`

                              if (status === 'maybe') {
                                cellClass = 'bg-[#f5a623] text-white font-bold hover:bg-amber-500'
                                symbol = '▲'
                                title = `${slot.startTime}〜${slot.endTime} △（未定）`
                              } else if (status === 'unavailable') {
                                cellClass =
                                  'bg-[#d4d4d4] text-stone-600 font-bold hover:bg-stone-400 hover:text-white'
                                symbol = '×'
                                title = `${slot.startTime}〜${slot.endTime} ✕（不可）`
                              }

                              return (
                                <div
                                  key={slot.id}
                                  data-slot-id={slot.id}
                                  onMousedown={() => handleMouseDown(slot.id)}
                                  onMouseenter={() => handleMouseEnter(slot.id)}
                                  onTouchstart={() => handleMouseDown(slot.id)}
                                  class={`${cellWidthClass} h-full flex items-center justify-center text-xs select-none border-r border-white/40 transition cursor-pointer active:scale-95 ${cellClass}`}
                                  title={title}
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
                </div>
              </div>
            )
          })}
        </div>

        {/* 送信ボタン */}
        <div class="pt-2">
          <button
            type="button"
            disabled={isSubmitting.value}
            onClick={handleSubmit}
            class="w-full py-4 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-base md:text-lg rounded-2xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting.value ? (
              <span>送信中...</span>
            ) : (
              <>
                <span>💌</span>
                <span>{participantId.value ? '回答を更新する' : '予定を登録する'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    )
  },
})
