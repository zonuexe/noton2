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
import type { AnswerStatus, CreateEventInput, SubmitResponseInput } from '@/shared/types'
import { isValidSlotDate, isValidSlotTimeRange, isValidTimeHM } from '@/shared/time'
import type { AuthBindings, AuthVariables } from '../middleware/auth'
import {
  RequestError,
  isNonEmptyString,
  isRecord,
  readJson,
  readOptionalJson,
} from '../http'

export const api = new Hono<{
  Bindings: AuthBindings
  Variables: AuthVariables
}>()

const MAX_ID_LENGTH = 64
const MAX_TOKEN_LENGTH = 128
const MAX_SLOTS = 500
const VALID_STATUSES = new Set<AnswerStatus>([
  'favorite',
  'available',
  'maybe',
  'unavailable',
])

type SlotInput = {
  slotDate: string
  startTime: string
  endTime: string
  dateTitle?: string | null
}

function optionalToken(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > MAX_TOKEN_LENGTH) {
    throw new RequestError('認証トークンの形式が不正です', 400)
  }
  return value
}

function optionalId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > MAX_ID_LENGTH) {
    throw new RequestError('識別子の形式が不正です', 400)
  }
  return value
}

async function readOptionalJsonObject(c: Parameters<typeof readJson>[0]) {
  const body = await readOptionalJson(c)
  if (body === null) return null
  if (!isRecord(body)) {
    throw new RequestError('リクエストの形式が正しくありません', 400)
  }
  return body
}

function validateSlots(
  value: unknown,
  messages: {
    empty: string
    tooMany: string
    invalidDate: string
    invalidTime: string
    invalidRange: string
    invalidTitle: string
  }
): SlotInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestError(messages.empty, 400)
  }
  if (value.length > MAX_SLOTS) {
    throw new RequestError(messages.tooMany, 400)
  }

  const slots: SlotInput[] = []
  for (const raw of value) {
    if (!isRecord(raw)) {
      throw new RequestError(messages.invalidDate, 400)
    }

    const slotDate = raw.slotDate
    const startTime = raw.startTime
    const endTime = raw.endTime

    if (typeof slotDate !== 'string' || !isValidSlotDate(slotDate)) {
      throw new RequestError(messages.invalidDate, 400)
    }
    if (
      typeof startTime !== 'string' ||
      typeof endTime !== 'string' ||
      !isValidTimeHM(startTime) ||
      !isValidTimeHM(endTime)
    ) {
      throw new RequestError(messages.invalidTime, 400)
    }
    if (!isValidSlotTimeRange(startTime, endTime)) {
      throw new RequestError(messages.invalidRange, 400)
    }

    let dateTitle: string | null | undefined
    if (raw.dateTitle !== undefined && raw.dateTitle !== null) {
      if (typeof raw.dateTitle !== 'string' || raw.dateTitle.length > 50) {
        throw new RequestError(messages.invalidTitle, 400)
      }
      dateTitle = raw.dateTitle
    } else if (raw.dateTitle === null) {
      dateTitle = null
    }

    slots.push({ slotDate, startTime, endTime, dateTitle })
  }

  return slots
}

function validateAnswers(value: unknown): SubmitResponseInput['answers'] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new RequestError('回答の形式が不正です', 400)
  }
  if (value.length > MAX_SLOTS) {
    throw new RequestError('回答スロット数が上限（500件）を超えています', 400)
  }

  const answers: SubmitResponseInput['answers'] = []
  for (const raw of value) {
    if (!isRecord(raw)) {
      throw new RequestError('回答のステータス形式が不正です', 400)
    }
    const slotId = raw.slotId
    const status = raw.status
    if (
      typeof slotId !== 'string' ||
      !slotId ||
      slotId.length > MAX_ID_LENGTH ||
      typeof status !== 'string' ||
      !VALID_STATUSES.has(status as AnswerStatus)
    ) {
      throw new RequestError('回答のステータス形式が不正です', 400)
    }
    answers.push({ slotId, status: status as AnswerStatus })
  }
  return answers
}

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

    const body = await readJson(c)
    if (!isRecord(body)) {
      throw new RequestError('リクエストの形式が正しくありません', 400)
    }

    const title = body.title
    if (!isNonEmptyString(title)) {
      return c.json({ error: 'イベント名を入力してください' }, 400)
    }
    if (title.trim().length > 100) {
      return c.json({ error: 'イベント名は100文字以内で入力してください' }, 400)
    }

    const organizerName = body.organizerName
    if (!isNonEmptyString(organizerName)) {
      return c.json({ error: '主催者名を入力してください' }, 400)
    }
    if (organizerName.trim().length > 50) {
      return c.json({ error: '主催者名は50文字以内で入力してください' }, 400)
    }

    const description = body.description
    if (description !== undefined && typeof description !== 'string') {
      return c.json({ error: '補足説明の形式が正しくありません' }, 400)
    }
    if (typeof description === 'string' && description.length > 2000) {
      return c.json({ error: '補足説明は2000文字以内で入力してください' }, 400)
    }

    let durationMinutes: number | undefined
    if (body.durationMinutes !== undefined) {
      if (
        typeof body.durationMinutes !== 'number' ||
        !Number.isFinite(body.durationMinutes) ||
        body.durationMinutes < 15 ||
        body.durationMinutes > 1440
      ) {
        return c.json({ error: '所要時間は15分〜1440分の間で指定してください' }, 400)
      }
      durationMinutes = body.durationMinutes
    }

    let slotIntervalMinutes: number | undefined
    if (body.slotIntervalMinutes !== undefined) {
      if (body.slotIntervalMinutes !== 30 && body.slotIntervalMinutes !== 60) {
        return c.json({ error: '枠の刻み幅は30分または60分を指定してください' }, 400)
      }
      slotIntervalMinutes = body.slotIntervalMinutes
    }

    const slots = validateSlots(body.slots, {
      empty: '候補日時を1つ以上選択してください',
      tooMany: '候補日時は最大500件まで指定できます',
      invalidDate: '候補日時の日付形式が正しくありません (YYYY-MM-DD)',
      invalidTime: '候補日時の時刻形式が正しくありません (HH:mm)',
      invalidRange: '終了時刻は開始時刻より後に設定してください',
      invalidTitle: '日程の名称は50文字以内で入力してください',
    })

    const input: CreateEventInput = {
      title,
      organizerName,
      description,
      durationMinutes,
      slotIntervalMinutes,
      slots,
    }
    const { id, adminToken } = await createEvent(c.env.DB, input, user.id)
    return c.json({ id, adminToken })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Create event error:', err)
    return c.json({ error: 'イベントの作成に失敗しました' }, 500)
  }
})

// イベント詳細取得
api.get('/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id')
    // 管理トークンはアクセスログに残らないようヘッダーでのみ受け付ける
    const rawAdminToken = c.req.header('x-admin-token')
    const adminToken =
      rawAdminToken && rawAdminToken.length <= MAX_TOKEN_LENGTH ? rawAdminToken : undefined
    const currentUser = c.get('user')
    const event = await getEventById(c.env.DB, eventId, adminToken, currentUser?.id)

    if (!event) {
      return c.json({ error: '指定されたイベントが見つかりません' }, 404)
    }

    return c.json(event)
  } catch (err: unknown) {
    console.error('Get event error:', err)
    return c.json({ error: 'イベントの取得に失敗しました' }, 500)
  }
})

// スロットの追加 (主催者のみ)
api.post('/events/:id/slots', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await readJson(c)
    if (!isRecord(body)) {
      throw new RequestError('リクエストの形式が正しくありません', 400)
    }
    const currentUser = c.get('user')
    const adminToken = optionalToken(body.adminToken)

    const slots = validateSlots(body.slots, {
      empty: '追加する候補枠を指定してください',
      tooMany: '一度に追加できる候補枠は最大500件です',
      invalidDate: 'スロットの日付形式が不正です (YYYY-MM-DD)',
      invalidTime: 'スロットの時刻形式が不正です (HH:mm)',
      invalidRange: '終了時刻は開始時刻より後に設定してください',
      invalidTitle: '日程の名称は50文字以内で入力してください',
    })

    const result = await addSlotsToEvent(c.env.DB, eventId, slots, adminToken, currentUser?.id)

    return c.json({ success: true, addedCount: result.addedCount })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Add slots error:', err)
    if (err instanceof Error && err.message === 'スロット追加の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    if (err instanceof Error && err.message.includes('500件')) {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: 'スロットの追加に失敗しました' }, 500)
  }
})

// スロットの削除 (主催者のみ)
api.delete('/events/:id/slots/:slotId', async (c) => {
  try {
    const eventId = c.req.param('id')
    const slotId = c.req.param('slotId')
    const body = await readOptionalJsonObject(c)
    const adminToken = optionalToken(body?.adminToken)
    const currentUser = c.get('user')

    const ok = await deleteSlotFromEvent(c.env.DB, eventId, slotId, adminToken, currentUser?.id)
    if (!ok) {
      return c.json({ error: 'スロットの削除に失敗しました' }, 400)
    }

    return c.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Delete slot error:', err)
    if (err instanceof Error && err.message === 'スロット削除の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    return c.json({ error: 'スロットの削除に失敗しました' }, 500)
  }
})

// 特定日付の全スロット削除 (主催者のみ)
api.delete('/events/:id/slots-by-date', async (c) => {
  try {
    const eventId = c.req.param('id')
    const slotDate = c.req.query('date')
    const currentUser = c.get('user')

    if (!slotDate) {
      return c.json({ error: '日付が指定されていません' }, 400)
    }
    if (!isValidSlotDate(slotDate)) {
      return c.json({ error: '日付の形式が正しくありません (YYYY-MM-DD)' }, 400)
    }

    const body = await readOptionalJsonObject(c)
    const adminToken = optionalToken(body?.adminToken)

    const res = await deleteSlotsByDate(c.env.DB, eventId, slotDate, adminToken, currentUser?.id)
    return c.json({ success: true, deletedCount: res.deletedCount })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Delete slots by date error:', err)
    if (err instanceof Error && err.message === 'スロット削除の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    return c.json({ error: '日付スロットの削除に失敗しました' }, 500)
  }
})

// イベント基本情報の更新 (主催者のみ)
api.patch('/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await readJson(c)
    if (!isRecord(body)) {
      throw new RequestError('リクエストの形式が正しくありません', 400)
    }
    const currentUser = c.get('user')
    const adminToken = optionalToken(body.adminToken)

    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) {
        return c.json({ error: 'イベント名を入力してください' }, 400)
      }
      if (body.title.trim().length > 100) {
        return c.json({ error: 'イベント名は100文字以内で入力してください' }, 400)
      }
    }
    if (body.organizerName !== undefined) {
      if (!isNonEmptyString(body.organizerName)) {
        return c.json({ error: '主催者名を入力してください' }, 400)
      }
      if (body.organizerName.trim().length > 50) {
        return c.json({ error: '主催者名は50文字以内で入力してください' }, 400)
      }
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
      return c.json({ error: '補足説明の形式が正しくありません' }, 400)
    }
    if (typeof body.description === 'string' && body.description.length > 2000) {
      return c.json({ error: '補足説明は2000文字以内で入力してください' }, 400)
    }
    if (body.durationMinutes !== undefined) {
      if (
        typeof body.durationMinutes !== 'number' ||
        !Number.isFinite(body.durationMinutes) ||
        body.durationMinutes < 15 ||
        body.durationMinutes > 1440
      ) {
        return c.json({ error: '所要時間は15分〜1440分の間で指定してください' }, 400)
      }
    }

    const ok = await updateEventDetails(
      c.env.DB,
      eventId,
      {
        title: body.title as string | undefined,
        description: body.description as string | undefined,
        durationMinutes: body.durationMinutes as number | undefined,
        organizerName: body.organizerName as string | undefined,
      },
      adminToken,
      currentUser?.id
    )
    if (!ok) {
      return c.json({ error: 'イベント情報の更新に失敗しました' }, 400)
    }

    return c.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Update event error:', err)
    if (err instanceof Error && err.message === 'イベント編集の権限がありません') {
      return c.json({ error: err.message }, 403)
    }
    return c.json({ error: 'イベント情報の更新に失敗しました' }, 500)
  }
})

// 回答登録・編集（※ 誰でもログイン不要で回答可能、ログイン中であればアカウントに紐付け）
api.post('/events/:id/responses', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await readJson(c)
    if (!isRecord(body)) {
      throw new RequestError('リクエストの形式が正しくありません', 400)
    }
    const currentUser = c.get('user')

    const name = body.name
    if (!isNonEmptyString(name)) {
      return c.json({ error: 'お名前（ニックネーム）を入力してください' }, 400)
    }
    if (name.trim().length > 50) {
      return c.json({ error: 'お名前は50文字以内で入力してください' }, 400)
    }
    if (body.comment !== undefined && typeof body.comment !== 'string') {
      return c.json({ error: 'コメントの形式が正しくありません' }, 400)
    }
    if (typeof body.comment === 'string' && body.comment.length > 500) {
      return c.json({ error: 'コメントは500文字以内で入力してください' }, 400)
    }

    const participantId = optionalId(body.participantId)
    const editToken = optionalToken(body.editToken)
    const answers = validateAnswers(body.answers)

    const input: SubmitResponseInput = {
      participantId,
      editToken,
      name,
      comment: body.comment as string | undefined,
      answers,
    }
    const result = await submitResponse(c.env.DB, eventId, input, currentUser?.id)
    return c.json(result)
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Submit response error:', err)
    if (err instanceof Error && err.message === '指定されたイベントが見つかりません') {
      return c.json({ error: err.message }, 404)
    }
    if (
      err instanceof Error &&
      (err.message === '編集権限がありません' ||
        err.message === 'この回答は別のアカウントに紐付いています')
    ) {
      return c.json({ error: err.message }, 403)
    }
    if (err instanceof Error && err.message.includes('上限')) {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: '回答の送信に失敗しました' }, 500)
  }
})

// 日程確定（adminToken または 作成者のGitHubログインで操作可能）
api.post('/events/:id/confirm', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await readJson(c)
    if (!isRecord(body)) {
      throw new RequestError('リクエストの形式が正しくありません', 400)
    }
    const adminToken = optionalToken(body.adminToken)
    const currentUser = c.get('user')

    const slotId = body.slotId
    if (slotId !== null && (typeof slotId !== 'string' || !slotId || slotId.length > MAX_ID_LENGTH)) {
      return c.json({ error: '確定する候補枠の指定が不正です' }, 400)
    }

    const ok = await confirmSlot(c.env.DB, eventId, adminToken, slotId, currentUser?.id)
    if (!ok) {
      return c.json({ error: '管理者権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true, confirmedSlotId: slotId })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Confirm slot error:', err)
    if (err instanceof Error && err.message === '指定されたスロットが存在しません') {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: '日程の確定に失敗しました' }, 500)
  }
})

// イベント削除（adminToken または 作成者のGitHubログインで操作可能）
api.delete('/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id')
    const body = await readOptionalJsonObject(c)
    const adminToken = optionalToken(body?.adminToken)
    const currentUser = c.get('user')

    const ok = await deleteEvent(c.env.DB, eventId, adminToken, currentUser?.id)
    if (!ok) {
      return c.json({ error: '管理者権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Delete event error:', err)
    return c.json({ error: 'イベントの削除に失敗しました' }, 500)
  }
})

// 参加者の回答削除（参加者本人の editToken または 主催者権限で操作可能）
api.delete('/events/:id/participants/:participantId', async (c) => {
  try {
    const eventId = c.req.param('id')
    const participantId = c.req.param('participantId')
    const body = await readOptionalJsonObject(c)
    const token = optionalToken(body?.token)
    const currentUser = c.get('user')

    const ok = await deleteParticipant(c.env.DB, eventId, participantId, token, currentUser?.id)
    if (!ok) {
      return c.json({ error: '削除権限が確認できませんでした' }, 403)
    }

    return c.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status)
    }
    console.error('Delete participant error:', err)
    return c.json({ error: '参加者の削除に失敗しました' }, 500)
  }
})
