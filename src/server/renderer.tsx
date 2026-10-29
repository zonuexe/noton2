// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { jsxRenderer } from 'hono/jsx-renderer'
import type { User } from '@/shared/types'

interface LayoutProps {
  title?: string
  description?: string
  ogImage?: string
  ogUrl?: string
}

declare module 'hono' {
  interface ContextRenderer {
    (content: any, props?: LayoutProps): Response | Promise<Response>
  }
}

export const renderer = jsxRenderer(({ children, title, description, ogImage, ogUrl }, c) => {
  const user = c.get('user') as User | null
  const pageTitle = title ? `${title} | noton2` : 'noton2 - ログイン不要の超高速日程調整ツール'
  const pageDescription =
    description || 'Cloudflare で完結する超高速日程調整Webアプリ。カレンダーから時間枠を選ぶだけで直感的に日程を調整できます。'

  // OGP URL からクエリパラメータ (adminToken 等) を確実に除外して生成
  const requestUrl = new URL(c.req.url)
  const currentUrl = ogUrl || `${requestUrl.origin}${requestUrl.pathname}`

  // 安全な外部URLの検証 (http/https のみ許可)
  const safeProfileUrl =
    user?.profileUrl && /^https?:\/\//i.test(user.profileUrl)
      ? user.profileUrl
      : user
        ? `https://github.com/${encodeURIComponent(user.username)}`
        : '#'
  const safeAvatarUrl =
    user?.avatarUrl && /^https?:\/\//i.test(user.avatarUrl) ? user.avatarUrl : null

  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />

        {/* OGP */}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={currentUrl} />
        <meta property="og:site_name" content="noton2" />
        {ogImage && <meta property="og:image" content={ogImage} />}

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />

        {/* Google Fonts (Noto Sans JP) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />

        {/* Client Assets */}
        {import.meta.env.PROD ? (
          <>
            <script type="module" src="/static/client.js"></script>
            <link rel="stylesheet" href="/static/client.css" />
          </>
        ) : (
          <>
            <script type="module" src="/src/client/main.tsx"></script>
            <link rel="stylesheet" href="/src/client/styles/style.css" />
          </>
        )}
      </head>
      <body class="bg-rose-50/40 text-stone-800 min-h-screen font-sans antialiased selection:bg-rose-200 selection:text-rose-900 flex flex-col justify-between">
        <div>
          <header class="bg-white/80 backdrop-blur-md border-b border-rose-100 sticky top-0 z-40 transition-shadow">
            <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
              <a href="/" class="flex items-center gap-2 group">
                <span class="text-2xl transition-transform group-hover:scale-110">🐷</span>
                <span class="font-extrabold text-xl tracking-tight bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent font-['M_PLUS_Rounded_1c']">
                  noton2
                </span>
              </a>

              <div class="flex items-center gap-2 sm:gap-3 text-sm">
                <a
                  href="/new"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white rounded-full font-bold shadow-sm shadow-rose-200 transition-all hover:shadow-md text-xs sm:text-sm"
                >
                  <span>＋</span> <span>新しい日程を作る</span>
                </a>

                {user ? (
                  <div class="flex items-center gap-2 pl-2 border-l border-rose-200">
                    <a
                      href={safeProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-1.5 group"
                      title={`GitHub: @${user.username}`}
                    >
                      {safeAvatarUrl ? (
                        <img
                          src={safeAvatarUrl}
                          alt={user.username}
                          class="w-7 h-7 rounded-full border border-rose-200 shadow-sm"
                        />
                      ) : (
                        <span class="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-xs">
                          👤
                        </span>
                      )}
                      <span class="text-xs font-bold text-stone-700 hidden md:inline group-hover:text-rose-600">
                        @{user.username}
                      </span>
                    </a>
                    <form method="post" action="/auth/logout" class="inline m-0">
                      <button
                        type="submit"
                        class="text-xs text-stone-400 hover:text-stone-700 hover:underline px-1 py-0.5 bg-transparent border-0 cursor-pointer"
                      >
                        ログアウト
                      </button>
                    </form>
                  </div>
                ) : (
                  <a
                    href="/auth/github"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-full font-bold text-xs shadow-sm transition-all"
                    title="イベント作成時にGitHubログインが必要です"
                  >
                    <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>ログイン</span>
                  </a>
                )}
              </div>
            </div>
          </header>

          <main class="max-w-5xl mx-auto px-4 py-6 md:py-10">{children}</main>
        </div>

        <footer class="mt-20 border-t border-rose-100 bg-white/60 py-8 text-center text-xs text-stone-400">
          <div class="max-w-5xl mx-auto px-4 flex flex-col items-center gap-2.5">
            <div class="flex items-center gap-1 font-['M_PLUS_Rounded_1c'] font-bold text-stone-600 text-sm">
              <span>🐷</span> noton2
            </div>
            <p>Cloudflare で完結する超高速・日程調整ツールです。</p>

            <div class="flex items-center gap-4 text-xs text-stone-500 pt-0.5">
              <a href="/terms" class="hover:text-rose-600 hover:underline">
                利用規約
              </a>
              <span>•</span>
              <a href="/privacy" class="hover:text-rose-600 hover:underline">
                プライバシーポリシー
              </a>
              <span>•</span>
              <a
                href="https://github.com/zonuexe/noton2"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-rose-600 hover:underline inline-flex items-center gap-1"
              >
                GitHub (OSS)
              </a>
            </div>

            <p class="text-[11px] text-stone-400 pt-1">Powered by Cloudflare Workers & D1 + Vue JSX Vapor</p>
          </div>
        </footer>
      </body>
    </html>
  )
})
