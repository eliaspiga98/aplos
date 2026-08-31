BEGIN;

ALTER TABLE operatori
  ADD COLUMN lingua TEXT NOT NULL DEFAULT 'it'
    CHECK (lingua IN ('it', 'en'));

ALTER TABLE app_settings
  ADD COLUMN config_directory TEXT NOT NULL DEFAULT '',
  ADD COLUMN uploads_directory TEXT NOT NULL DEFAULT '';

COMMIT;
