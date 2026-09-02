# Aplo's — Documento di Progetto

Documento principale che consolida la specifica funzionale (`specs.md`) e tutte
le decisioni tecniche prese durante la progettazione. Aggiornare quando una
decisione importante cambia. Per i dettagli di dominio (cosa fa il software, le
storie utente) la fonte di verità resta `specs.md`.

---

## 1. Cos'è Aplo's

Gestionale per **un singolo laboratorio odontotecnico**. Web app fruita da PC e
tablet condivisi nei banchi di lavoro del laboratorio. Centralizza:

- ciclo di vita delle commesse (lavori) dall'ordine al pronto-consegna,
- magazzino dei materiali con tracciabilità lotto → lavoro → paziente,
- anagrafica clienti (dottori / studi) e operatori,
- collaboratori fisici del laboratorio e assegnazione delle mansioni ai lavori,
- macchinari, manutenzioni programmate e avvisi di scadenza,
- assistente in linguaggio naturale per interrogare i dati.

## 2. Vincoli normativi

- **MDR (Medical Device Regulation, UE 2017/745).** I dispositivi prodotti sono
  "dispositivi medici su misura". Conseguenze tecniche imposte:
  - tracciabilità completa del **lotto** del materiale impiegato su ogni lavoro
    (mai cancellare le associazioni `lavoro ↔ lotto materiale`);
  - **soft delete** su tutte le entità anagrafiche e di produzione (no
    `DELETE` fisico);
  - **audit log immutabile** delle azioni operatore.
- **GDPR.** Trattiamo dati di pazienti (nome, eventualmente CF) e dottori. Il
  deployment **on-prem** in laboratorio aiuta: i dati non lasciano la struttura.
  Le copie di backup vanno cifrate.

## 3. Architettura e deployment

- **Tenancy:** single-tenant. Una installazione per laboratorio, su una macchina
  dedicata in sede.
- **Forma:** SPA (frontend) + REST API (backend) + Postgres + storage locale per
  allegati.
- **Hosting:** macchina locale in laboratorio. Niente cloud. LAN.
- **Postgres:** installato nativamente sull'OS sia in dev (Homebrew) sia in
  produzione (gestore di pacchetti del server). Niente Docker.
- **LLM:** locale (probabilmente Ollama) sulla stessa macchina o su nodo
  dedicato. Da decidere quando affronteremo il modulo AI.
- **Backup:** dump giornalieri di Postgres su disco esterno + retention.

## 4. Stack tecnico

| Strato | Scelta | Note |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | SPA. CSS scritto a mano per ora; valutare Tailwind più avanti. |
| Routing FE | react-router-dom v6 | |
| Backend | Node 20+ + Fastify + TypeScript | Schema-validation con `@sinclair/typebox`. |
| Auth | JWT in cookie HTTP-only firmato | Sessione 8h con sliding renewal. |
| DB | PostgreSQL 16 | |
| Driver DB | `pg` (no ORM) | Query SQL esplicite, types manuali sui risultati. |
| Migrazioni | SQL puro versionato in `db/migrations/NNNN_*.sql` | Forward-only, runner Node custom in `api/src/db/migrate.ts`. |
| Hash PIN | `bcrypt` | |
| LLM | Locale, da definire | Probabile Ollama. |

**Principi guida:** semplicità prima di tutto, niente ORM-magic, niente
astrazioni preventive (service/repository). Una funzione per use-case. Codice
esplicito > meta-programmazione.

## 5. Moduli funzionali

### 5.1 Autenticazione (Fast-Login)
- Lista operatori → click → PIN numerico → JWT cookie.
- Auto-logout su inattività (timeout configurabile, default 30 minuti).
- PIN salvato come hash bcrypt.

### 5.2 Dashboard
- KPI: lavori per stato (`in_attesa`, `in_corso`, `in_prova`, `finito`),
  alert materiali sotto soglia, conteggio lavori in scadenza nei prossimi N
  giorni.
- Tabella "Ultimi N lavori" con accesso rapido alla modifica.
- Tutto deve caricare in < 1.5 s.

### 5.3 Gestione Lavori
- Tabella con omni-search (cognome paziente / dottore / id lavoro) e
  ordinamento per `data_consegna` ascendente.
- Filtri per stato.
- Modale di creazione/modifica con sezioni:
  - **Anagrafica:** dottore (autocomplete) + paziente.
  - **Date:** entrata, consegna (consegna ≥ entrata, vincolo DB).
  - **Tecnica:** scala colori VITA, tipologia, istruzioni, allegati STL.
  - **Odontogramma:** selezione denti (notazione FDI 11-48 e 51-85),
    raggruppamento in ponti.
- Cambio stato come azione separata (registrata in `audit_log`).
- Quando un lavoro passa in corso, proposta non obbligatoria di assegnare uno
  o più collaboratori con una mansione (per esempio CAD o rifinitura).
  Le assegnazioni restano attive attraversando gli altri stati e possono
  essere modificate in seguito; data di assegnazione e storico sono preservati.
- La scala colori è una scelta guidata VITA: BL1-BL3, A1-A4 (A3.5 incluso),
  B1-B4, C1-C4 e D2-D4. D1 non è ammesso.
- Il dottore può essere creato direttamente dal form del lavoro e viene
  selezionato senza perdere i dati dell'ordine in compilazione.
- Registrazione consumo materiale (`lavori_materiali`) come azione separata.

### 5.4 Collaboratori di laboratorio

- Anagrafica separata dagli operatori autenticati, con contatti, mansioni e note.
- Un collaboratore può essere associato a più lavori e lo stesso lavoro può
  avere più incarichi contemporanei.
- Archiviare un collaboratore chiude le assegnazioni attive ma non cancella
  lo storico.

### 5.5 Magazzino Materiali
- Tab per categoria (`zirconio`, `pmma`, `resina`, `metallo`, `ceramica`,
  `altro`). Form di inserimento con campi base + `attributi_extra` JSONB per
  attributi non standard.
- Stati cialde: `nuovo` / `parziale` / `esaurito`.
- La stessa categoria e lo stesso lotto possono comparire su righe differenti
  quando cambia marca, colore, altezza o larghezza. Soltanto i materiali con
  tutti questi dati uguali condividono la stessa quantità di magazzino.
- Alert quando sotto `soglia_alert`.
- Filtri per lotto, marca, deposito.

### 5.6 Macchinari e manutenzioni

- Anagrafica macchinari con marca, modello, matricola, ubicazione e note.
- Manutenzioni una tantum o ricorrenti per giorni, mesi o anni, con preavviso
  configurabile.
- Popup in-app nel periodo di preavviso e un nuovo avviso il giorno della
  scadenza; la conferma di lettura è distinta per operatore e occorrenza.
- Il completamento registra data, operatore e note nell'archivio interventi;
  una manutenzione ricorrente avanza automaticamente alla prima scadenza futura.

### 5.7 Assistente AI (fase finale)
- Chat. Domanda in italiano → query SQL → risultato → risposta in italiano.
- LLM locale, **utente DB read-only** dedicato (no SQL injection via prompt).
- Schema descritto in un prompt di sistema riutilizzabile.

### 5.8 Libreria Documenti

- Categorie create e modificate liberamente dagli operatori.
- Caricamento di PDF con testo selezionabile, conservati nello storage locale.
- Indicizzazione per pagina e ricerca degli estratti pertinenti alla domanda.
- Domande sull'intera libreria, su una categoria o su un singolo documento.
- Risposte dell'LLM locale fondate esclusivamente sugli estratti recuperati,
  con collegamenti al PDF e alla pagina usata come fonte.
- I PDF composti solo da immagini restano archiviati ma vengono segnalati come
  non consultabili fino a una futura elaborazione OCR.

## 6. Modello dati

Schema completo: `db/migrations/0001_initial_schema.sql`.

Entità:

- `operatori` — utenti del sistema (PIN hashato, ruolo `admin`/`tecnico`).
- `dottori` — anagrafica clienti.
- `lavori` — commesse / dispositivi medici.
- `lavori_strutture` — odontogramma. `tipo_struttura` ∈ {`corona_singola`,
  `ponte`} + `elementi_dentali SMALLINT[]`. Vincoli CHECK garantiscono
  coerenza (no ponti da 1 dente, no corone con più denti).
- `lavori_allegati` — file (STL, foto) associati a un lavoro.
- `collaboratori` — persone che eseguono fisicamente le lavorazioni.
- `lavori_assegnazioni` — mansione, presa in carico e chiusura incarico,
  mantenute come storico.
- `macchinari` — anagrafica delle attrezzature.
- `manutenzioni_programmate` — prossima scadenza, preavviso e ricorrenza.
- `manutenzioni_interventi` — registro degli interventi effettuati.
- `manutenzioni_notifiche_lette` — letture avvisi per operatore/occorrenza.
- `materiali` — magazzino. `(categoria, lotto)` UNIQUE.
- `lavori_materiali` — **tracciabilità MDR**. Mai cancellare.
- `categorie_documenti` — classificazione libera dei protocolli e manuali.
- `documenti` — metadati e percorso persistente dei PDF caricati.
- `documenti_chunk` — testo indicizzato per pagina e ricerca documentale.
- `audit_log` — registro azioni immutabile.
- `schema_migrations` — versioning migrazioni applicate.

## 7. Decisioni di design

Decisioni prese in fase di progettazione che il codice da solo non spiega.

- **Soft delete via `deleted_at TIMESTAMPTZ`** invece di `is_deleted BOOLEAN`.
  Tiene anche *quando* è stato cancellato — utile per audit MDR.
- **Indici parziali `WHERE deleted_at IS NULL`** sui lookup frequenti: query
  più veloci, indici più piccoli.
- **Indice `idx_lavori_data_consegna`** è parziale anche su `stato <> 'finito'`
  perché l'ordering "consegne imminenti" della dashboard interessa solo lavori
  attivi.
- **Validazione numeri FDI lato app, non DB.** È più semplice cambiarla.
- **`attributi_extra JSONB`** sui materiali invece di tabella polimorfica.
  Quando un attributo emerge come ricorrente lo si "promuove" a colonna.
- **Audit log popolato dall'app**, non da trigger DB. Più visibile, più semplice
  da arricchire con contesto (request id, ip, ecc.).
- **Migrazioni forward-only**. Per "rollback" si scrive una nuova migrazione che
  inverte. Niente file `down.sql`.
- **No ORM.** SQL puro o thin query helpers. Massima leggibilità per chi
  arriva al progetto senza avere familiarità con un ORM specifico.
- **Tipi italiani per tabelle/colonne** (coerenza con la spec di dominio in
  `specs.md`). Inglese solo per convenzioni standard (`created_at`,
  `updated_at`, `deleted_at`).

## 8. Decisioni aperte

Da affrontare prima del rispettivo modulo:

- **Scelta concreta dell'LLM locale** (Ollama + quale modello). Da decidere
  prima del modulo AI.
- **Test integrati DB-dipendenti.** Oggi i test (`api/test/*.test.ts`) sono
  tutti unit puri (sql-guard, validators FDI, audit logger con mock,
  bcrypt round-trip). Per i flussi MDR end-to-end (soft delete lavoro che
  preserva `lavori_materiali`, audit entry per ogni write) servirebbe un
  harness con `TEST_DATABASE_URL`, migrazioni e cleanup. Non bloccante
  per il go-live, ma raccomandato in seguito.
- **Modulo fatturazione.** Citato in `specs.md` ma non specificato. Fuori MVP.
- **Storage allegati STL.** Default proposto: filesystem locale del server in
  `var/aplos/uploads/<id_lavoro>/`. Limite dimensione configurabile.
- ~~**Reset PIN operatore.**~~ Risolto: l'admin imposta un nuovo PIN da
  "Modifica operatore" (campo "Nuovo PIN (lasciare vuoto per non cambiare)"
  in `OperatoreFormModal`). L'operatore al primo login col nuovo PIN può
  cambiarlo da `CambioPinModal`.
- ~~**Multi-deposito.** `materiali.deposito` è una stringa libera.~~ Risolto
  con migrazione 0002: tabella `depositi` con FK `materiali.id_deposito`,
  pagina dedicata `/depositi`. La vecchia colonna è preservata come
  `deposito_legacy` per migrazione manuale dei dati esistenti.

## 9. Roadmap

- [x] **Fase 1** — Schema DB + setup Postgres nativo.
- [x] **Fase 2** — Migration runner + scaffolding backend Fastify + scaffolding
      frontend Vite. Endpoint health.
- [x] **Fase 3** — Auth fast-login (server + UI). CRUD operatori (admin only).
- [x] **Fase 4** — CRUD dottori.
- [x] **Fase 5** — CRUD lavori con odontogramma. Cambio stato.
- [x] **Fase 6** — Magazzino materiali (form dinamico). Tracciabilità
      `lavori_materiali`.
- [x] **Fase 7** — Audit log integrato in tutte le azioni scriventi.
- [x] **Fase 8** — Dashboard KPI con scadenze e materiali sotto soglia.
- [x] **Fase 9** — Upload/download/delete allegati (STL e altro).
- [x] **Fase 10** — Modulo Assistente AI (Ollama locale, text-to-SQL con utente
      DB read-only).
- [x] **Fase 11a** — Auto-logout inattività, rate limiting login,
      conferme + toast, paginazione, search debounce.
- [x] **Fase 11b** — Stampa scheda lavoro (`/lavori/:id/stampa`, layout A4
      con CSS print → Stampa o "Salva come PDF" dal dialog browser).
- [x] **Fase 11c** — Export CSV (lavori, dottori, materiali) con BOM UTF-8
      per compatibilità Excel.
- [x] **Fase 11d** — Multi-deposito strutturato (tabella `depositi` + FK).
- [x] **Fase 11e** — Hardening finale: systemd unit per API, systemd timer
      per backup giornaliero, reverse proxy nginx, certificato HTTPS
      self-signed per LAN. File in `deploy/` + `scripts/generate-cert.sh`.
      Runbook completo in `deploy/DEPLOY.md`.
- [x] **Fase 12** — UX polish dashboard: Dashboard riscritta con KPI grafici,
      vista Kanban dei lavori (`LavoriKanban`), vista Calendario consegne
      (`CalendarView` + pagina `/calendario`), campanella notifiche
      (`NotificheBell`), `LavoroPreviewBlock` per anteprime contestuali,
      `DottoreDetailModal`, AiWidget riscritto con storia conversazione e
      suggerimenti.
- [x] **Fase 13** — Collaboratori separati dagli operatori, assegnazioni
      multi-mansione con storico, scala VITA completa e creazione rapida dottore.
- [x] **Fase 14** — Macchinari, manutenzioni programmate ricorrenti, storico
      interventi e notifiche in-app di preavviso/scadenza.
- [x] **Fase 15** — Correzione date civili PostgreSQL senza slittamento di fuso
      orario e isolamento completo delle query di dettaglio nel database demo.
- [x] **Fase 16** — Libreria Documenti con categorie libere, indicizzazione PDF
      locale e risposte AI basate sui protocolli con fonti per pagina.

## 10. Deploy in laboratorio

> **Runbook eseguibile**: `deploy/DEPLOY.md`. La sezione qui sotto è il
> riepilogo architetturale; per i comandi passo-passo seguire il runbook.

Lo schema di deploy proposto per la macchina dedicata in laboratorio:

1. **Postgres 16** installato nativamente. Crea utente principale (`aplos`) e
   utente read-only (`aplos_readonly`) usato solo dall'AI.
   ```sql
   CREATE USER aplos_readonly WITH PASSWORD '...';
   GRANT CONNECT ON DATABASE aplos TO aplos_readonly;
   GRANT USAGE ON SCHEMA public TO aplos_readonly;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO aplos_readonly;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT ON TABLES TO aplos_readonly;
   ```
2. **Provider AI locale** sulla stessa macchina (o su nodo separato in LAN):
   Ollama su Windows/Linux/macOS con `ollama pull qwen3.5:9b-q4_K_M`, oppure
   MLX su Apple Silicon con `mlx-community/Qwen3.5-9B-MLX-4bit`. Provider,
   modello e URL sono configurabili dal pannello admin **Impostazioni**.
3. **API**: `npm run build` produce `api/dist/`. Avvio con
   `node --env-file=.env api/dist/server.js`. Tipicamente con un'unit systemd:
   ```ini
   [Unit]
   Description=Aplo's API
   After=postgresql.service
   [Service]
   WorkingDirectory=/opt/aplos
   EnvironmentFile=/opt/aplos/.env
   ExecStart=/usr/bin/node api/dist/server.js
   Restart=on-failure
   User=aplos
   [Install]
   WantedBy=multi-user.target
   ```
4. **Frontend**: `npm run build` produce `web/dist/`. Servire con nginx (oppure
   con il Fastify se si preferisce single-process). Esempio nginx:
   ```nginx
   server {
     listen 80 default_server;
     root /opt/aplos/web/dist;
     index index.html;
     location /api/ { proxy_pass http://127.0.0.1:3001; }
     location / { try_files $uri /index.html; }
   }
   ```
5. **Backup giornalieri**: cron alle 02:00 lancia `scripts/backup.sh`.
   Configurato tramite variabili d'ambiente (`APLOS_BACKUP_DIR`,
   `APLOS_RETENTION`, `DATABASE_URL`).
6. **Log rotation**: gli stdout di systemd finiscono in journald, già con
   rotazione gestita dall'OS. Per un log file applicativo dedicato si può
   aggiungere `pino-roll` in futuro.
