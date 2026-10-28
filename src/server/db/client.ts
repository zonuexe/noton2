import type {
  CreateEventInput,
  EventDetail,
  Participant,
  SubmitResponseInput,
  TimeSlot,
} from '@/shared/types'

// URL用の短縮ランダムID生成 (8文字)
export function generateShortId(length = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const randomBytes = new Uint8Array(length)
  crypto.getRandomValues(randomBytes)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length]
  }
  return result
}

// 認証・編集用セキュアトークン
export function generateToken(): string {
  return crypto.randomUUID()
}

export async function createEvent(
  db: D1Database,
  input: CreateEventInput
): Promise<{ id: string; adminToken: string }> {
  const eventId = generateShortId(8)
  const adminToken = generateToken()

  // 1. events テーブルに挿入
  await db
    .prepare(
      `INSERT INTO events (id, admin_token, title, description, organizer_name)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      adminToken,
      input.title.trim(),
      input.description?.trim() || null,
      input.organizerName.trim()
    )
    .run()

  // 2. time_slots テーブルに挿入
  if (input.slots && input.slots.length > 0) {
    const slotStatements = input.slots.map((slot, idx) => {
      const slotId = generateShortId(10)
      return db
        .prepare(
          `INSERT INTO time_slots (id, event_id, slot_date, start_time, end_time, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(slotId, eventId, slot.slotDate, slot.startTime, slot.endTime, idx)
    })
    await db.batch(slotStatements)
  }

  return { id: eventId, adminToken }
}

export async function getEventById(
  db: D1Database,
  eventId: string,
  adminToken?: string
): Promise<EventDetail | null> {
  const eventRow = await db
    .prepare(
      `SELECT id, admin_token, title, description, organizer_name, confirmed_slot_id, created_at, updated_at
       FROM events WHERE id = ?`
    )
    .bind(eventId)
    .first<{
      id: string
      admin_token: string
      title: string
      description: string | null
      organizer_name: string
      confirmed_slot_id: string | null
      created_at: string
      updated_at: string
    }>()

  if (!eventRow) {
    return null
  }

  // スロット取得 (日付、開始時刻、ソート順で並び替え)
  const slotRows = await db
    .prepare(
      `SELECT id, event_id, slot_date, start_time, end_time, sort_order
       FROM time_slots
       WHERE event_id = ?
       ORDER BY slot_date ASC, start_time ASC, sort_order ASC`
    )
    .bind(eventId)
    .all<{
      id: string
      event_id: string
      slot_date: string
      start_time: string
      end_time: string
      sort_order: number
    }>()

  const slots: TimeSlot[] = (slotRows.results || []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    slotDate: row.slot_date,
    startTime: row.start_time,
    endTime: row.end_time,
    sortOrder: row.sort_order,
  }))

  // 参加者取得
  const participantRows = await db
    .prepare(
      `SELECT id, event_id, name, comment, edit_token, created_at, updated_at
       FROM participants
       WHERE event_id = ?
       ORDER BY created_at ASC`
    )
    .bind(eventId)
    .all<{
      id: string
      event_id: string
      name: string
      comment: string | null
      edit_token: string
      created_at: string
      updated_at: string
    }>()

  // 各参加者の回答取得
  const answerRows = await db
    .prepare(
      `SELECT sa.participant_id, sa.slot_id, sa.status
       FROM slot_answers sa
       JOIN participants p ON sa.participant_id = p.id
       WHERE p.event_id = ?`
    )
    .bind(eventId)
    .all<{
      participant_id: string
      slot_id: string
      status: any
    }>()

  const answersByParticipant: Record<string, Record<string, any>> = {}
  for (const ans of answerRows.results || []) {
    if (!answersByParticipant[ans.participant_id]) {
      answersByParticipant[ans.participant_id] = {}
    }
    answersByParticipant[ans.participant_id][ans.slot_id] = ans.status
  }

  const participants: Participant[] = (participantRows.results || []).map((p) => ({
    id: p.id,
    eventId: p.event_id,
    name: p.name,
    comment: p.comment,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    answers: answersByParticipant[p.id] || {},
    // 管理者トークンが一致していれば edit_token も返す
    editToken: adminToken === eventRow.admin_token ? p.edit_token : undefined,
  }))

  return {
    id: eventRow.id,
    adminToken: adminToken === eventRow.admin_token ? eventRow.admin_token : undefined,
    title: eventRow.title,
    description: eventRow.description,
    organizerName: eventRow.organizer_name,
    confirmedSlotId: eventRow.confirmed_slot_id,
    createdAt: eventRow.created_at,
    updatedAt: eventRow.updated_at,
    slots,
    participants,
  }
}

export async function submitResponse(
  db: D1Database,
  eventId: string,
  input: SubmitResponseInput
): Promise<{ participantId: string; editToken: string }> {
  let participantId = input.participantId
  let editToken = input.editToken

  if (participantId && editToken) {
    // 既存回答の更新: 認証確認
    const existing = await db
      .prepare(`SELECT id FROM participants WHERE id = ? AND event_id = ? AND edit_token = ?`)
      .bind(participantId, eventId, editToken)
      .first()

    if (!existing) {
      throw new Error('編集権限がありません')
    }

    await db
      .prepare(
        `UPDATE participants
         SET name = ?, comment = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(input.name.trim(), input.comment?.trim() || null, participantId)
      .run()

    // 既存回答削除
    await db.prepare(`DELETE FROM slot_answers WHERE participant_id = ?`).bind(participantId).run()
  } else {
    // 新規参加者作成
    participantId = generateShortId(10)
    editToken = generateToken()

    await db
      .prepare(
        `INSERT INTO participants (id, event_id, name, comment, edit_token)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(participantId, eventId, input.name.trim(), input.comment?.trim() || null, editToken)
      .run()
  }

  // スロット回答の登録
  if (input.answers && input.answers.length > 0) {
    const answerStatements = input.answers.map((ans) => {
      const answerId = generateShortId(12)
      return db
        .prepare(
          `INSERT INTO slot_answers (id, participant_id, slot_id, status)
           VALUES (?, ?, ?, ?)`
        )
        .bind(answerId, participantId, ans.slotId, ans.status)
    })
    await db.batch(answerStatements)
  }

  return { participantId, editToken }
}

export async function confirmSlot(
  db: D1Database,
  eventId: string,
  adminToken: string,
  slotId: string | null
): Promise<boolean> {
  const event = await db
    .prepare(`SELECT id FROM events WHERE id = ? AND admin_token = ?`)
    .bind(eventId, adminToken)
    .first()

  if (!event) {
    return false
  }

  await db
    .prepare(
      `UPDATE events
       SET confirmed_slot_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(slotId, eventId)
    .run()

  return true
}

export async function deleteEvent(
  db: D1Database,
  eventId: string,
  adminToken: string
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM events WHERE id = ? AND admin_token = ?`)
    .bind(eventId, adminToken)
    .run()

  return result.meta.changes > 0
}

export async function deleteParticipant(
  db: D1Database,
  eventId: string,
  participantId: string,
  token: string
): Promise<boolean> {
  // adminToken または editToken のいずれかで削除可能
  const event = await db
    .prepare(`SELECT admin_token FROM events WHERE id = ?`)
    .bind(eventId)
    .first<{ admin_token: string }>()

  const isAdmin = event && event.admin_token === token

  let query: string
  if (isAdmin) {
    query = `DELETE FROM participants WHERE id = ? AND event_id = ?`
    const res = await db.prepare(query).bind(participantId, eventId).run()
    return res.meta.changes > 0
  } else {
    query = `DELETE FROM participants WHERE id = ? AND event_id = ? AND edit_token = ?`
    const res = await db.prepare(query).bind(participantId, eventId, token).run()
    return res.meta.changes > 0
  }
}
