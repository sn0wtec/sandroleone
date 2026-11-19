CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  homepage   TEXT,
  approved   INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_approved ON entries (approved, id DESC);
CREATE INDEX IF NOT EXISTS idx_entries_ip ON entries (ip_hash, created_at);
