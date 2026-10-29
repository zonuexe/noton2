// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, ref } from 'vue'
import type { EventDetail } from '@/shared/types'
import { splitIntoSlots, formatDateLabel } from '@/shared/time'

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
    const isUpdating = ref(false)
    const isCopiedMessage = ref(false)
    const isCopiedShareUrl = ref(false)

    // セクション開閉
    const isAddSlotOpen = ref(false)
    const isEditInfoOpen = ref(false)

    // 新規スロット追加用フォーム
    const todayStr = new Date().toISOString().split('T')[0]
    const newSlotDate = ref(todayStr)
    const newStartTime = ref('10:00')
    const newEndTime = ref('19:00')

    // イベント基本情報編集用フォーム
    const editTitle = ref(props.event.title)
    const editDescription = ref(props.event.description || '')
    const editDuration = ref(props.event.durationMinutes)

    const timePresets = [
      { label: '日中 (10:00〜19:00)', start: '10:00', end: '19:00' },
      { label: '終日 (09:00〜18:00)', start: '09:00', end: '18:00' },
      { label: '午後 (13:00〜18:00)', start: '13:00', end: '18:00' },
      { label: '夜 (18:00〜22:00)', start: '18:00', end: '22:00' },
    ]

    // スロットの追加
    const handleAddSlots = async () => {
      if (!newSlotDate.value) {
        alert('日付を選択してください')
        return
      }
      if (newStartTime.value >= newEndTime.value) {
        alert('終了時刻は開始時刻より後に設定してください')
        return
      }

      isUpdating.value = true
      try {
        const slotsToAdd = splitIntoSlots(
          newStartTime.value,
          newEndTime.value,
          props.event.slotIntervalMinutes || 60
        ).map((s) => ({
          slotDate: newSlotDate.value,
          startTime: s.start,
          endTime: s.end,
        }))

        const res = await fetch(`/api/events/${props.event.id}/slots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminToken: props.adminToken || undefined,
            slots: slotsToAdd,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'スロットの追加に失敗しました')
        }

        alert(`${data.addedCount}件の枠を追加しました！`)
        props.onReload()
      } catch (e: any) {
        alert(e.message || '通信エラーが発生しました')
      } finally {
        isUpdating.value = false
      }
    }

    // イベント基本情報の更新
    const handleUpdateInfo = async () => {
      if (!editTitle.value.trim()) {
        alert('タイトルを入力してください')
        return
      }

      isUpdating.value = true
      try {
        const res = await fetch(`/api/events/${props.event.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminToken: props.adminToken || undefined,
            title: editTitle.value.trim(),
            description: editDescription.value.trim() || undefined,
            durationMinutes: editDuration.value,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || '更新に失敗しました')
        }

        alert('イベント情報を更新しました！')
        isEditInfoOpen.value = false
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

    // 連絡用メッセージ生成
    const generateAnnouncementMessage = () => {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const shareUrl = `${origin}/events/${props.event.id}`

      return `【日程調整のお願い】${props.event.title}

皆さま、日程のご回答をお願いいたします！
以下のURLからご都合のよい日時をご登録ください。

👤 主催者: ${props.event.organizerName}
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
      <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded-3xl p-4 sm:p-6 md:p-8 border-2 border-amber-300 shadow-xl shadow-amber-100/50 space-y-6">
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

        {/* アクションボタン群 */}
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1">
          <button
            type="button"
            onClick={() => (isAddSlotOpen.value = !isAddSlotOpen.value)}
            class="px-4 py-3 bg-white border border-amber-300 hover:border-amber-500 rounded-2xl text-left transition shadow-xs flex items-center justify-between font-bold text-xs text-amber-950 cursor-pointer"
          >
            <span class="flex items-center gap-1.5">
              <span>📅</span> 日時・枠を追加する
            </span>
            <span>{isAddSlotOpen.value ? '▲' : '▼'}</span>
          </button>

          <button
            type="button"
            onClick={() => (isEditInfoOpen.value = !isEditInfoOpen.value)}
            class="px-4 py-3 bg-white border border-amber-300 hover:border-amber-500 rounded-2xl text-left transition shadow-xs flex items-center justify-between font-bold text-xs text-amber-950 cursor-pointer"
          >
            <span class="flex items-center gap-1.5">
              <span>✏️</span> イベント情報を編集
            </span>
            <span>{isEditInfoOpen.value ? '▲' : '▼'}</span>
          </button>

          <button
            type="button"
            onClick={copyAnnouncement}
            class="px-4 py-3 bg-white border border-amber-300 hover:border-amber-500 rounded-2xl text-left transition shadow-xs flex items-center justify-between font-bold text-xs text-amber-950 cursor-pointer"
          >
            <span class="flex items-center gap-1.5">
              <span>📋</span> 連絡用メッセージ
            </span>
            <span class="text-[11px] text-amber-600">
              {isCopiedMessage.value ? 'コピー完了！' : 'コピー'}
            </span>
          </button>

          <button
            type="button"
            onClick={copyShareUrl}
            class="px-4 py-3 bg-white border border-amber-300 hover:border-amber-500 rounded-2xl text-left transition shadow-xs flex items-center justify-between font-bold text-xs text-amber-950 cursor-pointer"
          >
            <span class="flex items-center gap-1.5">
              <span>🔗</span> 共有URL
            </span>
            <span class="text-[11px] text-amber-600">
              {isCopiedShareUrl.value ? 'コピー完了！' : 'コピー'}
            </span>
          </button>
        </div>

        {/* 1. 日時・候補枠追加パネル */}
        {isAddSlotOpen.value ? (
          <div class="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200 space-y-4 animate-fade-in shadow-xs">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                <span>➕</span> 新しい候補日時・枠を追加する
              </h3>
              <span class="text-[11px] text-stone-500">
                ※既存の回答データは保持されたまま、新しい枠が追加されます
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-bold text-stone-700 mb-1">追加する日付</label>
                <input
                  type="date"
                  value={newSlotDate.value}
                  onChange={(e: any) => (newSlotDate.value = e.target.value)}
                  class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-stone-700 mb-1">開始時刻</label>
                <input
                  type="time"
                  value={newStartTime.value}
                  onChange={(e: any) => (newStartTime.value = e.target.value)}
                  class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-stone-700 mb-1">終了時刻</label>
                <input
                  type="time"
                  value={newEndTime.value}
                  onChange={(e: any) => (newEndTime.value = e.target.value)}
                  class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>
            </div>

            {/* プリセット */}
            <div class="flex flex-wrap gap-1.5 items-center">
              <span class="text-[11px] font-bold text-stone-500 mr-1">プリセット:</span>
              {timePresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    newStartTime.value = p.start
                    newEndTime.value = p.end
                  }}
                  class="px-2.5 py-1 bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 text-[11px] rounded-lg font-medium transition"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div class="flex justify-end pt-2">
              <button
                type="button"
                disabled={isUpdating.value}
                onClick={handleAddSlots}
                class="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-extrabold rounded-xl transition shadow-sm cursor-pointer"
              >
                {isUpdating.value ? '追加中...' : 'この枠を追加する'}
              </button>
            </div>
          </div>
        ) : null}

        {/* 2. イベント情報編集パネル */}
        {isEditInfoOpen.value ? (
          <div class="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200 space-y-4 animate-fade-in shadow-xs">
            <h3 class="text-sm font-bold text-amber-950 flex items-center gap-1.5">
              <span>✏️</span> イベント基本情報の編集
            </h3>

            <div class="space-y-3">
              <div>
                <label class="block text-xs font-bold text-stone-700 mb-1">イベント名</label>
                <input
                  type="text"
                  value={editTitle.value}
                  onInput={(e: any) => (editTitle.value = e.target.value)}
                  class="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm outline-none font-medium"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-stone-700 mb-1">予定時間 / 所要時間</label>
                <select
                  value={editDuration.value}
                  onChange={(e: any) => (editDuration.value = Number(e.target.value))}
                  class="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs outline-none bg-white font-medium"
                >
                  <option value={30}>30分</option>
                  <option value={60}>1時間</option>
                  <option value={90}>1時間30分</option>
                  <option value={120}>2時間</option>
                  <option value={180}>3時間</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-stone-700 mb-1">説明・補足</label>
                <textarea
                  rows={2}
                  value={editDescription.value}
                  onInput={(e: any) => (editDescription.value = e.target.value)}
                  class="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs outline-none font-medium"
                />
              </div>
            </div>

            <div class="flex justify-end pt-2">
              <button
                type="button"
                disabled={isUpdating.value}
                onClick={handleUpdateInfo}
                class="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
              >
                {isUpdating.value ? '保存中...' : '変更を保存する'}
              </button>
            </div>
          </div>
        ) : null}

        {/* 危険な操作 (削除) */}
        <div class="border-t border-amber-200/80 pt-3 flex justify-end">
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
