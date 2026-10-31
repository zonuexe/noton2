// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { ref, type Ref } from 'vue'

export interface StoredResponse {
  participantId?: string
  editToken?: string
  name?: string
}

// eventId ごとに共有されるリアクティブ状態
const responseCache = new Map<string, Ref<StoredResponse | null>>()

export function useStoredResponse(eventId: string) {
  if (!responseCache.has(eventId)) {
    let initial: StoredResponse | null = null
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`noton2_resp_${eventId}`)
        if (raw) initial = JSON.parse(raw)
      } catch (e) {
        console.error('Failed to parse stored response:', e)
      }
    }
    responseCache.set(eventId, ref<StoredResponse | null>(initial))
  }

  const storedResponse = responseCache.get(eventId)!

  const saveStoredResponse = (data: StoredResponse) => {
    storedResponse.value = data
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`noton2_resp_${eventId}`, JSON.stringify(data))
      } catch (e) {
        console.error('Failed to save response to localStorage:', e)
      }
    }
  }

  const clearStoredResponse = () => {
    storedResponse.value = null
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`noton2_resp_${eventId}`)
      } catch (e) {
        console.error('Failed to remove response from localStorage:', e)
      }
    }
  }

  return {
    storedResponse,
    saveStoredResponse,
    clearStoredResponse,
  }
}
