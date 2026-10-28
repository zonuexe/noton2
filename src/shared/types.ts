export type AnswerStatus = 'favorite' | 'available' | 'maybe' | 'unavailable'

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
  adminToken: string
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
