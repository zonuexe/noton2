// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

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
    if (!body.organizerName || !body.organizerName.trim()) {
      return c.json({ error: '主催者名を入力してください' }, 400)
    }
    if (!body.slots || body.slots.length === 0) {
      return c.json({ error: '候補日時を1つ以上選択してください' }, 400)
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

// 回答登録・編集（※ 誰でもログイン不要で回答可能）
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
