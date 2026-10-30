// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type {
  AdminEventSummary,
  AdminStats,
  AdminUserSummary,
  CreateEventInput,
  CreatorProfile,
  EventDetail,
  Participant,
  SubmitResponseInput,
  TimeSlot,
  User,
  UserCreatedEventSummary,
  UserParticipatedEventSummary,
} from '@/shared/types'
import { compareSlots } from '@/shared/time'
import { timingSafeEqual } from '../crypto'

// URL用の短縮ランダムID生成 (8文字)
// 紛らわしい文字(0, o, 1, l, i)を除いた31文字。リジェクションサンプリングによりモジュロバイアスを完全排除
export function generateShortId(length = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const maxByte = 256 - (256 % chars.length)
  let result = ''
  while (result.length < length) {
    const randomBytes = new Uint8Array(length - result.length + 4)
    crypto.getRandomValues(randomBytes)
    for (let i = 0; i < randomBytes.length; i++) {
      if (randomBytes[i] < maxByte) {
        result += chars[randomBytes[i] % chars.length]
        if (result.length === length) break
      }
    }
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

  const isTokenAdmin = timingSafeEqual(adminToken, event.admin_token)
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

  const statements: D1PreparedStatement[] = [
    db
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
      ),
  ]

  // スロットの重複を排除し、トントン24時間軸でソートしてから保存
  if (input.slots && input.slots.length > 0) {
    const seen = new Set<string>()
    const uniqueSlots: Array<{
      slotDate: string
      startTime: string
      endTime: string
      dateTitle?: string | null
    }> = []
    for (const slot of input.slots) {
      const key = `${slot.slotDate}_${slot.startTime}_${slot.endTime}`
      if (seen.has(key)) continue
      seen.add(key)
      uniqueSlots.push(slot)
    }

    uniqueSlots.sort(compareSlots)

    for (let idx = 0; idx < uniqueSlots.length; idx++) {
      const slot = uniqueSlots[idx]
      const slotId = generateShortId(10)
      statements.push(
        db
          .prepare(
            `INSERT INTO time_slots (id, event_id, slot_date, start_time, end_time, date_title, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            slotId,
            eventId,
            slot.slotDate,
            slot.startTime,
            slot.endTime,
            slot.dateTitle?.trim() || null,
            idx
          )
      )
    }
  }

  // events と time_slots を単一トランザクションでアトミックに保存
  await db.batch(statements)

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
  const isTokenAdmin = timingSafeEqual(adminToken, eventRow.admin_token)
  const isUserAdmin = Boolean(
    currentUserId && eventRow.creator_user_id && currentUserId === eventRow.creator_user_id
  )
  const isOrganizer = isTokenAdmin || isUserAdmin

  // スロット取得 (日付、開始時刻順で厳密に並び替え)
  const slotRows = await db
    .prepare(
      `SELECT id, event_id, slot_date, start_time, end_time, date_title, sort_order
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
      date_title: string | null
      sort_order: number
    }>()

  const slots: TimeSlot[] = (slotRows.results || [])
    .map((row) => ({
      id: row.id,
      eventId: row.event_id,
      slotDate: row.slot_date,
      startTime: row.start_time,
      endTime: row.end_time,
      dateTitle: row.date_title || null,
      sortOrder: row.sort_order,
    }))
    .sort(compareSlots)

  // 参加者取得 (回答者に紐付くGitHubユーザー情報も合わせて取得)
  const participantRows = await db
    .prepare(
      `SELECT
         p.id, p.event_id, p.user_id, p.name, p.comment, p.edit_token, p.created_at, p.updated_at,
         u.id as u_id, u.username as u_username, u.display_name as u_display_name,
         u.avatar_url as u_avatar_url, u.profile_url as u_profile_url
       FROM participants p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.event_id = ?
       ORDER BY p.created_at ASC`
    )
    .bind(eventId)
    .all<{
      id: string
      event_id: string
      user_id: string | null
      name: string
      comment: string | null
      edit_token: string
      created_at: string
      updated_at: string
      u_id: string | null
      u_username: string | null
      u_display_name: string | null
      u_avatar_url: string | null
      u_profile_url: string | null
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

  const participants: Participant[] = (participantRows.results || []).map((p) => {
    const isOwnerParticipant = Boolean(currentUserId && p.user_id && p.user_id === currentUserId)
    const userProfile: CreatorProfile | null = p.u_id
      ? {
          id: p.u_id,
          username: p.u_username || '',
          displayName: p.u_display_name,
          avatarUrl: p.u_avatar_url,
          profileUrl: p.u_profile_url,
        }
      : null

    return {
      id: p.id,
      eventId: p.event_id,
      userId: p.user_id || null,
      user: userProfile,
      name: p.name,
      comment: p.comment,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      answers: answersByParticipant[p.id] || {},
      editToken: isOrganizer || isOwnerParticipant ? p.edit_token : undefined,
    }
  })

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
  newSlots: Array<{
    slotDate: string
    startTime: string
    endTime: string
    dateTitle?: string | null
  }>,
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

    if (existingSet.size >= 500) {
      throw new Error('候補日時は合計500件までしか登録できません')
    }
    existingSet.add(key)

    const slotId = generateShortId(10)
    statements.push(
      db
        .prepare(
          `INSERT INTO time_slots (id, event_id, slot_date, start_time, end_time, date_title, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          slotId,
          eventId,
          s.slotDate,
          s.startTime,
          s.endTime,
          s.dateTitle?.trim() || null,
          existingSet.size - 1
        )
    )
    addedCount++
  }

  if (statements.length > 0) {
    statements.push(
      db.prepare(`UPDATE events SET updated_at = datetime('now') WHERE id = ?`).bind(eventId)
    )
    await db.batch(statements)
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

  // 確定スロットが削除対象の場合、確定状態を解除
  await db
    .prepare(
      `UPDATE events
       SET confirmed_slot_id = NULL, updated_at = datetime('now')
       WHERE id = ? AND confirmed_slot_id = ?`
    )
    .bind(eventId, slotId)
    .run()

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

  // 確定スロットが該当日のスロットに含まれていた場合、確定状態を解除
  await db
    .prepare(
      `UPDATE events
       SET confirmed_slot_id = NULL, updated_at = datetime('now')
       WHERE id = ? AND confirmed_slot_id IN (
         SELECT id FROM time_slots WHERE slot_date = ? AND event_id = ?
       )`
    )
    .bind(eventId, slotDate, eventId)
    .run()

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
  input: SubmitResponseInput,
  currentUserId?: string | null
): Promise<{ participantId: string; editToken: string; userId: string | null }> {
  // イベントの存在確認
  const eventExists = await db
    .prepare(`SELECT id FROM events WHERE id = ?`)
    .bind(eventId)
    .first()

  if (!eventExists) {
    throw new Error('指定されたイベントが見つかりません')
  }

  // 当該イベントに属する有効なスロット一覧を取得
  const validSlotRows = await db
    .prepare(`SELECT id FROM time_slots WHERE event_id = ?`)
    .bind(eventId)
    .all<{ id: string }>()
  const validSlotIds = new Set((validSlotRows.results || []).map((s) => s.id))

  let participantId = input.participantId
  let editToken = input.editToken
  let nextUserId: string | null = currentUserId || null
  const statements: D1PreparedStatement[] = []

  if (participantId) {
    // 既存回答の更新: editToken 一致 または 本人ログイン (user_id === currentUserId) を検証
    const existing = await db
      .prepare(`SELECT id, user_id, edit_token FROM participants WHERE id = ? AND event_id = ?`)
      .bind(participantId, eventId)
      .first<{ id: string; user_id: string | null; edit_token: string }>()

    const isTokenValid = timingSafeEqual(editToken, existing?.edit_token)
    const isUserOwner = Boolean(
      currentUserId && existing && existing.user_id && existing.user_id === currentUserId
    )

    if (!existing || (!isTokenValid && !isUserOwner)) {
      throw new Error('編集権限がありません')
    }

    // すでに別のアカウントに紐付いている回答を、別ユーザーが editToken 経由で自身のアカウントに上書き・乗っ取ることを防止
    if (existing.user_id && currentUserId && existing.user_id !== currentUserId) {
      throw new Error('この回答は別のアカウントに紐付いています')
    }

    // 既存の user_id があれば維持し、未ログイン回答だった場合は今回ログイン中の currentUserId を紐付ける
    nextUserId = existing.user_id || currentUserId || null
    editToken = existing.edit_token

    statements.push(
      db
        .prepare(
          `UPDATE participants
           SET name = ?, comment = ?, user_id = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(input.name.trim(), input.comment?.trim() || null, nextUserId, participantId)
    )

    // 既存回答削除
    statements.push(
      db.prepare(`DELETE FROM slot_answers WHERE participant_id = ?`).bind(participantId)
    )
  } else {
    // 参加者上限チェック (1イベントあたり最大300名)
    const countRow = await db
      .prepare(`SELECT COUNT(*) as count FROM participants WHERE event_id = ?`)
      .bind(eventId)
      .first<{ count: number }>()

    if (countRow && countRow.count >= 300) {
      throw new Error('このイベントの回答者数が上限（300名）に達しています')
    }

    // 新規参加者作成
    participantId = generateShortId(10)
    editToken = generateToken()
    nextUserId = currentUserId || null

    statements.push(
      db
        .prepare(
          `INSERT INTO participants (id, event_id, user_id, name, comment, edit_token)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          participantId,
          eventId,
          nextUserId,
          input.name.trim(),
          input.comment?.trim() || null,
          editToken
        )
    )
  }

  // 有効なステータス定義
  const validStatuses = new Set(['favorite', 'available', 'maybe', 'unavailable'])

  // 各独立スロットへの回答を登録 (重複 slotId は最後のステータスに集約し、イベントに実在するスロットのみ対象)
  if (input.answers && input.answers.length > 0) {
    const uniqueAnswers = new Map<string, string>()
    for (const ans of input.answers) {
      if (ans.slotId && validSlotIds.has(ans.slotId) && validStatuses.has(ans.status)) {
        uniqueAnswers.set(ans.slotId, ans.status)
      }
    }

    for (const [slotId, status] of uniqueAnswers.entries()) {
      const answerId = generateShortId(12)
      statements.push(
        db
          .prepare(
            `INSERT INTO slot_answers (id, participant_id, slot_id, status)
             VALUES (?, ?, ?, ?)`
          )
          .bind(answerId, participantId, slotId, status)
      )
    }
  }

  // UPDATE/INSERT/DELETE を同一トランザクションでアトミックに実行（失敗時のデータ全損を防止）
  if (statements.length > 0) {
    statements.push(
      db.prepare(`UPDATE events SET updated_at = datetime('now') WHERE id = ?`).bind(eventId)
    )
    await db.batch(statements)
  }

  return { participantId, editToken, userId: nextUserId }
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

  // 指定された slotId がそのイベントに実在するかチェック (null の場合は確定解除なのでOK)
  if (slotId) {
    const slotExists = await db
      .prepare(`SELECT id FROM time_slots WHERE id = ? AND event_id = ?`)
      .bind(slotId, eventId)
      .first()

    if (!slotExists) {
      throw new Error('指定されたスロットが存在しません')
    }
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

  const isTokenAdmin = timingSafeEqual(token, event?.admin_token)
  const isUserAdmin = Boolean(
    currentUserId && event?.creator_user_id && currentUserId === event.creator_user_id
  )
  const isAdmin = isTokenAdmin || isUserAdmin

  if (!isAdmin) {
    // 編集トークンも他のトークンと同様に定時間比較で検証する (SQL の = 比較に委ねない)
    const participant = await db
      .prepare(`SELECT user_id, edit_token FROM participants WHERE id = ? AND event_id = ?`)
      .bind(participantId, eventId)
      .first<{ user_id: string | null; edit_token: string }>()
    if (!participant) return false

    const isTokenOwner = timingSafeEqual(token, participant.edit_token)
    const isUserOwner = Boolean(
      currentUserId && participant.user_id && participant.user_id === currentUserId
    )
    if (!isTokenOwner && !isUserOwner) return false
  }

  const res = await db
    .prepare(`DELETE FROM participants WHERE id = ? AND event_id = ?`)
    .bind(participantId, eventId)
    .run()
  return res.meta.changes > 0
}

export async function getEventsByCreatorUserId(
  db: D1Database,
  userId: string
): Promise<UserCreatedEventSummary[]> {
  interface EventRow {
    id: string
    title: string
    description: string | null
    organizer_name: string
    confirmed_slot_id: string | null
    confirmed_slot_date: string | null
    confirmed_start_time: string | null
    confirmed_end_time: string | null
    confirmed_date_title: string | null
    created_at: string
    updated_at: string
    slot_count: number
    participant_count: number
  }

  const { results } = await db
    .prepare(
      `SELECT
        e.id,
        e.title,
        e.description,
        e.organizer_name,
        e.confirmed_slot_id,
        ts.slot_date as confirmed_slot_date,
        ts.start_time as confirmed_start_time,
        ts.end_time as confirmed_end_time,
        ts.date_title as confirmed_date_title,
        e.created_at,
        e.updated_at,
        (SELECT COUNT(*) FROM time_slots WHERE event_id = e.id) as slot_count,
        (SELECT COUNT(*) FROM participants WHERE event_id = e.id) as participant_count
      FROM events e
      LEFT JOIN time_slots ts ON e.confirmed_slot_id = ts.id
      WHERE e.creator_user_id = ?
      ORDER BY e.created_at DESC, e.rowid DESC`
    )
    .bind(userId)
    .all<EventRow>()

  return (results || []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    organizerName: row.organizer_name,
    confirmedSlotId: row.confirmed_slot_id,
    confirmedSlotDate: row.confirmed_slot_date,
    confirmedStartTime: row.confirmed_start_time,
    confirmedEndTime: row.confirmed_end_time,
    confirmedDateTitle: row.confirmed_date_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slotCount: Number(row.slot_count || 0),
    participantCount: Number(row.participant_count || 0),
  }))
}

export async function getParticipatedEventsByUserId(
  db: D1Database,
  userId: string
): Promise<UserParticipatedEventSummary[]> {
  interface ParticipatedRow {
    id: string
    title: string
    description: string | null
    organizer_name: string
    confirmed_slot_id: string | null
    confirmed_slot_date: string | null
    confirmed_start_time: string | null
    confirmed_end_time: string | null
    confirmed_date_title: string | null
    participant_id: string
    participant_name: string
    responded_at: string
    slot_count: number
    participant_count: number
  }

  const { results } = await db
    .prepare(
      `SELECT
        e.id,
        e.title,
        e.description,
        e.organizer_name,
        e.confirmed_slot_id,
        ts.slot_date as confirmed_slot_date,
        ts.start_time as confirmed_start_time,
        ts.end_time as confirmed_end_time,
        ts.date_title as confirmed_date_title,
        p.id as participant_id,
        p.name as participant_name,
        p.updated_at as responded_at,
        (SELECT COUNT(*) FROM time_slots WHERE event_id = e.id) as slot_count,
        (SELECT COUNT(*) FROM participants WHERE event_id = e.id) as participant_count
      FROM participants p
      JOIN events e ON p.event_id = e.id
      LEFT JOIN time_slots ts ON e.confirmed_slot_id = ts.id
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC, p.rowid DESC`
    )
    .bind(userId)
    .all<ParticipatedRow>()

  return (results || []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    organizerName: row.organizer_name,
    confirmedSlotId: row.confirmed_slot_id,
    confirmedSlotDate: row.confirmed_slot_date,
    confirmedStartTime: row.confirmed_start_time,
    confirmedEndTime: row.confirmed_end_time,
    confirmedDateTitle: row.confirmed_date_title,
    participantId: row.participant_id,
    participantName: row.participant_name,
    respondedAt: row.responded_at,
    slotCount: Number(row.slot_count || 0),
    participantCount: Number(row.participant_count || 0),
  }))
}

export async function getAdminDashboardData(db: D1Database): Promise<{
  stats: AdminStats
  events: AdminEventSummary[]
  users: AdminUserSummary[]
}> {
  const statsRow = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM events) as total_events,
        (SELECT COUNT(*) FROM events WHERE confirmed_slot_id IS NOT NULL) as confirmed_events,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM participants) as total_participants`
    )
    .first<{
      total_events: number
      confirmed_events: number
      total_users: number
      total_participants: number
    }>()

  interface AdminEventRow {
    id: string
    title: string
    organizer_name: string
    creator_user_id: string | null
    creator_username: string | null
    confirmed_slot_id: string | null
    slot_count: number
    participant_count: number
    created_at: string
  }

  const eventsRes = await db
    .prepare(
      `SELECT
        e.id,
        e.title,
        e.organizer_name,
        e.creator_user_id,
        u.username as creator_username,
        e.confirmed_slot_id,
        (SELECT COUNT(*) FROM time_slots WHERE event_id = e.id) as slot_count,
        (SELECT COUNT(*) FROM participants WHERE event_id = e.id) as participant_count,
        e.created_at
      FROM events e
      LEFT JOIN users u ON e.creator_user_id = u.id
      ORDER BY e.created_at DESC, e.rowid DESC
      LIMIT 100`
    )
    .all<AdminEventRow>()

  interface AdminUserRow {
    id: string
    github_id: number
    username: string
    display_name: string | null
    avatar_url: string | null
    profile_url: string | null
    created_event_count: number
    participated_event_count: number
    created_at: string
  }

  const usersRes = await db
    .prepare(
      `SELECT
        u.id,
        u.github_id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.profile_url,
        (SELECT COUNT(*) FROM events WHERE creator_user_id = u.id) as created_event_count,
        (SELECT COUNT(*) FROM participants WHERE user_id = u.id) as participated_event_count,
        u.created_at
      FROM users u
      ORDER BY u.created_at DESC, u.rowid DESC
      LIMIT 100`
    )
    .all<AdminUserRow>()

  return {
    stats: {
      totalEvents: Number(statsRow?.total_events || 0),
      confirmedEvents: Number(statsRow?.confirmed_events || 0),
      totalUsers: Number(statsRow?.total_users || 0),
      totalParticipants: Number(statsRow?.total_participants || 0),
    },
    events: (eventsRes.results || []).map((row) => ({
      id: row.id,
      title: row.title,
      organizerName: row.organizer_name,
      creatorUserId: row.creator_user_id,
      creatorUsername: row.creator_username,
      confirmedSlotId: row.confirmed_slot_id,
      slotCount: Number(row.slot_count || 0),
      participantCount: Number(row.participant_count || 0),
      createdAt: row.created_at,
    })),
    users: (usersRes.results || []).map((row) => ({
      id: row.id,
      githubId: Number(row.github_id),
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      profileUrl: row.profile_url,
      createdEventCount: Number(row.created_event_count || 0),
      participatedEventCount: Number(row.participated_event_count || 0),
      createdAt: row.created_at,
    })),
  }
}

export async function deleteEventBySystemAdmin(
  db: D1Database,
  eventId: string
): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM events WHERE id = ?`).bind(eventId).run()
  return result.meta.changes > 0
}

