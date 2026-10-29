// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, ref } from 'vue'
import type { EventDetail } from '@/shared/types'

export const AdminControls = defineVaporComponent({
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
    const selectedSlotId = ref<string>(
      props.event.confirmedSlotId || props.event.slots[0]?.id || ''
    )
    const isUpdating = ref(false)
    const isCopiedMessage = ref(false)
    const isCopiedShareUrl = ref(false)

    const formatDateLabel = (dateStr: string) => {
      const parts = dateStr.split('-')
      if (parts.length < 3) return dateStr
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const dayNames = ['日', '月', '火', '水', '木', '金', '土']
      return `${Number(parts[1])}/${Number(parts[2])} (${dayNames[d.getDay()]})`
    }

    // 日程確定または解除
    const handleConfirm = async (slotId: string | null) => {
      isUpdating.value = true
      try {
        const res = await fetch(`/api/events/${props.event.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminToken: props.adminToken || undefined,
            slotId,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || '日程確定の更新に失敗しました')
          return
        }

        props.onReload()
      } catch (e: any) {
        alert(e.message || '通信エラーが発生しました')
      } finally {
        isUpdating.value = false
      }
    }

    // イベント削除
    const handleDeleteEvent = async () => {
      if (
        !confirm(
          'このイベントと全ての回答データを削除してもよろしいですか？この操作は取り消せません。'
        )
      ) {
        return
      }

      isUpdating.value = true
      try {
        const res = await fetch(`/api/events/${props.event.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminToken: props.adminToken || undefined }),
        })

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || '削除に失敗しました')
          return
        }

        alert('イベントを削除しました。トップページに戻ります。')
        window.location.href = '/'
      } catch (e: any) {
        alert(e.message || '通信エラーが発生しました')
        isUpdating.value = false
      }
    }

    // 決定通知メッセージ生成
    const generateAnnouncementMessage = () => {
      const confirmedSlot = props.event.slots.find((s) => s.id === props.event.confirmedSlotId)
      const slotText = confirmedSlot
        ? `${formatDateLabel(confirmedSlot.slotDate)} ${confirmedSlot.startTime}〜${confirmedSlot.endTime}`
        : '未確定'

      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const shareUrl = `${origin}/events/${props.event.id}`

      return `【日程決定】${props.event.title}

皆さま、日程のご回答ありがとうございました！
以下の日時にて開催が決定いたしました。

📅 日時: ${slotText}
👤 調整主催: ${props.event.organizerName}

▼ 詳細・回答一覧はこちら
${shareUrl}

よろしくお願いいたします！`
    }

    const copyAnnouncement = async () => {
      try {
        const text = generateAnnouncementMessage()
        await navigator.clipboard.writeText(text)
        isCopiedMessage.value = true
        setTimeout(() => (isCopiedMessage.value = false), 2500)
      } catch (e) {
        console.error(e)
      }
    }

    const copyShareUrl = async () => {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        await navigator.clipboard.writeText(`${origin}/events/${props.event.id}`)
        isCopiedShareUrl.value = true
        setTimeout(() => (isCopiedShareUrl.value = false), 2000)
      } catch (e) {
        console.error(e)
      }
    }

    return (
      <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded-3xl p-6 md:p-8 border-2 border-amber-300 shadow-xl shadow-amber-100/50 space-y-6">
        <div class="flex items-center justify-between border-b border-amber-200 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">👑</span>
            <h2 class="text-base md:text-lg font-bold text-amber-950 font-['M_PLUS_Rounded_1c']">
              主催者専用 管理メニュー
            </h2>
          </div>
          <span class="text-xs bg-amber-200 text-amber-800 font-bold px-2.5 py-1 rounded-full">
            管理者権限
          </span>
        </div>

        {/* 日程確定セクション */}
        <div class="space-y-3">
          <label class="block text-xs font-bold text-amber-900">開催日時の確定</label>
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={selectedSlotId.value}
              onChange={(e: any) => (selectedSlotId.value = e.target.value)}
              class="bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm text-stone-800 outline-none flex-1 font-medium"
            >
              {props.event.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateLabel(s.slotDate)} {s.startTime}〜{s.endTime}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={isUpdating.value}
              onClick={() => handleConfirm(selectedSlotId.value)}
              class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-sm font-extrabold rounded-xl transition shadow-sm whitespace-nowrap"
            >
              この日程で決定する
            </button>

            {props.event.confirmedSlotId ? (
              <button
                type="button"
                disabled={isUpdating.value}
                onClick={() => handleConfirm(null)}
                class="px-4 py-2.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-sm font-bold rounded-xl transition whitespace-nowrap"
              >
                確定を解除
              </button>
            ) : null}
          </div>
        </div>

        {/* 決定メッセージコピー & 共有 */}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={copyAnnouncement}
            class="p-3 bg-white border border-amber-200 hover:border-amber-400 rounded-2xl text-left transition shadow-xs flex items-center justify-between group"
          >
            <div>
              <div class="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <span>📋</span> 日程決定メッセージをコピー
              </div>
              <div class="text-[11px] text-stone-500 mt-0.5">LINE・Slack連絡用の定型文</div>
            </div>
            <span class="text-xs font-bold text-amber-600 group-hover:underline">
              {isCopiedMessage.value ? 'コピー完了！' : 'コピー'}
            </span>
          </button>

          <button
            type="button"
            onClick={copyShareUrl}
            class="p-3 bg-white border border-amber-200 hover:border-amber-400 rounded-2xl text-left transition shadow-xs flex items-center justify-between group"
          >
            <div>
              <div class="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <span>🔗</span> 参加者共有URLをコピー
              </div>
              <div class="text-[11px] text-stone-500 mt-0.5">回答依頼用リンク</div>
            </div>
            <span class="text-xs font-bold text-amber-600 group-hover:underline">
              {isCopiedShareUrl.value ? 'コピー完了！' : 'コピー'}
            </span>
          </button>
        </div>

        {/* 危険な操作 (削除) */}
        <div class="border-t border-amber-200/80 pt-4 flex justify-end">
          <button
            type="button"
            disabled={isUpdating.value}
            onClick={handleDeleteEvent}
            class="text-xs text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
          >
            ⚠️ このイベントを削除する
          </button>
        </div>
      </div>
    )
  },
})
