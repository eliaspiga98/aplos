-- Schema iniziale per Aplo's — gestionale laboratorio odontotecnico.
--
-- Vincoli MDR (Medical Device Regulation):
--   - soft delete (deleted_at) sulle entità anagrafiche e di produzione
--   - audit_log immutabile per tracciare le azioni degli operatori
--   - tracciabilità completa lotto materiale → lavoro → paziente

BEGIN;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE ruolo_operatore AS ENUM ('admin', 'tecnico');

CREATE TYPE stato_lavoro AS ENUM (
    'in_attesa',
    'in_corso',
    'in_prova',
    'finito'
);

CREATE TYPE tipo_struttura AS ENUM ('corona_singola', 'ponte');

CREATE TYPE categoria_materiale AS ENUM (
    'zirconio',
    'pmma',
    'resina',
    'metallo',
    'ceramica',
    'altro'
);

CREATE TYPE stato_utilizzo_materiale AS ENUM ('nuovo', 'parziale', 'esaurito');


-- =============================================================================
-- HELPER: trigger per aggiornare automaticamente updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- OPERATORI — utenti del sistema (login fast: nome + PIN)
-- =============================================================================

CREATE TABLE operatori (
    id          BIGSERIAL PRIMARY KEY,
    nome        TEXT NOT NULL,
    ruolo       ruolo_operatore NOT NULL DEFAULT 'tecnico',
    pin_hash    TEXT NOT NULL,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operatori_attivi ON operatori (nome) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_operatori_updated_at
    BEFORE UPDATE ON operatori
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- DOTTORI — anagrafica clienti (odontoiatri / studi medici)
-- =============================================================================

CREATE TABLE dottori (
    id              BIGSERIAL PRIMARY KEY,
    nome            TEXT NOT NULL,
    studio          TEXT,
    telefono        TEXT,
    email           TEXT,
    indirizzo       TEXT,
    partita_iva     TEXT,
    codice_fiscale  TEXT,
    note            TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dottori_nome   ON dottori (nome)   WHERE deleted_at IS NULL;
CREATE INDEX idx_dottori_studio ON dottori (studio) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_dottori_updated_at
    BEFORE UPDATE ON dottori
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- LAVORI — commesse / dispositivi medici su misura
-- =============================================================================

CREATE TABLE lavori (
    id                      BIGSERIAL PRIMARY KEY,
    id_dottore              BIGINT NOT NULL REFERENCES dottori(id),
    nome_paziente           TEXT NOT NULL,
    data_entrata            DATE NOT NULL,
    data_consegna           DATE NOT NULL,
    stato                   stato_lavoro NOT NULL DEFAULT 'in_attesa',
    scala_colori            TEXT,
    tipologia_lavoro        TEXT,
    note_istruzioni         TEXT,
    id_operatore_creazione  BIGINT NOT NULL REFERENCES operatori(id),
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_lavori_date_coerenti CHECK (data_consegna >= data_entrata)
);

-- Indice mirato sull'ordering "consegne più imminenti" mostrato in dashboard.
CREATE INDEX idx_lavori_data_consegna ON lavori (data_consegna)
    WHERE deleted_at IS NULL AND stato <> 'finito';
CREATE INDEX idx_lavori_stato    ON lavori (stato) WHERE deleted_at IS NULL;
CREATE INDEX idx_lavori_dottore  ON lavori (id_dottore);
CREATE INDEX idx_lavori_paziente ON lavori (nome_paziente);

CREATE TRIGGER trg_lavori_updated_at
    BEFORE UPDATE ON lavori
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- LAVORI_STRUTTURE — odontogramma (corone singole e ponti)
-- =============================================================================
-- Un lavoro ha 1..N strutture. La distinzione tra ponte e corona singola è
-- portata dal campo tipo_struttura, NON dal numero di righe:
--   - 3 corone singole su 12, 13, 14  → 3 righe (corona_singola, [12]) ecc.
--   - 1 ponte su 12-13-14             → 1 riga  (ponte, [12,13,14])
-- Numerazione FDI (11-48 per denti permanenti, 51-85 per decidui):
-- la validazione del numero specifico è lasciata all'app (più flessibile).

CREATE TABLE lavori_strutture (
    id                BIGSERIAL PRIMARY KEY,
    id_lavoro         BIGINT NOT NULL REFERENCES lavori(id) ON DELETE CASCADE,
    tipo_struttura    tipo_struttura NOT NULL,
    elementi_dentali  SMALLINT[] NOT NULL,

    CONSTRAINT chk_struttura_elementi_non_vuoto
        CHECK (array_length(elementi_dentali, 1) >= 1),
    CONSTRAINT chk_corona_singola_un_solo_elemento
        CHECK (tipo_struttura <> 'corona_singola'
               OR array_length(elementi_dentali, 1) = 1),
    CONSTRAINT chk_ponte_almeno_due_elementi
        CHECK (tipo_struttura <> 'ponte'
               OR array_length(elementi_dentali, 1) >= 2)
);

CREATE INDEX idx_lavori_strutture_lavoro ON lavori_strutture (id_lavoro);


-- =============================================================================
-- LAVORI_ALLEGATI — file STL (scansioni intraorali) e altri allegati
-- =============================================================================

CREATE TABLE lavori_allegati (
    id            BIGSERIAL PRIMARY KEY,
    id_lavoro     BIGINT NOT NULL REFERENCES lavori(id) ON DELETE CASCADE,
    nome_file     TEXT NOT NULL,
    storage_path  TEXT NOT NULL,
    mime_type     TEXT,
    size_bytes    BIGINT,
    id_operatore  BIGINT NOT NULL REFERENCES operatori(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lavori_allegati_lavoro ON lavori_allegati (id_lavoro);


-- =============================================================================
-- MATERIALI — magazzino (cialde, resine, metalli, ecc.)
-- =============================================================================
-- Campi base coprono i casi più comuni (cialde di zirconio/PMMA: altezza,
-- larghezza). Per attributi specifici di altre categorie (es. viscosità di una
-- resina) usare attributi_extra (JSONB) finché non emerge un pattern stabile da
-- promuovere a colonna.

CREATE TABLE materiali (
    id              BIGSERIAL PRIMARY KEY,
    categoria       categoria_materiale NOT NULL,
    sottotipo       TEXT,
    marca           TEXT,
    colore          TEXT,
    lotto           TEXT NOT NULL,
    deposito        TEXT,
    altezza_mm      NUMERIC(6,2),
    larghezza_mm    NUMERIC(6,2),
    quantita        NUMERIC(10,3),
    unita_misura    TEXT,
    stato_utilizzo  stato_utilizzo_materiale NOT NULL DEFAULT 'nuovo',
    soglia_alert    NUMERIC(10,3),
    attributi_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_materiali_categoria_lotto UNIQUE (categoria, lotto)
);

CREATE INDEX idx_materiali_categoria ON materiali (categoria)      WHERE deleted_at IS NULL;
CREATE INDEX idx_materiali_stato     ON materiali (stato_utilizzo) WHERE deleted_at IS NULL;
CREATE INDEX idx_materiali_lotto     ON materiali (lotto);

CREATE TRIGGER trg_materiali_updated_at
    BEFORE UPDATE ON materiali
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- LAVORI_MATERIALI — tracciabilità MDR (lotto consumato sul lavoro X)
-- =============================================================================
-- Tabella di associazione: registra ogni utilizzo di un materiale su un lavoro.
-- Le righe NON vanno mai cancellate (vincolo normativo).

CREATE TABLE lavori_materiali (
    id              BIGSERIAL PRIMARY KEY,
    id_lavoro       BIGINT NOT NULL REFERENCES lavori(id),
    id_materiale    BIGINT NOT NULL REFERENCES materiali(id),
    quantita_usata  NUMERIC(10,3),
    unita_misura    TEXT,
    note            TEXT,
    id_operatore    BIGINT NOT NULL REFERENCES operatori(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lavori_materiali_lavoro    ON lavori_materiali (id_lavoro);
CREATE INDEX idx_lavori_materiali_materiale ON lavori_materiali (id_materiale);


-- =============================================================================
-- AUDIT_LOG — registro immutabile delle azioni (vincolo MDR)
-- =============================================================================

CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    id_operatore  BIGINT REFERENCES operatori(id),
    azione        TEXT NOT NULL,
    entita        TEXT,
    id_entita     BIGINT,
    dettagli      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_operatore ON audit_log (id_operatore);
CREATE INDEX idx_audit_log_entita    ON audit_log (entita, id_entita);
CREATE INDEX idx_audit_log_created   ON audit_log (created_at DESC);

-- La tabella `schema_migrations` e la registrazione della versione applicata
-- sono gestite dal runner (api/src/db/migrate.ts), non dalle migrazioni.

COMMIT;
