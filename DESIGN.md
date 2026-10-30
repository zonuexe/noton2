# noton2 Design System

> Soft and playful on the surface, plain and orderly underneath — so that scheduling goes *ton-ton* (smoothly, in quick succession).

This document describes the visual language and tone of voice of noton2. It is extracted from the live implementation (`src/server/renderer.tsx`, `src/server/routes/pages.tsx`, `src/client/components/*`) and is backed by design tokens in [`src/client/styles/tokens.css`](src/client/styles/tokens.css).

- **Tokens**: Tailwind CSS v4 `@theme` variables (generate utilities) + plain `:root` CSS variables.
- **Visual reference**: the "noton2 Design System" canvas (Foundations / Components / Schedule UI boards).

---

## 1. Principles

| Principle | What it means in practice |
|---|---|
| **Light & quick** | Copy promises low effort; flows avoid sign-up walls; primary actions are big and obvious. |
| **Friendly** | A pig mascot (🐷), rounded display type, one emoji at the head of labels. |
| **Reassuring** | State up front what removes anxiety ("no sign-up", "organizer verified via GitHub"). Always make clear *who* can do *what*. |
| **Plain-spoken** | Exactly three answer symbols (◯ △ ✕). Information is organized with bold weight and warm grays, not decoration. |

## 2. Voice & tone

The product speaks Japanese, casually but politely (です/ます in descriptions, short noun phrases on controls).

- **Use onomatopoeia for ease**: サクッと, サクサク, ポチポチ, トントン拍子.
- **Lead labels with one emoji** that carries the meaning: `✨ 日程調整表を作る`, `🎉 開催決定`, `🗓️ 日程調整中`, `👑 主催者モード`, `💡` for hints.
- **Fixed notation**
  - Answers: `◯（参加可能）` `△（未定）` `✕（不可）` — never other symbols.
  - Time ranges use `〜` (`19:00〜21:00`).
  - Date titles use `【】`; quoted UI terms and presets use `「」`.
- **Avoid** corporate or abstract phrasing ("効率的なスケジュール管理を実現", "イベントを新規作成する") and English status words in the UI.

| Situation | Do | Don't |
|---|---|---|
| Primary CTA | ✨ 日程調整表を作る / ＋ 新しい日程を作る | イベントを新規作成する |
| Headline | みんなの空き時間をトントン拍子にサクッと調整 | 効率的なスケジュール管理を実現 |
| Status | 🎉 開催決定 | Status: Confirmed |
| Hint | 💡 マウスを押したまま横になぞると連続してサクサク塗れます。 | ドラッグ操作に対応しています。 |

## 3. Color

All semantic colors map onto Tailwind's default palette (oklch), except the schedule-matrix colors which are fixed hex values.

### 3.1 Brand — rose

| Token | Maps to | Use |
|---|---|---|
| `--color-brand` | rose-500 | Primary buttons, brand accents |
| `--color-brand-hover` | rose-600 | Hover |
| `--color-brand-active` | rose-700 | Active / pressed |
| `--color-brand-ink` | rose-700 | Text on `brand-subtle` |
| `--color-brand-link` | rose-600 | Link hover, accent text |
| `--color-brand-subtle` | rose-100 | Chips, icon tiles, avatar fallback |
| `--color-brand-muted` | rose-50 | Page wash (`bg-brand-muted/40`) |
| `--color-brand-border` | rose-100 | Card and header borders |
| `--color-brand-ring` | rose-200 | Focus ring, CTA shadow, text selection |
| `--color-brand-focus` | rose-400 | Focused input border |

### 3.2 Neutrals — stone

Warm grays. Bold labels in `ink-soft` are the most common text style in the app.

| Token | Maps to | Use |
|---|---|---|
| `--color-ink-strong` | stone-900 | Headings, dark buttons (GitHub login, admin) |
| `--color-ink` | stone-800 | Default text |
| `--color-ink-soft` | stone-700 | UI labels |
| `--color-ink-muted` | stone-600 | Body copy, descriptions |
| `--color-ink-subtle` | stone-500 | Metadata |
| `--color-ink-faint` | stone-400 | **Decorative / disabled only** |
| `--color-surface` | white | Cards |
| `--color-surface-sunken` | stone-50 | Tool panels (groups of controls) |
| `--color-surface-control` | stone-100 | Secondary buttons |
| `--color-line` | stone-200 | Default borders |
| `--color-line-strong` | stone-300 | Input / unselected tool borders |

### 3.3 Status

A status is always expressed as the trio **subtle background + same-hue border + dark text**.

| Meaning | Tokens (`-subtle` / `-border` / `-ink`) | Examples |
|---|---|---|
| Success | emerald 100 / 200 / 800 | 🎉 開催決定, confirmed date box |
| Pending / owner | amber 100 / 200 / 800 | 🗓️ 日程調整中, 👑 主催者モード |
| Info | sky 100 / 200 / 800 | ✅ 回答済み |

### 3.4 Gradients

| Variable / utility | Stops | Use |
|---|---|---|
| `--gradient-brand` / `text-gradient-brand` | rose-500 → pink-500 | Logotype |
| `--gradient-hero` / `text-gradient-hero` | rose-500 → pink-500 → amber-500 | Hero headline emphasis |

Gradients are applied to **text only** (`background-clip: text`). Never fill surfaces or buttons with them.

## 4. Typography

| Role | Family | Weight |
|---|---|---|
| Display / headings (`font-display`) | M PLUS Rounded 1c | 700, 800 |
| Body / UI (`font-sans`) | Noto Sans JP | 400, 500, 700 |
| Usernames (`@name`) | `font-mono` | — |

Both families are loaded from Google Fonts in `renderer.tsx`.

| Style | Size / weight | Example |
|---|---|---|
| Hero | 48px (30px mobile) / 800, `tracking-tight`, `leading-tight` | みんなの空き時間を |
| Page title | 30px (24px mobile) / 800 | Event name |
| Section | 18px / 700, display | 作成したイベント |
| Card title | 16px / 700, display | 直感的な 3段階回答 |
| Body | 14px / 400, `leading-relaxed` | Descriptions |
| **UI label** | **12px / 700** — the default for controls | 塗りツール: |
| Micro | 11px / 700 | Tallies, hour ticks, footer notes |

Rule of thumb: anything the user reads to *decide* is bold; anything they read to *understand* is regular in `ink-muted`.

## 5. Shape, elevation & layout

### Radius

| Token | Value | Use |
|---|---|---|
| `rounded-cell` | 2px | Matrix and tally cells |
| `rounded-chip` | 8px | Small buttons, confirmed-date box |
| `rounded-control` | 12px | Inputs, tool buttons, icon tiles, secondary buttons |
| `rounded-card` | 16px | Cards, panels, large CTAs — **the signature radius** |
| `rounded-full` | — | Header buttons, badges, avatars |

### Elevation

| Token | Use |
|---|---|
| none + `border-line` | Empty states, tables |
| `shadow-card` | Default card (with `border-brand-border`) |
| `shadow-raised` | Card hover, the schedule matrix |
| `shadow-cta` / `shadow-cta-hover` | **Primary CTA only** — the only tinted shadow |

### Layout

| Token | Value | Use |
|---|---|---|
| `max-w-content` | 64rem (1024px) | Main container, with `px-4` |
| `h-header` | 3.5rem (56px) | Sticky header: `bg-white/80 backdrop-blur-md border-b border-brand-border` |

Spacing: gaps of 4 / 6 / 8px inside components, 16–24px between cards, 20–24px card padding.

## 6. Components

### Buttons

| Variant | Recipe |
|---|---|
| Hero CTA | `bg-brand hover:bg-brand-hover active:bg-brand-active text-white font-extrabold text-base md:text-lg px-8 py-3.5 rounded-card shadow-cta hover:shadow-cta-hover hover:-translate-y-0.5` |
| Submit (full width) | Same as hero CTA, `w-full py-4`, `disabled:opacity-50` |
| Primary (compact) | `bg-brand hover:bg-brand-hover text-white font-bold text-sm px-4 py-2 rounded-control shadow-card` |
| Header pill | `bg-brand text-white font-bold rounded-full px-3.5 py-1.5` |
| Dark pill | `bg-ink-strong text-white font-bold text-xs rounded-full` (GitHub login, admin) |
| Secondary | `bg-surface-control text-ink-soft font-bold text-xs rounded-control hover:bg-brand-muted hover:text-brand-link` |
| Text | `text-xs text-ink-subtle hover:text-ink-soft hover:underline` |

Only one hero CTA per page. Button labels start with an emoji or `＋`.

### Badges

`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold` + a status trio, e.g.
`bg-success-subtle text-success-ink border border-success-border`. The hero announcement pill is the larger exception (`px-4 py-1.5 text-sm bg-brand-subtle text-brand-ink`).

### Cards

- **Feature card**: `bg-surface p-6 rounded-card border border-brand-border shadow-card hover:shadow-raised`, a 48px `rounded-control` icon tile in `brand-subtle` (or pink/amber-100), display-font title.
- **Event card**: same shell with `p-5`; badge + title row, confirmed-date box (`rounded-chip bg-emerald-50 border-emerald-100 text-emerald-700`), metadata in `text-xs text-ink-subtle`.
- **Empty state**: `border-line` without shadow, a large emoji, display-font title, compact primary button.
- **Tool panel**: `bg-surface-sunken border border-line rounded-card` — controls live here, information lives on white cards.

### Form fields

`border border-line rounded-control px-3.5 py-2 text-sm font-medium outline-none focus:border-brand-focus focus:ring-2 focus:ring-brand-ring`. Labels are UI-label style (12px / 700, `ink-soft`).

### Header & footer

- Header: 🐷 + `noton2` in `font-display font-extrabold text-gradient-brand`; nav on the right.
- Footer: `border-t border-brand-border bg-white/60`, centered, `text-xs`, links hover to `brand-link`.

## 7. Schedule UI (sub-system)

The answer matrix deliberately leaves the rose brand and uses tonton-style functional colors. Keep it that way — it signals "data" rather than "brand".

### Answer states

| State | Token | Value | Symbol | Text |
|---|---|---|---|---|
| ◯ Available (default) | `answer-available` | `#58B4FF` | • | white, bold |
| △ Maybe | `answer-maybe` | `#F5A623` | ▲ | white, bold, 9px |
| ✕ Unavailable | `answer-unavailable` | `#D4D4D4` | × | stone-600, bold |
| No answer (matrix only) | `answer-none` | stone-100 | - | stone-400 |

Toggle order loops ◯ → △ → ✕ → ◯. Unanswered slots in the answer form default to ◯.

### Paint tools

- Unselected: `bg-white` + same-hue border and text (`border-sky-300 text-sky-700`, `border-amber-300 text-amber-700`, `border-stone-300 text-stone-600`).
- Selected: solid fill + white text + 2px pale ring (`bg-sky-500 ring-2 ring-sky-200`, …). The "toggle" tool uses `bg-stone-800 ring-stone-300`.
- Bulk actions: `rounded-chip`, `bg-sky-100 text-sky-800` (all ◯) / `bg-stone-200 text-stone-700` (all ✕).

### Matrix & tallies

- Title bar: `bg-matrix-header` with a 24px `bg-matrix-accent` icon chip and a white display-font title.
- The table card uses `shadow-raised`.
- Tally cells:

| Level | Tokens |
|---|---|
| empty (0) | `tally-empty` / `tally-empty-ink`, extrabold — a warning |
| single (1) | `tally-single` / `tally-single-ink` |
| sufficient (2+) | `tally-sufficient` / `tally-sufficient-ink`, extrabold |
| confirmed slot | `confirmed` / `confirmed-ink` + `ring-2 ring-confirmed-ring ring-inset` |

Confirmed slots are marked with an amber inset ring in **both** answer cells and tally cells.

## 8. Accessibility notes

- **Answer cells**: white on `#58B4FF` (~2.2:1) and on `#F5A623` (~2.0:1) do not meet text contrast. Treat symbols as redundant shape cues next to color, and keep the full text in `title` / tooltips. Do not put readable text on these fills.
- **`ink-faint` (stone-400)** on white fails 4.5:1. It is currently used for footer text and the logout link; prefer `ink-subtle` (stone-500) or darker for anything users must read.
- **Solid amber badge** (`bg-amber-500 text-white`, "🎉 開催決定" on the event page) fails contrast; use `bg-amber-700` or the success trio.
- Color is never the only signal: answers have symbols, statuses have emoji + words.
- Keep the 44px minimum touch target in mind for compact pills on mobile.

## 9. Using the tokens

`src/client/styles/style.css` imports `tokens.css` after Tailwind:

```css
@import "tailwindcss";
@import "./tokens.css";
```

- `@theme static` emits every token as a CSS variable on `:root` (usable from plain CSS or inline styles) and generates utilities: `bg-brand`, `text-ink-muted`, `border-line`, `rounded-card`, `shadow-cta`, `font-display`, `max-w-content`, `h-header`, `bg-answer-available`, …
- Composite utilities: `text-gradient-brand`, `text-gradient-hero`.
- Existing palette classes (`bg-rose-500`, `text-stone-600`, …) keep working and render identically; migrate to semantic tokens opportunistically. In particular, replace the hard-coded `bg-[#58b4ff]`, `bg-[#f5a623]`, `bg-[#d4d4d4]`, `bg-[#9c9c9c]`, `bg-[#f06292]` in `MatrixTable.tsx` / `AnswerForm.tsx` with the `answer-*` / `matrix-*` utilities.
