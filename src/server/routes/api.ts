import { Hono } from 'hono'
import {
  confirmSlot,
  createEvent,
  deleteEvent,
  deleteParticipant,
  getEventById,
  submitResponse,
} from '../db/client'
import type { CreateEventInput, SubmitResponseInput } from '@/shared/types'

type Bindings = {
  DB: D1Database
}

export const api = new Hono<{ Bindings: Bindings }>()

// イベント作成
api.post('/events', async (c) => {
  try {
    const body = await c.req.json<CreateEventInput>()
    if (!body.title || !body.title.trim()) {
      return c.json({ error: 'イベント名を入力してください' }, 400)
    }
    if (!body.organizerName || !body.organizerName.trim()) {
      return c.json({ error: '主催者名を入力してください' }, 400)
    }
    if (!body.slots || body.slots.length === 0) {
      return c.json({ error: '候補日時を1つ以上選択してください' }, 400)
    }

    const { id, adminToken } = await createEvent(c.env.DB, body)
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
    const event = await getEventById(c.env.DB, eventId, adminToken)

    if (!event) {
      return c.json({ error: '指定されたイベントが見つかりません' }, 404)
    }

    return c.json(event)
  } catch (err: any) {
    console.error('Get event error:', err)
    return c.json({ error: 'イベントの取得に失敗しました' }, 500)
  }
})

// 回答登録・編集
api.post('/events/:id/responses', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await c.req.json<SubmitResponseInput>()

    if (!body.name || !body.name.trim()) {
      return c.json({ error: 'お名前（ニックネーム）を入力してください' }, 400)
    }

    const result = await submitResponse(c.env.DB, eventId, body)
    return c.json(result)
  } catch (err: any) {
    console.error('Submit response error:', err)
    return c.json({ error: err.message || '回答の送信に失敗しました' }, 500)
  }
})

// 日程確定
api.post('/events/:id/confirm', async (c) => {
  try {
    const eventId = c.req.param('id')
    const { adminToken, slotId } = await c.req.json<{ adminToken: string; slotId: string | null }>()

    if (!adminToken) {
      return c.json({ error: '管理者トークンが必要です' }, 401)
    }

    const ok = await confirmSlot(c.env.DB, eventId, adminToken, slotId)
    if (!ok) {
      return c.json({ error: '管理者権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true, confirmedSlotId: slotId })
  } catch (err: any) {
    console.error('Confirm slot error:', err)
    return c.json({ error: '日程の確定に失敗しました' }, 500)
  }
})

// イベント削除
api.delete('/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id')
    const adminToken = c.req.query('admin') || (await c.req.json().catch(() => ({}))).adminToken

    if (!adminToken) {
      return c.json({ error: '管理者トークンが必要です' }, 401)
    }

    const ok = await deleteEvent(c.env.DB, eventId, adminToken)
    if (!ok) {
      return c.json({ error: '管理者権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error('Delete event error:', err)
    return c.json({ error: 'イベントの削除に失敗しました' }, 500)
  }
})

// 参加者の回答削除
api.delete('/events/:id/participants/:participantId', async (c) => {
  try {
    const eventId = c.req.param('id')
    const participantId = c.req.param('participantId')
    const token = c.req.query('token') || (await c.req.json().catch(() => ({}))).token

    if (!token) {
      return c.json({ error: '削除権限トークンが必要です' }, 401)
    }

    const ok = await deleteParticipant(c.env.DB, eventId, participantId, token)
    if (!ok) {
      return c.json({ error: '削除権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error('Delete participant error:', err)
    return c.json({ error: '参加者の削除に失敗しました' }, 500)
  }
})
