// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { defineVaporComponent, ref, computed } from 'vue'
import { AnswerForm } from './AnswerForm'
import { MatrixTable } from './MatrixTable'
import { AdminControls } from './AdminControls'
import type { EventDetail, User } from '@/shared/types'
import { formatDateLabel, parseTextWithUrls, sanitizeHttpsUrl } from '@/shared/time'

export const EventDetailApp = defineVaporComponent({
  props: {
    initialEvent: {
      type: Object as () => EventDetail,
      required: true,
    },
    initialUser: {
      type: Object as () => User | null,
      default: null,
    },
  },
  setup(props) {
    const event = ref<EventDetail>(props.initialEvent)
    const isReloading = ref(false)
    const isCopied = ref(false)

    // URLクエリから adminToken を抽出 (初期値)
    const getUrlAdminToken = () => {
      if (typeof window === 'undefined') return ''
      const params = new URLSearchParams(window.location.search)
      return params.get('admin') || ''
    }
    const urlAdminToken = ref(getUrlAdminToken())

    // サーバー側で認証検証済みの isOrganizer を唯一の判定基準とする (偽の ?admin=xxx でのUI露出を防止)
    const isOrganizer = computed(() => Boolean(event.value.isOrganizer))

    const effectiveAdminToken = computed(
      () => event.value.adminToken || (isOrganizer.value ? urlAdminToken.value : '')
    )

    // 最新データのリロード
    const reloadEvent = async () => {
      isReloading.value = true
      try {
        const token = effectiveAdminToken.value || urlAdminToken.value
        // 管理トークンは URL ではなくヘッダーで送信し、ログへの露出を減らす
        const res = await fetch(`/api/events/${event.value.id}`, {
          headers: token ? { 'X-Admin-Token': token } : undefined,
        })
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
        <article
          class="h-event bg-white rounded-3xl p-6 md:p-8 border border-rose-100 shadow-xl shadow-rose-100/40 space-y-4"
          vocab="https://schema.org/"
          typeof="Event"
        >
          <meta
            property="eventStatus"
            content={confirmedSlot.value ? 'https://schema.org/EventScheduled' : 'https://schema.org/EventPostponed'}
          />
          <header class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div class="space-y-1.5 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                {!confirmedSlot.value ? (
                  <span class="p-category text-xs bg-rose-100 text-rose-700 font-bold px-2.5 py-0.5 rounded-full">
                    日程調整中
                  </span>
                ) : (
                  <span class="p-category text-xs bg-amber-500 text-white font-extrabold px-2.5 py-0.5 rounded-full animate-pulse">
                    🎉 開催決定
                  </span>
                )}
                {isOrganizer.value ? (
                  <span class="text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span>👑</span> 主催者モード
                  </span>
                ) : null}
              </div>

              <h1 class="p-name text-2xl md:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c'] tracking-tight" property="name">
                {event.value.title}
              </h1>

              <div class="flex items-center gap-4 text-xs text-stone-500 font-medium flex-wrap">
                <div class="p-organizer h-card flex items-center gap-1.5" property="organizer" typeof="Person">
                  <span>主催者:</span>
                  {event.value.creator ? (
                    <a
                      href={
                        sanitizeHttpsUrl(event.value.creator.profileUrl) ||
                        `https://github.com/${encodeURIComponent(event.value.creator.username)}`
                      }
                      target="_blank"
                      rel="author external"
                      class="u-url inline-flex items-center gap-1.5 text-stone-800 hover:text-rose-600 font-bold bg-stone-100 hover:bg-rose-50 px-2.5 py-1 rounded-full border border-stone-200 transition group"
                      title="GitHubプロフィールを確認"
                      property="url"
                    >
                      {sanitizeHttpsUrl(event.value.creator.avatarUrl) ? (
                        <img
                          src={sanitizeHttpsUrl(event.value.creator.avatarUrl)!}
                          alt={event.value.creator.username}
                          class="u-photo w-4 h-4 rounded-full"
                          property="image"
                        />
                      ) : null}
                      <span class="p-nickname" property="alternateName">@{event.value.creator.username}</span>
                      <meta
                        property="name"
                        content={
                          event.value.organizerName ||
                          event.value.creator.displayName ||
                          event.value.creator.username
                        }
                      />
                      <svg class="w-3 h-3 fill-current opacity-60" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                    </a>
                  ) : (
                    <strong class="p-name text-stone-700" property="name">{event.value.organizerName}</strong>
                  )}
                  {event.value.creator &&
                  event.value.organizerName &&
                  event.value.organizerName !== event.value.creator.username ? (
                    <span class="p-name text-stone-400">（{event.value.organizerName}）</span>
                  ) : null}
                </div>
                <span>
                  予定時間:{' '}
                  <strong class="text-stone-700">
                    {event.value.durationMinutes >= 60
                      ? `${event.value.durationMinutes / 60}時間`
                      : `${event.value.durationMinutes}分`}
                  </strong>
                </span>
                <span>
                  候補枠数:{' '}
                  <data value={event.value.slots.length}>{event.value.slots.length}コマ</data>
                </span>
              </div>
            </div>

            {/* 共有ボタン */}
            <button
              type="button"
              onClick={copyShareUrl}
              class="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:bg-rose-200 text-rose-700 rounded-xl text-xs font-bold transition shadow-xs whitespace-nowrap self-start cursor-pointer"
            >
              <span aria-hidden="true">🔗</span>
              <span>{isCopied.value ? 'コピー完了！' : '共有URLをコピー'}</span>
            </button>
          </header>

          {/* イベント説明 */}
          {event.value.description ? (
            <p class="p-summary e-description bg-rose-50/50 p-4 rounded-2xl border border-rose-100 text-xs md:text-sm text-stone-700 whitespace-pre-wrap leading-relaxed break-words" property="description">
              {parseTextWithUrls(event.value.description).map((seg, idx) =>
                seg.isUrl && seg.url ? (
                  <a
                    key={`desc-link-${idx}`}
                    href={seg.url}
                    target="_blank"
                    rel="ugc nofollow external"
                    class="text-rose-600 hover:text-rose-700 underline font-medium break-all"
                  >
                    {seg.text}
                  </a>
                ) : (
                  seg.text
                )
              )}
            </p>
          ) : null}

          {/* 確定日時バナー */}
          {confirmedSlot.value ? (
            <div class="p-4 md:p-5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-md space-y-1">
              <div class="text-xs font-bold uppercase tracking-wider opacity-90 flex items-center gap-1">
                <span aria-hidden="true">🎉</span> 開催日時が決定しました！
              </div>
              <div class="text-lg md:text-xl font-extrabold font-['M_PLUS_Rounded_1c'] flex items-center gap-2 flex-wrap">
                {confirmedSlot.value.dateTitle ? (
                  <span class="p-category px-2.5 py-0.5 bg-white/25 text-white rounded-lg text-sm font-bold backdrop-blur-xs shadow-2xs">
                    {confirmedSlot.value.dateTitle}
                  </span>
                ) : null}
                <span>
                  <time
                    class="dt-start"
                    property="startDate"
                    datetime={`${confirmedSlot.value.slotDate}T${confirmedSlot.value.startTime}`}
                  >
                    {formatDateLabel(confirmedSlot.value.slotDate)} {confirmedSlot.value.startTime}
                  </time>
                  <span>〜</span>
                  <time
                    class="dt-end"
                    property="endDate"
                    datetime={`${confirmedSlot.value.slotDate}T${confirmedSlot.value.endTime}`}
                  >
                    {confirmedSlot.value.endTime}
                  </time>
                </span>
              </div>
            </div>
          ) : null}
        </article>

        {/* 主催者管理バー (主催者権限がある場合のみ) */}
        {isOrganizer.value ? (
          <AdminControls
            event={event.value}
            adminToken={effectiveAdminToken.value}
            onReload={reloadEvent}
          />
        ) : null}

        {/* 出欠集計表 (マトリクス) */}
        <MatrixTable
          event={event.value}
          currentUser={props.initialUser}
          adminToken={effectiveAdminToken.value}
          onReload={reloadEvent}
        />

        {/* 回答入力フォーム（誰でも登録不要で回答可能） */}
        <AnswerForm
          event={event.value}
          currentUser={props.initialUser}
          onSuccess={reloadEvent}
        />
      </div>
    )
  },
})
