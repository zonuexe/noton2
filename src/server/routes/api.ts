// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Hono } from 'hono'
import {
  addSlotsToEvent,
  confirmSlot,
  createEvent,
  deleteEvent,
  deleteParticipant,
  deleteSlotFromEvent,
  deleteSlotsByDate,
  getEventById,
  submitResponse,
  updateEventDetails,
} from '../db/client'
import type { CreateEventInput, SubmitResponseInput } from '@/shared/types'
import { isValidSlotDate, isValidSlotTimeRange, isValidTimeHM } from '@/shared/time'
import type { AuthBindings, AuthVariables } from '../middleware/auth'

export const api = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

// イベント作成
api.post('/events', async (c) => {
  try {
    const user = c.get('user')
    // イベント作成は GitHub ログイン必須
    if (!user) {
      return c.json(
        {
          error: 'イベントを作成するには GitHub ログインが必要です',
          requireAuth: true,
        },
        401
      )
    }

    const body = await c.req.json<CreateEventInput>()
    if (!body.title || !body.title.trim()) {
      return c.json({ error: 'イベント名を入力してください' }, 400)
    }
    if (body.title.trim().length > 100) {
      return c.json({ error: 'イベント名は100文字以内で入力してください' }, 400)
    }
    if (!body.organizerName || !body.organizerName.trim()) {
      return c.json({ error: '主催者名を入力してください' }, 400)
    }
    if (body.organizerName.trim().length > 50) {
      return c.json({ error: '主催者名は50文字以内で入力してください' }, 400)
    }
    if (body.description && body.description.length > 2000) {
      return c.json({ error: '補足説明は2000文字以内で入力してください' }, 400)
    }
    if (
      body.durationMinutes !== undefined &&
      (typeof body.durationMinutes !== 'number' ||
        body.durationMinutes < 15 ||
        body.durationMinutes > 1440)
    ) {
      return c.json({ error: '所要時間は15分〜1440分の間で指定してください' }, 400)
    }
    if (
      body.slotIntervalMinutes !== undefined &&
      body.slotIntervalMinutes !== 30 &&
      body.slotIntervalMinutes !== 60
    ) {
      return c.json({ error: '枠の刻み幅は30分または60分を指定してください' }, 400)
    }
    if (!body.slots || body.slots.length === 0) {
      return c.json({ error: '候補日時を1つ以上選択してください' }, 400)
    }
    if (body.slots.length > 500) {
      return c.json({ error: '候補日時は最大500件まで指定できます' }, 400)
    }

    for (const s of body.slots) {
      if (!isValidSlotDate(s.slotDate)) {
        return c.json({ error: '候補日時の日付形式が正しくありません (YYYY-MM-DD)' }, 400)
      }
      if (!isValidTimeHM(s.startTime) || !isValidTimeHM(s.endTime)) {
        return c.json({ error: '候補日時の時刻形式が正しくありません (HH:mm)' }, 400)
      }
      if (!isValidSlotTimeRange(s.startTime, s.endTime)) {
        return c.json({ error: '終了時刻は開始時刻より後に設定してください' }, 400)
      }
      if (s.dateTitle !== undefined && s.dateTitle !== null) {
        if (typeof s.dateTitle !== 'string' || s.dateTitle.length > 50) {
          return c.json({ error: '日程の名称は50文字以内で入力してください' }, 400)
        }
      }
    }

    const { id, adminToken } = await createEvent(c.env.DB, body, user.id)
    return c.json({ id, adminToken })
  } catch (err: any) {
    console.error('Create event error:', err)
    return c.json({ error: err.message || 'イベントの作成に失敗しました' }, 500)
  }
})

// イベント詳細取得
api.get('/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id')
    const adminToken = c.req.query('admin')
    const currentUser = c.get('user')
    const event = await getEventById(c.env.DB, eventId, adminToken, currentUser?.id)

    if (!event) {
      return c.json({ error: '指定されたイベントが見つかりません' }, 404)
    }

    return c.json(event)
  } catch (err: any) {
    console.error('Get event error:', err)
    return c.json({ error: 'イベントの取得に失敗しました' }, 500)
  }
})

// スロットの追加 (主催者のみ)
api.post('/events/:id/slots', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await c.req.json<{
      adminToken?: string
      slots: Array<{
        slotDate: string
        startTime: string
        endTime: string
        dateTitle?: string | null
      }>
    }>()
    const currentUser = c.get('user')

    if (!body.slots || !Array.isArray(body.slots) || body.slots.length === 0) {
      return c.json({ error: '追加する候補枠を指定してください' }, 400)
    }

    if (body.slots.length > 500) {
      return c.json({ error: '一度に追加できる候補枠は最大500件です' }, 400)
    }

    for (const s of body.slots) {
      if (!isValidSlotDate(s.slotDate)) {
        return c.json({ error: 'スロットの日付形式が不正です (YYYY-MM-DD)' }, 400)
      }
      if (!isValidTimeHM(s.startTime) || !isValidTimeHM(s.endTime)) {
        return c.json({ error: 'スロットの時刻形式が不正です (HH:mm)' }, 400)
      }
      if (!isValidSlotTimeRange(s.startTime, s.endTime)) {
        return c.json({ error: '終了時刻は開始時刻より後に設定してください' }, 400)
      }
      if (s.dateTitle !== undefined && s.dateTitle !== null) {
        if (typeof s.dateTitle !== 'string' || s.dateTitle.length > 50) {
          return c.json({ error: '日程の名称は50文字以内で入力してください' }, 400)
        }
      }
    }

    const result = await addSlotsToEvent(
      c.env.DB,
      eventId,
      body.slots,
      body.adminToken,
      currentUser?.id
    )

    return c.json({ success: true, addedCount: result.addedCount })
  } catch (err: any) {
    console.error('Add slots error:', err)
    if (err.message === 'スロット追加の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    if (err.message && err.message.includes('500件')) {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: err.message || 'スロットの追加に失敗しました' }, 500)
  }
})

// スロットの削除 (主催者のみ)
api.delete('/events/:id/slots/:slotId', async (c) => {
  try {
    const eventId = c.req.param('id')
    const slotId = c.req.param('slotId')
    const adminToken = c.req.query('admin') || (await c.req.json().catch(() => ({}))).adminToken
    const currentUser = c.get('user')

    const ok = await deleteSlotFromEvent(c.env.DB, eventId, slotId, adminToken, currentUser?.id)
    if (!ok) {
      return c.json({ error: 'スロットの削除に失敗しました' }, 400)
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error('Delete slot error:', err)
    if (err.message === 'スロット削除の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    return c.json({ error: err.message || 'スロットの削除に失敗しました' }, 500)
  }
})

// 特定日付の全スロット削除 (主催者のみ)
api.delete('/events/:id/slots-by-date', async (c) => {
  try {
    const eventId = c.req.param('id')
    const slotDate = c.req.query('date')
    const adminToken = c.req.query('admin')
    const currentUser = c.get('user')

    if (!slotDate) {
      return c.json({ error: '日付が指定されていません' }, 400)
    }
    if (!isValidSlotDate(slotDate)) {
      return c.json({ error: '日付の形式が正しくありません (YYYY-MM-DD)' }, 400)
    }

    const res = await deleteSlotsByDate(c.env.DB, eventId, slotDate, adminToken, currentUser?.id)
    return c.json({ success: true, deletedCount: res.deletedCount })
  } catch (err: any) {
    console.error('Delete slots by date error:', err)
    if (err.message === 'スロット削除の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    return c.json({ error: err.message || '日付スロットの削除に失敗しました' }, 500)
  }
})

// イベント基本情報の更新 (主催者のみ)
api.patch('/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await c.req.json<{
      adminToken?: string
      title?: string
      description?: string
      durationMinutes?: number
      organizerName?: string
    }>()
    const currentUser = c.get('user')

    if (body.title !== undefined) {
      if (!body.title.trim()) {
        return c.json({ error: 'イベント名を入力してください' }, 400)
      }
      if (body.title.trim().length > 100) {
        return c.json({ error: 'イベント名は100文字以内で入力してください' }, 400)
      }
    }
    if (body.organizerName !== undefined) {
      if (!body.organizerName.trim()) {
        return c.json({ error: '主催者名を入力してください' }, 400)
      }
      if (body.organizerName.trim().length > 50) {
        return c.json({ error: '主催者名は50文字以内で入力してください' }, 400)
      }
    }
    if (body.description !== undefined && body.description.length > 2000) {
      return c.json({ error: '補足説明は2000文字以内で入力してください' }, 400)
    }
    if (body.durationMinutes !== undefined && (typeof body.durationMinutes !== 'number' || body.durationMinutes <= 0)) {
      return c.json({ error: '所要時間は正の数値を指定してください' }, 400)
    }

    const ok = await updateEventDetails(c.env.DB, eventId, body, body.adminToken, currentUser?.id)
    if (!ok) {
      return c.json({ error: 'イベント情報の更新に失敗しました' }, 400)
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error('Update event error:', err)
    if (err.message === 'イベント編集の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    return c.json({ error: err.message || 'イベント情報の更新に失敗しました' }, 500)
  }
})

// 回答登録・編集（※ 誰でもログイン不要で回答可能、ログイン中であればアカウントに紐付け）
api.post('/events/:id/responses', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await c.req.json<SubmitResponseInput>()
    const currentUser = c.get('user')

    if (!body.name || !body.name.trim()) {
      return c.json({ error: 'お名前（ニックネーム）を入力してください' }, 400)
    }
    if (body.name.trim().length > 50) {
      return c.json({ error: 'お名前は50文字以内で入力してください' }, 400)
    }
    if (body.comment && body.comment.length > 500) {
      return c.json({ error: 'コメントは500文字以内で入力してください' }, 400)
    }
    if (body.answers && body.answers.length > 500) {
      return c.json({ error: '回答スロット数が上限（500件）を超えています' }, 400)
    }
    if (body.answers) {
      const validStatuses = new Set(['favorite', 'available', 'maybe', 'unavailable'])
      for (const ans of body.answers) {
        if (!ans || typeof ans.slotId !== 'string' || !validStatuses.has(ans.status)) {
          return c.json({ error: '回答のステータス形式が不正です' }, 400)
        }
      }
    }

    const result = await submitResponse(c.env.DB, eventId, body, currentUser?.id)
    return c.json(result)
  } catch (err: any) {
    console.error('Submit response error:', err)
    if (err.message === '指定されたイベントが見つかりません') {
      return c.json({ error: err.message }, 404)
    }
    if (
      err.message === '編集権限がありません' ||
      err.message === 'この回答は別のアカウントに紐付いています'
    ) {
      return c.json({ error: err.message }, 403)
    }
    if (err.message.includes('上限')) {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: err.message || '回答の送信に失敗しました' }, 500)
  }
})

// 日程確定（adminToken または 作成者のGitHubログインで操作可能）
api.post('/events/:id/confirm', async (c) => {
  try {
    const eventId = c.req.param('id')
    const { adminToken, slotId } = await c.req.json<{
      adminToken?: string
      slotId: string | null
    }>()
    const currentUser = c.get('user')

    const ok = await confirmSlot(c.env.DB, eventId, adminToken, slotId, currentUser?.id)
    if (!ok) {
      return c.json({ error: '管理者権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true, confirmedSlotId: slotId })
  } catch (err: any) {
    console.error('Confirm slot error:', err)
    if (err.message === '指定されたスロットが存在しません') {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: '日程の確定に失敗しました' }, 500)
  }
})

// イベント削除（adminToken または 作成者のGitHubログインで操作可能）
api.delete('/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id')
    const adminToken = c.req.query('admin') || (await c.req.json().catch(() => ({}))).adminToken
    const currentUser = c.get('user')

    const ok = await deleteEvent(c.env.DB, eventId, adminToken, currentUser?.id)
    if (!ok) {
      return c.json({ error: '管理者権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error('Delete event error:', err)
    return c.json({ error: 'イベントの削除に失敗しました' }, 500)
  }
})

// 参加者の回答削除（参加者本人の editToken または 主催者権限で操作可能）
api.delete('/events/:id/participants/:participantId', async (c) => {
  try {
    const eventId = c.req.param('id')
    const participantId = c.req.param('participantId')
    const token = c.req.query('token') || (await c.req.json().catch(() => ({}))).token
    const currentUser = c.get('user')

    const ok = await deleteParticipant(c.env.DB, eventId, participantId, token, currentUser?.id)
    if (!ok) {
      return c.json({ error: '削除権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error('Delete participant error:', err)
    return c.json({ error: '参加者の削除に失敗しました' }, 500)
  }
})
