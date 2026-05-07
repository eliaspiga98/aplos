# Aplo's — Piano deploy demo cloud

Questo documento descrive come mettere online una versione **demo** di
Aplo's per farla provare al cliente, senza toccare l'architettura on-prem
descritta in `DEPLOY.md`.

> ⚠️ **Eccezione esplicita alla regola "no Docker / no cloud"**: il
> progetto è progettato per girare on-prem nativo. Per la demo cloud
> usiamo Docker (Cloud Run lo richiede) e servizi gestiti GCP. Questo
> vale **solo per la demo** — l'installazione in laboratorio resta quella
> di `DEPLOY.md`.

---

## TL;DR

**Firebase puro non basta** (è hosting statico + Functions/Firestore,
niente Postgres gestito né proxy long-running per Fastify in modo
naturale). La combinazione più semplice e con minimi cambi di codice è:

- **Firebase Hosting** per il frontend (CDN globale, cert HTTPS gratis).
- **Cloud Run** per il backend Fastify (container, scale-to-zero).
- **Cloud SQL Postgres** per il database.
- **Cloud Storage** per gli allegati.
- **Vertex AI / Anthropic / disabled** per il modulo AI.

**Costo stimato**: ~10-15 €/mese per traffico demo. Cloud SQL è la voce
non-zero (non scala a zero); il resto è praticamente gratis sotto le
soglie del free tier.

**Tempo realistico**: una giornata effettiva di lavoro.

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│  cliente (browser)                                          │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTPS
                 ▼
┌─────────────────────────┐    ┌──────────────────────────────┐
│ Firebase Hosting        │    │ Cloud Run (api)              │
│  web/dist statico       │───▶│  Fastify + node 20           │
│  CDN globale, cert auto │    │  scale-to-zero               │
└─────────────────────────┘    └──┬──────────────┬────────────┘
                                  │              │
                                  ▼              ▼
                         ┌────────────────┐ ┌──────────────────┐
                         │ Cloud SQL      │ │ Cloud Storage    │
                         │  Postgres 16   │ │  bucket uploads  │
                         │  db_aplos_demo │ │  (sostituisce    │
                         └────────────────┘ │   var/uploads)   │
                                            └──────────────────┘

Modulo AI: per la demo sostituire Ollama con Vertex AI Gemini /
Anthropic Claude / disabilitato.
```

## Cosa cambia rispetto all'on-prem

| Strato | On-prem | Demo cloud | Modifica codice |
|---|---|---|---|
| Frontend | nginx + statico | Firebase Hosting | nessuna |
| Backend | systemd + node | Cloud Run (container) | aggiungere `Dockerfile` |
| DB | Postgres nativo | Cloud SQL Postgres | nessuna |
| Allegati | `var/uploads/` | bucket GCS | astrarre `routes/allegati.ts` |
| LLM | Ollama locale | Vertex / Anthropic / disabled | astrarre `api/src/ai/` |
| HTTPS | self-signed LAN | managed cert | nessuna |
| JWT cookie | `secure:false` ok in LAN | `secure:true`, `sameSite` da rivedere | piccolo aggiustamento |
| Backup | GPG locale + retention | Cloud SQL automated backups | nessuna |
| Auth | `WEB_ORIGIN=http://localhost:5173` | dominio Firebase | env var |

---

## Step-by-step

### 0. Decisioni preliminari (10 min, richiede te)

- **GCP project**: creare `aplos-demo` su Google Cloud (richiede carta di
  credito, free tier copre ampiamente la demo).
- **Region**: `europe-west8` (Milano) — vicinanza al cliente, GDPR.
  Alternativa: `europe-west1` (Belgio).
- **Dominio demo**: `aplos-demo.web.app` (gratis, Firebase) oppure dominio
  custom (es. `demo.aplos.tuodominio.it`).
- **AI nella demo** — tre opzioni:
  1. **Disabilitata**: il widget mostra "non disponibile". Più semplice.
  2. **Vertex AI Gemini Flash**: low cost, italiano OK, già su GCP.
  3. **Anthropic Claude Haiku**: ottimo per text-to-SQL, billing separato.

### 1. Astrazione storage allegati (1-2h, codice)

Modificare `api/src/routes/allegati.ts` (oggi scrive su filesystem)
introducendo un'interfaccia minimale con due implementazioni:

```ts
// api/src/storage/index.ts (nuovo)
export interface AttachmentStore {
  put(key: string, data: Buffer | Readable, mime: string): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  signedUrl?(key: string, ttlSec: number): Promise<string>; // per GCS
}
```

- `LocalStore` — usa `fs/promises`, replica il comportamento attuale.
- `GcsStore` — usa `@google-cloud/storage`, attivo se `GCS_BUCKET` settata.

Selezione in `config.ts`:
```ts
storage: process.env.GCS_BUCKET ? 'gcs' : 'local',
```

L'on-prem **non cambia**: senza `GCS_BUCKET` resta tutto come oggi.

### 2. Astrazione AI provider (1-2h, codice)

Stessa logica per `api/src/ai/`. Variabile `AI_PROVIDER`:

| Valore | Comportamento |
|---|---|
| `ollama` (default) | come oggi |
| `vertex` | usa `@google-cloud/vertexai`, modello `gemini-1.5-flash` |
| `anthropic` | usa `@anthropic-ai/sdk`, modello `claude-haiku-4-5` |
| `disabled` | endpoint AI ritorna 503 con messaggio "non disponibile" |

Refactor minimale: estrarre da `api/src/ai/llm.ts` (o equivalente) una
funzione `generateSql(question: string, schema: string): Promise<string>`
che chiama il provider selezionato. Tutto il resto (sql-guard, esecuzione
read-only) resta invariato.

### 3. `Dockerfile` per Cloud Run (30 min)

```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY api/package*.json api/
COPY web/package*.json web/
RUN npm ci
COPY . .
RUN npm --workspace api run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/package*.json ./api/
COPY --from=build /app/package*.json ./
COPY --from=build /app/db ./db
RUN npm ci --omit=dev --workspace api
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "api/dist/server.js"]
```

> Cloud Run richiede `PORT` (default 8080). Adattare `config.ts` per
> leggere `process.env.PORT` come override di `API_PORT` quando definito.

### 4. Cloud SQL (15 min via console)

- Istanza `db-f1-micro` (la più piccola, ~7 €/mese; non scala a zero).
- Postgres 16.
- Database `aplos_demo`.
- Utente `aplos` con password generata.
- **Niente IP pubblico**: usare **Cloud SQL Auth Proxy** o connessione
  privata verso Cloud Run.

### 5. Cloud Storage bucket (5 min)

- Bucket `aplos-demo-uploads` nella stessa region di Cloud Run.
- Accesso uniforme, **no public**.
- Service account dedicato a Cloud Run con `roles/storage.objectAdmin`
  solo su quel bucket (principio del minimo privilegio).

### 6. Cloud Run deploy (15 min)

```bash
gcloud run deploy aplos-api \
  --source . \
  --region europe-west8 \
  --add-cloudsql-instances PROJECT:europe-west8:aplos-demo-db \
  --set-env-vars NODE_ENV=production,GCS_BUCKET=aplos-demo-uploads,AI_PROVIDER=disabled,WEB_ORIGIN=https://aplos-demo.web.app \
  --set-secrets JWT_SECRET=jwt-secret:latest,DATABASE_URL=db-url:latest \
  --service-account aplos-run@PROJECT.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3
```

- Scale-to-zero → 0 € quando nessuno la usa.
- Cold start ~2s al primo accesso.
- Secret Manager per `JWT_SECRET` e `DATABASE_URL` (non in env plaintext).

### 7. Migrazioni + seed demo (5 min, una tantum)

Da una Cloud Shell con il proxy verso Cloud SQL:

```bash
# In una shell:
cloud-sql-proxy PROJECT:europe-west8:aplos-demo-db &

# In un'altra:
DATABASE_URL=postgresql://aplos:PWD@127.0.0.1:5432/aplos_demo \
  npm run migrate

DATABASE_URL=postgresql://aplos:PWD@127.0.0.1:5432/aplos_demo \
  npm run seed:demo
```

Il seed demo è già pronto (`api/src/db/seed-demo.ts`): 25 lavori, 6
dottori, 15 materiali, 5 depositi, 2 operatori demo (admin + tecnico).

### 8. Firebase Hosting per frontend (10 min)

```bash
# Build con env var puntata a Cloud Run
VITE_API_BASE_URL=https://aplos-api-XXX.run.app npm --workspace web run build

# Init Firebase
firebase init hosting     # public dir = web/dist, rewrite all to /index.html
firebase deploy --only hosting
```

`firebase.json` consigliato:
```json
{
  "hosting": {
    "public": "web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "/api/**", "run": { "serviceId": "aplos-api", "region": "europe-west8" } },
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

> Con il rewrite Firebase Hosting → Cloud Run, **tutto sotto lo stesso
> dominio** → `sameSite: 'lax'` ok per il cookie JWT, niente CORS
> complesso. Consigliato.

### 9. Aggiustamenti runtime (30 min, codice)

- `JWT cookie`: in produzione cloud
  ```ts
  reply.setCookie('aplos_session', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',  // 'none' se frontend e API su domini diversi
    path: '/',
    maxAge: config.sessionTtlSeconds,
  });
  ```
- `WEB_ORIGIN` e CORS: allineati al dominio Firebase.
- `config.ts`: leggere `PORT` (Cloud Run) come override di `API_PORT`.
- Smoke test cloud: login, creazione lavoro, upload allegato, AI (se
  abilitata).

### 10. Hand-off al cliente

- URL demo: `https://aplos-demo.web.app`.
- 2 utenti demo già presenti dal seed (credenziali in output di
  `seed:demo`).
- Banner DEMO già presente in UI quando `usa_demo=true`.
- Il cliente prova; quando finisce, spegnere Cloud SQL per azzerare i
  costi (vedi sotto).

---

## Costi indicativi (demo low-traffic)

| Risorsa | Costo mensile |
|---|---|
| Cloud Run | ~0 € (free tier 2M req, 360k GB-s) |
| Cloud SQL `db-f1-micro` | ~7-10 € (always-on, no scale-to-zero) |
| Cloud Storage | ~0 € (pochi GB di STL) |
| Firebase Hosting | 0 € (free tier 10 GB/mese) |
| Egress | ~0 € (low traffic) |
| Vertex AI / Anthropic (se attivo) | 1-5 € (poche centinaia di query) |
| **Totale** | **~10-15 €/mese** |

**Trick anti-spreco** quando la demo è ferma:

```bash
# Spegnere Cloud SQL (risparmio ~7 €/mese × giorni di stop)
gcloud sql instances patch aplos-demo-db --activation-policy NEVER

# Riaccendere
gcloud sql instances patch aplos-demo-db --activation-policy ALWAYS
```

Cloud Run scala già da solo a zero, niente da fare lato API.

---

## Tempo totale stimato

| Attività | Ore |
|---|---|
| Astrazione storage allegati | 1-2 |
| Astrazione AI provider | 1-2 |
| Dockerfile + tuning config | 0.5 |
| Setup GCP (Cloud SQL, GCS, IAM) | 1 |
| Setup Firebase Hosting | 0.5 |
| Tuning JWT cookie + CORS | 0.5 |
| Smoke test cloud + fix | 1-2 |
| **Totale** | **5-9 ore** (≈ una giornata) |

---

## Alternativa "lift-and-shift"

Se vuoi qualcosa di operativo **in 1-2 ore senza modifiche al codice**:

- VM **Compute Engine** `e2-small` (~12 €/mese, sempre accesa).
- Installa Postgres + Node + nginx come da `DEPLOY.md` esistente.
- Apri porta 443, dominio + Let's Encrypt (qui il cert pubblico funziona,
  niente self-signed).
- `git pull` + `DEPLOY.md` step 1-12.

**Trade-off**:
- ✅ Zero modifiche al codice. Stesso comportamento on-prem.
- ✅ Tempo bassissimo.
- ❌ Niente scale-to-zero, paghi anche se nessuno la usa.
- ❌ Allegati sulla VM, se la cancelli sparisce tutto (o backup manuale).
- ❌ Nessuna gestione automatica DB/storage.

Buono per una demo "veloce e sporca" di pochi giorni. Per una demo che
vivrà settimane meglio l'architettura serverless.

---

## Decisioni aperte

Prima di iniziare il codice servono queste scelte:

1. **AI nella demo**: disabilitata / Vertex Gemini / Anthropic Claude?
2. **Architettura**: serverless GCP (raccomandata) o VM lift-and-shift?
3. **Dominio**: `aplos-demo.web.app` (gratis) o tuo dominio custom?
4. **Quando partire**: subito sulle astrazioni storage/AI, o aspetti di
   aver scelto l'AI provider per evitare lavoro doppio?

---

## Riferimenti tecnici

- Cloud Run + Cloud SQL: https://cloud.google.com/sql/docs/postgres/connect-run
- Firebase Hosting + Cloud Run rewrite: https://firebase.google.com/docs/hosting/cloud-run
- Cloud Storage Node SDK: `@google-cloud/storage`
- Vertex AI Node SDK: `@google-cloud/vertexai`
- Anthropic Node SDK: `@anthropic-ai/sdk`
- Secret Manager con Cloud Run: https://cloud.google.com/run/docs/configuring/secrets
