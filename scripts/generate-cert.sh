#!/usr/bin/env bash
#
# Genera un certificato self-signed per Aplo's su LAN.
#
# Perché self-signed: il deploy è on-prem, niente dominio pubblico → Let's
# Encrypt non è applicabile. Il certificato va distribuito ai client (PC e
# tablet del laboratorio) come autorità "di fiducia" per evitare warning.
#
# Uso:
#   sudo APLOS_HOST="aplos.lan" APLOS_IP="192.168.1.50" ./scripts/generate-cert.sh
#
# Variabili:
#   APLOS_HOST   hostname (es. aplos.lan, oppure il nome della macchina)
#   APLOS_IP     IP statico in LAN (verrà aggiunto come SAN IP)
#   APLOS_DAYS   validità in giorni (default 825 — limite Apple/iOS)
#   APLOS_OUT    cartella output (default /etc/aplos/ssl)
#

set -euo pipefail

HOST="${APLOS_HOST:-aplos.lan}"
IP="${APLOS_IP:-}"
DAYS="${APLOS_DAYS:-825}"
OUT="${APLOS_OUT:-/etc/aplos/ssl}"

if [[ -z "$IP" ]]; then
  echo "Errore: APLOS_IP non impostato (es: APLOS_IP=192.168.1.50)" >&2
  exit 1
fi

mkdir -p "$OUT"

CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT

cat > "$CONF" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions    = v3_req
prompt             = no

[req_distinguished_name]
CN = $HOST
O  = Aplo's
OU = Laboratorio

[v3_req]
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @alt_names

[alt_names]
DNS.1 = $HOST
DNS.2 = localhost
IP.1  = $IP
IP.2  = 127.0.0.1
EOF

KEY="$OUT/aplos.key"
CRT="$OUT/aplos.crt"

openssl req -x509 -nodes \
  -newkey rsa:4096 \
  -keyout "$KEY" \
  -out "$CRT" \
  -days "$DAYS" \
  -config "$CONF" \
  -extensions v3_req

chmod 600 "$KEY"
chmod 644 "$CRT"

echo
echo "Certificato generato:"
echo "  cert: $CRT  (validità $DAYS giorni)"
echo "  key:  $KEY  (mode 600)"
echo
echo "Distribuisci $CRT ai client del laboratorio:"
echo "  - macOS:    Keychain Access → import nel System Keychain → 'Always Trust'"
echo "  - Windows:  certmgr → Trusted Root CAs → import"
echo "  - iPad/iOS: AirDrop o email → Settings → Profile Downloaded → Install + abilita full trust"
echo
echo "Poi ricarica nginx: sudo systemctl reload nginx"
