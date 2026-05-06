#!/usr/bin/env bash
#
# Backup giornaliero Aplo's: dump del database + snapshot della cartella
# allegati. Eseguito tipicamente da cron / systemd-timer.
#
# Esempio di crontab (root o utente con accesso al DB e a /var/backups/aplos):
#   0 2 * * * /opt/aplos/scripts/backup.sh >> /var/log/aplos-backup.log 2>&1
#
# Configurazione tramite variabili d'ambiente (si possono mettere in
# /etc/aplos.env e poi `set -a; source /etc/aplos.env; set +a` prima di
# lanciare):
#   APLOS_BACKUP_DIR    destinazione (default: /var/backups/aplos)
#   APLOS_RETENTION     giorni di retention (default: 30)
#   DATABASE_URL        connessione Postgres (es: postgresql://user:pwd@host/db)
#   APLOS_UPLOADS_DIR   path della cartella uploads (default: var/uploads
#                       relativa al progetto, dove "il progetto" si assume
#                       essere la directory padre dello script)
#

set -euo pipefail

BACKUP_DIR="${APLOS_BACKUP_DIR:-/var/backups/aplos}"
RETENTION_DAYS="${APLOS_RETENTION:-30}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Errore: DATABASE_URL non impostata" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPLOADS_DIR="${APLOS_UPLOADS_DIR:-$PROJECT_ROOT/var/uploads}"

mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_DIR/aplos-db-$TS.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/aplos-uploads-$TS.tar.gz"

echo "[$(date -Is)] backup in corso → $BACKUP_DIR"

# 1. Database dump (custom format compresso, più affidabile per pg_restore)
pg_dump --no-owner --no-acl --format=plain "$DATABASE_URL" | gzip -9 > "$DUMP_FILE"
echo "  ✓ db dump: $(du -h "$DUMP_FILE" | cut -f1)"

# 2. Allegati (se la cartella esiste e non è vuota)
if [[ -d "$UPLOADS_DIR" ]] && [[ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]]; then
  tar -czf "$UPLOADS_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "  ✓ uploads: $(du -h "$UPLOADS_FILE" | cut -f1)"
else
  echo "  · uploads: cartella vuota, skip"
fi

# 3. Retention
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'aplos-*.gz' -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/  − retention: /'

echo "[$(date -Is)] backup completato"
