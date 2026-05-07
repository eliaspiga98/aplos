# Aplo's — Deploy in laboratorio

Runbook completo per installare Aplo's su una macchina dedicata in
laboratorio (single-tenant, on-prem). Lo schema è: Postgres + Ollama + API
Fastify (systemd) + frontend statico servito da nginx con HTTPS self-signed.

Tutto sotto `/opt/aplos`. Utente di sistema dedicato `aplos`.

---

## 0. Prerequisiti hardware/software

- Server Linux con accesso fisico al laboratorio (Debian 12 / Ubuntu 24.04 LTS
  consigliati). 8 GB RAM minimi se Ollama gira sulla stessa macchina,
  16 GB raccomandati.
- IP statico in LAN (annotalo: ti serve per il certificato).
- Hostname risolvibile dai client (via DNS interno del router o `/etc/hosts`).
  Esempio in questo runbook: `aplos.lan` su `192.168.1.50`.

## 1. Pacchetti di sistema

```bash
sudo apt update
sudo apt install -y postgresql-16 nginx openssl curl ca-certificates gnupg

# Node 20 (richiesto per --env-file nativo)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Ollama (LLM locale)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:7b
```

## 2. Utente di sistema

```bash
sudo useradd --system --create-home --home-dir /opt/aplos --shell /usr/sbin/nologin aplos
sudo mkdir -p /opt/aplos/var/uploads /var/backups/aplos /etc/aplos/ssl
sudo chown -R aplos:aplos /opt/aplos /var/backups/aplos
sudo chown root:root /etc/aplos/ssl && sudo chmod 750 /etc/aplos/ssl
```

## 3. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER aplos WITH PASSWORD 'CAMBIAMI';
CREATE DATABASE aplos OWNER aplos;

CREATE USER aplos_readonly WITH PASSWORD 'CAMBIAMI_RO';
GRANT CONNECT ON DATABASE aplos TO aplos_readonly;
\c aplos
GRANT USAGE ON SCHEMA public TO aplos_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO aplos_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO aplos_readonly;
SQL
```

> L'utente `aplos_readonly` viene usato dal modulo AI per le query
> generate dall'LLM. È l'ultima linea di difesa contro un prompt che provi
> a fare scritture: il pool blinda anche con `BEGIN READ ONLY` +
> `statement_timeout`, ma senza permessi non c'è niente da bloccare.

## 4. Codice sorgente e build

```bash
# Clona/copia il sorgente in /opt/aplos
sudo -u aplos git clone <repo-url> /opt/aplos
cd /opt/aplos

# Dipendenze e build
sudo -u aplos npm ci
sudo -u aplos npm run build      # → api/dist e web/dist
```

## 5. Configurazione `.env`

Copia `.env.example` (se esiste) oppure crea `/opt/aplos/.env` con i valori
di produzione:

```bash
sudo -u aplos tee /opt/aplos/.env >/dev/null <<'ENV'
DATABASE_URL=postgresql://aplos:CAMBIAMI@localhost:5432/aplos
READONLY_DATABASE_URL=postgresql://aplos_readonly:CAMBIAMI_RO@localhost:5432/aplos
API_HOST=127.0.0.1
API_PORT=3001
JWT_SECRET=__GENERA_64_CHAR_CASUALI__
SESSION_TTL_SECONDS=28800
WEB_ORIGIN=https://aplos.lan
UPLOADS_DIR=/opt/aplos/var/uploads
UPLOAD_MAX_BYTES=52428800
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:7b
NODE_ENV=production
ENV

sudo chmod 600 /opt/aplos/.env
sudo chown aplos:aplos /opt/aplos/.env
```

> `JWT_SECRET`: genera con `openssl rand -hex 32`. Non riusarlo mai tra
> installazioni.
>
> `API_HOST=127.0.0.1`: il backend ascolta solo su loopback. L'unico modo
> di raggiungerlo è via il proxy nginx.

## 6. Migrazioni e primo seed

```bash
cd /opt/aplos
sudo -u aplos npm run migrate
# Solo al primissimo deploy:
sudo -u aplos npm run seed
```

Il seed crea l'operatore admin iniziale (vedi output del comando per le
credenziali). **Cambia subito il PIN** dalla UI dopo il primo login.

## 7. systemd unit per l'API

```bash
sudo cp /opt/aplos/deploy/aplos-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aplos-api
sudo systemctl status aplos-api
```

Log: `journalctl -u aplos-api -f`.

## 8. Backup automatico (systemd timer)

I backup contengono dati sanitari di pazienti. Per legge (GDPR + spirito
MDR) **devono lasciare la macchina cifrati**. Lo script `backup.sh` rifiuta
di partire se non è configurata una modalità di cifratura.

### 8.1 Generare la chiave GPG (consigliato: chiave pubblica)

Su una macchina **diversa dal server** (es. PC del titolare):

```bash
gpg --full-generate-key
# scegli RSA 4096, no expiry, identità "Aplo's Backup <admin@laboratorio>"
gpg --export --armor admin@laboratorio > aplos-backup-pub.asc
# La chiave PRIVATA resta solo qui. Salvala anche su un supporto offline.
```

Trasferisci la chiave pubblica sul server e importala come utente `aplos`:

```bash
sudo -u aplos gpg --import /tmp/aplos-backup-pub.asc
sudo -u aplos gpg --list-keys
# Annota il fingerprint o l'email — serve per APLOS_GPG_RECIPIENT.
```

### 8.2 Configurare le unità

Edita `/etc/systemd/system/aplos-backup.service` e aggiungi nella sezione
`[Service]`:

```ini
Environment=APLOS_GPG_RECIPIENT=admin@laboratorio
```

In alternativa, per cifratura simmetrica con passphrase (più semplice ma
meno sicura — la passphrase vive sul server):

```bash
sudo install -m 600 -o aplos -g aplos /dev/stdin /etc/aplos/backup.passphrase <<<"PASSPHRASE_LUNGA_E_CASUALE"
# poi nel .service:
#   Environment=APLOS_GPG_PASSPHRASE_FILE=/etc/aplos/backup.passphrase
```

### 8.3 Abilitare il timer

```bash
sudo cp /opt/aplos/deploy/aplos-backup.service /etc/systemd/system/
sudo cp /opt/aplos/deploy/aplos-backup.timer   /etc/systemd/system/
# (riapplica eventuali Environment= aggiunti sopra)
sudo systemctl daemon-reload
sudo systemctl enable --now aplos-backup.timer
sudo systemctl list-timers aplos-backup.timer
```

### 8.4 Verifica manuale

```bash
sudo systemctl start aplos-backup.service
ls -lh /var/backups/aplos/
# Dovresti vedere file *.sql.gz.gpg e *.tar.gz.gpg
```

### 8.5 Ripristino da backup cifrato

Sulla macchina che ha la chiave privata (o la passphrase):

```bash
# DB
gpg --decrypt aplos-db-YYYYMMDD-HHMMSS.sql.gz.gpg \
  | gunzip \
  | psql "$DATABASE_URL"

# Uploads
gpg --decrypt aplos-uploads-YYYYMMDD-HHMMSS.tar.gz.gpg \
  | tar -xzf - -C /opt/aplos/var/
```

## 9. Certificato HTTPS (self-signed, LAN)

```bash
sudo APLOS_HOST=aplos.lan APLOS_IP=192.168.1.50 \
  /opt/aplos/scripts/generate-cert.sh
```

Distribuisci `/etc/aplos/ssl/aplos.crt` ai client (PC e tablet del
laboratorio) come autorità di fiducia — vedi istruzioni stampate dallo
script.

## 10. nginx

```bash
sudo cp /opt/aplos/deploy/aplos.nginx.conf /etc/nginx/sites-available/aplos
sudo ln -sf /etc/nginx/sites-available/aplos /etc/nginx/sites-enabled/aplos
sudo rm -f /etc/nginx/sites-enabled/default   # se presente
sudo nginx -t
sudo systemctl reload nginx
```

## 11. DNS interno

Sul router (oppure aggiungendo righe a `/etc/hosts` su ogni client):

```
192.168.1.50  aplos.lan
```

## 12. Smoke test

Da un client del laboratorio:

1. Apri `https://aplos.lan` — deve mostrare la pagina di login senza
   warning HTTPS (se hai installato il certificato come trusted).
2. Login con l'operatore admin del seed.
3. Crea un dottore di test, poi un lavoro di test, poi cancellalo (soft).
4. Apri il widget AI in dashboard e fai una domanda banale ("quanti
   lavori in attesa?").
5. Verifica che il backup del giorno dopo esista in `/var/backups/aplos/`.

## 13. Aggiornamenti futuri

```bash
cd /opt/aplos
sudo -u aplos git pull
sudo -u aplos npm ci
sudo -u aplos npm run build
sudo -u aplos npm run migrate    # se ci sono nuove migrazioni
sudo systemctl restart aplos-api
```

`web/dist` viene servito da nginx come file statici, basta che `build`
abbia rigenerato la cartella — niente da riavviare lato web.

## 14. Troubleshooting rapido

| Sintomo | Dove guardare |
|---|---|
| Login non funziona | `journalctl -u aplos-api -n 200` |
| Errore 502 da nginx | API down, vedi sopra |
| Backup non parte | `journalctl -u aplos-backup.service` e `systemctl list-timers` |
| AI risponde lento | `ollama ps`, RAM disponibile, modello caricato |
| Allegati non si caricano | permessi su `/opt/aplos/var/uploads`, `client_max_body_size` in nginx, `UPLOAD_MAX_BYTES` in `.env` |
