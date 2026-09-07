-- Applied on every startup via executescript(); keep it idempotent.

CREATE TABLE IF NOT EXISTS stations (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    stream_url         TEXT    NOT NULL,
    homepage_url       TEXT,
    favicon_url        TEXT,
    codec              TEXT,
    bitrate            INTEGER,
    radio_browser_uuid TEXT,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS now_playing (
    station_id           INTEGER PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
    raw_stream_title     TEXT,   -- shown as-is; deliberately not split into artist/title (see icy.py)
    status               TEXT    NOT NULL DEFAULT 'unknown',  -- unknown | ok | no_metadata | error
    fetched_at           TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    next_retry_at        TEXT
);

-- v2 (track history / alerts) will add:
-- CREATE TABLE track_history (station_id, raw_stream_title, first_seen, last_seen);
