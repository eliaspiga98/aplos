#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/scripts/macos/stop-aplos.sh"
STATUS=$?
if [[ $STATUS -ne 0 ]]; then
  echo
  echo "Chiusura non riuscita. Premi Invio per chiudere questa finestra."
  read -r
fi
exit $STATUS

