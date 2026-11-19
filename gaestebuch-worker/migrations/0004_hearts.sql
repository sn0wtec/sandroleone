ALTER TABLE entries ADD COLUMN hearts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE thoughts ADD COLUMN hearts INTEGER NOT NULL DEFAULT 0;
-- Wer schon ein Herz gegeben hat (nur täglich wechselnder IP-Prüfwert, wird nach 24 h gelöscht)
CREATE TABLE IF NOT EXISTS heart_log (
  kind       TEXT NOT NULL,
  item_id    INTEGER NOT NULL,
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (kind, item_id, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_heart_log_created ON heart_log (created_at);
