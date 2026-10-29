// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export type AnswerStatus = 'favorite' | 'available' | 'maybe' | 'unavailable'

export interface User {
  id: string
  githubId: number
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  profileUrl?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatorProfile {
  id: string
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  profileUrl?: string | null
}

export interface TimeSlot {
  id: string
  eventId: string
  slotDate: string // 'YYYY-MM-DD'
  startTime: string // 'HH:mm'
  endTime: string // 'HH:mm'
  sortOrder: number
}

export interface SlotAnswer {
  id: string
  participantId: string
  slotId: string
  status: AnswerStatus
}

export interface Participant {
  id: string
  eventId: string
  name: string
  comment?: string | null
  editToken?: string
  createdAt: string
  updatedAt: string
  answers?: Record<string, AnswerStatus> // slotId -> status
}

export interface EventDetail {
  id: string
  adminToken?: string
  title: string
  description?: string | null
  organizerName: string
  creatorUserId?: string | null
  creator?: CreatorProfile | null
  isOrganizer?: boolean
  confirmedSlotId?: string | null
  createdAt: string
  updatedAt: string
  slots: TimeSlot[]
  participants: Participant[]
}

export interface CreateEventInput {
  title: string
  description?: string
  organizerName: string
  creatorUserId?: string
  slots: {
    slotDate: string
    startTime: string
    endTime: string
  }[]
}

export interface SubmitResponseInput {
  participantId?: string // 既存回答の更新用
  editToken?: string // 既存回答の認証用
  name: string
  comment?: string
  answers: {
    slotId: string
    status: AnswerStatus
  }[]
}

export interface ConfirmSlotInput {
  adminToken?: string
  slotId: string | null // null で解除
}

export interface SlotScore {
  slotId: string
  score: number
  favoriteCount: number
  availableCount: number
  maybeCount: number
  unavailableCount: number
  totalResponses: number
}
