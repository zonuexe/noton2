// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import {
  deleteEventBySystemAdmin,
  getAdminDashboardData,
  getEventById,
  getEventsByCreatorUserId,
  getParticipatedEventsByUserId,
} from '../db/client'
import { formatDateLabel, sanitizeHttpUrl } from '@/shared/time'
import { isAdminUser, type AuthBindings, type AuthVariables } from '../middleware/auth'

export const pages = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

// トップページ
pages.get('/', (c) => {
  return c.render(
    <article class="flex flex-col items-center text-center space-y-8 py-6 md:py-12">
      <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-100 text-rose-700 text-sm font-semibold animate-pulse">
        <span>🐷</span> 登録不要ですぐ使える日程調整
      </div>

      <header class="space-y-4 max-w-2xl">
        <h1 class="text-3xl md:text-5xl font-extrabold tracking-tight text-stone-900 font-['M_PLUS_Rounded_1c'] leading-tight">
          みんなの空き時間を
          <br />
          <span class="bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 bg-clip-text text-transparent">
            トントン拍子にサクッと調整
          </span>
        </h1>
        <p class="text-stone-600 text-base md:text-lg leading-relaxed">
          回答者は面倒な会員登録やログインは一切不要。
          <br class="hidden sm:inline" />
          主催者のGitHub身元確認付きで安心。カレンダーから時間枠を選ぶだけで直感的に日程を調整できます。
        </p>
      </header>

      <div class="flex flex-col sm:flex-row items-center gap-4 w-full justify-center max-w-md">
        <a
          href="/new"
          class="w-full sm:w-auto px-8 py-3.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-extrabold text-base md:text-lg rounded-2xl shadow-lg shadow-rose-200 hover:shadow-rose-300 transition-all transform hover:-translate-y-0.5 text-center flex items-center justify-center gap-2"
        >
          <span>✨</span>
          <span>日程調整表を作る</span>
        </a>
      </div>

      {/* 特徴カード 3選 */}
      <section aria-labelledby="features-heading" class="w-full mt-10 text-left">
        <h2 id="features-heading" class="sr-only">
          noton2の特徴
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <article class="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
            <figure class="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-2xl mb-4" aria-hidden="true">
              ⏱️
            </figure>
            <h3 class="text-base font-bold text-stone-800 mb-2 font-['M_PLUS_Rounded_1c']">
              カレンダー×時間帯で直感的
            </h3>
            <p class="text-sm text-stone-600 leading-relaxed">
              「30分単位」「1時間単位」「夜だけ」「ランチだけ」など、カレンダー上でポチポチ選ぶだけで候補枠を作成できます。
            </p>
          </article>

          <article class="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
            <figure class="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center text-2xl mb-4" aria-hidden="true">
              🎯
            </figure>
            <h3 class="text-base font-bold text-stone-800 mb-2 font-['M_PLUS_Rounded_1c']">
              直感的な 3段階回答
            </h3>
            <p class="text-sm text-stone-600 leading-relaxed">
              ◯（参加可能）、△（未定）、✕（不可）の3段階。参加者は登録不要で、ドラッグ塗りや一括選択もストレスフリー。
            </p>
          </article>

          <article class="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
            <figure class="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl mb-4" aria-hidden="true">
              🛡️
            </figure>
            <h3 class="text-base font-bold text-stone-800 mb-2 font-['M_PLUS_Rounded_1c']">
              GitHub連携で安心・安全
            </h3>
            <p class="text-sm text-stone-600 leading-relaxed">
              イベント作成者はGitHubログインで身元が明示されるため、参加者も安心。主催者はログインするだけで管理可能です。
            </p>
          </article>
        </div>
      </section>
    </article>,
    {
      title: 'ログイン不要の超高速日程調整ツール',
    }
  )
})

// イベント作成ページ
pages.get('/new', (c) => {
  const user = c.get('user')
  return c.render(
    <div>
      <div id="event-creator-island" data-user={JSON.stringify(user || null)}></div>
    </div>,
    {
      title: '日程調整を作成する',
      description: 'カレンダーから候補日時を選んで、トントン拍子にイベントを作成します。',
    }
  )
})

// マイページ（作成したイベント一覧）
pages.get('/mypage', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.redirect('/auth/github?returnTo=/mypage')
  }

  const [events, participatedEvents] = await Promise.all([
    getEventsByCreatorUserId(c.env.DB, user.id),
    getParticipatedEventsByUserId(c.env.DB, user.id),
  ])

  const safeProfileUrl =
    user.profileUrl && /^https:\/\/github\.com\/[a-zA-Z0-9-_]+$/.test(user.profileUrl)
      ? user.profileUrl
      : `https://github.com/${user.username}`
  const safeAvatarUrl =
    user.avatarUrl && /^https:\/\/avatars\.githubusercontent\.com\//.test(user.avatarUrl)
      ? user.avatarUrl
      : null

  return c.render(
    <div class="space-y-8 max-w-4xl mx-auto py-2">
      {/* ユーザーヘッダー */}
      <header class="h-card bg-white rounded-2xl border border-rose-100 shadow-sm p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          {safeAvatarUrl ? (
            <img
              src={safeAvatarUrl}
              alt={user.username}
              class="u-photo w-14 h-14 rounded-full border-2 border-rose-200 shadow-sm"
            />
          ) : (
            <div class="w-14 h-14 rounded-full bg-rose-100 border-2 border-rose-200 flex items-center justify-center text-2xl" aria-hidden="true">
              👤
            </div>
          )}
          <div>
            <div class="flex items-center gap-2">
              <h1 class="p-name text-xl font-bold text-stone-900 font-['M_PLUS_Rounded_1c']">
                {user.displayName || user.username}
              </h1>
              <a
                href={safeProfileUrl}
                target="_blank"
                rel="author external noopener noreferrer"
                class="u-url p-nickname text-xs text-rose-600 hover:text-rose-700 hover:underline font-mono"
                title="GitHubプロフィールを開く"
              >
                @{user.username} ↗
              </a>
            </div>
            <p class="text-xs text-stone-500 mt-1 flex items-center gap-3">
              <span>
                作成したイベント:{' '}
                <data value={events.length} class="font-bold text-stone-800">
                  {events.length}
                </data>{' '}
                件
              </span>
              <span>•</span>
              <span>
                回答したイベント:{' '}
                <data value={participatedEvents.length} class="font-bold text-stone-800">
                  {participatedEvents.length}
                </data>{' '}
                件
              </span>
            </p>
          </div>
        </div>

        <a
          href="/new"
          class="inline-flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm shadow-sm hover:shadow transition-all whitespace-nowrap"
        >
          <span>＋</span> <span>新しい日程を作る</span>
        </a>
      </header>

      {/* イベント一覧セクション */}
      <section aria-labelledby="my-events-heading" class="space-y-4">
        <div class="flex items-center justify-between px-1">
          <h2 id="my-events-heading" class="text-lg font-bold text-stone-800 font-['M_PLUS_Rounded_1c'] flex items-center gap-2">
            <span>📋</span>
            <span>あなたが作成したイベント</span>
          </h2>
        </div>

        {events.length === 0 ? (
          <div class="bg-white rounded-2xl border border-stone-200 p-8 md:p-12 text-center space-y-4">
            <div class="text-4xl" aria-hidden="true">🗓️</div>
            <div class="space-y-1">
              <h3 class="text-base font-bold text-stone-800 font-['M_PLUS_Rounded_1c']">
                まだ作成したイベントはありません
              </h3>
              <p class="text-xs sm:text-sm text-stone-500">
                候補日を選んで日程調整表を作成してみましょう！
              </p>
            </div>
            <div class="pt-2">
              <a
                href="/new"
                class="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm shadow-sm transition-all"
              >
                <span>✨</span> <span>最初の日程調整表を作る</span>
              </a>
            </div>
          </div>
        ) : (
          <div class="space-y-3">
            {events.map((ev) => {
              const isConfirmed = Boolean(ev.confirmedSlotId)
              const createdDateFormatted = ev.createdAt ? ev.createdAt.slice(0, 10).replace(/-/g, '/') : ''

              return (
                <article
                  key={ev.id}
                  class="h-event bg-white rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div class="space-y-2 flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      {isConfirmed ? (
                        <span class="p-category inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <span>🎉</span> 開催決定
                        </span>
                      ) : (
                        <span class="p-category inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <span>🗓️</span> 日程調整中
                        </span>
                      )}
                      <h3 class="text-base font-bold text-stone-900 truncate">
                        <a href={`/events/${ev.id}`} class="p-name u-url hover:text-rose-600 transition-colors">
                          {ev.title}
                        </a>
                      </h3>
                    </div>

                    {isConfirmed && ev.confirmedSlotDate && (
                      <div class="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 inline-block">
                        {ev.confirmedDateTitle && <span class="p-category mr-1">【{ev.confirmedDateTitle}】</span>}
                        <time class="dt-start" datetime={`${ev.confirmedSlotDate}T${ev.confirmedStartTime}`}>
                          {formatDateLabel(ev.confirmedSlotDate)} {ev.confirmedStartTime}
                        </time>
                        <span>〜</span>
                        <time class="dt-end" datetime={`${ev.confirmedSlotDate}T${ev.confirmedEndTime}`}>
                          {ev.confirmedEndTime}
                        </time>
                      </div>
                    )}

                    {ev.description && (
                      <p class="p-summary text-xs text-stone-600 line-clamp-1">{ev.description}</p>
                    )}

                    <div class="flex flex-wrap items-center gap-3 text-xs text-stone-500 pt-1">
                      <span>
                        候補枠: <strong class="text-stone-700">{ev.slotCount}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        回答者: <strong class="text-stone-700">{ev.participantCount}</strong> 人
                      </span>
                      {createdDateFormatted && (
                        <>
                          <span>•</span>
                          <span>
                            作成日:{' '}
                            <time class="dt-published" datetime={ev.createdAt}>
                              {createdDateFormatted}
                            </time>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-stone-100">
                    <a
                      href={`/events/${ev.id}`}
                      class="u-url w-full md:w-auto text-center px-4 py-2 bg-stone-100 hover:bg-rose-50 hover:text-rose-600 text-stone-700 rounded-xl text-xs font-bold transition-colors"
                    >
                      イベントを開く →
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* 回答したイベント一覧セクション */}
      <section aria-labelledby="participated-events-heading" class="space-y-4">
        <div class="flex items-center justify-between px-1">
          <h2
            id="participated-events-heading"
            class="text-lg font-bold text-stone-800 font-['M_PLUS_Rounded_1c'] flex items-center gap-2"
          >
            <span>✍️</span>
            <span>あなたが回答したイベント</span>
          </h2>
        </div>

        {participatedEvents.length === 0 ? (
          <div class="bg-white rounded-2xl border border-stone-200 p-6 md:p-8 text-center space-y-2">
            <p class="text-xs sm:text-sm text-stone-500">
              アカウントに紐付けられた回答はまだありません。イベントにログイン状態で回答（または再提出）するとここに一覧表示されます。
            </p>
          </div>
        ) : (
          <div class="space-y-3">
            {participatedEvents.map((ev) => {
              const isConfirmed = Boolean(ev.confirmedSlotId)
              const respondedDateFormatted = ev.respondedAt
                ? ev.respondedAt.slice(0, 10).replace(/-/g, '/')
                : ''

              return (
                <article
                  key={`${ev.id}-${ev.participantId}`}
                  class="h-event bg-white rounded-2xl border border-stone-200 shadow-xs hover:shadow-md transition-shadow p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div class="space-y-2 flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      {isConfirmed ? (
                        <span class="p-category inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <span>🎉</span> 開催決定
                        </span>
                      ) : (
                        <span class="p-category inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">
                          <span>✅</span> 回答済み
                        </span>
                      )}
                      <h3 class="text-base font-bold text-stone-900 truncate">
                        <a href={`/events/${ev.id}`} class="p-name u-url hover:text-rose-600 transition-colors">
                          {ev.title}
                        </a>
                      </h3>
                    </div>

                    {isConfirmed && ev.confirmedSlotDate && (
                      <div class="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 inline-block">
                        {ev.confirmedDateTitle && <span class="p-category mr-1">【{ev.confirmedDateTitle}】</span>}
                        <time class="dt-start" datetime={`${ev.confirmedSlotDate}T${ev.confirmedStartTime}`}>
                          {formatDateLabel(ev.confirmedSlotDate)} {ev.confirmedStartTime}
                        </time>
                        <span>〜</span>
                        <time class="dt-end" datetime={`${ev.confirmedSlotDate}T${ev.confirmedEndTime}`}>
                          {ev.confirmedEndTime}
                        </time>
                      </div>
                    )}

                    <div class="flex flex-wrap items-center gap-3 text-xs text-stone-500 pt-1">
                      <span>
                        回答名: <strong class="text-stone-700">{ev.participantName}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        主催者: <strong class="text-stone-700">{ev.organizerName}</strong>
                      </span>
                      {respondedDateFormatted && (
                        <>
                          <span>•</span>
                          <span>
                            最終回答:{' '}
                            <time datetime={ev.respondedAt}>{respondedDateFormatted}</time>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-stone-100">
                    <a
                      href={`/events/${ev.id}`}
                      class="u-url w-full md:w-auto text-center px-4 py-2 bg-stone-100 hover:bg-rose-50 hover:text-rose-600 text-stone-700 rounded-xl text-xs font-bold transition-colors"
                    >
                      イベントを開く →
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>,
    {
      title: 'マイページ - 作成したイベント一覧',
    }
  )
})

// システム管理者画面
pages.get('/admin', async (c) => {
  const user = c.get('user')
  if (!user) {
    return c.redirect('/auth/github?returnTo=/admin')
  }

  const isAdmin = Boolean(c.get('isAdmin') ?? isAdminUser(user, c.env))
  if (!isAdmin) {
    c.status(403)
    return c.render(
      <article class="bg-white p-8 rounded-2xl border border-rose-200 text-center max-w-md mx-auto my-12 space-y-4">
        <div class="text-4xl" aria-hidden="true">🚫</div>
        <h1 class="text-xl font-bold text-stone-800 font-['M_PLUS_Rounded_1c']">
          管理者権限がありません
        </h1>
        <p class="text-sm text-stone-600">
          このページはシステム管理者として許可されたGitHubアカウントのみアクセス可能です。
        </p>
        <a
          href="/"
          rel="home"
          class="inline-block px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-sm font-bold"
        >
          トップへ戻る
        </a>
      </article>,
      {
        title: 'アクセス権限がありません',
      }
    )
  }

  const { stats, events, users } = await getAdminDashboardData(c.env.DB)
  const isDeleted = c.req.query('deleted') === '1'

  return c.render(
    <div class="space-y-8 max-w-5xl mx-auto py-2">
      {/* ヘッダー */}
      <header class="bg-stone-900 text-white rounded-2xl p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
            <span aria-hidden="true">🛠️</span>
            <span>System Administration</span>
          </div>
          <h1 class="text-xl md:text-2xl font-extrabold font-['M_PLUS_Rounded_1c']">
            noton2 システム管理画面
          </h1>
          <p class="text-xs text-stone-400">
            管理者としてログイン中: <strong class="text-stone-200">@{user.username}</strong> (ID: {user.githubId})
          </p>
        </div>
        <a
          href="/mypage"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-bold border border-stone-700 transition self-start sm:self-auto"
        >
          <span>← マイページへ戻る</span>
        </a>
      </header>

      {isDeleted ? (
        <div
          role="status"
          class="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2"
        >
          <span aria-hidden="true">✅</span>
          <span>指定されたイベントおよび関連する回答データを削除しました。</span>
        </div>
      ) : null}

      {/* システム統計サマリー */}
      <section aria-labelledby="admin-stats-heading" class="space-y-3">
        <h2 id="admin-stats-heading" class="text-base font-bold text-stone-800 font-['M_PLUS_Rounded_1c'] px-1">
          📊 システム統計サマリー
        </h2>
        <dl class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
            <dt class="text-xs font-bold text-stone-500">総イベント数</dt>
            <dd class="text-2xl md:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c']">
              <data value={stats.totalEvents}>{stats.totalEvents}</data>
              <span class="text-xs font-normal text-stone-500 ml-1">件</span>
            </dd>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
            <dt class="text-xs font-bold text-stone-500">開催確定済み</dt>
            <dd class="text-2xl md:text-3xl font-extrabold text-emerald-600 font-['M_PLUS_Rounded_1c']">
              <data value={stats.confirmedEvents}>{stats.confirmedEvents}</data>
              <span class="text-xs font-normal text-stone-500 ml-1">件</span>
            </dd>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
            <dt class="text-xs font-bold text-stone-500">登録ユーザー数</dt>
            <dd class="text-2xl md:text-3xl font-extrabold text-rose-600 font-['M_PLUS_Rounded_1c']">
              <data value={stats.totalUsers}>{stats.totalUsers}</data>
              <span class="text-xs font-normal text-stone-500 ml-1">人</span>
            </dd>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
            <dt class="text-xs font-bold text-stone-500">総回答者数</dt>
            <dd class="text-2xl md:text-3xl font-extrabold text-sky-600 font-['M_PLUS_Rounded_1c']">
              <data value={stats.totalParticipants}>{stats.totalParticipants}</data>
              <span class="text-xs font-normal text-stone-500 ml-1">件</span>
            </dd>
          </div>
        </dl>
      </section>

      {/* イベント一覧・管理 */}
      <section aria-labelledby="admin-events-heading" class="space-y-3">
        <div class="flex items-center justify-between px-1">
          <h2 id="admin-events-heading" class="text-base font-bold text-stone-800 font-['M_PLUS_Rounded_1c']">
            🗓️ 全イベント管理（最新100件）
          </h2>
          <span class="text-xs text-stone-500">{events.length} 件表示</span>
        </div>

        <div class="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          {events.length === 0 ? (
            <p class="p-8 text-center text-sm text-stone-500">登録されているイベントはありません。</p>
          ) : (
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr class="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold text-xs">
                    <th scope="col" class="py-3 px-4">ステータス</th>
                    <th scope="col" class="py-3 px-4">イベント名 / ID</th>
                    <th scope="col" class="py-3 px-4">作成者 / 主催者</th>
                    <th scope="col" class="py-3 px-4 text-right">枠 / 回答</th>
                    <th scope="col" class="py-3 px-4">作成日時</th>
                    <th scope="col" class="py-3 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                  {events.map((ev) => (
                    <tr key={ev.id} class="hover:bg-stone-50/80">
                      <td class="py-3 px-4 whitespace-nowrap">
                        {ev.confirmedSlotId ? (
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            確定済
                          </span>
                        ) : (
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                            調整中
                          </span>
                        )}
                      </td>
                      <td class="py-3 px-4 max-w-xs">
                        <a
                          href={`/events/${ev.id}`}
                          class="font-bold text-stone-900 hover:text-rose-600 hover:underline block truncate"
                        >
                          {ev.title}
                        </a>
                        <code class="text-[11px] text-stone-400 font-mono">{ev.id}</code>
                      </td>
                      <td class="py-3 px-4 whitespace-nowrap">
                        <div class="font-medium text-stone-800">{ev.organizerName}</div>
                        {ev.creatorUsername ? (
                          <a
                            href={`https://github.com/${encodeURIComponent(ev.creatorUsername)}`}
                            target="_blank"
                            rel="external noopener noreferrer"
                            class="text-[11px] text-rose-600 hover:underline font-mono"
                          >
                            @{ev.creatorUsername}
                          </a>
                        ) : (
                          <span class="text-[11px] text-stone-400">未連携</span>
                        )}
                      </td>
                      <td class="py-3 px-4 text-right whitespace-nowrap font-mono text-xs">
                        <span>{ev.slotCount}枠</span> / <strong>{ev.participantCount}人</strong>
                      </td>
                      <td class="py-3 px-4 whitespace-nowrap text-xs text-stone-500">
                        <time datetime={ev.createdAt}>{ev.createdAt.slice(0, 16)}</time>
                      </td>
                      <td class="py-3 px-4 text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-2">
                          <a
                            href={`/events/${ev.id}`}
                            class="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition"
                          >
                            開く
                          </a>
                          <form
                            method="post"
                            action={`/admin/events/${ev.id}/delete`}
                            class="inline m-0"
                          >
                            <button
                              type="submit"
                              class="px-2.5 py-1 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer"
                            >
                              削除
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 登録ユーザー一覧 */}
      <section aria-labelledby="admin-users-heading" class="space-y-3">
        <div class="flex items-center justify-between px-1">
          <h2 id="admin-users-heading" class="text-base font-bold text-stone-800 font-['M_PLUS_Rounded_1c']">
            👥 登録GitHubユーザー一覧（最新100件）
          </h2>
          <span class="text-xs text-stone-500">{users.length} 人表示</span>
        </div>

        <div class="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          {users.length === 0 ? (
            <p class="p-8 text-center text-sm text-stone-500">登録されているユーザーはいません。</p>
          ) : (
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr class="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold text-xs">
                    <th scope="col" class="py-3 px-4">ユーザー</th>
                    <th scope="col" class="py-3 px-4">GitHub ID</th>
                    <th scope="col" class="py-3 px-4 text-right">作成イベント</th>
                    <th scope="col" class="py-3 px-4 text-right">回答イベント</th>
                    <th scope="col" class="py-3 px-4">初回ログイン日時</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                  {users.map((u) => {
                    const safeAvatar = sanitizeHttpUrl(u.avatarUrl)
                    const safeProfile =
                      sanitizeHttpUrl(u.profileUrl) ||
                      `https://github.com/${encodeURIComponent(u.username)}`

                    return (
                      <tr key={u.id} class="h-card hover:bg-stone-50/80">
                        <td class="py-3 px-4 whitespace-nowrap">
                          <div class="flex items-center gap-2.5">
                            {safeAvatar ? (
                              <img
                                src={safeAvatar}
                                alt=""
                                aria-hidden="true"
                                class="u-photo w-7 h-7 rounded-full border border-stone-200"
                              />
                            ) : (
                              <span class="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-xs">
                                👤
                              </span>
                            )}
                            <div>
                              <div class="p-name font-bold text-stone-900">
                                {u.displayName || u.username}
                              </div>
                              <a
                                href={safeProfile}
                                target="_blank"
                                rel="external noopener noreferrer"
                                class="u-url p-nickname text-[11px] text-rose-600 hover:underline font-mono"
                              >
                                @{u.username} ↗
                              </a>
                            </div>
                          </div>
                        </td>
                        <td class="py-3 px-4 whitespace-nowrap font-mono text-xs text-stone-500">
                          {u.githubId}
                        </td>
                        <td class="py-3 px-4 text-right whitespace-nowrap font-mono text-xs">
                          <strong>{u.createdEventCount}</strong> 件
                        </td>
                        <td class="py-3 px-4 text-right whitespace-nowrap font-mono text-xs">
                          <strong>{u.participatedEventCount}</strong> 件
                        </td>
                        <td class="py-3 px-4 whitespace-nowrap text-xs text-stone-500">
                          <time datetime={u.createdAt}>{u.createdAt.slice(0, 16)}</time>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>,
    {
      title: 'システム管理画面',
    }
  )
})

// システム管理者によるイベント強制削除
pages.post('/admin/events/:id/delete', async (c) => {
  const user = c.get('user')
  const isAdmin = Boolean(c.get('isAdmin') ?? isAdminUser(user, c.env))
  if (!user || !isAdmin) {
    return c.text('Forbidden', 403)
  }

  const eventId = c.req.param('id')
  await deleteEventBySystemAdmin(c.env.DB, eventId)
  return c.redirect('/admin?deleted=1')
})

// イベント詳細・回答ページ
pages.get('/events/:id', async (c) => {
  const eventId = c.req.param('id')
  const adminToken = c.req.query('admin')
  const currentUser = c.get('user')
  const event = await getEventById(c.env.DB, eventId, adminToken, currentUser?.id)

  if (!event) {
    return c.render(
      <div class="bg-white p-8 rounded-2xl border border-rose-200 text-center max-w-md mx-auto my-12 space-y-4">
        <div class="text-4xl">😢</div>
        <h1 class="text-xl font-bold text-stone-800">イベントが見つかりません</h1>
        <p class="text-sm text-stone-600">
          URLが間違っているか、すでに削除された可能性があります。
        </p>
        <a
          href="/"
          class="inline-block px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-sm font-bold"
        >
          トップへ戻る
        </a>
      </div>,
      {
        title: 'イベントが見つかりません',
      }
    )
  }

  // OGP用テキスト整形
  const slotSummary = event.slots
    .slice(0, 3)
    .map((s) => `${s.slotDate.slice(5)} ${s.startTime}〜${s.endTime}`)
    .join(', ')
  const organizerDisplay = event.creator ? `@${event.creator.username}` : event.organizerName
  const ogpDesc = `${organizerDisplay}さんが作成した日程調整「${event.title}」。候補日時: ${slotSummary}${
    event.slots.length > 3 ? ' ほか' : ''
  }`

  return c.render(
    <div>
      <div
        id="event-detail-island"
        data-event={JSON.stringify(event)}
        data-user={JSON.stringify(currentUser || null)}
      ></div>
    </div>,
    {
      title: `${event.title} の日程調整`,
      description: ogpDesc,
    }
  )
})

// 利用規約ページ
pages.get('/terms', (c) => {
  return c.render(
    <article class="max-w-3xl mx-auto space-y-6 py-4 md:py-8">
      <div class="bg-white rounded-3xl p-6 sm:p-8 md:p-10 border border-rose-100 shadow-md space-y-8 text-stone-700 leading-relaxed">
        <header class="border-b border-rose-100 pb-4">
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c']">
            利用規約
          </h1>
          <p class="text-xs text-stone-400 mt-1">
            最終更新日: <time datetime="2026-10-29">2026年10月29日</time>
          </p>
        </header>

        <p class="text-sm">
          本利用規約（以下「<dfn>本規約</dfn>」）は、noton2（以下「<dfn>本サービス</dfn>」）の利用条件を定めるものです。利用者の皆さま（以下「<dfn>ユーザー</dfn>」）には、本規約に同意いただいた上で本サービスをご利用いただきます。
        </p>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            第1条（適用および定義）
          </h2>
          <ol class="list-decimal list-inside space-y-2 text-sm pl-1">
            <li>本規約は、ユーザーと本サービス運営者（以下「<dfn>運営者</dfn>」）との間の本サービスの利用に関わる一切の関係に適用されます。</li>
            <li>「<dfn>主催者</dfn>」とは、外部アカウント連携（GitHub等）による認証を行い、イベントを作成・管理するユーザーを指します。</li>
            <li>「<dfn>参加者</dfn>」とは、主催者が発行したイベントURLにアクセスし、日程等の回答・登録を行うユーザーを指します。</li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            第2条（サービスの特徴および公開性）
          </h2>
          <ol class="list-decimal list-inside space-y-2 text-sm pl-1">
            <li>本サービスは、特定のURLを共有することで参加者がアカウント登録なしに日程調整・出欠確認を行えるツールです。</li>
            <li>本サービス上に登録された情報（イベント情報、参加者の表示名、回答内容、コメント等）は、当該イベントのURLを知る第三者に対して公開されます。</li>
            <li>ユーザーは、本名・電話番号・メールアドレス・住所・クレジットカード情報・パスワード等の機密情報や個人を特定できる情報を、本サービス上（表示名やコメント欄等）に入力してはならないものとします。</li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            第3条（禁止事項）
          </h2>
          <p class="text-sm">ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ol class="list-decimal list-inside space-y-1.5 text-sm pl-1">
            <li>法令または公序良俗に違反する行為、または犯罪行為に関連する行為</li>
            <li>運営者、他のユーザー、または第三者の知的財産権、肖像権、プライバシー、名誉その他の権利・利益を侵害する行為</li>
            <li>第三者の個人情報や機密情報を無断で掲載・漏洩させる行為</li>
            <li>本サービスのサーバーやネットワークシステムに過度な負荷をかける行為（不正アクセス、過度な連続リクエスト、スクレイピング等）</li>
            <li>本サービスの不具合や脆弱性を意図的に突いた不正利用</li>
            <li>スパム行為、営利目的の無差別な宣伝・勧誘・イベント作成</li>
            <li>反社会的勢力等への利益供与行為</li>
            <li>その他、運営者が不適切と合理的に判断する行為</li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            第4条（サービスの停止・変更・終了およびデータの削除）
          </h2>
          <ol class="list-decimal list-inside space-y-2 text-sm pl-1">
            <li>運営者は、システムの保守点検、障害対応、天災、その他運用上必要な場合、ユーザーへの事前の通知なく本サービスの提供を一時中断または停止することができます。</li>
            <li>運営者は、事前の予告なく本サービスの内容を変更し、または本サービスの提供を終了することができます。</li>
            <li>運営者は、以下のいずれかに該当する場合、事前の予告なくイベントデータや回答データを削除できるものとします。
              <ul class="list-disc list-inside pl-4 mt-1 space-y-1 text-stone-600">
                <li>第3条の禁止事項に該当すると合理的に判断される場合</li>
                <li>作成または最終アクセスから一定期間が経過した休眠イベント</li>
                <li>システムの容量確保、保全、または運用上やむを得ない場合</li>
              </ul>
            </li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            第5条（免責事項・無保証）
          </h2>
          <ol class="list-decimal list-inside space-y-2 text-sm pl-1">
            <li>本サービスは現状有姿（AS-IS）で提供されます。運営者は、本サービスの正確性、安全性、有用性、特定目的への適合性、データの完全性および永続性について、いかなる保証も行いません。</li>
            <li>運営者は、本サービスの利用、中断、停止、終了、データの消失、日程調整の齟齬等によりユーザーまたは第三者に生じたいかなる損害についても、一切の責任を負いません。</li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            第6条（規約の改定）
          </h2>
          <p class="text-sm">
            運営者は、必要と判断した場合には、本規約をいつでも変更することができます。改定後の規約は、本サービス上に掲載された時点より効力を生じるものとします。
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            第7条（準拠法および管轄裁判所）
          </h2>
          <p class="text-sm">本規約の解釈および適用は、日本法に準拠するものとします。</p>
        </section>
      </div>
    </article>,
    {
      title: '利用規約',
      description: 'noton2 の利用規約です。本サービスをご利用いただくにあたっての条件を定めています。',
    }
  )
})

// プライバシーポリシーページ
pages.get('/privacy', (c) => {
  return c.render(
    <article class="max-w-3xl mx-auto space-y-6 py-4 md:py-8">
      <div class="bg-white rounded-3xl p-6 sm:p-8 md:p-10 border border-rose-100 shadow-md space-y-8 text-stone-700 leading-relaxed">
        <header class="border-b border-rose-100 pb-4">
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 font-['M_PLUS_Rounded_1c']">
            プライバシーポリシー
          </h1>
          <p class="text-xs text-stone-400 mt-1">
            最終更新日: <time datetime="2026-10-29">2026年10月29日</time>
          </p>
        </header>

        <p class="text-sm">
          noton2（以下「<dfn>本サービス</dfn>」）は、利用者のプライバシーを尊重し、安心してご利用いただけるよう情報の適切な保護・管理に努めます。本ポリシー（以下「<dfn>本ポリシー</dfn>」）では、本サービスにおける情報の取り扱い方針について説明します。
        </p>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            1. 取得する情報および取得方法
          </h2>
          <p class="text-sm">
            本サービスでは、サービス提供および円滑な運営に必要な範囲で、以下の情報を取得・保存します。
          </p>
          <ul class="list-disc list-inside space-y-2.5 text-sm pl-1">
            <li>
              <strong class="text-stone-800">イベント主催者に関する情報:</strong>
              <div class="text-stone-600 pl-5 text-xs sm:text-sm">
                外部アカウント連携（GitHub OAuth等）に伴い提供されるアカウント識別情報（ユーザーID、公開プロフィール情報、アイコン画像等）、およびイベントの作成・管理にあたり登録された情報（イベント名、候補日時、説明、その他付随する設定情報）
              </div>
            </li>
            <li>
              <strong class="text-stone-800">イベント参加者に関する情報:</strong>
              <div class="text-stone-600 pl-5 text-xs sm:text-sm">
                参加登録や日程回答にあたり入力された情報（表示名、日程・希望等に関する回答内容、メッセージ・コメント、その他付随する入力項目）
              </div>
            </li>
            <li>
              <strong class="text-stone-800">本人識別および認証のための技術情報:</strong>
              <div class="text-stone-600 pl-5 text-xs sm:text-sm">
                ログイン状態の維持や、参加者自身による回答の再確認・編集を可能にするための識別情報（Cookie、ローカルストレージ等のセッション・認証トークン）
              </div>
            </li>
            <li>
              <strong class="text-stone-800">アクセスログ・システム情報:</strong>
              <div class="text-stone-600 pl-5 text-xs sm:text-sm">
                サービスの安定運用、パフォーマンス向上、セキュリティ確保のためにインフラ（Cloudflare等）により自動的に記録されるアクセス情報（IPアドレス、端末・ブラウザ情報、アクセス日時等）
              </div>
            </li>
          </ul>
          <div class="text-xs text-stone-500 bg-rose-50/60 p-3 rounded-xl border border-rose-100">
            ※本サービスでは、利用者のパスワード、電話番号、クレジットカード情報等の機密性の高い個人情報を収集・要求することはありません。
          </div>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            2. 情報の利用目的
          </h2>
          <p class="text-sm">取得した情報は、以下の目的でのみ利用します。</p>
          <ol class="list-decimal list-inside space-y-1.5 text-sm pl-1">
            <li>日程調整および出欠集計機能の提供・運営</li>
            <li>主催者の身元明示によるなりすまし・悪用防止</li>
            <li>参加者による回答の再確認・編集機能の提供</li>
            <li>不正アクセスやスパム等の防止、システムのセキュリティ維持</li>
            <li>本サービスの機能改善および不具合の調査・対応</li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            3. 情報の公開範囲
          </h2>
          <ol class="list-decimal list-inside space-y-2 text-sm pl-1">
            <li>
              本サービスで作成されたイベントの情報（イベント名、主催者情報、候補日時、参加者の表示名、回答状況、コメント等）は、
              <strong class="text-rose-700">当該イベントのURLを知る第三者に公開されます。</strong>
            </li>
            <li>
              意図しない情報公開を防ぐため、表示名やコメント欄等に本名、連絡先、その他機密情報を記載しないようご注意ください。
            </li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            4. 外部サービスの利用とCookie
          </h2>
          <ul class="list-disc list-inside space-y-2 text-sm pl-1">
            <li>
              <strong class="text-stone-800">GitHub OAuth:</strong> 主催者アカウントの身元確認および認証に GitHub API を利用しています。
            </li>
            <li>
              <strong class="text-stone-800">Cloudflare:</strong> サービスの配信、セキュリティ保護、データ保管のために Cloudflare のインフラストラクチャを利用しています。
            </li>
            <li>
              <strong class="text-stone-800">行動追跡・広告の不使用:</strong> 本サービスでは、第三者による行動追跡広告や外部トラッキング用Cookieは一切使用していません。
            </li>
          </ul>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            5. 情報の管理・削除
          </h2>
          <ol class="list-decimal list-inside space-y-2 text-sm pl-1">
            <li>ユーザーは、イベント画面を通じていつでも自身の回答や作成したイベントを削除することができます。</li>
            <li>一定期間アクセスがないイベントデータは、サーバーの定期メンテナンス等により自動的に削除される場合があります。</li>
          </ol>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            6. お問い合わせ
          </h2>
          <p class="text-sm">
            本ポリシーまたは本サービスに関するご質問・不具合報告・データ削除等のご要望は、<address class="not-italic inline"><a href="https://github.com/zonuexe/noton2/issues" target="_blank" rel="external noopener noreferrer" class="text-rose-600 hover:underline">公式リポジトリ（GitHub Issue / Discussions）</a></address>よりご連絡ください。
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 font-['M_PLUS_Rounded_1c']">
            7. プライバシーポリシーの改定
          </h2>
          <p class="text-sm">
            本ポリシーは、法令の変更やサービス内容の改善等に伴い、事前の予告なく改定されることがあります。改定後のポリシーは本サイト上に掲載された時点で効力を生じます。
          </p>
        </section>
      </div>
    </article>,
    {
      title: 'プライバシーポリシー',
      description: 'noton2 のプライバシーポリシーです。利用者のプライバシー保護と情報の取り扱いについて説明しています。',
    }
  )
})
