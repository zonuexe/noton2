// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type {
  CreateEventInput,
  CreatorProfile,
  EventDetail,
  Participant,
  SubmitResponseInput,
  TimeSlot,
  User,
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

// 主催者権限チェック共通関数
export async function verifyOrganizerPermission(
  db: D1Database,
  eventId: string,
  adminToken?: string,
  currentUserId?: string | null
): Promise<{ isAuthorized: boolean; event: { id: string; admin_token: string; creator_user_id: string | null } | null }> {
  const event = await db
    .prepare(`SELECT id, admin_token, creator_user_id FROM events WHERE id = ?`)
    .bind(eventId)
    .first<{ id: string; admin_token: string; creator_user_id: string | null }>()

  if (!event) {
    return { isAuthorized: false, event: null }
  }

  const isTokenAdmin = Boolean(adminToken && adminToken === event.admin_token)
  const isUserAdmin = Boolean(
    currentUserId && event.creator_user_id && currentUserId === event.creator_user_id
  )

  return { isAuthorized: isTokenAdmin || isUserAdmin, event }
}

// ユーザーの upsert (GitHub OAuth 連携)
export async function upsertUser(
  db: D1Database,
  userData: {
    githubId: number
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    profileUrl?: string | null
  }
): Promise<User> {
  const userId = `gh_${userData.githubId}`
  await db
    .prepare(
      `INSERT INTO users (id, github_id, username, display_name, avatar_url, profile_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(github_id) DO UPDATE SET
         username = excluded.username,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         profile_url = excluded.profile_url,
         updated_at = datetime('now')`
    )
    .bind(
      userId,
      userData.githubId,
      userData.username,
      userData.displayName || null,
      userData.avatarUrl || null,
      userData.profileUrl || null
    )
    .run()

  const user = await getUserById(db, userId)
  if (!user) {
    throw new Error('ユーザー情報の保存に失敗しました')
  }
  return user
}

export async function getUserById(db: D1Database, userId: string): Promise<User | null> {
  const row = await db
    .prepare(
      `SELECT id, github_id, username, display_name, avatar_url, profile_url, created_at, updated_at
       FROM users WHERE id = ?`
    )
    .bind(userId)
    .first<{
      id: string
      github_id: number
      username: string
      display_name: string | null
      avatar_url: string | null
      profile_url: string | null
      created_at: string
      updated_at: string
    }>()

  if (!row) return null

  return {
    id: row.id,
    githubId: row.github_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createEvent(
  db: D1Database,
  input: CreateEventInput,
  creatorUserId?: string | null
): Promise<{ id: string; adminToken: string }> {
  const eventId = generateShortId(8)
  const adminToken = generateToken()
  const durationMinutes = input.durationMinutes || 60
  const slotIntervalMinutes = input.slotIntervalMinutes || 60

  // 1. events テーブルに挿入
  await db
    .prepare(
      `INSERT INTO events (id, admin_token, title, description, duration_minutes, slot_interval_minutes, organizer_name, creator_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      adminToken,
      input.title.trim(),
      input.description?.trim() || null,
      durationMinutes,
      slotIntervalMinutes,
      input.organizerName.trim(),
      creatorUserId || null
    )
    .run()

  // 2. time_slots テーブルに挿入 (各コマを独立した行として保存)
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
  adminToken?: string,
  currentUserId?: string | null
): Promise<EventDetail | null> {
  const eventRow = await db
    .prepare(
      `SELECT
         e.id,
         e.admin_token,
         e.title,
         e.description,
         e.duration_minutes,
         e.slot_interval_minutes,
         e.organizer_name,
         e.creator_user_id,
         e.confirmed_slot_id,
         e.created_at,
         e.updated_at,
         u.id as u_id,
         u.username as u_username,
         u.display_name as u_display_name,
         u.avatar_url as u_avatar_url,
         u.profile_url as u_profile_url
       FROM events e
       LEFT JOIN users u ON e.creator_user_id = u.id
       WHERE e.id = ?`
    )
    .bind(eventId)
    .first<{
      id: string
      admin_token: string
      title: string
      description: string | null
      duration_minutes: number | null
      slot_interval_minutes: number | null
      organizer_name: string
      creator_user_id: string | null
      confirmed_slot_id: string | null
      created_at: string
      updated_at: string
      u_id: string | null
      u_username: string | null
      u_display_name: string | null
      u_avatar_url: string | null
      u_profile_url: string | null
    }>()

  if (!eventRow) {
    return null
  }

  // 主催者・管理者判定
  const isTokenAdmin = Boolean(adminToken && adminToken === eventRow.admin_token)
  const isUserAdmin = Boolean(
    currentUserId && eventRow.creator_user_id && currentUserId === eventRow.creator_user_id
  )
  const isOrganizer = isTokenAdmin || isUserAdmin

  // スロット取得 (日付、開始時刻順で厳密に並び替え)
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
    editToken: isOrganizer ? p.edit_token : undefined,
  }))

  const creator: CreatorProfile | null = eventRow.u_id
    ? {
        id: eventRow.u_id,
        username: eventRow.u_username || '',
        displayName: eventRow.u_display_name,
        avatarUrl: eventRow.u_avatar_url,
        profileUrl: eventRow.u_profile_url,
      }
    : null

  return {
    id: eventRow.id,
    adminToken: isOrganizer ? eventRow.admin_token : undefined,
    title: eventRow.title,
    description: eventRow.description,
    durationMinutes: eventRow.duration_minutes || 60,
    slotIntervalMinutes: eventRow.slot_interval_minutes || 60,
    organizerName: eventRow.organizer_name,
    creatorUserId: eventRow.creator_user_id,
    creator,
    isOrganizer,
    confirmedSlotId: eventRow.confirmed_slot_id,
    createdAt: eventRow.created_at,
    updatedAt: eventRow.updated_at,
    slots,
    participants,
  }
}

// スロットの追加 (主催者専用)
export async function addSlotsToEvent(
  db: D1Database,
  eventId: string,
  newSlots: Array<{ slotDate: string; startTime: string; endTime: string }>,
  adminToken?: string,
  currentUserId?: string | null
): Promise<{ addedCount: number }> {
  const { isAuthorized } = await verifyOrganizerPermission(db, eventId, adminToken, currentUserId)
  if (!isAuthorized) {
    throw new Error('スロット追加の権限がありません')
  }

  if (!newSlots || newSlots.length === 0) {
    return { addedCount: 0 }
  }

  // 既存のスロットを取得して重複を防ぐ
  const existingRows = await db
    .prepare(`SELECT slot_date, start_time, end_time FROM time_slots WHERE event_id = ?`)
    .bind(eventId)
    .all<{ slot_date: string; start_time: string; end_time: string }>()

  const existingSet = new Set(
    (existingRows.results || []).map((r) => `${r.slot_date}_${r.start_time}_${r.end_time}`)
  )

  const statements: D1PreparedStatement[] = []
  let addedCount = 0

  for (const s of newSlots) {
    const key = `${s.slotDate}_${s.startTime}_${s.endTime}`
    if (existingSet.has(key)) continue

    const slotId = generateShortId(10)
    statements.push(
      db
        .prepare(
          `INSERT INTO time_slots (id, event_id, slot_date, start_time, end_time, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(slotId, eventId, s.slotDate, s.startTime, s.endTime, 0)
    )
    addedCount++
  }

  if (statements.length > 0) {
    await db.batch(statements)
    // 更新日時を更新
    await db
      .prepare(`UPDATE events SET updated_at = datetime('now') WHERE id = ?`)
      .bind(eventId)
      .run()
  }

  return { addedCount }
}

// スロットの削除 (主催者専用)
export async function deleteSlotFromEvent(
  db: D1Database,
  eventId: string,
  slotId: string,
  adminToken?: string,
  currentUserId?: string | null
): Promise<boolean> {
  const { isAuthorized } = await verifyOrganizerPermission(db, eventId, adminToken, currentUserId)
  if (!isAuthorized) {
    throw new Error('スロット削除の権限がありません')
  }

  const res = await db
    .prepare(`DELETE FROM time_slots WHERE id = ? AND event_id = ?`)
    .bind(slotId, eventId)
    .run()

  if (res.meta.changes > 0) {
    await db
      .prepare(`UPDATE events SET updated_at = datetime('now') WHERE id = ?`)
      .bind(eventId)
      .run()
    return true
  }
  return false
}

// 特定日付の全スロット削除 (主催者専用)
export async function deleteSlotsByDate(
  db: D1Database,
  eventId: string,
  slotDate: string,
  adminToken?: string,
  currentUserId?: string | null
): Promise<{ deletedCount: number }> {
  const { isAuthorized } = await verifyOrganizerPermission(db, eventId, adminToken, currentUserId)
  if (!isAuthorized) {
    throw new Error('スロット削除の権限がありません')
  }

  const res = await db
    .prepare(`DELETE FROM time_slots WHERE slot_date = ? AND event_id = ?`)
    .bind(slotDate, eventId)
    .run()

  if (res.meta.changes > 0) {
    await db
      .prepare(`UPDATE events SET updated_at = datetime('now') WHERE id = ?`)
      .bind(eventId)
      .run()
  }
  return { deletedCount: res.meta.changes }
}

// イベント基本情報の更新 (主催者専用)
export async function updateEventDetails(
  db: D1Database,
  eventId: string,
  updates: {
    title?: string
    description?: string
    durationMinutes?: number
    organizerName?: string
  },
  adminToken?: string,
  currentUserId?: string | null
): Promise<boolean> {
  const { isAuthorized } = await verifyOrganizerPermission(db, eventId, adminToken, currentUserId)
  if (!isAuthorized) {
    throw new Error('イベント編集の権限がありません')
  }

  const fields: string[] = []
  const values: any[] = []

  if (updates.title !== undefined) {
    fields.push('title = ?')
    values.push(updates.title.trim())
  }
  if (updates.description !== undefined) {
    fields.push('description = ?')
    values.push(updates.description.trim() || null)
  }
  if (updates.durationMinutes !== undefined) {
    fields.push('duration_minutes = ?')
    values.push(updates.durationMinutes)
  }
  if (updates.organizerName !== undefined) {
    fields.push('organizer_name = ?')
    values.push(updates.organizerName.trim())
  }

  if (fields.length === 0) return true

  fields.push("updated_at = datetime('now')")
  values.push(eventId)

  const query = `UPDATE events SET ${fields.join(', ')} WHERE id = ?`
  const res = await db.prepare(query).bind(...values).run()
  return res.meta.changes > 0
}

export async function submitResponse(
  db: D1Database,
  eventId: string,
  input: SubmitResponseInput
): Promise<{ participantId: string; editToken: string }> {
  // イベントの存在確認
  const eventExists = await db
    .prepare(`SELECT id FROM events WHERE id = ?`)
    .bind(eventId)
    .first()

  if (!eventExists) {
    throw new Error('指定されたイベントが見つかりません')
  }

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

  // 各独立スロットへの回答を登録 (重複 slotId は最後のステータスに集約)
  if (input.answers && input.answers.length > 0) {
    const uniqueAnswers = new Map<string, string>()
    for (const ans of input.answers) {
      if (ans.slotId && ans.status) {
        uniqueAnswers.set(ans.slotId, ans.status)
      }
    }

    const answerStatements: D1PreparedStatement[] = []
    for (const [slotId, status] of uniqueAnswers.entries()) {
      const answerId = generateShortId(12)
      answerStatements.push(
        db
          .prepare(
            `INSERT INTO slot_answers (id, participant_id, slot_id, status)
             VALUES (?, ?, ?, ?)`
          )
          .bind(answerId, participantId, slotId, status)
      )
    }

    if (answerStatements.length > 0) {
      await db.batch(answerStatements)
    }
  }

  return { participantId, editToken }
}

export async function confirmSlot(
  db: D1Database,
  eventId: string,
  adminToken?: string,
  slotId?: string | null,
  currentUserId?: string | null
): Promise<boolean> {
  const { isAuthorized } = await verifyOrganizerPermission(db, eventId, adminToken, currentUserId)
  if (!isAuthorized) {
    return false
  }

  await db
    .prepare(
      `UPDATE events
       SET confirmed_slot_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(slotId ?? null, eventId)
    .run()

  return true
}

export async function deleteEvent(
  db: D1Database,
  eventId: string,
  adminToken?: string,
  currentUserId?: string | null
): Promise<boolean> {
  const { isAuthorized } = await verifyOrganizerPermission(db, eventId, adminToken, currentUserId)
  if (!isAuthorized) {
    return false
  }

  const result = await db.prepare(`DELETE FROM events WHERE id = ?`).bind(eventId).run()

  return result.meta.changes > 0
}

export async function deleteParticipant(
  db: D1Database,
  eventId: string,
  participantId: string,
  token?: string,
  currentUserId?: string | null
): Promise<boolean> {
  const event = await db
    .prepare(`SELECT admin_token, creator_user_id FROM events WHERE id = ?`)
    .bind(eventId)
    .first<{ admin_token: string; creator_user_id: string | null }>()

  const isTokenAdmin = Boolean(token && event && event.admin_token === token)
  const isUserAdmin = Boolean(
    currentUserId && event?.creator_user_id && currentUserId === event.creator_user_id
  )
  const isAdmin = isTokenAdmin || isUserAdmin

  let query: string
  if (isAdmin) {
    query = `DELETE FROM participants WHERE id = ? AND event_id = ?`
    const res = await db.prepare(query).bind(participantId, eventId).run()
    return res.meta.changes > 0
  } else if (token) {
    query = `DELETE FROM participants WHERE id = ? AND event_id = ? AND edit_token = ?`
    const res = await db.prepare(query).bind(participantId, eventId, token).run()
    return res.meta.changes > 0
  }
  return false
}
