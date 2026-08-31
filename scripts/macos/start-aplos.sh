#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APLOS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="$APLOS_ROOT/var/runtime/macos-launcher"
LOG_DIR="$APLOS_ROOT/var/logs"
LOCK_DIR="$RUNTIME_DIR/start.lock"
API_URL="http://127.0.0.1:3001/api/health"
WEB_URL="http://127.0.0.1:5173"
MLX_URL="http://127.0.0.1:8080/v1/models"
MLX_LABEL="dev.aplos.mlx"
MLX_PLIST="$HOME/Library/LaunchAgents/${MLX_LABEL}.plist"

# Finder non carica necessariamente il profilo della shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID="$(tr -dc '0-9' <"$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "Un avvio di Aplo's è già in corso."
    exit 0
  fi
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || true
  mkdir "$LOCK_DIR"
fi
printf '%s\n' "$$" >"$LOCK_DIR/pid"
trap 'rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

log() { printf '==> %s\n' "$1"; }

wait_for_url() {
  local url="$1"
  local timeout="$2"
  local elapsed=0
  while (( elapsed < timeout )); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

brew_service_status() {
  local service="$1"
  brew services list 2>/dev/null | awk -v wanted="$service" '$1 == wanted { print $2; found=1 } END { if (!found) print "missing" }'
}

postgres_ready() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1
  else
    nc -z 127.0.0.1 5432 >/dev/null 2>&1
  fi
}

find_postgres_service() {
  local service
  for service in postgresql@16 postgresql@17 postgresql; do
    if brew list --versions "$service" >/dev/null 2>&1; then
      printf '%s\n' "$service"
      return 0
    fi
  done
  return 1
}

start_launch_job() {
  local name="$1"
  local label="$2"
  log "Avvio $name"
  launchctl remove "$label" >/dev/null 2>&1 || true
  launchctl submit \
    -l "$label" \
    -o "$LOG_DIR/${name}.out.log" \
    -e "$LOG_DIR/${name}.err.log" \
    -- "$SCRIPT_DIR/run-service.sh" "$name" "$APLOS_ROOT"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Questo launcher è destinato a macOS."
  exit 1
fi

for command in brew node npm curl nc; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Comando mancante: $command"
    echo "Installa i prerequisiti e riprova."
    exit 1
  fi
done

log "Controllo PostgreSQL"
if ! postgres_ready; then
  POSTGRES_SERVICE="$(find_postgres_service || true)"
  if [[ -z "$POSTGRES_SERVICE" ]]; then
    echo "PostgreSQL non è installato tramite Homebrew."
    echo "Installa postgresql@16 e riprova."
    exit 1
  fi
  if [[ "$(brew_service_status "$POSTGRES_SERVICE")" != "started" ]]; then
    brew services start "$POSTGRES_SERVICE"
    printf '%s\n' "$POSTGRES_SERVICE" >"$RUNTIME_DIR/postgres-started-by-aplos"
  fi
fi

for _ in $(seq 1 30); do
  postgres_ready && break
  sleep 1
done
if ! postgres_ready; then
  echo "PostgreSQL non risponde sulla porta 5432."
  exit 1
fi

if [[ ! -d "$APLOS_ROOT/node_modules" ]] || [[ "$APLOS_ROOT/package-lock.json" -nt "$APLOS_ROOT/node_modules/.package-lock.json" ]]; then
  log "Installazione dipendenze"
  (cd "$APLOS_ROOT" && npm ci)
fi

log "Aggiornamento database"
(cd "$APLOS_ROOT" && npm run migrate)

if wait_for_url "$MLX_URL" 1; then
  log "Server MLX già pronto"
elif [[ -f "$MLX_PLIST" ]]; then
  log "Avvio server MLX"
  if ! launchctl print "gui/$(id -u)/${MLX_LABEL}" >/dev/null 2>&1; then
    launchctl bootstrap "gui/$(id -u)" "$MLX_PLIST"
    : >"$RUNTIME_DIR/mlx-started-by-aplos"
  else
    launchctl kickstart "gui/$(id -u)/${MLX_LABEL}" >/dev/null 2>&1 || true
  fi
  if ! wait_for_url "$MLX_URL" 120; then
    echo "ATTENZIONE: MLX non è ancora pronto. L'app partirà comunque."
    echo "Controlla $HOME/Library/Logs/aplos-mlx.err.log"
  fi
else
  echo "ATTENZIONE: server MLX non configurato."
  echo "Per abilitarlo esegui una volta: scripts/install-mlx-server.sh"
fi

if wait_for_url "$API_URL" 1; then
  log "API già attiva"
else
  start_launch_job "api" "dev.aplos.api"
  if ! wait_for_url "$API_URL" 60; then
    echo "L'API non si è avviata. Controlla $LOG_DIR/api.err.log"
    exit 1
  fi
fi

if wait_for_url "$WEB_URL" 1; then
  log "Web app già attiva"
else
  start_launch_job "web" "dev.aplos.web"
  if ! wait_for_url "$WEB_URL" 60; then
    echo "La web app non si è avviata. Controlla $LOG_DIR/web.err.log"
    exit 1
  fi
fi

log "Aplo's è pronto: $WEB_URL"
if [[ "${APLOS_NO_OPEN:-0}" != "1" ]]; then
  open "$WEB_URL"
fi
