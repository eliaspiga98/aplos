# Aplo's — installazione su Windows con NVIDIA e Ollama

Questa guida prepara una postazione Windows per eseguire Aplo's e il modello
locale `qwen3.5:9b-q4_K_M`. MLX non e disponibile su Windows: il provider da
selezionare nell'applicazione e **Ollama**.

## 1. Prerequisiti

- Windows 10 22H2 o Windows 11, 64 bit.
- Driver NVIDIA aggiornato (`nvidia-smi` deve mostrare la GPU).
- [Ollama per Windows](https://ollama.com/download/windows).
- Node.js 24 LTS, Git e PostgreSQL 16.

Ollama per Windows gira in background ed espone l'API locale su
`http://127.0.0.1:11434`. Non aprire la porta 11434 verso Internet: l'endpoint
locale non richiede autenticazione.

## 2. Codice e dipendenze

Clona il repository e installa le dipendenze:

```powershell
git clone https://github.com/eliaspiga98/aplos.git C:\Aplos
Set-Location C:\Aplos
npm ci
```

## 3. Modello AI

Da PowerShell nella root del repository:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-ollama-windows.ps1
```

Lo script:

1. verifica la presenza di Ollama e della GPU NVIDIA;
2. esegue `ollama pull qwen3.5:9b-q4_K_M`;
3. prova `/api/chat` con il thinking disabilitato;
4. stampa i valori da usare nella pagina **Impostazioni → Modello AI**.

Verifica che il modello sia caricato sulla GPU:

```powershell
ollama ps
```

## 4. Database PostgreSQL

Apri SQL Shell (`psql`) o il Query Tool di pgAdmin come amministratore e crea
il database e i due ruoli. Sostituisci le password prima di eseguire:

```sql
CREATE USER aplos WITH PASSWORD 'CAMBIAMI';
CREATE DATABASE aplos OWNER aplos;

CREATE USER aplos_readonly WITH PASSWORD 'CAMBIAMI_RO';
GRANT CONNECT ON DATABASE aplos TO aplos_readonly;
```

Riconnettiti al database `aplos`, poi esegui:

```sql
GRANT USAGE ON SCHEMA public TO aplos_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO aplos_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO aplos_readonly;
```

## 5. Configurazione Aplo's

Crea `C:\Aplos\.env` senza commetterlo nel repository:

```dotenv
DATABASE_URL=postgresql://aplos:CAMBIAMI@localhost:5432/aplos
READONLY_DATABASE_URL=postgresql://aplos_readonly:CAMBIAMI_RO@localhost:5432/aplos
API_HOST=127.0.0.1
API_PORT=3001
JWT_SECRET=SOSTITUISCI_CON_ALMENO_64_CARATTERI_CASUALI
SESSION_TTL_SECONDS=28800
WEB_ORIGIN=http://localhost:5173
UPLOADS_DIR=C:/Aplos/var/uploads
UPLOAD_MAX_BYTES=52428800
NODE_ENV=development
```

Prepara database e build:

```powershell
npm run migrate
npm run seed
npm run build
```

Il seed crea l'utente `Admin` con PIN iniziale `0000`: cambialo subito.

## 6. Avvio sulla singola postazione

Apri due finestre PowerShell in `C:\Aplos`.

Prima finestra, API:

```powershell
npm run dev:api
```

Seconda finestra, interfaccia:

```powershell
npm run dev:web
```

Apri `http://localhost:5173`, accedi come admin e verifica in
**Impostazioni → Modello AI**:

- provider: `Ollama`;
- modello: `qwen3.5:9b-q4_K_M`;
- URL Ollama: `http://127.0.0.1:11434`.

Premi **Prova connessione**, salva e prova la domanda “Quanti lavori sono in
corso?”.

## 7. Note operative

- Il modello pesa circa 6,6 GB; con 16 GB di VRAM rimane spazio per la cache.
- Aplo's invia `think: false` perché classifier e generazione SQL richiedono
  output breve e deterministico.
- Per una postazione sempre accesa o accessibile dalla LAN, usare WSL2/Ubuntu
  e il runbook `deploy/DEPLOY.md`, oppure predisporre servizi Windows dedicati.
- I dati sanitari e i backup devono restare cifrati e non devono essere inviati
  a provider LLM cloud.
