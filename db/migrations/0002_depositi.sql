-- Multi-deposito strutturato: anagrafica `depositi` + foreign key da
-- `materiali.id_deposito`. La colonna `materiali.deposito` (testo libero)
-- viene preservata come `deposito_legacy` per non perdere dati esistenti
-- durante la migrazione manuale ai nuovi depositi.

BEGIN;

CREATE TABLE depositi (
    id          BIGSERIAL PRIMARY KEY,
    nome        TEXT NOT NULL,
    descrizione TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_depositi_nome UNIQUE (nome)
);

CREATE INDEX idx_depositi_attivi ON depositi (nome) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_depositi_updated_at
    BEFORE UPDATE ON depositi
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Aggiungi FK su materiali. Nullable per non rompere le righe esistenti.
ALTER TABLE materiali ADD COLUMN id_deposito BIGINT REFERENCES depositi(id);
CREATE INDEX idx_materiali_deposito ON materiali (id_deposito) WHERE deleted_at IS NULL;

-- Rinomina la vecchia colonna come backup. Non la droppiamo per dare tempo
-- a un'eventuale migrazione dati. Quando emerge un pattern stabile (tutti i
-- materiali puntano a un id_deposito) si potrà eliminare con una nuova
-- migrazione.
ALTER TABLE materiali RENAME COLUMN deposito TO deposito_legacy;

COMMIT;
