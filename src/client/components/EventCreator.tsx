// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, ref, computed, watch } from 'vue'
import type { CreateEventInput, User } from '@/shared/types'
import {
  TIME_PRESETS,
  splitIntoSlots,
  replaceSlotsForDate,
  formatDateLabel,
  formatDateISO,
  getTodayISO,
  compareSlots,
  isValidSlotTimeRange,
  sanitizeHttpUrl,
} from '@/shared/time'

const DateConfigRow = defineVaporComponent({
  props: {
    dateStr: { type: String, required: true },
    idx: { type: Number, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    title: { type: String, default: '' },
    slotsCount: { type: Number, default: 0 },
  },
  emits: ['update:title', 'update:range', 'toggleDate'],
  setup(props, { emit }) {
    const titleModel = computed({
      get: () => props.title,
      set: (val: string) => emit('update:title', val),
    })

    return (
      <div
        data-testid={`date-row-${props.dateStr}`}
        class="bg-rose-50/40 border border-rose-200/80 rounded-2xl p-3 flex flex-col gap-2.5 transition hover:border-rose-300"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          {/* 日付ラベル */}
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-[11px] font-extrabold">
              {props.idx + 1}日目
            </span>
            {props.title ? (
              <span class="px-2 py-0.5 bg-rose-500 text-white rounded text-[11px] font-extrabold shadow-2xs">
                {props.title}
              </span>
            ) : null}
            <span class="font-bold text-sm text-stone-900 font-['M_PLUS_Rounded_1c']">
              {formatDateLabel(props.dateStr)}
            </span>
            <span class="text-[11px] text-stone-500 font-bold bg-white px-2 py-0.5 rounded-full border border-stone-200">
              {props.slotsCount}コマ
            </span>
          </div>

          {/* 開始〜終了時刻の個別指定 & 日付削除 */}
          <div class="flex items-center gap-1.5 flex-wrap">
            <input
              type="time"
              aria-label={`${formatDateLabel(props.dateStr)}の開始時刻`}
              value={props.start}
              onChange={(e: any) => emit('update:range', e.target.value, props.end)}
              class="bg-white border border-stone-300 focus:border-rose-400 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-stone-800 outline-none"
            />
            <span class="text-xs text-stone-400 font-bold">〜</span>
            <input
              type="time"
              aria-label={`${formatDateLabel(props.dateStr)}の終了時刻`}
              value={props.end}
              onChange={(e: any) => emit('update:range', props.start, e.target.value)}
              class="bg-white border border-stone-300 focus:border-rose-400 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-stone-800 outline-none"
            />
            <button
              type="button"
              onClick={() => emit('toggleDate', props.dateStr)}
              class="ml-1 text-xs text-stone-400 hover:text-rose-600 font-bold px-2 py-1 rounded-lg hover:bg-rose-100/60 transition cursor-pointer"
              title="この候補日を削除"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 日程名（名前付け）入力 */}
        <div class="flex items-center gap-1.5 pt-1 border-t border-rose-200/50">
          <span class="text-[11px] font-bold text-stone-600 shrink-0">日程名:</span>
          <input
            type="text"
            placeholder="例: DAY 0、前夜祭、会場撤収（任意）"
            aria-label={`${formatDateLabel(props.dateStr)}の日程名`}
            v-model={titleModel.value}
            class="w-full max-w-xs bg-white border border-stone-300 focus:border-rose-400 rounded-lg px-2.5 py-1 text-xs text-stone-800 outline-none font-medium"
          />
        </div>

        {/* 日ごとのクイックプリセットボタン */}
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[11px] text-stone-400 font-bold mr-0.5">この日を:</span>
          {TIME_PRESETS.map((preset) => {
            const isCurrent = props.start === preset.start && props.end === preset.end
            return (
              <button
                key={`${props.dateStr}-${preset.key}`}
                type="button"
                onClick={() => emit('update:range', preset.start, preset.end)}
                class={`px-2 py-0.5 text-[11px] rounded-md font-bold transition cursor-pointer border ${
                  isCurrent
                    ? 'bg-rose-500 text-white border-rose-500'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-rose-300 hover:text-rose-700'
                }`}
                title={preset.label}
              >
                {preset.shortLabel}
              </button>
            )
          })}
        </div>
      </div>
    )
  },
})

export const EventCreator = defineVaporComponent({
  props: {
    initialUser: {
      type: Object as () => User | null,
      default: null,
    },
  },
  setup(props) {
    const user = ref<User | null>(props.initialUser)
    const title = ref('')
    const organizerName = ref(user.value?.displayName || user.value?.username || '')
    const description = ref('')

    // 予定時間 / 所要時間 (分)
    const durationMinutes = ref(60)

    // スロット刻み幅 (分: 30 or 60)
    const slotIntervalMinutes = ref(60)

    // カレンダー選択用ステータス (ローカル時間基準で初期化)
    const today = new Date()
    const currentYear = ref(today.getFullYear())
    const currentMonth = ref(today.getMonth()) // 0-indexed

    // 選択された日付のセット ('YYYY-MM-DD')
    const todayStr = getTodayISO()
    const selectedDates = ref<string[]>([todayStr])

    // 日付ごとの開始〜終了時刻・日程名設定 (複数日で日ごとに異なる時間帯や名称を設定しやすくする)
    const dateRanges = ref<Record<string, { start: string; end: string; title?: string }>>({
      [todayStr]: { start: '10:00', end: '19:00', title: '' },
    })

    // カスタム一括設定・新規選択日デフォルト用の時間
    const customStartTime = ref('10:00')
    const customEndTime = ref('19:00')

    // コマ単位の微調整リストの開閉状態
    const isSlotDetailOpen = ref(false)

    // 初期候補枠 (10:00〜19:00 の 1時間刻み独立スロット)
    const initialHourly = splitIntoSlots('10:00', '19:00', slotIntervalMinutes.value).map(
      (slot) => ({
        slotDate: todayStr,
        startTime: slot.start,
        endTime: slot.end,
      })
    )

    const slots = ref<
      Array<{
        slotDate: string
        startTime: string
        endTime: string
        dateTitle?: string | null
      }>
    >(initialHourly)

    const isSubmitting = ref(false)
    const errorMessage = ref('')
    const createdResult = ref<{ id: string; adminToken: string } | null>(null)
    const isCopiedShareUrl = ref(false)
    const isCopiedAdminUrl = ref(false)

    // カレンダーの日付グリッド計算 (タイムゾーンズレを防止)
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
        const dateStr = formatDateISO(prevDate)
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
      const nowStr = getTodayISO()
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const current = new Date(year, month, d)
        const dateStr = formatDateISO(current)
        days.push({
          dateStr,
          dayNum: d,
          isCurrentMonth: true,
          isPast: dateStr < nowStr,
          isToday: dateStr === nowStr,
          isSelected: selectedDates.value.includes(dateStr),
          dayOfWeek: current.getDay(),
        })
      }

      // 翌月の先頭 (6行42マスに揃える)
      const remaining = 42 - days.length
      for (let d = 1; d <= remaining; d++) {
        const nextDate = new Date(year, month + 1, d)
        const dateStr = formatDateISO(nextDate)
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

    const sortSlots = () => {
      slots.value.sort(compareSlots)
    }

    // カレンダーの日付トグル
    const toggleDate = (dateStr: string) => {
      const idx = selectedDates.value.indexOf(dateStr)
      if (idx >= 0) {
        selectedDates.value = selectedDates.value.filter((d) => d !== dateStr)
        slots.value = slots.value.filter((s) => s.slotDate !== dateStr)
        const nextRanges = { ...dateRanges.value }
        delete nextRanges[dateStr]
        dateRanges.value = nextRanges
      } else {
        selectedDates.value = [...selectedDates.value, dateStr].sort()
        const defaultStart = isValidSlotTimeRange(customStartTime.value, customEndTime.value)
          ? customStartTime.value
          : '10:00'
        const defaultEnd = isValidSlotTimeRange(customStartTime.value, customEndTime.value)
          ? customEndTime.value
          : '19:00'
        dateRanges.value = {
          ...dateRanges.value,
          [dateStr]: { start: defaultStart, end: defaultEnd, title: '' },
        }
        slots.value = replaceSlotsForDate(
          slots.value,
          dateStr,
          defaultStart,
          defaultEnd,
          slotIntervalMinutes.value,
          ''
        )
      }
    }

    // 日程名（dateRanges 内の title）が更新されたらスロットの dateTitle も自動同期
    watch(
      dateRanges,
      (ranges) => {
        let changed = false
        const nextSlots = slots.value.map((s) => {
          const expectedTitle = ranges[s.slotDate]?.title?.trim() || null
          if (s.dateTitle !== expectedTitle) {
            changed = true
            return { ...s, dateTitle: expectedTitle }
          }
          return s
        })
        if (changed) {
          slots.value = nextSlots
        }
      },
      { deep: true }
    )

    // 特定日の時間帯（開始〜終了）を個別に変更
    const updateSingleDateRange = (dateStr: string, start: string, end: string) => {
      const current = dateRanges.value[dateStr] || {}
      dateRanges.value = {
        ...dateRanges.value,
        [dateStr]: { ...current, start, end },
      }
      if (!isValidSlotTimeRange(start, end)) {
        errorMessage.value = `${formatDateLabel(dateStr)} の終了時刻は開始時刻より後に設定してください`
        return
      }
      errorMessage.value = ''
      slots.value = replaceSlotsForDate(
        slots.value,
        dateStr,
        start,
        end,
        slotIntervalMinutes.value,
        current.title
      )
    }

    // 刻み幅の変更 (既存スロットの連続時間帯を維持して新しい刻み幅で再分割)
    const handleIntervalChange = (interval: number) => {
      slotIntervalMinutes.value = interval

      if (slots.value.length === 0) {
        let nextSlots: Array<{ slotDate: string; startTime: string; endTime: string }> = []
        selectedDates.value.forEach((d) => {
          const range = dateRanges.value[d] || {
            start: customStartTime.value,
            end: customEndTime.value,
          }
          if (isValidSlotTimeRange(range.start, range.end)) {
            nextSlots = replaceSlotsForDate(nextSlots, d, range.start, range.end, interval)
          }
        })
        slots.value = nextSlots
        return
      }

      // 日付ごとに既存スロットの連続する時間帯ブロックを抽出して再分割
      const byDate = new Map<
        string,
        Array<{ startTime: string; endTime: string; dateTitle?: string | null }>
      >()
      for (const s of slots.value) {
        const list = byDate.get(s.slotDate) || []
        list.push({ startTime: s.startTime, endTime: s.endTime, dateTitle: s.dateTitle })
        byDate.set(s.slotDate, list)
      }

      const nextSlots: Array<{
        slotDate: string
        startTime: string
        endTime: string
        dateTitle?: string | null
      }> = []
      for (const [dateStr, daySlots] of byDate.entries()) {
        // 開始時刻順に並べて隣接スロットを結合
        const sorted = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime))
        const mergedRanges: Array<{ start: string; end: string }> = []
        for (const item of sorted) {
          const last = mergedRanges[mergedRanges.length - 1]
          if (last && last.end === item.startTime && last.end !== '00:00' && last.end !== '24:00') {
            last.end = item.endTime
          } else {
            mergedRanges.push({ start: item.startTime, end: item.endTime })
          }
        }

        const dayTitle = dateRanges.value[dateStr]?.title || daySlots[0]?.dateTitle || null
        for (const range of mergedRanges) {
          const resplit = splitIntoSlots(range.start, range.end, interval)
          for (const slot of resplit) {
            nextSlots.push({
              slotDate: dateStr,
              startTime: slot.start,
              endTime: slot.end,
              dateTitle: dayTitle,
            })
          }
        }
      }

      slots.value = nextSlots
      sortSlots()
    }

    // 選択中の全日程にプリセット時間帯を一括反映（上書き）
    const applyPresetToSelectedDates = (preset: { start: string; end: string }) => {
      if (selectedDates.value.length === 0) {
        errorMessage.value = 'まずはカレンダーから日付を選んでください'
        return
      }
      errorMessage.value = ''
      customStartTime.value = preset.start
      customEndTime.value = preset.end

      const nextRanges = { ...dateRanges.value }
      let nextSlots = [...slots.value]
      selectedDates.value.forEach((d) => {
        const prevTitle = nextRanges[d]?.title || ''
        nextRanges[d] = { start: preset.start, end: preset.end, title: prevTitle }
        nextSlots = replaceSlotsForDate(
          nextSlots,
          d,
          preset.start,
          preset.end,
          slotIntervalMinutes.value,
          prevTitle
        )
      })
      dateRanges.value = nextRanges
      slots.value = nextSlots
    }

    // 選択中の全日程をカスタム時間帯で一括反映（上書き）
    const applyCustomRangeToSelectedDates = () => {
      if (selectedDates.value.length === 0) {
        errorMessage.value = 'まずはカレンダーから日付を選んでください'
        return
      }
      if (!isValidSlotTimeRange(customStartTime.value, customEndTime.value)) {
        errorMessage.value = '終了時刻は開始時刻より後に設定してください'
        return
      }
      applyPresetToSelectedDates({
        start: customStartTime.value,
        end: customEndTime.value,
      })
    }

    // カスタム時間枠の追加（既存枠を残したまま別時間帯を追加）
    const addCustomSlot = () => {
      if (selectedDates.value.length === 0) {
        errorMessage.value = 'まずはカレンダーから日付を選んでください'
        return
      }
      if (!isValidSlotTimeRange(customStartTime.value, customEndTime.value)) {
        errorMessage.value = '終了時刻は開始時刻より後に設定してください'
        return
      }
      errorMessage.value = ''

      const slotsToAdd = splitIntoSlots(
        customStartTime.value,
        customEndTime.value,
        slotIntervalMinutes.value
      )

      selectedDates.value.forEach((d) => {
        slotsToAdd.forEach((slot) => {
          const exists = slots.value.some(
            (s) => s.slotDate === d && s.startTime === slot.start && s.endTime === slot.end
          )
          if (!exists) {
            slots.value.push({
              slotDate: d,
              startTime: slot.start,
              endTime: slot.end,
            })
          }
        })
      })
      sortSlots()
    }

    const removeSlot = (index: number) => {
      const removed = slots.value[index]
      slots.value.splice(index, 1)
      if (removed && !slots.value.some((s) => s.slotDate === removed.slotDate)) {
        selectedDates.value = selectedDates.value.filter((d) => d !== removed.slotDate)
        const nextRanges = { ...dateRanges.value }
        delete nextRanges[removed.slotDate]
        dateRanges.value = nextRanges
      }
    }

    const clearAllSlots = () => {
      slots.value = []
      selectedDates.value = []
      dateRanges.value = {}
    }

    // イベント送信
    const handleSubmit = async () => {
      errorMessage.value = ''
      if (!user.value) {
        errorMessage.value = 'イベントを作成するには GitHub ログインが必要です'
        return
      }
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
          durationMinutes: durationMinutes.value,
          slotIntervalMinutes: slotIntervalMinutes.value,
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
          if (data.requireAuth) {
            window.location.href = '/auth/github?returnTo=/new'
            return
          }
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
          <article class="max-w-2xl mx-auto bg-white rounded-3xl p-6 md:p-10 border border-stone-200 shadow-xl shadow-stone-100/50 space-y-8 animate-fade-in">
            <header class="text-center space-y-3">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 text-3xl" aria-hidden="true">
                🎉
              </div>
              <h1 class="text-2xl md:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c']">
                日程調整表を作成しました！
              </h1>
              <p class="text-stone-600 text-sm">以下のURLを参加メンバーに共有してください。</p>
            </header>

            {/* 参加者用共有URL */}
            <div class="bg-rose-50/70 p-5 rounded-2xl border border-rose-200 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                  <span aria-hidden="true">🔗</span> 参加者に送るURL
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
                  onClick={() =>
                    copyToClipboard(`${getOrigin()}/events/${createdResult.value!.id}`, 'share')
                  }
                  class="whitespace-nowrap px-4 py-2 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-sm font-bold rounded-xl transition shadow-sm cursor-pointer"
                >
                  {isCopiedShareUrl.value ? 'コピー完了！' : 'URLをコピー'}
                </button>
              </div>
            </div>

            {/* 主催者用管理案内 */}
            <div class="bg-amber-50/60 p-5 rounded-2xl border border-amber-200 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <span aria-hidden="true">🔑</span> 主催者管理について
                </span>
                <span class="text-xs text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded-full">
                  GitHubアカウント連携済み
                </span>
              </div>
              <p class="text-xs text-stone-600 leading-relaxed">
                作成した日程は、あなたのGitHubアカウント（@{user.value?.username}
                ）に紐づいています。GitHubにログインしているブラウザであれば、いつでもイベントページで日程確定や削除が可能です。
              </p>
              <div class="pt-1">
                <div class="text-[11px] font-bold text-amber-800 mb-1">
                  別ブラウザや直接管理用のURL:
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    readonly
                    value={`${getOrigin()}/events/${createdResult.value.id}?admin=${createdResult.value.adminToken}`}
                    class="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs text-stone-700 font-mono select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        `${getOrigin()}/events/${createdResult.value!.id}?admin=${createdResult.value!.adminToken}`,
                        'admin'
                      )
                    }
                    class="whitespace-nowrap px-3 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
                  >
                    {isCopiedAdminUrl.value ? 'コピー完了！' : '管理URLコピー'}
                  </button>
                </div>
                <p class="text-[11px] text-rose-700 mt-2 leading-relaxed">
                  ⚠️ このURLを知っている人は誰でもイベントを編集・削除できます。共有範囲に注意してください。
                </p>
              </div>
            </div>

            <nav aria-label="作成完了アクション" class="pt-4 flex flex-col sm:flex-row gap-3">
              <a
                href={`/events/${createdResult.value.id}`}
                class="w-full text-center px-6 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-md transition"
              >
                イベントページへ移動する
              </a>
              <a
                href="/"
                rel="home"
                class="w-full text-center px-6 py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition"
              >
                トップに戻る
              </a>
            </nav>
          </article>
        ) : (
          /* イベント作成フォーム */
          <article class="max-w-3xl mx-auto space-y-8">
            <header class="text-center space-y-2">
              <h1 class="text-2xl md:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c']">
                日程調整表を作る
              </h1>
              <p class="text-stone-600 text-sm">
                日付と時間帯を選ぶだけで、誰でも直感的に回答できるタイムラインを作成します。
              </p>
            </header>

            {/* 未ログイン時の案内カード */}
            {!user.value ? (
              <div class="p-6 bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-3xl shadow-lg space-y-4">
                <div class="flex items-center gap-3">
                  <span class="text-3xl">🛡️</span>
                  <div>
                    <h2 class="text-base font-extrabold text-white">
                      イベント作成には GitHub ログインが必要です
                    </h2>
                    <p class="text-xs text-stone-300 mt-0.5">
                      主催者の身元を明確にし、参加者が安心して回答できるようにするため、作成者のみGitHubアカウントで身分を確認しています。（※参加者の回答は登録不要です）
                    </p>
                  </div>
                </div>
                <div class="pt-2">
                  <a
                    href="/auth/github?returnTo=/new"
                    class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-stone-100 text-stone-900 font-bold text-sm rounded-xl transition shadow-sm"
                  >
                    <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>GitHubでログインして作成する</span>
                  </a>
                </div>
              </div>
            ) : null}

            {errorMessage.value ? (
              <div class="p-4 bg-rose-100 border border-rose-300 text-rose-800 rounded-2xl text-sm font-medium flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMessage.value}</span>
              </div>
            ) : null}

            <div class="bg-white rounded-3xl p-6 md:p-8 border border-stone-200 shadow-xl shadow-stone-100/40 space-y-8">
              {/* 基本情報 */}
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <h2 class="text-base font-bold text-stone-800 border-l-4 border-rose-500 pl-3">
                    1. 基本情報
                  </h2>
                  {user.value ? (
                    <div class="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full text-xs text-rose-700 font-bold">
                      {sanitizeHttpUrl(user.value.avatarUrl) ? (
                        <img
                          src={sanitizeHttpUrl(user.value.avatarUrl)!}
                          alt={user.value.username}
                          class="w-4 h-4 rounded-full"
                        />
                      ) : null}
                      <span>@{user.value.username} として作成</span>
                    </div>
                  ) : null}
                </div>

                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-bold text-stone-700 mb-1">
                      イベント名 / 会議名 <span class="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="例: プロジェクト定例MTG、同期飲み会、ランチ会"
                      v-model={title.value}
                      class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                    />
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-bold text-stone-700 mb-1">
                        主催者名（表示名） <span class="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="例: 山田太郎、幹事、ニックネーム"
                        v-model={organizerName.value}
                        class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                      />
                    </div>

                    <div>
                      <label class="block text-xs font-bold text-stone-700 mb-1">
                        予定時間 / 所要時間
                      </label>
                      <select
                        value={durationMinutes.value}
                        onChange={(e: any) => (durationMinutes.value = Number(e.target.value))}
                        class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-3 py-2.5 text-sm transition outline-none bg-white font-medium"
                      >
                        <option value={30}>30分</option>
                        <option value={60}>1時間（推奨）</option>
                        <option value={90}>1時間30分</option>
                        <option value={120}>2時間</option>
                        <option value={180}>3時間</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-stone-700 mb-1">
                      補足・備考（任意）
                    </label>
                    <textarea
                      rows={2}
                      placeholder="例: オンライン（Google Meet / Zoom）で開催予定です。議題: ○○○"
                      v-model={description.value}
                      class="w-full border border-stone-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* カレンダー & 候補日時選択 */}
              <div class="space-y-4">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <h2 class="text-base font-bold text-stone-800 border-l-4 border-rose-500 pl-3">
                    2. 候補日時を選ぶ
                  </h2>

                  {/* 刻み幅の選択 */}
                  <div class="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
                    <span class="text-[11px] font-bold text-stone-500 px-2">刻み幅:</span>
                    <button
                      type="button"
                      onClick={() => handleIntervalChange(30)}
                      class={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                        slotIntervalMinutes.value === 30
                          ? 'bg-white text-rose-600 shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      30分刻み
                    </button>
                    <button
                      type="button"
                      onClick={() => handleIntervalChange(60)}
                      class={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                        slotIntervalMinutes.value === 60
                          ? 'bg-white text-rose-600 shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      1時間刻み
                    </button>
                  </div>
                </div>

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
                          {isSelected ? (
                            <span class="w-1 h-1 bg-white rounded-full mt-0.5"></span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>

                  <div class="mt-3 text-[11px] text-stone-500 text-center">
                    クリックして候補日を選択（複数日選択可）
                  </div>
                </div>

                {/* 時間帯プリセットと一括反映 */}
                <div class="space-y-3 pt-2">
                  <div class="flex items-center justify-between flex-wrap gap-1">
                    <label class="block text-xs font-bold text-stone-700">
                      選択中の全日程（{selectedDates.value.length}日）に時間帯を一括反映
                    </label>
                    <span class="text-[11px] text-stone-500">
                      ※{slotIntervalMinutes.value}分刻みで自動分割されます
                    </span>
                  </div>

                  {/* プリセットボタン群 */}
                  <div class="flex flex-wrap gap-2">
                    {TIME_PRESETS.map((preset) => {
                      const isActiveDefault =
                        customStartTime.value === preset.start && customEndTime.value === preset.end
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => applyPresetToSelectedDates(preset)}
                          class={`px-3 py-1.5 border text-xs rounded-xl font-bold transition shadow-xs cursor-pointer ${
                            isActiveDefault
                              ? 'bg-rose-500 border-rose-500 text-white'
                              : 'bg-white border-rose-200 hover:bg-rose-50 text-stone-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* カスタム時間帯一括設定・追加 */}
                  <div class="flex flex-wrap items-center gap-2 pt-1 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                    <span class="text-xs font-bold text-stone-600">カスタム時間:</span>
                    <input
                      type="time"
                      value={customStartTime.value}
                      onChange={(e: any) => (customStartTime.value = e.target.value)}
                      class="bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs outline-none font-mono"
                    />
                    <span class="text-xs text-stone-400">〜</span>
                    <input
                      type="time"
                      value={customEndTime.value}
                      onChange={(e: any) => (customEndTime.value = e.target.value)}
                      class="bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={applyCustomRangeToSelectedDates}
                      class="px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                    >
                      全日程に反映
                    </button>
                    <button
                      type="button"
                      onClick={addCustomSlot}
                      class="px-3 py-1.5 bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 text-xs font-bold rounded-lg transition cursor-pointer"
                      title="既存の枠を残したまま、別の時間帯を追加します"
                    >
                      ＋ 枠を追加
                    </button>
                  </div>
                </div>

                {/* 日ごとの時間帯設定 */}
                <div class="space-y-3 pt-2">
                  <div class="flex items-center justify-between">
                    <div>
                      <label class="block text-xs font-bold text-stone-700">
                        日ごとの時間帯設定（全 {selectedDates.value.length} 日・計 {slots.value.length} コマ）
                      </label>
                    </div>
                    {slots.value.length > 0 ? (
                      <button
                        type="button"
                        onClick={clearAllSlots}
                        class="text-xs text-stone-400 hover:text-rose-500 cursor-pointer shrink-0"
                      >
                        すべてクリア
                      </button>
                    ) : null}
                  </div>

                  {selectedDates.value.length === 0 ? (
                    <div class="p-6 border-2 border-dashed border-rose-200 rounded-2xl text-center text-xs text-stone-400">
                      カレンダーから候補日を選択してください
                    </div>
                  ) : (
                    <div class="space-y-2">
                      {selectedDates.value.map((dateStr, idx) => {
                        const range = dateRanges.value[dateStr] || {
                          start: customStartTime.value,
                          end: customEndTime.value,
                        }
                        const daySlots = slots.value.filter((s) => s.slotDate === dateStr)

                        return (
                          <DateConfigRow
                            key={dateStr}
                            dateStr={dateStr}
                            idx={idx}
                            start={range.start}
                            end={range.end}
                            title={range.title || ''}
                            slotsCount={daySlots.length}
                            onUpdate:title={(newTitle: string) => {
                              const current = dateRanges.value[dateStr] || {
                                start: customStartTime.value,
                                end: customEndTime.value,
                              }
                              dateRanges.value = {
                                ...dateRanges.value,
                                [dateStr]: { ...current, title: newTitle },
                              }
                            }}
                            onUpdate:range={(start: string, end: string) =>
                              updateSingleDateRange(dateStr, start, end)
                            }
                            onToggleDate={() => toggleDate(dateStr)}
                          />
                        )
                      })}
                    </div>
                  )}

                  {/* コマ単位の微調整アコーディオン */}
                  {slots.value.length > 0 ? (
                    <div class="pt-1">
                      <button
                        type="button"
                        onClick={() => (isSlotDetailOpen.value = !isSlotDetailOpen.value)}
                        class="text-xs text-stone-500 hover:text-stone-800 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isSlotDetailOpen.value ? '▼' : '▶'}</span>
                        <span>コマ単位で個別に確認・削除する（全 {slots.value.length} コマ）</span>
                      </button>

                      {isSlotDetailOpen.value ? (
                        <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-60 overflow-y-auto p-2 bg-stone-50/70 rounded-2xl border border-stone-200">
                          {slots.value.map((slot, index) => (
                            <div
                              key={`${slot.slotDate}-${slot.startTime}-${slot.endTime}-${index}`}
                              class="flex items-center justify-between bg-white border border-stone-200 px-2.5 py-1.5 rounded-lg text-xs shadow-2xs"
                            >
                              <div class="font-medium text-stone-800 truncate mr-1">
                                <span class="font-bold text-[11px] text-stone-600 block truncate">
                                  {slot.dateTitle ? `[${slot.dateTitle}] ` : ''}
                                  {formatDateLabel(slot.slotDate)}
                                </span>
                                <span class="font-mono text-xs text-rose-600 font-bold">
                                  {slot.startTime}〜{slot.endTime}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSlot(index)}
                                class="text-stone-300 hover:text-rose-600 font-bold p-1 cursor-pointer"
                                title="枠を削除"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 送信ボタン */}
              <div class="pt-4 space-y-2">
                {user.value ? (
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
                        <span>日程調整表を作成する（全 {slots.value.length} コマ）</span>
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    href="/auth/github?returnTo=/new"
                    class="w-full py-4 bg-stone-900 hover:bg-stone-800 text-white font-extrabold text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>GitHubでログインして作成する</span>
                  </a>
                )}
                <p class="text-center text-[11px] text-stone-400">
                  作成することで、
                  <a href="/terms" target="_blank" class="underline hover:text-stone-600">
                    利用規約
                  </a>
                  および
                  <a href="/privacy" target="_blank" class="underline hover:text-stone-600">
                    プライバシーポリシー
                  </a>
                  に同意したものとみなされます。
                </p>
              </div>
            </div>
          </article>
        )}
      </div>
    )
  },
})
