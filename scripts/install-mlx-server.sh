#!/usr/bin/env bash
# Installa mlx-lm e registra mlx_lm.server come servizio launchd locale.
# Idempotente: se l'agent esiste già, lo ricarica con la nuova config.
#
# Uso:
#   scripts/install-mlx-server.sh [MODEL_HF_ID]
# Esempio:
#   scripts/install-mlx-server.sh mlx-community/Qwen2.5-Coder-7B-Instruct-4bit
#
# Default model: mlx-community/Qwen2.5-Coder-7B-Instruct-4bit (~4.3 GB)

set -euo pipefail

MODEL="${1:-mlx-community/Qwen2.5-Coder-7B-Instruct-4bit}"
PORT="${MLX_PORT:-8080}"
LABEL="dev.aplos.mlx"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"
REPO_PLIST="$(cd "$(dirname "$0")/.." && pwd)/deploy/dev.aplos.mlx.plist"

echo "==> Verifico prerequisiti"
command -v brew >/dev/null || { echo "Homebrew non installato"; exit 1; }
command -v pipx >/dev/null || brew install pipx

echo "==> Installo mlx-lm via pipx (idempotente)"
pipx install mlx-lm >/dev/null 2>&1 || pipx upgrade mlx-lm >/dev/null 2>&1 || true

MLX_BIN="$(command -v mlx_lm.server || echo "$HOME/.local/bin/mlx_lm.server")"
[[ -x "$MLX_BIN" ]] || { echo "mlx_lm.server non trovato dopo l'installazione"; exit 1; }

echo "==> Pre-scarico modello: $MODEL"
"$(dirname "$MLX_BIN")/python" - <<PY
from huggingface_hub import snapshot_download
p = snapshot_download("${MODEL}")
print("Modello pronto:", p)
PY

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

echo "==> Attendo che mlx_lm.server risponda su http://127.0.0.1:${PORT}/v1/models"
for i in $(seq 1 60); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/v1/models" >/dev/null 2>&1; then
    echo "OK: mlx server attivo (${i}s)"
    exit 0
  fi
  sleep 1
done
echo "Timeout: il server non risponde. Controlla ${LOG_DIR}/aplos-mlx.err.log"
exit 1
