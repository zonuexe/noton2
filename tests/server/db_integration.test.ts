// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach } from 'vitest'
// @ts-expect-error Node 22+ built-in sqlite module
import { DatabaseSync } from 'node:sqlite'
import schemaSql from '../../schema.sql?raw'
import {
  upsertUser,
  getUserById,
  createEvent,
  getEventById,
  addSlotsToEvent,
  deleteSlotFromEvent,
  deleteSlotsByDate,
  updateEventDetails,
  submitResponse,
  confirmSlot,
  deleteParticipant,
  deleteEvent,
  getEventsByCreatorUserId,
} from '@/server/db/client'

/**
 * Node.js 標準の node:sqlite (DatabaseSync) を用いたインメモリ Cloudflare D1 互換アダプタ
 * 実際の schema.sql と SQL クエリ・外部キー制約・トランザクション (db.batch) を検証する
 */
function createInMemoryD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec(schemaSql)

  const createStatement = (sql: string, boundValues: any[] = []): D1PreparedStatement => {
    return {
      bind(...values: any[]) {
        return createStatement(sql, values)
      },
      async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
        const stmt = sqlite.prepare(sql)
        const row = stmt.get(...boundValues) as Record<string, any> | undefined
        if (!row) return null
        if (colName) return (row[colName] as T) ?? null
        return row as T
      },
      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        const stmt = sqlite.prepare(sql)
        const results = stmt.all(...boundValues) as T[]
        return {
          results,
          success: true,
          meta: { duration: 0, changes: 0, last_row_id: 0, served_by: 'sqlite-memory' } as any,
        }
      },
      async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        const stmt = sqlite.prepare(sql)
        const info = stmt.run(...boundValues)
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
            served_by: 'sqlite-memory',
          } as any,
        }
      },
      async raw<T = unknown[]>(): Promise<T[]> {
        return []
      },
    } as unknown as D1PreparedStatement
  }

  return {
    prepare(query: string) {
      return createStatement(query)
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN IMMEDIATE TRANSACTION;')
      try {
        const results: D1Result<T>[] = []
        for (const stmt of statements) {
          results.push(await stmt.run<T>())
        }
        sqlite.exec('COMMIT;')
        return results
      } catch (err) {
        sqlite.exec('ROLLBACK;')
        throw err
      }
    },
    async exec(query: string): Promise<D1ExecResult> {
      sqlite.exec(query)
      return { count: 1, duration: 0 }
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0)
    },
    withSession(): any {
      return this
    },
  } as unknown as D1Database
}

describe('server/db/client - 実 SQLite (schema.sql) を用いた統合テスト', () => {
  let db: D1Database

  beforeEach(() => {
    db = createInMemoryD1()
  })

  it('ユーザーの upsert と取得が正常に動作し、再ログイン時に情報が更新されること', async () => {
    const user1 = await upsertUser(db, {
      githubId: 1001,
      username: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: 'https://github.com/octocat.png',
      profileUrl: 'https://github.com/octocat',
    })

    expect(user1.id).toBe('gh_1001')
    expect(user1.username).toBe('octocat')
    expect(user1.displayName).toBe('The Octocat')

    const updated = await upsertUser(db, {
      githubId: 1001,
      username: 'octocat-renamed',
      displayName: 'New Name',
    })
    expect(updated.username).toBe('octocat-renamed')
    expect(updated.displayName).toBe('New Name')

    const fetched = await getUserById(db, 'gh_1001')
    expect(fetched?.username).toBe('octocat-renamed')
  })

  it('イベント作成時に重複スロットが排除され、トントン24時間軸順で保存・取得されること', async () => {
    const creator = await upsertUser(db, {
      githubId: 2002,
      username: 'organizer-user',
    })

    const { id, adminToken } = await createEvent(
      db,
      {
        title: '深夜枠を含むイベント',
        organizerName: '幹事さん',
        durationMinutes: 60,
        slotIntervalMinutes: 60,
        slots: [
          { slotDate: '2026-10-29', startTime: '01:00', endTime: '02:00' }, // 深夜25時
          { slotDate: '2026-10-29', startTime: '19:00', endTime: '20:00' },
          { slotDate: '2026-10-29', startTime: '19:00', endTime: '20:00' }, // 重複
          { slotDate: '2026-10-29', startTime: '00:00', endTime: '01:00' }, // 深夜24時
        ],
      },
      creator.id
    )

    const event = await getEventById(db, id, adminToken, null)
    expect(event).not.toBeNull()
    expect(event?.slots).toHaveLength(3) // 重複が排除されて3件
    // 19:00 -> 00:00(24時) -> 01:00(25時) の順になっていること
    expect(event?.slots.map((s) => s.startTime)).toEqual(['19:00', '00:00', '01:00'])
  })

  it('イベント作成時およびスロット追加時に日程名（dateTitle）が正しく保存・取得されること', async () => {
    const { id, adminToken } = await createEvent(db, {
      title: 'フェス日程調整',
      organizerName: '実行委員会',
      slots: [
        { slotDate: '2026-10-29', startTime: '15:00', endTime: '20:00', dateTitle: '前夜祭' },
        { slotDate: '2026-10-30', startTime: '09:00', endTime: '18:00', dateTitle: '本祭 DAY 1' },
      ],
    })

    const ev = await getEventById(db, id, adminToken)
    expect(ev?.slots[0].dateTitle).toBe('前夜祭')
    expect(ev?.slots[1].dateTitle).toBe('本祭 DAY 1')

    // スロット追加でも dateTitle が保存されること
    await addSlotsToEvent(
      db,
      id,
      [
        { slotDate: '2026-10-31', startTime: '09:00', endTime: '12:00', dateTitle: '会場撤収' },
      ],
      adminToken
    )

    const evUpdated = await getEventById(db, id, adminToken)
    const slotDay3 = evUpdated?.slots.find((s) => s.slotDate === '2026-10-31')
    expect(slotDay3?.dateTitle).toBe('会場撤収')
  })

  it('回答の登録・編集・重複slotId集約・不正slotId無視・参加者削除が正しく動作すること', async () => {
    const { id: eventId, adminToken } = await createEvent(db, {
      title: '回答テスト会議',
      organizerName: '主催者',
      slots: [
        { slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' },
        { slotDate: '2026-10-29', startTime: '11:00', endTime: '12:00' },
      ],
    })

    const initialEvent = await getEventById(db, eventId, adminToken)
    const slot1 = initialEvent!.slots[0].id
    const slot2 = initialEvent!.slots[1].id

    // 1. 新規回答（存在しない slotId や重複する slotId を含める）
    const { participantId, editToken } = await submitResponse(db, eventId, {
      name: '参加者タロウ',
      comment: '初回コメント',
      answers: [
        { slotId: slot1, status: 'available' },
        { slotId: slot1, status: 'maybe' }, // 同じ slotId の後勝ち上書き
        { slotId: slot2, status: 'unavailable' },
        { slotId: 'non-existent-slot', status: 'available' }, // 無視されること
      ],
    })

    const afterCreate = await getEventById(db, eventId)
    expect(afterCreate?.participants).toHaveLength(1)
    expect(afterCreate?.participants[0].name).toBe('参加者タロウ')
    expect(afterCreate?.participants[0].answers?.[slot1]).toBe('maybe')
    expect(afterCreate?.participants[0].answers?.[slot2]).toBe('unavailable')

    // 2. 誤った editToken での編集は拒否されること
    await expect(
      submitResponse(db, eventId, {
        participantId,
        editToken: 'wrong-edit-token',
        name: '乗っ取り試行',
        answers: [],
      })
    ).rejects.toThrow('編集権限がありません')

    // 3. 正しい editToken での回答更新
    await submitResponse(db, eventId, {
      participantId,
      editToken,
      name: '参加者タロウ（更新）',
      comment: '更新コメント',
      answers: [
        { slotId: slot1, status: 'available' },
        { slotId: slot2, status: 'available' },
      ],
    })

    const afterUpdate = await getEventById(db, eventId)
    expect(afterUpdate?.participants[0].name).toBe('参加者タロウ（更新）')
    expect(afterUpdate?.participants[0].answers?.[slot1]).toBe('available')
    expect(afterUpdate?.participants[0].answers?.[slot2]).toBe('available')

    // 4. 無関係なトークンでの参加者削除は失敗すること
    const badDelete = await deleteParticipant(db, eventId, participantId, 'bad-token', null)
    expect(badDelete).toBe(false)

    // 5. 本人の editToken で参加者削除が成功し、slot_answers もカスケード削除されること
    const okDelete = await deleteParticipant(db, eventId, participantId, editToken, null)
    expect(okDelete).toBe(true)

    const afterDelete = await getEventById(db, eventId)
    expect(afterDelete?.participants).toHaveLength(0)
  })

  it('主催者操作（枠追加・重複排除・日程確定・枠削除による確定自動解除・イベント削除）が正しく動作すること', async () => {
    const creator = await upsertUser(db, {
      githubId: 3003,
      username: 'boss',
    })

    const { id: eventId, adminToken } = await createEvent(
      db,
      {
        title: '管理操作テスト',
        organizerName: 'ボス',
        slots: [{ slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' }],
      },
      creator.id
    )

    // 非主催者による枠追加は拒否されること
    await expect(
      addSlotsToEvent(
        db,
        eventId,
        [{ slotDate: '2026-10-30', startTime: '10:00', endTime: '11:00' }],
        'wrong-token',
        'other-user'
      )
    ).rejects.toThrow('スロット追加の権限がありません')

    // 作成者ユーザーID（adminToken なし）で枠追加できること（同一リクエスト内の重複も排除）
    const addRes = await addSlotsToEvent(
      db,
      eventId,
      [
        { slotDate: '2026-10-29', startTime: '10:00', endTime: '11:00' }, // 既存と重複
        { slotDate: '2026-10-30', startTime: '14:00', endTime: '15:00' },
        { slotDate: '2026-10-30', startTime: '14:00', endTime: '15:00' }, // リクエスト内重複
      ],
      undefined,
      creator.id
    )
    expect(addRes.addedCount).toBe(1)

    const ev1 = await getEventById(db, eventId, adminToken)
    expect(ev1?.slots).toHaveLength(2)
    const slotDay2 = ev1!.slots.find((s) => s.slotDate === '2026-10-30')!

    // 存在しないスロットでの日程確定はエラーになること
    await expect(confirmSlot(db, eventId, adminToken, 'invalid-slot-id')).rejects.toThrow(
      '指定されたスロットが存在しません'
    )

    // 正しいスロットで日程確定できること
    const confirmed = await confirmSlot(db, eventId, adminToken, slotDay2.id)
    expect(confirmed).toBe(true)

    const ev2 = await getEventById(db, eventId)
    expect(ev2?.confirmedSlotId).toBe(slotDay2.id)

    // 確定されたスロットを含む日付を削除すると、confirmed_slot_id が自動的に NULL にリセットされること
    const delDateRes = await deleteSlotsByDate(db, eventId, '2026-10-30', adminToken)
    expect(delDateRes.deletedCount).toBe(1)

    const ev3 = await getEventById(db, eventId)
    expect(ev3?.confirmedSlotId).toBeNull()
    expect(ev3?.slots).toHaveLength(1)

    // 単一スロットの削除
    const remainingSlotId = ev3!.slots[0].id
    const delSlotOk = await deleteSlotFromEvent(db, eventId, remainingSlotId, adminToken)
    expect(delSlotOk).toBe(true)

    // イベント基本情報の更新
    const updatedOk = await updateEventDetails(
      db,
      eventId,
      { title: '改題後タイトル', durationMinutes: 90 },
      undefined,
      creator.id
    )
    expect(updatedOk).toBe(true)

    const ev4 = await getEventById(db, eventId)
    expect(ev4?.title).toBe('改題後タイトル')
    expect(ev4?.durationMinutes).toBe(90)

    // イベント削除
    const deletedEventOk = await deleteEvent(db, eventId, adminToken)
    expect(deletedEventOk).toBe(true)
    expect(await getEventById(db, eventId)).toBeNull()
  })

  it('getEventsByCreatorUserId: 主催者が作成したイベント一覧および確定ステータス・集計が正しく取得できること', async () => {
    const userA = await upsertUser(db, {
      githubId: 1001,
      username: 'alice',
      displayName: 'Alice Dev',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1001',
    })
    const userB = await upsertUser(db, {
      githubId: 1002,
      username: 'bob',
      displayName: 'Bob Dev',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1002',
    })

    // 最初は 0 件
    const initialEvents = await getEventsByCreatorUserId(db, userA.id)
    expect(initialEvents).toHaveLength(0)

    // Alice がイベントを2つ作成
    const ev1 = await createEvent(
      db,
      {
        title: 'Alice Event 1 (調整中)',
        organizerName: 'Alice',
        slots: [
          { slotDate: '2026-11-01', startTime: '10:00', endTime: '11:00', dateTitle: 'キックオフ' },
          { slotDate: '2026-11-01', startTime: '11:00', endTime: '12:00', dateTitle: 'キックオフ' },
        ],
      },
      userA.id
    )

    const ev2 = await createEvent(
      db,
      {
        title: 'Alice Event 2 (確定済み)',
        organizerName: 'Alice',
        slots: [
          { slotDate: '2026-11-05', startTime: '18:00', endTime: '19:00', dateTitle: '前夜祭' },
        ],
      },
      userA.id
    )

    // Bob がイベントを1つ作成
    await createEvent(
      db,
      {
        title: 'Bob Event',
        organizerName: 'Bob',
        slots: [{ slotDate: '2026-11-06', startTime: '12:00', endTime: '13:00' }],
      },
      userB.id
    )

    // ev2 を日程確定
    const ev2Detail = await getEventById(db, ev2.id)
    const slotToConfirm = ev2Detail!.slots[0]
    await confirmSlot(db, ev2.id, ev2.adminToken, slotToConfirm.id)

    // ev1 に回答者を1名追加
    const ev1Detail = await getEventById(db, ev1.id)
    const ev1SlotId = ev1Detail!.slots[0].id
    await submitResponse(db, ev1.id, {
      name: 'Charlie',
      answers: [{ slotId: ev1SlotId, status: 'available' }],
    })

    const aliceEvents = await getEventsByCreatorUserId(db, userA.id)
    expect(aliceEvents).toHaveLength(2)

    // 作成日時の降順
    expect(aliceEvents[0].id).toBe(ev2.id)
    expect(aliceEvents[0].title).toBe('Alice Event 2 (確定済み)')
    expect(aliceEvents[0].confirmedSlotId).toBe(slotToConfirm.id)
    expect(aliceEvents[0].confirmedSlotDate).toBe('2026-11-05')
    expect(aliceEvents[0].confirmedStartTime).toBe('18:00')
    expect(aliceEvents[0].confirmedEndTime).toBe('19:00')
    expect(aliceEvents[0].confirmedDateTitle).toBe('前夜祭')
    expect(aliceEvents[0].slotCount).toBe(1)
    expect(aliceEvents[0].participantCount).toBe(0)

    expect(aliceEvents[1].id).toBe(ev1.id)
    expect(aliceEvents[1].title).toBe('Alice Event 1 (調整中)')
    expect(aliceEvents[1].confirmedSlotId).toBeNull()
    expect(aliceEvents[1].slotCount).toBe(2)

    // Bob のイベント一覧には Bob のものだけが含まれること
    const bobEvents = await getEventsByCreatorUserId(db, userB.id)
    expect(bobEvents).toHaveLength(1)
    expect(bobEvents[0].title).toBe('Bob Event')
  })
})
