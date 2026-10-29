// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, ref, computed, onMounted } from 'vue'
import type { AnswerStatus, EventDetail, SubmitResponseInput } from '@/shared/types'
import { TIMELINE_HOURS, formatDateLabel, findSlotForHour } from '@/shared/time'

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
    const answers = ref<Record<string, AnswerStatus>>({})
    const participantId = ref<string | null>(null)
    const editToken = ref<string | null>(null)

    // 現在選択中の塗りツール ('toggle' または 特定のステータス)
    const activeTool = ref<'toggle' | AnswerStatus>('toggle')

    const isSubmitting = ref(false)
    const errorMessage = ref('')
    const successMessage = ref('')

    // イベントに含まれるユニークな日付一覧 ('YYYY-MM-DD')
    const uniqueDates = computed(() => {
      const dateSet = new Set<string>()
      props.event.slots.forEach((s) => dateSet.add(s.slotDate))
      return Array.from(dateSet).sort()
    })

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
      props.event.slots.forEach((s) => {
        if (!answers.value[s.id]) {
          answers.value[s.id] = 'available'
        }
      })
    })

    // 全スロットを一括設定
    const setAll = (status: AnswerStatus) => {
      props.event.slots.forEach((s) => {
        answers.value[s.id] = status
      })
    }

    // 特定の日付の全スロットを一括設定
    const setDateAll = (dateStr: string, status: AnswerStatus) => {
      props.event.slots
        .filter((s) => s.slotDate === dateStr)
        .forEach((s) => {
          answers.value[s.id] = status
        })
    }

    // セルクリック時のトグルまたは塗り
    const handleCellClick = (slotId: string) => {
      if (activeTool.value !== 'toggle') {
        answers.value[slotId] = activeTool.value
        return
      }

      // トグル順: available(◯) -> maybe(△) -> unavailable(✕) -> favorite(◎) -> available(◯)
      const current = answers.value[slotId] || 'available'
      if (current === 'available') {
        answers.value[slotId] = 'maybe'
      } else if (current === 'maybe') {
        answers.value[slotId] = 'unavailable'
      } else if (current === 'unavailable') {
        answers.value[slotId] = 'favorite'
      } else {
        answers.value[slotId] = 'available'
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
            status: answers.value[s.id] || 'unavailable',
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

        successMessage.value = participantId.value ? '回答を更新しました！' : '回答を登録しました！'
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
      answers.value = {}
      props.event.slots.forEach((s) => {
        answers.value[s.id] = 'available'
      })
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
              お名前を入力し、タイムラインの各時間をタップして出欠（◯・△・✕）を選択してください。
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

        {/* タイムライン入力操作バー */}
        <div class="bg-stone-50 p-3 sm:p-4 rounded-2xl border border-stone-200 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold text-stone-700 mr-1">入力モード:</span>
              <button
                type="button"
                onClick={() => (activeTool.value = 'toggle')}
                class={`px-2.5 py-1 text-xs font-bold rounded-lg transition border ${
                  activeTool.value === 'toggle'
                    ? 'bg-stone-800 text-white border-stone-800 shadow-xs'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                }`}
              >
                🔄 タップで切替
              </button>
              <button
                type="button"
                onClick={() => (activeTool.value = 'available')}
                class={`px-2.5 py-1 text-xs font-bold rounded-lg transition border ${
                  activeTool.value === 'available'
                    ? 'bg-sky-500 text-white border-sky-500 shadow-xs'
                    : 'bg-white text-sky-700 border-sky-300 hover:bg-sky-50'
                }`}
              >
                • ◯を塗る
              </button>
              <button
                type="button"
                onClick={() => (activeTool.value = 'maybe')}
                class={`px-2.5 py-1 text-xs font-bold rounded-lg transition border ${
                  activeTool.value === 'maybe'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                }`}
              >
                ▲ △を塗る
              </button>
              <button
                type="button"
                onClick={() => (activeTool.value = 'unavailable')}
                class={`px-2.5 py-1 text-xs font-bold rounded-lg transition border ${
                  activeTool.value === 'unavailable'
                    ? 'bg-stone-500 text-white border-stone-500 shadow-xs'
                    : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-100'
                }`}
              >
                × ✕を塗る
              </button>
            </div>

            {/* 一括操作 */}
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] text-stone-500 font-bold">全枠一括:</span>
              <button
                type="button"
                onClick={() => setAll('available')}
                class="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 text-sky-800 text-xs rounded-md font-bold transition"
              >
                すべて◯
              </button>
              <button
                type="button"
                onClick={() => setAll('unavailable')}
                class="px-2 py-0.5 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs rounded-md font-bold transition"
              >
                すべて✕
              </button>
            </div>
          </div>
          <p class="text-[11px] text-stone-500">
            タイムライン上のマスをクリックすると出欠が変わります。まずは「すべて◯」にしてから、都合の悪い時間だけ✕にするのがおすすめです。
          </p>
        </div>

        {/* 日付ごとのタイムライン入力リスト */}
        <div class="space-y-3">
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
                    {/* 時間軸ヘッダー */}
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

                    {/* セル列（クリック可能） */}
                    <div class="flex h-8 sm:h-9 items-center">
                      {TIMELINE_HOURS.map((hour) => {
                        const slot = findSlotForHour(dateSlots, dateStr, hour)

                        // 枠外
                        if (!slot) {
                          return (
                            <div
                              key={hour}
                              class="w-[28px] sm:w-[32px] h-full bg-stone-200/70 border-r border-white/60 first:rounded-l last:rounded-r"
                              title={`${hour}:00 枠外`}
                            />
                          )
                        }

                        const status = answers.value[slot.id] || 'available'

                        let cellClass = 'bg-sky-400 text-white font-bold hover:bg-sky-500'
                        let symbol = '•'
                        let title = `${hour}:00 ◯（参加可能）`

                        if (status === 'favorite') {
                          cellClass = 'bg-blue-600 text-white font-bold hover:bg-blue-700'
                          symbol = '◎'
                          title = `${hour}:00 ◎（希望）`
                        } else if (status === 'maybe') {
                          cellClass = 'bg-amber-400 text-white font-bold hover:bg-amber-500'
                          symbol = '▲'
                          title = `${hour}:00 △（未定）`
                        } else if (status === 'unavailable') {
                          cellClass =
                            'bg-stone-300 text-stone-600 font-bold hover:bg-stone-400 hover:text-white'
                          symbol = '×'
                          title = `${hour}:00 ✕（不可）`
                        }

                        return (
                          <button
                            key={hour}
                            type="button"
                            onClick={() => handleCellClick(slot.id)}
                            class={`w-[28px] sm:w-[32px] h-full flex items-center justify-center text-xs select-none border-r border-white/40 transition cursor-pointer active:scale-95 ${cellClass}`}
                            title={title}
                          >
                            <span>{symbol}</span>
                          </button>
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
