-- Configurazione dei backup PostgreSQL gestiti dal pannello amministratore.
ALTER TABLE app_settings
  ADD COLUMN backup_directory TEXT NOT NULL DEFAULT 'var/backups',
  ADD COLUMN backup_schedule TEXT NOT NULL DEFAULT 'disabled'
    CHECK (backup_schedule IN ('disabled', 'daily', 'weekly')),
  ADD COLUMN backup_retention_count INTEGER NOT NULL DEFAULT 14
    CHECK (backup_retention_count BETWEEN 1 AND 365),
  ADD COLUMN backup_last_at TIMESTAMPTZ,
  ADD COLUMN backup_last_file TEXT,
  ADD COLUMN backup_last_size_bytes BIGINT,
  ADD COLUMN backup_last_error TEXT;
