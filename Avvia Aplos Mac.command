#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/scripts/macos/start-aplos.sh"
STATUS=$?
if [[ $STATUS -ne 0 ]]; then
  echo
  echo "Avvio non riuscito. Premi Invio per chiudere questa finestra."
  read -r
fi
exit $STATUS

