import { defineVaporComponent, computed, ref } from 'vue'
import type { EventDetail, SlotScore } from '@/shared/types'

export const MatrixTable = defineVaporComponent((props: {
  event: EventDetail
  adminToken?: string
  onReload: () => void
}) => {
  const isDeleting = ref(false)

    // ローカルストレージから自分のparticipantIdとeditTokenを取得
    const myResponse = computed(() => {
      try {
        const stored = localStorage.getItem(`noton2_resp_${props.event.id}`)
        return stored ? JSON.parse(stored) : null
      } catch (e) {
        return null
      }
    })

    const formatDateLabel = (dateStr: string) => {
      const parts = dateStr.split('-')
      if (parts.length < 3) return dateStr
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const dayNames = ['日', '月', '火', '水', '木', '金', '土']
      return `${Number(parts[1])}/${Number(parts[2])} (${dayNames[d.getDay()]})`
    }

    // 各スロットのスコア計算
    const slotScores = computed<Record<string, SlotScore>>(() => {
      const scores: Record<string, SlotScore> = {}

      props.event.slots.forEach((s) => {
        scores[s.id] = {
          slotId: s.id,
          score: 0,
          favoriteCount: 0,
          availableCount: 0,
          maybeCount: 0,
          unavailableCount: 0,
          totalResponses: 0,
        }
      })

      props.event.participants.forEach((p) => {
        if (!p.answers) return
        Object.entries(p.answers).forEach(([slotId, status]) => {
          if (!scores[slotId]) return
          scores[slotId].totalResponses++
          if (status === 'favorite') {
            scores[slotId].favoriteCount++
            scores[slotId].score += 2
          } else if (status === 'available') {
            scores[slotId].availableCount++
            scores[slotId].score += 1
          } else if (status === 'maybe') {
            scores[slotId].maybeCount++
            scores[slotId].score += 0.5
          } else if (status === 'unavailable') {
            scores[slotId].unavailableCount++
          }
        })
      })

      return scores
    })

    // 最高スコアのスロットIDを特定 (参加者が1人以上いる場合)
    const bestSlotId = computed(() => {
      if (props.event.participants.length === 0) return null
      let maxScore = -1
      let bestId: string | null = null
      let minUnavailable = 9999

      props.event.slots.forEach((s) => {
        const scoreObj = slotScores.value[s.id]
        if (!scoreObj) return

        if (
          scoreObj.score > maxScore ||
          (scoreObj.score === maxScore && scoreObj.unavailableCount < minUnavailable)
        ) {
          maxScore = scoreObj.score
          minUnavailable = scoreObj.unavailableCount
          bestId = s.id
        }
      })

      return maxScore > 0 ? bestId : null
    })

    // 参加者の削除処理
    const handleDeleteParticipant = async (participantId: string) => {
      if (!confirm('この参加者の回答を削除してもよろしいですか？')) return

      isDeleting.value = true
      try {
        const token =
          props.adminToken || (myResponse.value?.participantId === participantId ? myResponse.value?.editToken : '')

        const res = await fetch(
          `/api/events/${props.event.id}/participants/${participantId}?token=${encodeURIComponent(token)}`,
          { method: 'DELETE' }
        )

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || '削除に失敗しました')
          return
        }

        // 自分の回答を削除した場合はlocalStorageもクリア
        if (myResponse.value?.participantId === participantId) {
          localStorage.removeItem(`noton2_resp_${props.event.id}`)
        }

        props.onReload()
      } catch (e: any) {
        alert(e.message || '通信エラーが発生しました')
      } finally {
        isDeleting.value = false
      }
    }

    const renderStatusBadge = (status?: string) => {
      if (status === 'favorite') {
        return (
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-500 text-white font-extrabold text-sm shadow-xs" title="希望">
            ◎
          </span>
        )
      }
      if (status === 'available') {
        return (
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-extrabold text-sm border border-emerald-300" title="可">
            ◯
          </span>
        )
      }
      if (status === 'maybe') {
        return (
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-sm border border-amber-300" title="未定">
            △
          </span>
        )
      }
      if (status === 'unavailable') {
        return (
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-stone-100 text-stone-400 font-bold text-sm border border-stone-200" title="不可">
            ✕
          </span>
        )
      }
      return <span class="text-stone-300">-</span>
    }

    return (
      <div class="bg-white rounded-3xl p-6 md:p-8 border border-rose-100 shadow-xl shadow-rose-100/40 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-100 pb-4">
          <div>
            <h2 class="text-lg font-bold text-stone-900 font-['M_PLUS_Rounded_1c'] flex items-center gap-2">
              <span>📊</span>
              <span>出欠集計表（マトリクス）</span>
            </h2>
            <p class="text-xs text-stone-500 mt-0.5">
              回答人数: {props.event.participants.length}名
            </p>
          </div>

          <div class="flex items-center gap-3 text-xs">
            <span class="flex items-center gap-1 text-rose-600 font-bold">
              <span class="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center">
                ◎
              </span>
              希望(2pt)
            </span>
            <span class="flex items-center gap-1 text-emerald-700 font-bold">
              <span class="w-4 h-4 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 text-[10px] flex items-center justify-center">
                ◯
              </span>
              可(1pt)
            </span>
            <span class="flex items-center gap-1 text-amber-700 font-bold">
              <span class="w-4 h-4 rounded-full bg-amber-100 border border-amber-300 text-amber-700 text-[10px] flex items-center justify-center">
                △
              </span>
              未定(0.5pt)
            </span>
            <span class="flex items-center gap-1 text-stone-500 font-bold">
              <span class="w-4 h-4 rounded-full bg-stone-100 border border-stone-300 text-stone-400 text-[10px] flex items-center justify-center">
                ✕
              </span>
              不可(0pt)
            </span>
          </div>
        </div>

        {props.event.participants.length === 0 ? (
          <div class="py-12 text-center text-stone-400 text-sm space-y-2">
            <div class="text-3xl">📭</div>
            <p>まだ回答がありません。共有URLを送ってメンバーに回答してもらいましょう！</p>
          </div>
        ) : (
          <div class="overflow-x-auto -mx-6 md:-mx-8 px-6 md:px-8">
            <table class="w-full border-collapse text-xs md:text-sm">
              <thead>
                <tr class="border-b border-rose-100 bg-rose-50/40">
                  <th class="py-3 px-3 text-left font-bold text-stone-700 min-w-[150px] sticky left-0 bg-rose-50/90 backdrop-blur-xs z-10">
                    候補日時
                  </th>
                  <th class="py-3 px-3 text-center font-bold text-rose-700 min-w-[70px]">
                    スコア
                  </th>
                  <th class="py-3 px-3 text-center font-bold text-stone-600 min-w-[100px]">
                    集計 (◎/◯/△/✕)
                  </th>
                  {props.event.participants.map((p) => {
                    const isMe = myResponse.value?.participantId === p.id
                    const canDelete = props.adminToken || (isMe && myResponse.value?.editToken)

                    return (
                      <th
                        key={p.id}
                        class="py-3 px-3 text-center font-bold text-stone-800 min-w-[80px]"
                      >
                        <div class="flex items-center justify-center gap-1">
                          <span class={isMe ? 'text-rose-600 font-extrabold' : ''}>
                            {p.name}
                            {isMe ? <span class="text-[10px] ml-1 text-rose-500">(あなた)</span> : null}
                          </span>
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteParticipant(p.id)}
                              class="text-stone-300 hover:text-rose-500 text-xs font-bold p-0.5 cursor-pointer"
                              title="回答を削除"
                            >
                              ✕
                            </button>
                          ) : null}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody class="divide-y divide-rose-50">
                {props.event.slots.map((slot) => {
                  const scoreObj = slotScores.value[slot.id] || {
                    score: 0,
                    favoriteCount: 0,
                    availableCount: 0,
                    maybeCount: 0,
                    unavailableCount: 0,
                  }
                  const isBest = bestSlotId.value === slot.id
                  const isConfirmed = props.event.confirmedSlotId === slot.id

                  let rowBg = 'hover:bg-rose-50/30 transition'
                  if (isConfirmed) {
                    rowBg = 'bg-amber-100/50 hover:bg-amber-100/70'
                  } else if (isBest) {
                    rowBg = 'bg-rose-50/60 hover:bg-rose-50/80'
                  }

                  return (
                    <tr key={slot.id} class={rowBg}>
                      {/* 候補日時セル */}
                      <td class="py-3 px-3 text-left font-bold text-stone-800 sticky left-0 bg-white/95 backdrop-blur-xs z-10">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          {isConfirmed ? (
                            <span class="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-500 text-white text-[10px] font-extrabold rounded-full">
                              🎉 確定
                            </span>
                          ) : null}
                          {!isConfirmed && isBest ? (
                            <span class="inline-flex items-center gap-0.5 px-2 py-0.5 bg-rose-500 text-white text-[10px] font-extrabold rounded-full animate-bounce">
                              👑 第1候補
                            </span>
                          ) : null}
                          <span class="whitespace-nowrap">{formatDateLabel(slot.slotDate)}</span>
                          <span class="font-mono text-xs text-rose-700 whitespace-nowrap">
                            {slot.startTime}〜{slot.endTime}
                          </span>
                        </div>
                      </td>

                      {/* スコア */}
                      <td class="py-3 px-3 text-center">
                        <span
                          class={`font-mono font-extrabold text-sm ${
                            isBest ? 'text-rose-600 text-base' : 'text-stone-700'
                          }`}
                        >
                          {scoreObj.score}pt
                        </span>
                      </td>

                      {/* 内訳 (◎/◯/△/✕) */}
                      <td class="py-3 px-3 text-center whitespace-nowrap font-mono text-xs">
                        <span class="text-rose-600 font-bold">{scoreObj.favoriteCount}</span>
                        <span class="text-stone-300">/</span>
                        <span class="text-emerald-600 font-bold">{scoreObj.availableCount}</span>
                        <span class="text-stone-300">/</span>
                        <span class="text-amber-600 font-bold">{scoreObj.maybeCount}</span>
                        <span class="text-stone-300">/</span>
                        <span class="text-stone-400 font-bold">{scoreObj.unavailableCount}</span>
                      </td>

                      {/* 各参加者の回答セル */}
                      {props.event.participants.map((p) => {
                        const status = p.answers ? p.answers[slot.id] : undefined
                        return (
                          <td key={`${slot.id}-${p.id}`} class="py-3 px-3 text-center">
                            {renderStatusBadge(status)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}

                {/* 参加者コメント行 */}
                <tr class="bg-stone-50/50">
                  <td class="py-3 px-3 font-bold text-stone-500 sticky left-0 bg-stone-50/95 z-10">
                    コメント
                  </td>
                  <td class="py-3 px-3 text-center text-stone-300">-</td>
                  <td class="py-3 px-3 text-center text-stone-300">-</td>
                  {props.event.participants.map((p) => (
                    <td
                      key={`comment-${p.id}`}
                      class="py-3 px-3 text-center text-xs text-stone-600 max-w-[120px] truncate"
                      title={p.comment || ''}
                    >
                      {p.comment || <span class="text-stone-300">-</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
})
