# Aplo's — Documentazione Tecnica di Architettura

> Fonte di verità tecnica del codice. Per la specifica funzionale vedi
> `specs.md`. Per le decisioni di prodotto e il vincolo MDR vedi
> `PROGETTO.md`. Per i runbook di avvio/spegnimento dev locale e deploy
> in produzione vedi `deploy/DEV.md` e `deploy/DEPLOY.md`.

---

## 1. Visione d'insieme

Aplo's è una web app **single-tenant** per laboratori odontotecnici. Una
installazione = un laboratorio = un database. Frontend SPA + backend
REST + Postgres + provider LLM locale, tutto su una **macchina dedicata
in laboratorio** (LAN, no cloud). La superficie esterna è il proxy
nginx con HTTPS self-signed; il backend ascolta solo su loopback.

Il dominio è regolato dall'MDR (UE 2017/745) per dispositivi medici su
misura: di qui i pattern di **soft delete** universale, **audit log
immutabile** e **tracciabilità lotto materiale → lavoro → paziente**.

Ad alto livello:

```
Browser (LAN)
   │  HTTPS (cert self-signed)
   ▼
nginx (porta 443) ──── static files: /opt/aplos/web/dist
   │
   │  proxy_pass http://127.0.0.1:3001
   ▼
Fastify API (Node 20+, TypeScript)
   ├── pg (Pool) ───►  Postgres 16  (DB principale + DB demo opzionale)
   ├── pg (Pool RO) ►  Postgres 16  (utente read-only, modulo AI)
   ├── fs           ►  /opt/aplos/var/uploads/<id_lavoro>/<uuid><ext>
   └── HTTP         ►  Provider LLM locale: Ollama (:11434) o MLX (:8080)
```

---

## 2. Stack e versioni

| Componente | Versione | Note |
|---|---|---|
| Node.js | `>= 20.6.0` | Richiesto per `--env-file` nativo |
| TypeScript | 5.7.3 | Sia api che web |
| **Backend** | | |
| Fastify | 5.2.0 | Logger pino integrato |
| `@fastify/cookie` | 11.0.2 | Cookie parsing/sign |
| `@fastify/cors` | 10.0.2 | CORS via hook `onSend` |
| `@fastify/jwt` | 10.0.0 | JWT verify + sign |
| `@fastify/multipart` | 9.0.2 | Upload allegati |
| `@fastify/rate-limit` | 10.2.2 | Token bucket per-IP |
| `@sinclair/typebox` | 0.34.13 | Schema runtime + tipi |
| `pg` | 8.13.1 | Client Postgres puro, no ORM |
| `bcryptjs` | 2.4.3 | Hash PIN (JS puro) |
| `tsx` | 4.19.2 | Loader TS in dev (`tsx watch`) |
| **Frontend** | | |
| React | 18.3.1 | |
| `react-router-dom` | 6.28.1 | Routing client |
| `three` | 0.171.0 | Viewer 3D STL |
| Vite | 6.0.7 | Dev server + build |

**Cosa gira "sotto"**: il backend è puro Node — non c'è codice Go nel
progetto. Quando si parla di "Go" è solo perché **Ollama**, uno dei due
provider LLM esterni, è scritto in Go (binario gestito da
`brew services` in dev e da pacchetto OS in produzione Linux). L'altro
provider è **MLX**: server Python (`mlx_lm.server`, gestito da pipx) che
sfrutta direttamente Metal su Apple Silicon. Entrambi sono **processi
separati** raggiunti via HTTP.

---

## 3. Layout del repository

```
aplos/
├── api/                       # Workspace npm "aplos/api" — backend
│   ├── src/
│   │   ├── server.ts          # Composizione plugin, hooks, registrazione rotte
│   │   ├── config.ts          # Env vars validate (required/optional)
│   │   ├── audit.ts           # logAudit() — INSERT in audit_log
│   │   ├── csv.ts             # Helper export CSV (deterministico, no libs)
│   │   ├── validators.ts      # Validazione notazione FDI (numeri denti)
│   │   ├── auth/
│   │   │   ├── guards.ts      # attachUser, requireAuth, requireAdmin
│   │   │   └── types.ts       # FastifyRequest augmentation (req.user, req.pool)
│   │   ├── db/
│   │   │   ├── pool.ts        # main pool (max 10) + demo pool (max 5)
│   │   │   ├── readonly-pool.ts # readonly pool per modulo AI (max 3)
│   │   │   ├── migrate.ts     # Runner SQL forward-only
│   │   │   ├── seed.ts        # Seed minimale prod
│   │   │   └── seed-demo.ts   # Seed ricco per DB demo
│   │   ├── routes/            # Una rotta per file, mounted con prefix
│   │   ├── ai/
│   │   │   ├── llm.ts         # Dispatcher: legge app_settings, instrada
│   │   │   ├── providers/
│   │   │   │   ├── types.ts   # interface LlmProvider
│   │   │   │   ├── ollama.ts  # POST /api/chat NDJSON
│   │   │   │   └── mlx.ts     # POST /v1/chat/completions SSE
│   │   │   ├── classify.ts    # Euristica DATI vs INFO senza LLM
│   │   │   ├── schema-description.ts # Schema DB in prosa per il prompt
│   │   │   └── sql-guard.ts   # Validazione + sanitization SQL
│   │   └── ...
│   └── test/                  # node:test + tsx (266 righe totali)
│
├── web/                       # Workspace npm "aplos/web" — frontend
│   ├── src/
│   │   ├── main.tsx, App.tsx  # Routing, ProtectedRoute
│   │   ├── auth.tsx           # Context React (user, login, logout, refresh)
│   │   ├── api.ts             # fetch wrapper + ApiError + streamNdjsonPost
│   │   ├── pages/             # Una pagina per rotta
│   │   ├── components/        # Modals, kanban, calendario, AI widget, STL viewer
│   │   ├── hooks/             # useInactivityLogout, …
│   │   └── styles.css         # Stylesheet unico (2700 righe)
│   └── public/
│
├── db/migrations/             # SQL forward-only numerato (4 migrations)
├── deploy/                    # systemd, nginx, plist launchd, runbook
├── scripts/                   # backup.sh, generate-cert.sh, install-mlx-server.sh
├── var/uploads/               # Storage allegati (gitignored)
├── PROGETTO.md, specs.md      # Decisioni e specifica funzionale
└── ARCHITETTURA.md            # Questo file
```

Monorepo npm con workspaces. `npm run dev:api` e `npm run dev:web`
dalla root delegano ai workspace.

---

## 4. Database

### 4.1 Filosofia

- **Postgres 16** nativo (no Docker), schema gestito da migration SQL
  pure numerate `NNNN_*.sql` in `db/migrations/`. Runner manuale,
  forward-only, mai modificare migrazioni già applicate.
- **Niente ORM**: si scrive `pg.query` + tipi TypeScript a mano. La
  spec del progetto privilegia leggibilità e diff piccoli.
- **Soft delete** universale su tabelle anagrafiche/produzione:
  colonna `deleted_at TIMESTAMPTZ NULL`. Query applicative SEMPRE
  con `WHERE deleted_at IS NULL`. Mai `DELETE` fisico — vincolo MDR.
- **Audit log immutabile**: ogni operazione "scrivente" produce una
  riga in `audit_log` con operatore + azione + dettagli JSONB.
- **Trigger `updated_at`**: una funzione `set_updated_at()` applicata
  via trigger `BEFORE UPDATE` su tutte le tabelle con questa colonna.

### 4.2 Migrazioni

| File | Cosa fa |
|---|---|
| `0001_initial_schema.sql` | Tutte le tabelle base: operatori, dottori, lavori, lavori_strutture, lavori_allegati, materiali, lavori_materiali, audit_log. ENUM `ruolo_operatore`, `stato_lavoro`, `tipo_struttura`, `categoria_materiale`, `stato_utilizzo`. Trigger updated_at. |
| `0002_depositi.sql` | Tabella `depositi` (anagrafica nomi banchi/scaffali) + colonna `materiali.id_deposito` FK nullable. Rinomina vecchia colonna libera `materiali.deposito` → `deposito_legacy` per preservare dati esistenti senza migrarli forzatamente. |
| `0003_usa_demo.sql` | Colonna `operatori.usa_demo BOOLEAN` per indirizzare un operatore al DB demo invece del principale. |
| `0004_app_settings.sql` | Tabella singleton `app_settings` (`CHECK (id = 1)`) per provider LLM, modello, URL Ollama/MLX. Modificabile da `/impostazioni` admin a runtime. |

### 4.3 Modello — entità principali

- `operatori(id, nome, ruolo: admin|tecnico, pin_hash, usa_demo, ...)`
  — un solo campo `nome` (no `cognome` separato; importante perché il
  modulo AI lo sa esplicitamente, vedi §7).
- `dottori(id, nome, studio, telefono, email, indirizzo, partita_iva,
  codice_fiscale, note, ...)` — stesso pattern `nome` completo.
- `lavori(id, id_dottore→dottori, nome_paziente, data_entrata DATE,
  data_consegna DATE, stato: in_attesa|in_corso|in_prova|finito,
  scala_colori, tipologia_lavoro, note_istruzioni,
  id_operatore_creazione→operatori, ...)`
  con `CHECK (data_consegna >= data_entrata)`.
- `lavori_strutture(id_lavoro→lavori, tipo_struttura: corona_singola|ponte,
  elementi_dentali SMALLINT[])` con `CHECK` su lunghezza (>=1, =1 per
  corona singola, >=2 per ponte). Notazione FDI (11–48 permanenti,
  51–85 decidui) validata anche application-side in
  `api/src/validators.ts`.
- `lavori_allegati(id_lavoro, nome_file, storage_path, mime_type,
  size_bytes, id_operatore)` — metadati; il file vero sta su filesystem.
- `materiali(id, categoria: zirconio|pmma|resina|metallo|ceramica|altro,
  sottotipo, marca, colore, lotto, id_deposito→depositi, altezza_mm,
  larghezza_mm, quantita, unita_misura, stato_utilizzo:
  nuovo|parziale|esaurito, soglia_alert, attributi_extra JSONB, ...)`
  con `UNIQUE (categoria, lotto)`. Lo schema lascia `attributi_extra`
  per casi non standard prima di estrarli in colonne.
- `lavori_materiali(id_lavoro, id_materiale, quantita_usata,
  unita_misura, note, id_operatore, created_at)` — append-only, **senza
  `deleted_at`** (vincolo MDR: la tracciabilità storica non si
  cancella).
- `audit_log(id, id_operatore, azione, entita, id_entita, dettagli
  JSONB, created_at)` — append-only, indici su (id_operatore),
  (entita, id_entita), (created_at DESC).
- `app_settings(id=1, ai_provider, ai_model, ollama_url, mlx_url,
  updated_at, updated_by→operatori)` — singleton.

### 4.4 DB demo opzionale

Una `DEMO_DATABASE_URL` opzionale crea un secondo DB con stesso schema
e seed ricco (25 lavori, 6 dottori, 15 materiali, 5 depositi, 2
operatori demo). Lo stato `usa_demo` per operatore (vedi sopra) fa sì
che il `preHandler` del server imposti `req.pool` sul pool demo invece
di quello principale. Auth resta sempre sul DB principale. Switchabile
senza riavvio.

---

## 5. Backend

### 5.1 Composizione del server

`api/src/server.ts` costruisce l'app Fastify e registra in ordine:

1. `@fastify/cookie` — parsing/sign cookie.
2. `@fastify/cors` — `origin: config.webOrigin` (singolo origin),
   `credentials: true`, expose `x-total-count`.
3. `@fastify/jwt` — secret da `JWT_SECRET`, cookie `aplos_session`,
   `sign.expiresIn = sessionTtlSeconds` (default 8h).
4. `@fastify/multipart` — limite file = `UPLOAD_MAX_BYTES` (default
   50 MB), 1 file per richiesta.
5. `@fastify/rate-limit` — **300 req/min globale per IP**, alcune
   rotte sovrascrivono (login: 10/min).
6. Hook `onRequest` globale: `attachUser` (decodifica JWT best-effort,
   non blocca) e poi imposta `req.pool` su `mainPool` o `demoPool`
   in base a `req.user?.usa_demo`.
7. Registrazione delle rotte (vedi 5.4).
8. `app.listen({host, port})` e poi `llmWarmup()` in background.

### 5.2 Autenticazione

Modello "fast-login per ambiente di officina": niente email/password,
solo **id operatore + PIN**. Il PIN è hashato con `bcryptjs` (10 round
di salt). L'endpoint `GET /api/auth/operatori` è **pubblico** e
restituisce solo `id` e `nome` per popolare il dropdown del login —
scelta intenzionale: il PIN è la cosa che protegge, non l'enumerazione
degli id.

Flusso:

```
POST /api/auth/login {id_operatore, pin}
   │  rate limit: 10/min per IP
   ▼
SELECT FROM operatori WHERE id = $1 AND deleted_at IS NULL
   │
   ▼
bcrypt.compare(pin, op.pin_hash)
   │  fallimento → 401 "Credenziali non valide" (generica, no enumerazione)
   │  successo → jwtSign({id, nome, ruolo, usa_demo})
   ▼
Set-Cookie: aplos_session=<JWT>; HttpOnly; SameSite=Lax;
            Secure (solo prod); Path=/; Max-Age=28800
```

**Cookie flags** (`auth.ts:79–85`):
- `httpOnly: true` — niente accesso da JS, mitiga XSS.
- `secure: config.isProduction` — disattivato in dev su localhost (HTTP),
  attivo in prod dietro nginx (HTTPS).
- `sameSite: 'lax'` — protegge da CSRF cross-site su POST,
  permette navigazione normale GET cross-site.
- TTL: 8 ore (default), allineato a un turno lavorativo.

**Guards** (`auth/guards.ts`):
- `attachUser` — usato come hook globale; decodifica JWT, ignora errori,
  popola `req.user` o lo lascia `undefined`.
- `requireAuth` — `preHandler` per quasi tutte le rotte; 401 se senza
  user.
- `requireAdmin` — `preHandler` per rotte admin-only; 401 se non
  loggato, 403 se ruolo ≠ `admin`.

**Auto-logout client-side** (`web/src/hooks/useInactivityLogout.ts`):
dopo `VITE_INACTIVITY_LOGOUT_MINUTES` minuti di inattività (default 30)
il client chiama `/api/auth/logout`. Il backend non ha un concetto di
sessione lato server: scaduto il JWT (8h) la richiesta successiva
torna 401 e il client manda al login.

### 5.3 Pool Postgres

Tre pool, scopi diversi:

| Pool | File | Max conn | Uso |
|---|---|---|---|
| `pool` (main) | `db/pool.ts` | 10 | Operazioni applicative regolari |
| `demoPool` | `db/pool.ts` | 5 | Solo se `DEMO_DATABASE_URL` è set; usato quando operatore ha `usa_demo=true` |
| `readonlyPool` | `db/readonly-pool.ts` | 3 | Solo modulo AI; idealmente puntato a un utente Postgres con `GRANT SELECT` |

Il pool principale viene scelto per-request da un hook `onRequest`. Il
pool readonly è hardcoded per il solo modulo AI (vedi §7).

Pattern transazione: `withTx(pool, async (client) => { … })` in
`db/pool.ts` gestisce `BEGIN/COMMIT/ROLLBACK` con cleanup garantito.
Usato per operazioni multi-tabella tipo creazione lavoro + strutture
atomica.

### 5.4 Rotte API

Tutte montate con prefisso `/api/`. Validazione body/params/query con
schemi TypeBox. Risposte d'errore JSON `{ error: string }`.

| Prefisso | File | Guard di default | Cosa fa |
|---|---|---|---|
| `/api/health` | `routes/health.ts` | nessuna | Ping + check connessione DB |
| `/api/auth` | `routes/auth.ts` | nessuna | login, logout, /me, /me/pin, lista operatori per dropdown |
| `/api/operatori` | `routes/operatori.ts` | `requireAdmin` | CRUD operatori, toggle `usa_demo` |
| `/api/dottori` | `routes/dottori.ts` | `requireAuth` | CRUD + stats per dottore + export CSV |
| `/api/lavori` | `routes/lavori.ts` | `requireAuth` | CRUD lavori (con `lavori_strutture` atomico), registra consumo materiale, /stampa-dati, export CSV |
| `/api/materiali` | `routes/materiali.ts` | `requireAuth` | CRUD materiali, export CSV |
| `/api/depositi` | `routes/depositi.ts` | `requireAuth` | CRUD depositi |
| `/api/lavori/:id/allegati` | `routes/allegati.ts` | `requireAuth` | Upload (multipart), lista, delete allegati |
| `/api/ai` | `routes/ai.ts` | `requireAuth` | `/health`, `/chat` (streaming NDJSON) |
| `/api/admin/settings/ai` | `routes/admin-settings.ts` | `requireAdmin` | GET/PUT settings AI, `/health`, `/test` what-if |

Liste paginate restituiscono `X-Total-Count` (header) e un array;
`web/src/api.ts:getList` lo legge.

### 5.5 Storage allegati

`POST /api/lavori/:id/allegati` (multipart):
- limite 1 file per request, `UPLOAD_MAX_BYTES` byte (default 50 MB).
- nome storage: `var/uploads/<id_lavoro>/<uuid><ext>` — uuid per
  evitare collisioni e fuga di filename.
- DB salva metadati (`nome_file` originale, `storage_path`, `mime_type`,
  `size_bytes`, `id_operatore`).
- nginx ha `client_max_body_size 60M` (margine sopra 50M).

### 5.6 Audit log

`api/src/audit.ts:logAudit(runner, { idOperatore, azione, entita?,
idEntita?, dettagli? })` esegue `INSERT INTO audit_log`. Accetta una
`Pool` o un `PoolClient` (così può girare dentro una transazione).
Chiamata da quasi tutte le rotte di scrittura (auth, operatori,
dottori, lavori, materiali, depositi, allegati, admin-settings) con
azioni come `LOGIN`, `CAMBIO_PIN`, `CREATE_LAVORO`, `UPDATE_STATO`,
`REGISTRA_CONSUMO`, `AI_QUERY`, `AI_INFO`, `AI_SETTINGS_UPDATE`.

---

## 6. Frontend

### 6.1 Forma

SPA React 18 servita da Vite in dev, builded a statici e servita da
nginx in prod. Routing client con `react-router-dom@6`. Il bundle web
chiama l'API tramite `VITE_API_BASE_URL` (in dev: `http://localhost:3001`;
in prod: vuoto, stesso origin con `/api/...`).

`web/src/App.tsx` gestisce:
- splash di caricamento iniziale (`useAuth().loading`);
- se non loggato: solo `/login`;
- se loggato: tutto sotto `<Layout>` (sidebar + main), tranne
  `/lavori/:id/stampa` che è fuori layout per stampa A4 dedicata.

Rotte client e relativa pagina:

| Rotta | Pagina | Note |
|---|---|---|
| `/` | `Dashboard` | KPI, Kanban breve, calendario settimanale, alert magazzino, AI widget aperto |
| `/lavori` | `Lavori` | Lista filtri + modal di dettaglio/edit |
| `/calendario` | `Calendario` | Vista mensile lavori per data_consegna |
| `/dottori` | `Dottori` | Anagrafica + statistiche commesse |
| `/materiali` | `Materiali` | Magazzino + stato_utilizzo + soglia alert |
| `/depositi` | `Depositi` | Anagrafica depositi |
| `/operatori` | `Operatori` | Admin only — CRUD + toggle demo |
| `/impostazioni` | `Impostazioni` | Admin only — provider AI |
| `/lavori/:id/stampa` | `LavoroStampa` | Layout A4, no sidebar |

### 6.2 State management

Niente Redux / Zustand. Pattern:
- **Auth context** (`web/src/auth.tsx`) — hook `useAuth()` espone
  `user`, `login()`, `logout()`, `refreshUser()`. Wrapper su
  `/api/auth/me`.
- **`useInactivityLogout`** (`hooks/`) — timer su eventi tastiera/mouse;
  oltre N minuti chiama `logout()`.
- **State locale per pagina** (`useState`, `useEffect`). Le liste
  paginate fanno fetch via `getList<T>(path)` (in `api.ts`) che
  ritorna `{rows, total}`.

### 6.3 Streaming chat

Il modulo AI usa NDJSON via `streamNdjsonPost<T>(path, body)`
(`web/src/api.ts:69`): `fetch` legge il `ReadableStream` riga per riga
e yielda eventi. Eventi prodotti dal backend (`api/src/routes/ai.ts`):
`{type:'phase', phase}`, `{type:'sql', sql}`, `{type:'data', rows,
rowCount}`, `{type:'token', text}`, `{type:'replace_answer', text}`,
`{type:'done', …}`, `{type:'error', error, details?, sql?}`.

Il widget `AiWidget.tsx` interpreta gli eventi e aggiorna l'ultima
"bolla" di chat man mano che il modello scrive.

### 6.4 3D STL viewer

`web/src/components/StlViewer.tsx` usa `three@0.171` con `STLLoader`
per renderizzare gli allegati `.stl` in anteprima. Niente shader
custom: scene minimale, luce ambient + direzionale, OrbitControls.

---

## 7. Modulo AI

### 7.1 Pipeline complessiva

```
POST /api/ai/chat {domanda}
   │
   ▼ classify
   ├── quickClassify(domanda) → 'sql' | 'info' | null   (regex, 0 LLM)
   │     se null → llmChat(few-shot classifier) → 'DATI'|'INFO'
   │
   ├──── INFO ────► llmChatStream(INFO_SYSTEM_PROMPT) → stream token
   │                AI_INFO in audit_log; fine.
   │
   └──── SQL ────► llmChat(SQL_SYSTEM_PROMPT + few-shot, domanda)
                   │
                   ▼ extractAndValidateSql() → valida, estrae da ```sql```
                   ▼ rewriteAggregateOnlyToList() → COUNT(*) → SELECT *
                   ▼ readonlyPool: BEGIN READ ONLY; SET statement_timeout='5s';
                   │
                   ├── ok, righe>0    → answer
                   ├── ok, 0 righe    → retry (max 3 tot.): chiedo riformulazione semantica
                   └── errore SQL     → retry mostrando l'errore al modello
                   │
                   ▼ llmChatStream(ANSWER_SYSTEM_PROMPT + risultati) → stream token
                   ▼ heuristic: se output è codice, sostituisci con riassunto deterministico
                   ▼ AI_QUERY in audit_log (con SQL e n_righe); fine.
```

### 7.2 Dispatcher e provider

`api/src/ai/llm.ts` legge la riga singleton di `app_settings` (cache
TTL 5s, invalidata esplicitamente alla PUT delle settings) e costruisce
il `LlmProvider` corrispondente. I provider sono in `providers/`:

- **`ollama.ts`** — POST a `${ollama_url}/api/chat` con body
  `{model, messages, stream, keep_alive: -1, options:{temperature,
  num_predict}}`. Streaming NDJSON. **Attenzione**: `keep_alive` deve
  essere il numero `-1` (intero), non la stringa `'-1'` — Ollama parsa
  il campo come Go `time.Duration` e rigetta `"-1"` con
  `time: missing unit in duration`.
- **`mlx.ts`** — POST a `${mlx_url}/v1/chat/completions` con payload
  OpenAI-compatible. Streaming SSE (`data: <json>\n\n`). `mlx_lm.server`
  non filtra i token speciali del chat template (`<|im_end|>`,
  `<|eot_id|>`, …): il provider li strippa lato server con regex
  `<\|[^|]+\|>` e un buffer di carryover per gestire split su più chunk
  stream.

Entrambi i provider implementano la stessa `LlmProvider` interface
(`providers/types.ts`).

### 7.3 Classifier

Due livelli:
1. **Euristica** (`classify.ts:quickClassify`) — pattern regex su prefissi
   ("mostra", "elenca", "quali", "lavori", "materiali", "del dottor X",
   "cosa significa", "come si fa") → ritorna `'sql'`, `'info'` o
   `null`. Risparmia una chiamata LLM nel caso comune.
2. **LLM classifier** — chiamato solo se l'euristica è `null`. Prompt
   one-token ("DATI"|"INFO"), few-shot con esempi di trappole
   ("Come posso contattare la Dottoressa Verdi?" → DATI nonostante
   "Come"). `numPredict: 4`.

### 7.4 SQL guard

`sql-guard.ts:extractAndValidateSql(raw)` fa due cose:
- estrae la query da un fence ```` ```sql ... ``` ```` o, se assente,
  dal testo grezzo;
- rifiuta qualsiasi query con keyword non SELECT/CTE: `INSERT`,
  `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`,
  `REVOKE`, `COPY`, `EXECUTE`, `CALL`, `DO`, `VACUUM`, `CLUSTER`,
  `REINDEX`, `COMMENT`.

`rewriteAggregateOnlyToList(sql)` riscrive le query che sono solo un
COUNT/SUM senza GROUP BY in `SELECT * ... LIMIT 100`, per dare comunque
righe esempio all'utente oltre al conteggio (numero righe = il count).

### 7.5 Tre layer di difesa SQL

1. **SQL guard application-side** (sopra).
2. **Transazione `BEGIN READ ONLY`** + `SET LOCAL statement_timeout = '5s'`.
3. **Utente Postgres dedicato `aplos_readonly`** con solo
   `GRANT SELECT` su `public` (configurato in `DEPLOY.md` § 3).

I tre layer sono indipendenti: se uno fallisce gli altri reggono.

### 7.6 Schema description

`schema-description.ts` è una **prosa schematica** dello schema DB
iniettata nel prompt di sistema. Da aggiornare a mano quando si aggiunge
una colonna rilevante per le query in NL. Include note specifiche
("`dottori.nome` è campo unico, NON esiste `cognome`") per prevenire
errori di inferenza del modello.

### 7.7 Modelli di riferimento

Default seed: `qwen2.5-coder:7b` per Ollama e
`mlx-community/Qwen2.5-Coder-7B-Instruct-4bit` per MLX. La pagina
`/impostazioni` propone una lista di alternative ma accetta qualunque
id (anche fine-tune custom).

---

## 8. Sicurezza

### 8.1 Cosa c'è

| Tecnica | Implementazione |
|---|---|
| **JWT in cookie httpOnly** | `secure` in prod, `sameSite: 'lax'`, TTL 8h |
| **Hashing PIN** | `bcryptjs` 10 round |
| **Rate limit** | Globale 300/min per IP; login 10/min per IP |
| **CORS** | Origin singolo (`config.webOrigin`), `credentials: true` |
| **Input validation** | TypeBox schemi su body/params/query di ogni rotta |
| **SQL injection** | Query parametrizzate `pg`; modulo AI ha guard + RO tx + utente RO |
| **XSS** | React escape JSX di default; nessun `dangerouslySetInnerHTML` |
| **Soft delete** | `deleted_at` con filtro applicativo; nessuna fuga di dati cancellati nelle list |
| **Audit log immutabile** | Append-only, indici per scansione veloce |
| **HTTPS** | nginx TLS 1.2/1.3, cert self-signed con SAN per LAN (`scripts/generate-cert.sh`) |
| **Headers security** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` da nginx |
| **systemd hardening** | `NoNewPrivileges`, `ProtectSystem=strict`, `MemoryDenyWriteExecute`, `PrivateTmp`, `ProtectHome=true` |
| **Backup cifrati** | `backup.sh` esige `APLOS_GPG_RECIPIENT` o `APLOS_GPG_PASSPHRASE_FILE`; abort se assenti (override esplicito con `APLOS_BACKUP_INSECURE=1`) |
| **Auto-logout** | Client side, 30 min inattività default |
| **AI: utente DB readonly** | `aplos_readonly` con solo `GRANT SELECT` |
| **AI: statement_timeout** | 5s sulla transazione di esecuzione query |
| **AI: SQL guard** | Whitelist di SELECT/WITH, blacklist di keyword di scrittura/DDL/maintenance |

### 8.2 Cosa NON c'è (e perché va bene per il modello di deployment)

- **CSRF token**: non c'è. Mitigato da `SameSite=Lax` sul cookie di
  sessione + CORS con origin singolo. Per un servizio interno al
  laboratorio (LAN, niente login da pagine esterne) è considerato
  accettabile. Se Aplo's dovesse mai uscire in cloud multi-tenant,
  questa è la prima cosa da aggiungere.
- **Helmet plugin**: non c'è come plugin Fastify. Gli header equivalenti
  sono iniettati da **nginx** in produzione. In dev gli header non ci
  sono, ma non c'è nginx davanti.
- **CAPTCHA su login**: non c'è. Mitigato da rate limit 10/min per IP
  + PIN bcrypt + audit log dei tentativi.
- **Refresh token / blacklist JWT**: non c'è. Il logout cancella solo
  il cookie client. Un JWT rubato resta valido fino a scadenza (max 8h
  dalla emissione). Modello accettabile per LAN single-tenant; un
  attaccante con accesso al cookie ha già accesso al laboratorio.

### 8.3 Trust boundary

```
trust         | untrusted (esposto)
 prod nginx ─►| HTTPS public-ish (LAN)
   ▲          |
   │ proxy_pass loopback
   │          |
 API (3001) ─►| trusted (loopback only)
   │          |
   ├ Postgres |  loopback only
   ├ Ollama   |  loopback only
   └ MLX      |  loopback only
```

In prod il backend non ascolta su `0.0.0.0`: `API_HOST=127.0.0.1`. Il
solo modo di parlargli è via nginx.

---

## 9. Limiti operativi noti

| Limite | Valore | Dove configurato | Razionale |
|---|---|---|---|
| Sessione TTL | 8h | env `SESSION_TTL_SECONDS` | turno lavorativo |
| Auto-logout client | 30 min | env `VITE_INACTIVITY_LOGOUT_MINUTES` | terminali condivisi |
| Rate limit globale | 300 req/min/IP | `server.ts` | normale uso umano |
| Rate limit /login | 10/min/IP | `routes/auth.ts:51` | anti brute-force PIN 4–6 cifre |
| Upload max | 50 MB | env `UPLOAD_MAX_BYTES` | typical STL = 5–20 MB |
| nginx `client_max_body_size` | 60 MB | `aplos.nginx.conf` | margine sopra upload |
| AI statement_timeout | 5s | `routes/ai.ts:452` | query NL → DB lente non valgono |
| AI righe restituite | 100 | `RESULT_ROW_LIMIT` in `routes/ai.ts:163` | quanto rientra in un riassunto |
| AI retry massimo | 3 tentativi | `MAX_ATTEMPTS` in `routes/ai.ts:478` | 0 righe o errore SQL |
| AI cache settings | 5s TTL | `ai/llm.ts` | swap provider quasi-istantaneo da pannello |
| Pool main | 10 conn | `db/pool.ts:6` | single-tenant, niente concorrenza alta |
| Pool demo | 5 conn | `db/pool.ts:22` | uso sporadico |
| Pool readonly AI | 3 conn | `db/readonly-pool.ts:21` | il modulo AI ha 1 utente attivo per volta |
| Backup retention | 30 giorni | `backup.sh` | bilancio spazio/recupero |

### 9.1 Cosa Aplo's NON fa (out-of-scope MVP)

- Fatturazione (citata in `specs.md`, non implementata).
- Timeline dedicata degli stati lavoro (oggi è ricavabile da
  `audit_log` con `azione = 'CAMBIO_STATO_LAVORO'`).
- Multi-tenant (un solo laboratorio per installazione).
- Notifiche push / email.
- Mobile app nativa (la SPA è responsive ma non c'è wrapper iOS/Android).

---

## 10. Test

`api/test/*.test.ts` con `node --test --import tsx` (runner nativo,
nessun framework). Coperti:

- `pin-hash.test.ts` — bcrypt hash/compare, zeri iniziali nei PIN, salt
  casuale.
- `audit.test.ts` — `logAudit` serializza JSON, accetta campi nulli,
  accetta operatore null.
- `sql-guard.test.ts` — fence parser, commenti, parole vietate, CTE
  ammessi, query vuota.
- `classify.test.ts` — `quickClassify` su verbi imperativi DATI,
  sostantivi del dominio, domande INFO.
- `validators.test.ts` — array denti FDI: range permanente/decidui,
  duplicati, formato.

Nessun test di integrazione che colpisce il DB o il modello AI. È la
linea principale di "regression critical-path" — espandibile.

---

## 11. Deploy

In dev: due `npm run dev:*` + `brew services` + un launchd agent (per
MLX). Riferimento operativo: `deploy/DEV.md`.

In prod (Linux laboratorio): Postgres nativo + Ollama nativo + API
Fastify sotto `systemd` + frontend statico servito da nginx con HTTPS
self-signed + backup giornaliero cifrato GPG via `systemd` timer.
Runbook completo: `deploy/DEPLOY.md`. Su Mac mini/Mac Studio in
laboratorio è disponibile anche il provider MLX (sezione 12b di
`DEPLOY.md`).

Artefatti committati:

| File | Cosa fa |
|---|---|
| `deploy/aplos-api.service` | systemd unit per API, con hardening |
| `deploy/aplos.nginx.conf` | server block nginx (HTTPS, proxy, headers, gzip) |
| `deploy/aplos-backup.service` | one-shot che lancia `scripts/backup.sh` |
| `deploy/aplos-backup.timer` | trigger giornaliero alle 02:00 |
| `deploy/dev.aplos.mlx.plist` | template launchd agent per MLX (placeholder sostituiti dallo script) |
| `scripts/backup.sh` | dump DB + uploads → tarball GPG-cifrato + retention 30g |
| `scripts/generate-cert.sh` | cert self-signed 825g con SAN |
| `scripts/install-mlx-server.sh` | installa mlx-lm, scarica modello, registra agent |

---

## 12. Trap-door e bug noti

Pattern ricorrenti su cui inciampare:

1. **`reply.hijack()` + CORS**: gli endpoint streaming (`POST /api/ai/chat`)
   chiamano `reply.hijack()` per scrivere direttamente su `reply.raw`.
   Questo **bypassa l'hook `onSend` di `@fastify/cors`** → la risposta
   arriva al browser senza `Access-Control-Allow-Origin`, il browser
   blocca, l'utente vede un generico "Errore di rete". Soluzione
   applicata in `routes/ai.ts`: scrivere a mano gli header CORS nel
   `writeHead`. Replicare lo stesso pattern in ogni futuro endpoint
   streaming.

2. **Ollama `keep_alive: "-1"` (stringa)**: rifiutato con
   `time: missing unit in duration`. Va passato come **intero** `-1`.

3. **MLX `<|im_end|>` nello stream**: `mlx_lm.server` non rimuove i
   token di stop del chat template; il provider deve fare strip
   (`api/src/ai/providers/mlx.ts`).

4. **Specificità CSS hover**: la regola generica
   `button:hover:not(:disabled)` ha specificità maggiore di
   `.classe:hover` senza pseudo-class extra. Non sovrascrivere
   `background` lì dentro o si rompono tutti i bottoni con sfondo
   custom. Lo styling attuale usa `filter: brightness(0.92)` per
   evitare il problema.

5. **`dottori.nome` campo unico**: i modelli LLM tendono a inventare
   una colonna `cognome`. Lo schema description e i few-shot lo
   chiariscono esplicitamente; il retry su errore SQL recupera quando
   il modello sbaglia comunque.

---

## 13. Riferimenti incrociati

- `specs.md` — specifica funzionale completa.
- `PROGETTO.md` — decisioni di prodotto, vincoli MDR/GDPR, fasi.
- `deploy/DEV.md` — avvio/spegnimento ambiente dev locale.
- `deploy/DEPLOY.md` — runbook produzione, sezione 12b per MLX.
- `deploy/DEMO_CLOUD.md` — piano cloud demo (separato).
- `db/migrations/*.sql` — schema autoritative.
