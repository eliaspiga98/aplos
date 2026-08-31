#!/usr/bin/env bash

set -euo pipefail

SERVICE="${1:-}"
APLOS_ROOT="${2:-}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

[[ -d "$APLOS_ROOT" ]] || { echo "Repository Aplo's non trovato: $APLOS_ROOT"; exit 1; }
cd "$APLOS_ROOT"

case "$SERVICE" in
  api)
    exec npm run dev:api
    ;;
  web)
    # In sviluppo usiamo URL relativi: Vite inoltra /api al backend e i PC
    # della rete locale non tentano di contattare il proprio localhost.
    export VITE_API_BASE_URL=""
    exec npm --workspace web run dev
    ;;
  *)
    echo "Servizio Aplo's sconosciuto: $SERVICE"
    exit 1
    ;;
esac
