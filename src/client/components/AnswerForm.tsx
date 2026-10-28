import { defineVaporComponent, ref, onMounted } from 'vue'
import type { AnswerStatus, EventDetail, SubmitResponseInput } from '@/shared/types'

export const AnswerForm = defineVaporComponent((props: { event: EventDetail; onSuccess: () => void }) => {
  const name = ref('')
    const comment = ref('')
    const answers = ref<Record<string, AnswerStatus>>({})
    const participantId = ref<string | null>(null)
    const editToken = ref<string | null>(null)

    const isSubmitting = ref(false)
    const errorMessage = ref('')
    const successMessage = ref('')

    // 日付フォーマット
    const formatDateLabel = (dateStr: string) => {
      const parts = dateStr.split('-')
      if (parts.length < 3) return dateStr
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const dayNames = ['日', '月', '火', '水', '木', '金', '土']
      return `${Number(parts[1])}/${Number(parts[2])} (${dayNames[d.getDay()]})`
    }

    // localStorage から過去の自分の回答を取得
    onMounted(() => {
      try {
        const stored = localStorage.getItem(`noton2_resp_${props.event.id}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.participantId && parsed.editToken) {
            participantId.value = parsed.participantId
            editToken.value = parsed.editToken
            name.value = parsed.name || ''

            // 参加者リストから最新の回答・コメントを復元
            const existingParticipant = props.event.participants.find(
              (p) => p.id === parsed.participantId
            )
            if (existingParticipant) {
              name.value = existingParticipant.name
              comment.value = existingParticipant.comment || ''
              if (existingParticipant.answers) {
                answers.value = { ...existingParticipant.answers }
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

    const setAll = (status: AnswerStatus) => {
      props.event.slots.forEach((s) => {
        answers.value[s.id] = status
      })
    }

    const setSlotStatus = (slotId: string, status: AnswerStatus) => {
      answers.value[slotId] = status
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

        // 親にリロード通知
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
      <div class="bg-white rounded-3xl p-6 md:p-8 border border-rose-100 shadow-xl shadow-rose-100/40 space-y-6">
        <div class="flex items-center justify-between border-b border-rose-100 pb-4">
          <div>
            <h2 class="text-lg font-bold text-stone-900 font-['M_PLUS_Rounded_1c'] flex items-center gap-2">
              <span>✍️</span>
              <span>{participantId.value ? '回答を編集する' : '出欠を回答する'}</span>
            </h2>
            <p class="text-xs text-stone-500 mt-0.5">
              お名前を入力して、各日程の希望・都合を選んでください。
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
              class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-stone-700 mb-1">
              コメント（任意）
            </label>
            <input
              type="text"
              placeholder="例: 10分ほど遅れるかもしれません"
              value={comment.value}
              onInput={(e: any) => (comment.value = e.target.value)}
              class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        {/* 一括操作ボタン */}
        <div class="flex items-center justify-between pt-2">
          <span class="text-xs font-bold text-stone-700">各日程の出欠・希望</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAll('favorite')}
              class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs rounded-lg font-bold border border-rose-200"
            >
              すべて◎
            </button>
            <button
              type="button"
              onClick={() => setAll('available')}
              class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs rounded-lg font-bold border border-emerald-200"
            >
              すべて◯
            </button>
            <button
              type="button"
              onClick={() => setAll('unavailable')}
              class="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs rounded-lg font-bold border border-stone-200"
            >
              すべて✕
            </button>
          </div>
        </div>

        {/* スロットごとの 4段階ボタンリスト */}
        <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {props.event.slots.map((slot) => {
            const current = answers.value[slot.id] || 'available'
            const isConfirmed = props.event.confirmedSlotId === slot.id

            return (
              <div
                key={slot.id}
                class={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl border transition-all ${
                  isConfirmed
                    ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-300'
                    : 'bg-stone-50/60 border-stone-200 hover:border-rose-200'
                }`}
              >
                <div class="flex items-center gap-2 mb-2 sm:mb-0">
                  {isConfirmed ? (
                    <span class="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-extrabold rounded-full">
                      確定日時
                    </span>
                  ) : null}
                  <span class="font-bold text-sm text-stone-800">
                    {formatDateLabel(slot.slotDate)}
                  </span>
                  <span class="font-mono text-xs text-rose-700 font-bold bg-white px-2 py-0.5 rounded-md border border-rose-100">
                    {slot.startTime}〜{slot.endTime}
                  </span>
                </div>

                {/* 4段階ボタン */}
                <div class="grid grid-cols-4 gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSlotStatus(slot.id, 'favorite')}
                    class={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                      current === 'favorite'
                        ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-300 font-extrabold'
                        : 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50'
                    }`}
                  >
                    <span>◎</span>
                    <span class="text-[11px]">希望</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSlotStatus(slot.id, 'available')}
                    class={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                      current === 'available'
                        ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300 font-extrabold'
                        : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    <span>◯</span>
                    <span class="text-[11px]">可</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSlotStatus(slot.id, 'maybe')}
                    class={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                      current === 'maybe'
                        ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300 font-extrabold'
                        : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    <span>△</span>
                    <span class="text-[11px]">未定</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSlotStatus(slot.id, 'unavailable')}
                    class={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                      current === 'unavailable'
                        ? 'bg-stone-500 text-white shadow-sm ring-2 ring-stone-300 font-extrabold'
                        : 'bg-white text-stone-500 border border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <span>✕</span>
                    <span class="text-[11px]">不可</span>
                  </button>
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
            class="w-full py-3.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-base rounded-2xl shadow-md shadow-rose-200 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting.value ? (
              <span>送信中...</span>
            ) : (
              <>
                <span>💌</span>
                <span>{participantId.value ? '回答を更新する' : '回答を登録する'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    )
})
