# Aplo's — Avvio e spegnimento dell'ambiente dev locale (macOS)

Questo file documenta i servizi che servono per far girare Aplo's in
locale sulla macchina di sviluppo (macOS), come avviarli e come
spegnerli in modo pulito.

Per il deploy in laboratorio vedi `deploy/DEPLOY.md`.

---

## Architettura runtime locale

```
                  ┌─────────────────┐
  Browser ───────►│ Vite (web)      │  porta 5173
                  └────────┬────────┘
                           │ fetch
                           ▼
                  ┌─────────────────┐
                  │ API Fastify     │  porta 3001  (tsx watch)
                  └────┬────────┬───┘
                       │        │
                       ▼        ▼
              ┌─────────────┐ ┌─────────────────────┐
              │ Postgres 16 │ │ Provider AI         │
              │  porta 5432 │ │  - Ollama  :11434   │
              └─────────────┘ │  - MLX     :8080    │
                              └─────────────────────┘
```

Due servizi sono gestiti da `brew services` (sopravvivono ai riavvii
del Mac): **postgresql@16** e **ollama**.
Uno è gestito da `launchctl` come launchd agent utente: **dev.aplos.mlx**.
API e web invece girano "a vista", in due terminali separati, con
`tsx watch` e `vite` rispettivamente.

---

## Avvio automatico

Dal Finder fai doppio clic su **Avvia Aplos Mac.command**, oppure dal
Terminale esegui:

```bash
./scripts/macos/start-aplos.sh
```

Il launcher controlla i prerequisiti, avvia PostgreSQL e MLX se necessario,
applica le migrazioni, avvia API e web app in background e apre il browser.
È sicuro eseguirlo più volte. I log sono in `var/logs`.

La web app è raggiungibile anche dagli altri computer della stessa rete su
`http://IP-DEL-MAC:5173` (macOS potrebbe chiedere di autorizzare le connessioni
in entrata al primo avvio).

Per chiudere tutto fai doppio clic su **Chiudi Aplos Mac.command**, oppure:

```bash
./scripts/macos/stop-aplos.sh
```

PostgreSQL viene fermato soltanto se era stato avviato dal launcher. Il server
MLX viene invece sempre chiuso per liberare la memoria occupata dal modello.

## Avvio manuale

### 0. Servizi di base (di solito già attivi)

```bash
brew services start postgresql@16
brew services start ollama
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/dev.aplos.mlx.plist
```

Verifica:

```bash
brew services list                       # postgresql@16 e ollama: started
launchctl print "gui/$(id -u)/dev.aplos.mlx" | head -5
curl -sS http://localhost:11434/api/tags  >/dev/null && echo "ollama ok"
curl -sS http://127.0.0.1:8080/v1/models  >/dev/null && echo "mlx ok"
```

> Se MLX non risponde, riesegui `scripts/install-mlx-server.sh` —
> ricreerà il plist e ricaricherà l'agent.

### 1. API (terminale dedicato)

```bash
cd /Users/eliaspiga/lavoro/personale/Aplos
npm run dev:api
```

Deve loggare `Aplo's API in ascolto su http://0.0.0.0:3001`. Lascialo
aperto in foreground: ricarica automaticamente quando modifichi i file
di `api/src/`.

### 2. Web (altro terminale dedicato)

```bash
cd /Users/eliaspiga/lavoro/personale/Aplos
npm run dev:web
```

Apri `http://localhost:5173`.

---

## Spegnimento (`./aplos stop`)

Ordine consigliato: prima i client (web, API), poi i provider AI,
infine Postgres se davvero vuoi staccare tutto.

### 1. Web e API

Vai nei rispettivi terminali e premi **Ctrl+C**. Vite e tsx watch
intercettano il segnale e si chiudono puliti.

Se il terminale è stato chiuso senza prima fermare il processo, killali
per nome:

```bash
pkill -f "vite"          # web
pkill -f "tsx watch.*server.ts"  # api
```

Verifica che le porte siano libere:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E "5173|3001" || echo "ok, libere"
```

### 2. MLX server (servizio launchd locale)

```bash
launchctl bootout "gui/$(id -u)/dev.aplos.mlx"
```

Libera ~4.5 GB di RAM (modello scaricato dalla VRAM). Per riavviarlo:

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/dev.aplos.mlx.plist
```

### 3. Ollama (brew services)

```bash
brew services stop ollama
```

Libera ~7 GB di RAM (modello qwen3.5:9b-q4_K_M scaricato dalla VRAM
condivisa Metal). Per riavviarlo: `brew services start ollama`.

### 4. Postgres — opzionale

Lascia acceso se hai altri progetti che lo usano. Per chiuderlo:

```bash
brew services stop postgresql@16
```

> Postgres consuma pochissima RAM a riposo (~50 MB), ed è più scomodo
> riavviarlo che lasciarlo su. Spegnerlo serve principalmente quando
> stacchi tutto perché la macchina va offline (es. trasporto del
> laptop) o devi liberare la porta 5432 per un'installazione diversa.

---

## Controllo "tutto giù"

Comando one-liner per vedere lo stato di tutto:

```bash
{
  echo "=== brew services ==="; brew services list | grep -E "postgresql|ollama";
  echo "=== launchd MLX ===";   launchctl list | grep -E "dev\.aplos\.mlx" || echo "(non caricato)";
  echo "=== porte client ==="; lsof -nP -iTCP -sTCP:LISTEN | grep -E "5173|3001" || echo "(api/web non in ascolto)";
}
```

---

## Risoluzione problemi rapidi

| Sintomo                                          | Azione                                                      |
|--------------------------------------------------|-------------------------------------------------------------|
| `npm run dev:api` dice `EADDRINUSE :3001`        | `pkill -f "tsx watch.*server.ts"` e riprova                 |
| `npm run dev:web` dice `EADDRINUSE :5173`        | `pkill -f vite` e riprova                                   |
| Chat dà "Errore di rete"                         | `curl http://localhost:3001/api/admin/settings/ai/health`   |
| Switch a MLX nel pannello e Chat va in errore    | Controlla `~/Library/Logs/aplos-mlx.err.log`                |
| Vuoi riavviare solo MLX                          | `launchctl kickstart -k gui/$(id -u)/dev.aplos.mlx`         |
