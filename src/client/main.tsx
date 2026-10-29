// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import './styles/style.css'
import { createVaporApp } from 'vue'
import { EventCreator } from './components/EventCreator'
import { EventDetailApp } from './components/EventDetailApp'
import type { EventDetail, User } from '@/shared/types'

function mountIslands() {
  // 1. イベント作成アイランド
  const creatorEl = document.getElementById('event-creator-island')
  if (creatorEl) {
    let initialUser: User | null = null
    if (creatorEl.dataset.user) {
      try {
        initialUser = JSON.parse(creatorEl.dataset.user)
      } catch (e) {
        console.error('Failed to parse initial user data:', e)
      }
    }
    createVaporApp(EventCreator, { initialUser }).mount(creatorEl)
  }

  // 2. イベント詳細・集計アイランド
  const detailEl = document.getElementById('event-detail-island')
  if (detailEl && detailEl.dataset.event) {
    try {
      const initialEvent: EventDetail = JSON.parse(detailEl.dataset.event)
      createVaporApp(EventDetailApp, { initialEvent }).mount(detailEl)
    } catch (e) {
      console.error('Failed to parse initial event data from data-event attribute:', e)
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountIslands)
} else {
  mountIslands()
}
