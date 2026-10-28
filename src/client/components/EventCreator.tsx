import { defineVaporComponent, ref, computed } from 'vue'
import type { CreateEventInput } from '@/shared/types'

export const EventCreator = defineVaporComponent(() => {
  const title = ref('')
  const organizerName = ref('')
  const description = ref('')

  // カレンダー選択用ステータス
  const today = new Date()
  const currentYear = ref(today.getFullYear())
  const currentMonth = ref(today.getMonth()) // 0-indexed

  // 選択された日付のセット ('YYYY-MM-DD')
  const selectedDates = ref<string[]>([
    today.toISOString().split('T')[0],
  ])

  // 時間帯テンプレート
  const timePresets = [
    { label: '終日 (09:00〜18:00)', start: '09:00', end: '18:00' },
    { label: '午前 (09:00〜12:00)', start: '09:00', end: '12:00' },
    { label: 'ランチ (12:00〜14:00)', start: '12:00', end: '14:00' },
    { label: '午後 (13:00〜17:00)', start: '13:00', end: '17:00' },
    { label: '夜 (18:00〜21:00)', start: '18:00', end: '21:00' },
    { label: '飲み会 (19:00〜22:00)', start: '19:00', end: '22:00' },
  ]

  // カスタム追加用の時間
  const customStartTime = ref('18:00')
  const customEndTime = ref('20:00')

  // 作成される候補枠リスト
  const slots = ref<Array<{ slotDate: string; startTime: string; endTime: string }>>([
    {
      slotDate: today.toISOString().split('T')[0],
      startTime: '18:00',
      endTime: '20:00',
    },
  ])

  const isSubmitting = ref(false)
  const errorMessage = ref('')
  const createdResult = ref<{ id: string; adminToken: string } | null>(null)
  const isCopiedShareUrl = ref(false)
  const isCopiedAdminUrl = ref(false)

  // カレンダーの日付グリッド計算
  const calendarDays = computed(() => {
    const year = currentYear.value
    const month = currentMonth.value
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const days: Array<{
      dateStr: string
      dayNum: number
      isCurrentMonth: boolean
      isPast: boolean
      isToday: boolean
      isSelected: boolean
      dayOfWeek: number
    }> = []

    const startDayOfWeek = firstDay.getDay()
    // 前月の末尾
    const prevLastDay = new Date(year, month, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevLastDay - i
      const prevDate = new Date(year, month - 1, d)
      const dateStr = prevDate.toISOString().split('T')[0]
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isPast: true,
        isToday: false,
        isSelected: selectedDates.value.includes(dateStr),
        dayOfWeek: prevDate.getDay(),
      })
    }

    // 当月
    const todayStr = new Date().toISOString().split('T')[0]
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const current = new Date(year, month, d)
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isPast: dateStr < todayStr,
        isToday: dateStr === todayStr,
        isSelected: selectedDates.value.includes(dateStr),
        dayOfWeek: current.getDay(),
      })
    }

    // 翌月の先頭 (6行42マスに揃える)
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d)
      const dateStr = nextDate.toISOString().split('T')[0]
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isPast: false,
        isToday: false,
        isSelected: selectedDates.value.includes(dateStr),
        dayOfWeek: nextDate.getDay(),
      })
    }

    return days
  })

  const prevMonth = () => {
    if (currentMonth.value === 0) {
      currentMonth.value = 11
      currentYear.value--
    } else {
      currentMonth.value--
    }
  }

  const nextMonth = () => {
    if (currentMonth.value === 11) {
      currentMonth.value = 0
      currentYear.value++
    } else {
      currentMonth.value++
    }
  }

  const toggleDate = (dateStr: string) => {
    const idx = selectedDates.value.indexOf(dateStr)
    if (idx >= 0) {
      selectedDates.value = selectedDates.value.filter((d) => d !== dateStr)
      // slotsからも削除
      slots.value = slots.value.filter((s) => s.slotDate !== dateStr)
    } else {
      selectedDates.value = [...selectedDates.value, dateStr].sort()
      // デフォルト枠を追加
      slots.value.push({
        slotDate: dateStr,
        startTime: customStartTime.value,
        endTime: customEndTime.value,
      })
      sortSlots()
    }
  }

  // 選択中の日付すべてに時間帯を適用
  const applyPresetToSelectedDates = (preset: { start: string; end: string }) => {
    if (selectedDates.value.length === 0) {
      errorMessage.value = 'まずはカレンダーから日付を選んでください'
      return
    }
    errorMessage.value = ''
    selectedDates.value.forEach((d) => {
      const exists = slots.value.some(
        (s) => s.slotDate === d && s.startTime === preset.start && s.endTime === preset.end
      )
      if (!exists) {
        slots.value.push({
          slotDate: d,
          startTime: preset.start,
          endTime: preset.end,
        })
      }
    })
    sortSlots()
  }

  // カスタム時間枠の追加
  const addCustomSlot = () => {
    if (selectedDates.value.length === 0) {
      errorMessage.value = 'まずはカレンダーから日付を選んでください'
      return
    }
    if (customStartTime.value >= customEndTime.value) {
      errorMessage.value = '終了時刻は開始時刻より後に設定してください'
      return
    }
    errorMessage.value = ''
    selectedDates.value.forEach((d) => {
      const exists = slots.value.some(
        (s) =>
          s.slotDate === d &&
          s.startTime === customStartTime.value &&
          s.endTime === customEndTime.value
      )
      if (!exists) {
        slots.value.push({
          slotDate: d,
          startTime: customStartTime.value,
          endTime: customEndTime.value,
        })
      }
    })
    sortSlots()
  }

  const removeSlot = (index: number) => {
    slots.value.splice(index, 1)
  }

  const sortSlots = () => {
    slots.value.sort((a, b) => {
      if (a.slotDate !== b.slotDate) return a.slotDate.localeCompare(b.slotDate)
      return a.startTime.localeCompare(b.startTime)
    })
  }

  const formatDateLabel = (dateStr: string) => {
    const parts = dateStr.split('-')
    if (parts.length < 3) return dateStr
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    const dayNames = ['日', '月', '火', '水', '木', '金', '土']
    return `${Number(parts[1])}/${Number(parts[2])} (${dayNames[d.getDay()]})`
  }

  // イベント送信
  const handleSubmit = async () => {
    errorMessage.value = ''
    if (!title.value.trim()) {
      errorMessage.value = 'イベント名を入力してください'
      return
    }
    if (!organizerName.value.trim()) {
      errorMessage.value = '主催者名を入力してください'
      return
    }
    if (slots.value.length === 0) {
      errorMessage.value = '候補日時を最低1つ追加してください'
      return
    }

    isSubmitting.value = true
    try {
      const payload: CreateEventInput = {
        title: title.value.trim(),
        description: description.value.trim() || undefined,
        organizerName: organizerName.value.trim(),
        slots: slots.value,
      }

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '作成に失敗しました')
      }

      createdResult.value = data
    } catch (err: any) {
      errorMessage.value = err.message || '通信エラーが発生しました'
    } finally {
      isSubmitting.value = false
    }
  }

  const copyToClipboard = async (text: string, type: 'share' | 'admin') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'share') {
        isCopiedShareUrl.value = true
        setTimeout(() => (isCopiedShareUrl.value = false), 2000)
      } else {
        isCopiedAdminUrl.value = true
        setTimeout(() => (isCopiedAdminUrl.value = false), 2000)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

  return (
    <div>
      {createdResult.value ? (
        /* 作成完了画面 */
        <div class="max-w-2xl mx-auto bg-white rounded-3xl p-6 md:p-10 border border-rose-200 shadow-xl shadow-rose-100/50 space-y-8 animate-fade-in">
          <div class="text-center space-y-3">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 text-3xl">
              🎉
            </div>
            <h1 class="text-2xl md:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c']">
              日程調整表を作成しました！
            </h1>
            <p class="text-stone-600 text-sm">
              以下のURLを参加メンバーに共有してください。
            </p>
          </div>

          {/* 参加者用共有URL */}
          <div class="bg-rose-50/70 p-5 rounded-2xl border border-rose-200 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                <span>🔗</span> 参加者に送るURL
              </span>
              <span class="text-xs text-rose-600 font-medium">LINEやSlackで共有</span>
            </div>
            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                value={`${getOrigin()}/events/${createdResult.value.id}`}
                class="w-full bg-white border border-rose-200 rounded-xl px-3 py-2 text-sm text-stone-700 font-mono select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(`${getOrigin()}/events/${createdResult.value!.id}`, 'share')}
                class="whitespace-nowrap px-4 py-2 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-sm font-bold rounded-xl transition shadow-sm"
              >
                {isCopiedShareUrl.value ? 'コピー完了！' : 'URLをコピー'}
              </button>
            </div>
          </div>

          {/* 主催者用管理URL */}
          <div class="bg-amber-50/60 p-5 rounded-2xl border border-amber-200 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <span>🔑</span> 主催者専用 管理URL
              </span>
              <span class="text-xs text-amber-700 font-medium">※大切に保存してください</span>
            </div>
            <p class="text-xs text-stone-600">
              日程の確定、候補日の編集・削除などを行うための管理URLです。参加者には教えないでください。
            </p>
            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                value={`${getOrigin()}/events/${createdResult.value.id}?admin=${createdResult.value.adminToken}`}
                class="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-sm text-stone-700 font-mono select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `${getOrigin()}/events/${createdResult.value!.id}?admin=${createdResult.value!.adminToken}`,
                    'admin'
                  )
                }
                class="whitespace-nowrap px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-sm font-bold rounded-xl transition shadow-sm"
              >
                {isCopiedAdminUrl.value ? 'コピー完了！' : '管理URLコピー'}
              </button>
            </div>
          </div>

          <div class="pt-4 flex flex-col sm:flex-row gap-3">
            <a
              href={`/events/${createdResult.value.id}?admin=${createdResult.value.adminToken}`}
              class="w-full text-center px-6 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-md transition"
            >
              イベントページへ移動する
            </a>
            <a
              href="/"
              class="w-full text-center px-6 py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition"
            >
              トップに戻る
            </a>
          </div>
        </div>
      ) : (
        /* イベント作成フォーム */
        <div class="max-w-3xl mx-auto space-y-8">
          <div class="text-center space-y-2">
            <h1 class="text-2xl md:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c']">
              日程調整表を作る
            </h1>
            <p class="text-stone-600 text-sm">
              候補日と時間帯を選ぶだけで、すぐに回答用URLが発行されます。
            </p>
          </div>

          {errorMessage.value ? (
            <div class="p-4 bg-rose-100 border border-rose-300 text-rose-800 rounded-2xl text-sm font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage.value}</span>
            </div>
          ) : null}

          <div class="bg-white rounded-3xl p-6 md:p-8 border border-rose-100 shadow-xl shadow-rose-100/40 space-y-8">
            {/* 基本情報 */}
            <div class="space-y-4">
              <h2 class="text-base font-bold text-stone-800 border-l-4 border-rose-400 pl-3">
                1. 基本情報
              </h2>

              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-bold text-stone-700 mb-1">
                    イベント名 <span class="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例: プロジェクト定例MTG、同期飲み会、ランチ会"
                    value={title.value}
                    onInput={(e: any) => (title.value = e.target.value)}
                    class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-stone-700 mb-1">
                    主催者名 <span class="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例: 山田太郎、幹事、ニックネーム"
                    value={organizerName.value}
                    onInput={(e: any) => (organizerName.value = e.target.value)}
                    class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-stone-700 mb-1">
                    説明・備考（任意）
                  </label>
                  <textarea
                    rows={2}
                    placeholder="例: オンライン（Google Meet / Zoom）で開催予定です。所要時間は1時間を想定しています。"
                    value={description.value}
                    onInput={(e: any) => (description.value = e.target.value)}
                    class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                  />
                </div>
              </div>
            </div>

            {/* カレンダー & 候補日時選択 */}
            <div class="space-y-4">
              <h2 class="text-base font-bold text-stone-800 border-l-4 border-rose-400 pl-3">
                2. 候補日時を選ぶ
              </h2>

              {/* カレンダーヘッダー */}
              <div class="bg-rose-50/50 p-4 md:p-6 rounded-2xl border border-rose-100">
                <div class="flex items-center justify-between mb-4">
                  <span class="font-extrabold text-base text-stone-800">
                    {currentYear.value}年 {currentMonth.value + 1}月
                  </span>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={prevMonth}
                      class="p-1.5 px-3 rounded-lg hover:bg-rose-100 text-stone-700 text-sm font-bold transition"
                    >
                      ‹ 前月
                    </button>
                    <button
                      type="button"
                      onClick={nextMonth}
                      class="p-1.5 px-3 rounded-lg hover:bg-rose-100 text-stone-700 text-sm font-bold transition"
                    >
                      次月 ›
                    </button>
                  </div>
                </div>

                {/* 曜日ラベル */}
                <div class="grid grid-cols-7 gap-1 text-center text-xs font-bold mb-2">
                  <span class="text-rose-500">日</span>
                  <span class="text-stone-600">月</span>
                  <span class="text-stone-600">火</span>
                  <span class="text-stone-600">水</span>
                  <span class="text-stone-600">木</span>
                  <span class="text-stone-600">金</span>
                  <span class="text-sky-500">土</span>
                </div>

                {/* 日付グリッド */}
                <div class="grid grid-cols-7 gap-1">
                  {calendarDays.value.map((day) => {
                    const isSelected = day.isSelected
                    let cellClass =
                      'h-10 md:h-12 flex flex-col items-center justify-center rounded-xl text-xs md:text-sm transition-all cursor-pointer select-none '
                    if (isSelected) {
                      cellClass += 'bg-rose-500 text-white font-extrabold shadow-sm scale-102 '
                    } else if (!day.isCurrentMonth) {
                      cellClass += 'text-stone-300 hover:bg-rose-50/70 '
                    } else if (day.dayOfWeek === 0) {
                      cellClass += 'text-rose-500 hover:bg-rose-100 font-medium '
                    } else if (day.dayOfWeek === 6) {
                      cellClass += 'text-sky-600 hover:bg-rose-100 font-medium '
                    } else {
                      cellClass += 'text-stone-700 hover:bg-rose-100 font-medium '
                    }

                    if (day.isToday && !isSelected) {
                      cellClass += ' ring-2 ring-rose-400 ring-offset-1 '
                    }

                    return (
                      <button
                        key={day.dateStr}
                        type="button"
                        onClick={() => toggleDate(day.dateStr)}
                        class={cellClass}
                      >
                        <span>{day.dayNum}</span>
                        {isSelected ? <span class="w-1 h-1 bg-white rounded-full mt-0.5"></span> : null}
                      </button>
                    )
                  })}
                </div>

                <div class="mt-3 text-[11px] text-stone-500 text-center">
                  クリックして候補日を選択（複数日選択可）
                </div>
              </div>

              {/* 時間帯プリセットとカスタム追加 */}
              <div class="space-y-3 pt-2">
                <label class="block text-xs font-bold text-stone-700">
                  選択中の日付（{selectedDates.value.length}日）に時間帯を一括追加
                </label>

                {/* プリセットボタン群 */}
                <div class="flex flex-wrap gap-2">
                  {timePresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPresetToSelectedDates(preset)}
                      class="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-stone-700 text-xs rounded-xl font-medium transition shadow-xs"
                    >
                      ＋ {preset.label}
                    </button>
                  ))}
                </div>

                {/* カスタム時間帯追加 */}
                <div class="flex flex-wrap items-center gap-2 pt-1 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                  <span class="text-xs font-bold text-stone-600">カスタム枠:</span>
                  <input
                    type="time"
                    value={customStartTime.value}
                    onChange={(e: any) => (customStartTime.value = e.target.value)}
                    class="bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs outline-none"
                  />
                  <span class="text-xs text-stone-400">〜</span>
                  <input
                    type="time"
                    value={customEndTime.value}
                    onChange={(e: any) => (customEndTime.value = e.target.value)}
                    class="bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={addCustomSlot}
                    class="px-3 py-1 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-lg transition"
                  >
                    この時間枠を追加
                  </button>
                </div>
              </div>

              {/* 選択された候補枠一覧 */}
              <div class="space-y-2 pt-2">
                <div class="flex items-center justify-between">
                  <label class="block text-xs font-bold text-stone-700">
                    作成される候補枠（全 {slots.value.length} 枠）
                  </label>
                  {slots.value.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => (slots.value = [])}
                      class="text-xs text-stone-400 hover:text-rose-500"
                    >
                      すべてクリア
                    </button>
                  ) : null}
                </div>

                {slots.value.length === 0 ? (
                  <div class="p-6 border-2 border-dashed border-rose-200 rounded-2xl text-center text-xs text-stone-400">
                    カレンダーから日付を選んで時間枠を追加してください
                  </div>
                ) : (
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1">
                    {slots.value.map((slot, index) => (
                      <div
                        key={`${slot.slotDate}-${slot.startTime}-${slot.endTime}-${index}`}
                        class="flex items-center justify-between bg-rose-50/70 border border-rose-200/80 px-3 py-2 rounded-xl text-xs"
                      >
                        <div class="font-bold text-stone-800">
                          {formatDateLabel(slot.slotDate)}{' '}
                          <span class="font-mono text-rose-700">
                            {slot.startTime}〜{slot.endTime}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSlot(index)}
                          class="text-stone-400 hover:text-rose-600 font-bold ml-2 px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 送信ボタン */}
            <div class="pt-4">
              <button
                type="button"
                disabled={isSubmitting.value || slots.value.length === 0}
                onClick={handleSubmit}
                class="w-full py-4 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-lg rounded-2xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting.value ? (
                  <span>作成中...</span>
                ) : (
                  <>
                    <span>✨</span>
                    <span>日程調整表を作成する</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
