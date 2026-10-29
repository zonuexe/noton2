-- This Source Code Form is subject to the terms of the Mozilla Public
-- License, v. 2.0. If a copy of the MPL was not distributed with this
-- file, You can obtain one at https://mozilla.org/MPL/2.0/.

-- users table (GitHub OAuth 連携ユーザー)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    github_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    profile_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- events table
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    admin_token TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    organizer_name TEXT NOT NULL,
    creator_user_id TEXT,
    confirmed_slot_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(creator_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_events_creator ON events(creator_user_id);

-- time_slots table
CREATE TABLE IF NOT EXISTS time_slots (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    slot_date TEXT NOT NULL,       -- 'YYYY-MM-DD'
    start_time TEXT NOT NULL,      -- 'HH:mm'
    end_time TEXT NOT NULL,        -- 'HH:mm'
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_time_slots_event ON time_slots(event_id);

-- participants table
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    comment TEXT,
    edit_token TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_event ON participants(event_id);

-- slot_answers table
CREATE TABLE IF NOT EXISTS slot_answers (
    id TEXT PRIMARY KEY,
    participant_id TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('favorite', 'available', 'maybe', 'unavailable')),
    FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE,
    FOREIGN KEY(slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
    UNIQUE(participant_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_answers_participant ON slot_answers(participant_id);
CREATE INDEX IF NOT EXISTS idx_slot_answers_slot ON slot_answers(slot_id);
