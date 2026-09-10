CREATE TABLE IF NOT EXISTS sync_vaults (
  vault TEXT PRIMARY KEY,
  blob TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_vaults_updated_at ON sync_vaults(updated_at);
