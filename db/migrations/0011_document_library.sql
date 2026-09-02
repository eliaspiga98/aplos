-- Libreria documentale: categorie libere, PDF indicizzati e frammenti
-- ricercabili dall'assistente AI. I file fisici restano nella cartella upload;
-- il database conserva metadati, testo estratto e indice full-text.

BEGIN;

CREATE TABLE categorie_documenti (
    id                      BIGSERIAL PRIMARY KEY,
    nome                    TEXT NOT NULL,
    descrizione             TEXT,
    id_operatore_creazione  BIGINT NOT NULL REFERENCES operatori(id),
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_categorie_documenti_nome CHECK (length(btrim(nome)) > 0)
);

CREATE UNIQUE INDEX uq_categorie_documenti_nome_attivo
    ON categorie_documenti (lower(nome))
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_categorie_documenti_updated_at
    BEFORE UPDATE ON categorie_documenti
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE documenti (
    id                      BIGSERIAL PRIMARY KEY,
    id_categoria            BIGINT NOT NULL REFERENCES categorie_documenti(id),
    titolo                  TEXT NOT NULL,
    nome_file               TEXT NOT NULL,
    storage_path            TEXT NOT NULL,
    mime_type               TEXT NOT NULL DEFAULT 'application/pdf',
    size_bytes              BIGINT NOT NULL,
    sha256                  CHAR(64) NOT NULL,
    numero_pagine           INTEGER,
    testo_caratteri         INTEGER NOT NULL DEFAULT 0,
    stato_indicizzazione    TEXT NOT NULL DEFAULT 'pronto',
    errore_indicizzazione   TEXT,
    id_operatore_creazione  BIGINT NOT NULL REFERENCES operatori(id),
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_documenti_titolo CHECK (length(btrim(titolo)) > 0),
    CONSTRAINT chk_documenti_size CHECK (size_bytes >= 0),
    CONSTRAINT chk_documenti_pagine CHECK (numero_pagine IS NULL OR numero_pagine > 0),
    CONSTRAINT chk_documenti_testo_caratteri CHECK (testo_caratteri >= 0),
    CONSTRAINT chk_documenti_stato CHECK (
        stato_indicizzazione IN ('pronto', 'errore')
    )
);

CREATE INDEX idx_documenti_categoria
    ON documenti (id_categoria, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_documenti_sha256 ON documenti (sha256);

CREATE TRIGGER trg_documenti_updated_at
    BEFORE UPDATE ON documenti
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE documenti_chunk (
    id            BIGSERIAL PRIMARY KEY,
    id_documento  BIGINT NOT NULL REFERENCES documenti(id) ON DELETE CASCADE,
    indice        INTEGER NOT NULL,
    pagina        INTEGER NOT NULL,
    testo         TEXT NOT NULL,
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('italian', coalesce(testo, ''))
    ) STORED,

    CONSTRAINT uq_documenti_chunk_indice UNIQUE (id_documento, indice),
    CONSTRAINT chk_documenti_chunk_indice CHECK (indice >= 0),
    CONSTRAINT chk_documenti_chunk_pagina CHECK (pagina > 0),
    CONSTRAINT chk_documenti_chunk_testo CHECK (length(btrim(testo)) > 0)
);

CREATE INDEX idx_documenti_chunk_documento
    ON documenti_chunk (id_documento, indice);
CREATE INDEX idx_documenti_chunk_ricerca
    ON documenti_chunk USING GIN (search_vector);

COMMIT;
