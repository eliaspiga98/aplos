#!/usr/bin/env bash
#
# Backup giornaliero Aplo's: dump del database + snapshot della cartella
# allegati. Eseguito tipicamente da systemd-timer (vedi
# deploy/aplos-backup.timer) o crontab.
#
# Esempio crontab:
#   0 2 * * * /opt/aplos/scripts/backup.sh >> /var/log/aplos-backup.log 2>&1
#
# Configurazione tramite variabili d'ambiente (sourcable da /etc/aplos.env
# oppure passate da systemd EnvironmentFile):
#
#   APLOS_BACKUP_DIR     destinazione (default: /var/backups/aplos)
#   APLOS_RETENTION      giorni di retention (default: 30)
#   DATABASE_URL         connessione Postgres (es: postgresql://user:pwd@host/db)
#   APLOS_UPLOADS_DIR    path della cartella uploads (default: var/uploads
#                        relativa al progetto)
#
# Cifratura GPG (PROGETTO.md §2 — i backup contengono dati sanitari di
# pazienti, devono essere cifrati prima di lasciare la macchina). Modalità
# in ordine di precedenza:
#
#   1. APLOS_GPG_RECIPIENT     fingerprint o email di una chiave pubblica già
#                              importata nel keyring dell'utente che esegue
#                              lo script. → cifratura asimmetrica, scelta
#                              consigliata: la chiave privata vive altrove.
#
#   2. APLOS_GPG_PASSPHRASE_FILE  file (mode 600) contenente la passphrase.
#                                 → cifratura simmetrica AES256.
#
#   Se nessuna delle due è impostata: ABORT (no fallback in chiaro).
#   Per disattivare esplicitamente la cifratura — solo per dev/test —
#   impostare APLOS_BACKUP_INSECURE=1.
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

# --- modalità cifratura ---------------------------------------------------
GPG_MODE=""
if [[ -n "${APLOS_GPG_RECIPIENT:-}" ]]; then
  GPG_MODE="recipient"
elif [[ -n "${APLOS_GPG_PASSPHRASE_FILE:-}" ]]; then
  if [[ ! -r "${APLOS_GPG_PASSPHRASE_FILE}" ]]; then
    echo "Errore: APLOS_GPG_PASSPHRASE_FILE non leggibile: ${APLOS_GPG_PASSPHRASE_FILE}" >&2
    exit 1
  fi
  GPG_MODE="passphrase"
elif [[ "${APLOS_BACKUP_INSECURE:-0}" == "1" ]]; then
  GPG_MODE="none"
  echo "ATTENZIONE: APLOS_BACKUP_INSECURE=1 → backup NON cifrati. Solo per dev/test." >&2
else
  echo "Errore: nessun metodo di cifratura configurato." >&2
  echo "  Imposta APLOS_GPG_RECIPIENT (consigliato) o APLOS_GPG_PASSPHRASE_FILE." >&2
  echo "  Per dev/test: APLOS_BACKUP_INSECURE=1 (backup in chiaro)." >&2
  exit 1
fi

if [[ "$GPG_MODE" != "none" ]] && ! command -v gpg >/dev/null 2>&1; then
  echo "Errore: gpg non installato (apt install gnupg)" >&2
  exit 1
fi

# write_encrypted <destination>: legge stdin, scrive in <destination>.
# A seconda di GPG_MODE: cifra (recipient/passphrase) o passa attraverso.
write_encrypted() {
  local out="$1"
  case "$GPG_MODE" in
    recipient)
      gpg --batch --yes --trust-model always \
          --recipient "$APLOS_GPG_RECIPIENT" \
          --encrypt --output "$out"
      ;;
    passphrase)
      gpg --batch --yes \
          --pinentry-mode loopback \
          --passphrase-file "$APLOS_GPG_PASSPHRASE_FILE" \
          --symmetric --cipher-algo AES256 \
          --output "$out"
      ;;
    none)
      cat > "$out"
      ;;
  esac
}

mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
SUFFIX=""
[[ "$GPG_MODE" != "none" ]] && SUFFIX=".gpg"
DUMP_FILE="$BACKUP_DIR/aplos-db-$TS.sql.gz${SUFFIX}"
UPLOADS_FILE="$BACKUP_DIR/aplos-uploads-$TS.tar.gz${SUFFIX}"

echo "[$(date -Is)] backup in corso → $BACKUP_DIR (cifratura: $GPG_MODE)"

# 1. Database dump
pg_dump --no-owner --no-acl --format=plain "$DATABASE_URL" \
  | gzip -9 \
  | write_encrypted "$DUMP_FILE"
echo "  ✓ db dump: $(du -h "$DUMP_FILE" | cut -f1)"

# 2. Allegati (se la cartella esiste e non è vuota)
if [[ -d "$UPLOADS_DIR" ]] && [[ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]]; then
  tar -czf - -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" \
    | write_encrypted "$UPLOADS_FILE"
  echo "  ✓ uploads: $(du -h "$UPLOADS_FILE" | cut -f1)"
else
  echo "  · uploads: cartella vuota, skip"
fi

# 3. Retention (cancella sia .gz sia .gz.gpg)
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'aplos-*.gz' -o -name 'aplos-*.gz.gpg' \) \
  -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/  − retention: /'

echo "[$(date -Is)] backup completato"
