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
START_TIMEOUT="${MLX_START_TIMEOUT:-900}"
LABEL="dev.aplos.mlx"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"
REPO_PLIST="$(cd "$(dirname "$0")/.." && pwd)/deploy/dev.aplos.mlx.plist"

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
for i in $(seq 1 "$START_TIMEOUT"); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/v1/models" >/dev/null 2>&1; then
    echo "OK: mlx server attivo (${i}s)"
    exit 0
  fi
  sleep 1
done
echo "Timeout dopo ${START_TIMEOUT}s: il server non risponde. Controlla ${LOG_DIR}/aplos-mlx.err.log"
exit 1
