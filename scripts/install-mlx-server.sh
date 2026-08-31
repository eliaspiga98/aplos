#!/usr/bin/env bash
# Installa mlx-vlm e registra mlx_vlm.server come servizio launchd locale.
# Idempotente: se l'agent esiste già, lo ricarica con la nuova config.
#
# Uso:
#   scripts/install-mlx-server.sh [MODEL_HF_ID]
# Esempio:
#   scripts/install-mlx-server.sh mlx-community/Qwen3.5-9B-MLX-4bit
#
# Default model: mlx-community/Qwen3.5-9B-MLX-4bit (~6 GB)

set -euo pipefail

MODEL="${1:-mlx-community/Qwen3.5-9B-MLX-4bit}"
PORT="${MLX_PORT:-8080}"
# Il primo download può richiedere molto più di 15 minuti su connessioni lente.
# Con 0 si attende fino al completamento; un valore positivo imposta un limite
# esplicito in secondi, utile solo per diagnosi automatizzate.
START_TIMEOUT="${MLX_START_TIMEOUT:-0}"
LABEL="dev.aplos.mlx"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"
REPO_PLIST="$(cd "$(dirname "$0")/.." && pwd)/deploy/dev.aplos.mlx.plist"
MODEL_CACHE_DIR="$HOME/.cache/huggingface/hub/models--${MODEL//\//--}"
# Stima prudenziale: il modello Qwen3.5 9B MLX 4-bit occupa circa 6 GiB.
MODEL_ESTIMATED_BYTES=$((6 * 1024 * 1024 * 1024))

show_download_status() {
  local downloaded=0
  local percent=0
  local phase="caricamento del modello"

  if [[ -d "$MODEL_CACHE_DIR" ]]; then
    downloaded="$(du -sk "$MODEL_CACHE_DIR" 2>/dev/null | awk 'NR == 1 { print $1 * 1024 }')"
    downloaded="${downloaded:-0}"
    percent=$((downloaded * 100 / MODEL_ESTIMATED_BYTES))
    (( percent > 99 )) && percent=99
    if find "$MODEL_CACHE_DIR" -name '*.incomplete' -print -quit 2>/dev/null | grep -q .; then
      phase="download in corso"
    fi
  fi

  printf '    Stato: %s — %.1f GB di circa 6 GB (%s%%)\n' \
    "$phase" "$(awk -v bytes="$downloaded" 'BEGIN { printf "%.1f", bytes / 1024 / 1024 / 1024 }')" "$percent"
}

echo "==> Verifico prerequisiti"
[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] || {
  echo "MLX richiede macOS su Apple Silicon. Su Windows/Linux usa Ollama."
  exit 1
}
command -v brew >/dev/null || { echo "Homebrew non installato"; exit 1; }
command -v pipx >/dev/null || brew install pipx

echo "==> Installo mlx-vlm via pipx (idempotente)"
pipx install mlx-vlm >/dev/null 2>&1 || pipx upgrade mlx-vlm >/dev/null

MLX_BIN="$(command -v mlx_vlm.server || echo "$HOME/.local/bin/mlx_vlm.server")"
[[ -x "$MLX_BIN" ]] || { echo "mlx_vlm.server non trovato dopo l'installazione"; exit 1; }

echo "==> Genero plist launchd"
mkdir -p "$LOG_DIR" "$(dirname "$PLIST_DST")"
sed \
  -e "s|__MLX_SERVER_BIN__|${MLX_BIN}|g" \
  -e "s|__MLX_MODEL__|${MODEL}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$REPO_PLIST" > "$PLIST_DST"

echo "==> Ricarico agent launchd"
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo "==> Attendo mlx_vlm.server; al primo avvio scarica circa 6 GB da Hugging Face"
echo "    La finestra resta aperta durante il download e ti avviserà quando è pronto."
show_download_status
i=0
while true; do
  if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/v1/models" >/dev/null 2>&1; then
    echo "OK: mlx server attivo (${i}s)"
    osascript -e 'display notification "Il modello è pronto. Ora puoi avviare Aplo’\''s." with title "Aplo’\''s" sound name "Glass"' >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
  i=$((i + 1))
  if (( i > 0 && i % 15 == 0 )); then
    show_download_status
  fi
  if (( START_TIMEOUT > 0 && i >= START_TIMEOUT )); then
    echo "Timeout dopo ${START_TIMEOUT}s: il download può continuare in background."
    echo "Controlla ${LOG_DIR}/aplos-mlx.err.log"
    exit 1
  fi
done
