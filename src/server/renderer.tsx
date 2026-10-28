import { jsxRenderer } from 'hono/jsx-renderer'

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

export const renderer = jsxRenderer(({ children, title, description, ogImage, ogUrl }) => {
  const pageTitle = title ? `${title} | noton2` : 'noton2 - ログイン不要の超高速日程調整ツール'
  const pageDescription =
    description || 'トントン終了に伴う代替日程調整Webアプリ。登録不要、カレンダーから時間枠を選ぶだけで直感的に日程を調整できます。'
  const currentUrl = ogUrl || 'https://noton2.dev'

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
      <body class="bg-rose-50/40 text-stone-800 min-h-screen font-sans antialiased selection:bg-rose-200 selection:text-rose-900">
        <header class="bg-white/80 backdrop-blur-md border-b border-rose-100 sticky top-0 z-40 transition-shadow">
          <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" class="flex items-center gap-2 group">
              <span class="text-2xl transition-transform group-hover:scale-110">🐷</span>
              <span class="font-extrabold text-xl tracking-tight bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent font-['M_PLUS_Rounded_1c']">
                noton2
              </span>
              <span class="text-xs bg-rose-100 text-rose-600 font-semibold px-2 py-0.5 rounded-full">
                トントン代替
              </span>
            </a>
            <div class="flex items-center gap-3 text-sm">
              <a
                href="/new"
                class="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white rounded-full font-bold shadow-sm shadow-rose-200 transition-all hover:shadow-md"
              >
                <span>＋</span> 新しい日程を作る
              </a>
            </div>
          </div>
        </header>

        <main class="max-w-5xl mx-auto px-4 py-6 md:py-10">{children}</main>

        <footer class="mt-20 border-t border-rose-100 bg-white/60 py-8 text-center text-xs text-stone-400">
          <div class="max-w-5xl mx-auto px-4 flex flex-col items-center gap-2">
            <div class="flex items-center gap-1 font-['M_PLUS_Rounded_1c'] font-bold text-stone-600 text-sm">
              <span>🐷</span> noton2
            </div>
            <p>トントン (tonton) 終了に伴い開発された、Cloudflare で完結する超高速・登録不要の日程調整ツールです。</p>
            <p class="text-[11px] text-stone-400">Powered by Cloudflare Workers & D1 + Vue JSX Vapor</p>
          </div>
        </footer>
      </body>
    </html>
  )
})
