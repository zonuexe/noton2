// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import { getEventById } from '../db/client'
import type { AuthBindings, AuthVariables } from '../middleware/auth'

export const pages = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

// トップページ
pages.get('/', (c) => {
  return c.render(
    <div class="flex flex-col items-center text-center space-y-8 py-6 md:py-12">
      <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-100 text-rose-700 text-sm font-semibold animate-pulse">
        <span>🐷</span> 登録不要ですぐ使える日程調整
      </div>

      <div class="space-y-4 max-w-2xl">
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
      </div>

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
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-10 text-left">
        <div class="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
          <div class="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-2xl mb-4">
            ⏱️
          </div>
          <h2 class="text-base font-bold text-stone-800 mb-2 font-['M_PLUS_Rounded_1c']">
            カレンダー×時間帯で直感的
          </h2>
          <p class="text-sm text-stone-600 leading-relaxed">
            「30分単位」「1時間単位」「夜だけ」「ランチだけ」など、カレンダー上でポチポチ選ぶだけで候補枠を作成できます。
          </p>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
          <div class="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center text-2xl mb-4">
            🎯
          </div>
          <h2 class="text-base font-bold text-stone-800 mb-2 font-['M_PLUS_Rounded_1c']">
            直感的な 4段階回答
          </h2>
          <p class="text-sm text-stone-600 leading-relaxed">
            ◎（希望）、◯（参加可能）、△（未定）、✕（不可）の4段階。参加者は登録不要で、一括選択もストレスフリー。
          </p>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-shadow">
          <div class="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl mb-4">
            🛡️
          </div>
          <h2 class="text-base font-bold text-stone-800 mb-2 font-['M_PLUS_Rounded_1c']">
            GitHub連携で安心・安全
          </h2>
          <p class="text-sm text-stone-600 leading-relaxed">
            イベント作成者はGitHubログインで身元が明示されるため、参加者も安心。主催者はログインするだけで管理可能です。
          </p>
        </div>
      </div>
    </div>,
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
      <div id="event-detail-island" data-event={JSON.stringify(event)}></div>
    </div>,
    {
      title: `${event.title} の日程調整`,
      description: ogpDesc,
    }
  )
})
