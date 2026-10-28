import { defineVaporComponent, ref, computed } from 'vue'
import { AnswerForm } from './AnswerForm'
import { MatrixTable } from './MatrixTable'
import { AdminControls } from './AdminControls'
import type { EventDetail } from '@/shared/types'

export const EventDetailApp = defineVaporComponent((props: { initialEvent: EventDetail }) => {
  const event = ref<EventDetail>(props.initialEvent)
    const isReloading = ref(false)
    const isCopied = ref(false)

    // URLクエリから adminToken を抽出
    const getAdminToken = () => {
      if (typeof window === 'undefined') return ''
      const params = new URLSearchParams(window.location.search)
      return params.get('admin') || ''
    }
    const adminToken = ref(getAdminToken())

    // 日付フォーマット
    const formatDateLabel = (dateStr: string) => {
      const parts = dateStr.split('-')
      if (parts.length < 3) return dateStr
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const dayNames = ['日', '月', '火', '水', '木', '金', '土']
      return `${Number(parts[1])}/${Number(parts[2])} (${dayNames[d.getDay()]})`
    }

    // 最新データのリロード
    const reloadEvent = async () => {
      isReloading.value = true
      try {
        const query = adminToken.value ? `?admin=${encodeURIComponent(adminToken.value)}` : ''
        const res = await fetch(`/api/events/${event.value.id}${query}`)
        if (res.ok) {
          const updated = await res.json()
          event.value = updated
        }
      } catch (e) {
        console.error('Reload failed:', e)
      } finally {
        isReloading.value = false
      }
    }

    const copyShareUrl = async () => {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        await navigator.clipboard.writeText(`${origin}/events/${event.value.id}`)
        isCopied.value = true
        setTimeout(() => (isCopied.value = false), 2000)
      } catch (e) {
        console.error(e)
      }
    }

    const confirmedSlot = computed(() =>
      event.value.slots.find((s) => s.id === event.value.confirmedSlotId)
    )

    return (
      <div class="max-w-4xl mx-auto space-y-8 animate-fade-in">
        {/* イベントヘッダーカード */}
        <div class="bg-white rounded-3xl p-6 md:p-8 border border-rose-100 shadow-xl shadow-rose-100/40 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div class="space-y-1.5 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs bg-rose-100 text-rose-700 font-bold px-2.5 py-0.5 rounded-full">
                  日程調整中
                </span>
                {adminToken.value ? (
                  <span class="text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full">
                    👑 主催者モード
                  </span>
                ) : null}
                {confirmedSlot.value ? (
                  <span class="text-xs bg-amber-500 text-white font-extrabold px-2.5 py-0.5 rounded-full animate-pulse">
                    🎉 開催決定
                  </span>
                ) : null}
              </div>

              <h1 class="text-2xl md:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c'] tracking-tight">
                {event.value.title}
              </h1>

              <div class="flex items-center gap-4 text-xs text-stone-500 font-medium">
                <span>主催者: <strong class="text-stone-700">{event.value.organizerName}</strong> さん</span>
                <span>候補枠数: {event.value.slots.length}枠</span>
              </div>
            </div>

            {/* 共有ボタン */}
            <button
              type="button"
              onClick={copyShareUrl}
              class="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:bg-rose-200 text-rose-700 rounded-xl text-xs font-bold transition shadow-xs whitespace-nowrap self-start"
            >
              <span>🔗</span>
              <span>{isCopied.value ? 'コピー完了！' : '共有URLをコピー'}</span>
            </button>
          </div>

          {/* イベント説明 */}
          {event.value.description ? (
            <div class="bg-rose-50/50 p-4 rounded-2xl border border-rose-100 text-xs md:text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
              {event.value.description}
            </div>
          ) : null}

          {/* 確定日時バナー */}
          {confirmedSlot.value ? (
            <div class="p-4 md:p-5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-md space-y-1">
              <div class="text-xs font-bold uppercase tracking-wider opacity-90 flex items-center gap-1">
                <span>🎉</span> 開催日時が決定しました！
              </div>
              <div class="text-lg md:text-xl font-extrabold font-['M_PLUS_Rounded_1c']">
                {formatDateLabel(confirmedSlot.value.slotDate)} {confirmedSlot.value.startTime}〜{confirmedSlot.value.endTime}
              </div>
            </div>
          ) : null}
        </div>

        {/* 主催者管理バー (adminTokenがある場合のみ) */}
        {adminToken.value ? (
          <AdminControls
            event={event.value}
            adminToken={adminToken.value}
            onReload={reloadEvent}
          />
        ) : null}

        {/* 出欠集計表 (マトリクス) */}
        <MatrixTable
          event={event.value}
          adminToken={adminToken.value}
          onReload={reloadEvent}
        />

        {/* 回答入力フォーム */}
        <AnswerForm
          event={event.value}
          onSuccess={reloadEvent}
        />
      </div>
    )
})
