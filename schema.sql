-- events table
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    admin_token TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    organizer_name TEXT NOT NULL,
    confirmed_slot_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

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
