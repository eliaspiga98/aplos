#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APLOS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="$APLOS_ROOT/var/runtime/macos-launcher"
MLX_LABEL="dev.aplos.mlx"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

log() { printf '==> %s\n' "$1"; }

terminate_tree() {
  local pid="$1"
  local child
  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  kill -TERM "$pid" 2>/dev/null || true
  for child in $children; do
    terminate_tree "$child"
  done
}

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  [[ -f "$pid_file" ]] || return 0
  local pid
  pid="$(tr -dc '0-9' <"$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    log "Chiusura $name"
    terminate_tree "$pid"
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pid_file"
}

stop_repo_listener() {
  local name="$1"
  local port="$2"
  local pid
  local command_line
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command_line" == *"$APLOS_ROOT"* ]]; then
      log "Chiusura $name avviata manualmente"
      terminate_tree "$pid"
    fi
  done
}

stop_launch_job() {
  local name="$1"
  local label="$2"
  if launchctl print "gui/$(id -u)/${label}" >/dev/null 2>&1; then
    log "Chiusura $name"
    launchctl remove "$label" >/dev/null 2>&1 || true
  fi
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Questo launcher è destinato a macOS."
  exit 1
fi

mkdir -p "$RUNTIME_DIR"
stop_launch_job "web app" "dev.aplos.web"
stop_launch_job "API" "dev.aplos.api"
stop_pid_file "web app" "$RUNTIME_DIR/web.pid"
stop_pid_file "API" "$RUNTIME_DIR/api.pid"
stop_repo_listener "web app" 5173
stop_repo_listener "API" 3001

# L'agent è specifico di Aplo's: lo fermiamo per liberare la memoria del
# modello anche se era già caricato prima dello start corrente.
if launchctl print "gui/$(id -u)/${MLX_LABEL}" >/dev/null 2>&1; then
  log "Chiusura server MLX"
  launchctl bootout "gui/$(id -u)/${MLX_LABEL}" >/dev/null 2>&1 || true
fi
rm -f "$RUNTIME_DIR/mlx-started-by-aplos"

POSTGRES_MARKER="$RUNTIME_DIR/postgres-started-by-aplos"
if [[ -f "$POSTGRES_MARKER" ]] && command -v brew >/dev/null 2>&1; then
  POSTGRES_SERVICE="$(tr -d '\r\n' <"$POSTGRES_MARKER")"
  if [[ -n "$POSTGRES_SERVICE" ]]; then
    log "Chiusura $POSTGRES_SERVICE avviato da Aplo's"
    brew services stop "$POSTGRES_SERVICE" >/dev/null
  fi
  rm -f "$POSTGRES_MARKER"
fi

log "Aplo's è stato chiuso"
