BEGIN;

CREATE TABLE macchinari (
    id          BIGSERIAL PRIMARY KEY,
    nome        TEXT NOT NULL,
    marca       TEXT,
    modello     TEXT,
    matricola   TEXT,
    ubicazione  TEXT,
    note        TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_macchinari_attivi ON macchinari (nome) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_macchinari_updated_at
    BEFORE UPDATE ON macchinari
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE manutenzioni_programmate (
    id                  BIGSERIAL PRIMARY KEY,
    id_macchinario      BIGINT NOT NULL REFERENCES macchinari(id),
    titolo              TEXT NOT NULL,
    descrizione         TEXT,
    prossima_scadenza   DATE NOT NULL,
    preavviso_giorni    INTEGER NOT NULL DEFAULT 7,
    ricorrenza_valore   INTEGER,
    ricorrenza_unita    TEXT,
    attiva              BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_manutenzioni_preavviso CHECK (preavviso_giorni >= 0 AND preavviso_giorni <= 365),
    CONSTRAINT chk_manutenzioni_ricorrenza CHECK (
      (ricorrenza_valore IS NULL AND ricorrenza_unita IS NULL)
      OR
      (ricorrenza_valore > 0 AND ricorrenza_unita IN ('giorni', 'mesi', 'anni'))
    )
);

CREATE INDEX idx_manutenzioni_scadenza
    ON manutenzioni_programmate (prossima_scadenza)
    WHERE deleted_at IS NULL AND attiva = TRUE;
CREATE INDEX idx_manutenzioni_macchinario
    ON manutenzioni_programmate (id_macchinario)
    WHERE deleted_at IS NULL;
CREATE TRIGGER trg_manutenzioni_updated_at
    BEFORE UPDATE ON manutenzioni_programmate
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE manutenzioni_interventi (
    id                  BIGSERIAL PRIMARY KEY,
    id_manutenzione     BIGINT NOT NULL REFERENCES manutenzioni_programmate(id),
    scadenza_prevista   DATE NOT NULL,
    completata_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note                TEXT,
    id_operatore        BIGINT NOT NULL REFERENCES operatori(id)
);

CREATE INDEX idx_manutenzioni_interventi_manutenzione
    ON manutenzioni_interventi (id_manutenzione, completata_at DESC);

CREATE TABLE manutenzioni_notifiche_lette (
    id_operatore        BIGINT NOT NULL REFERENCES operatori(id),
    id_manutenzione     BIGINT NOT NULL REFERENCES manutenzioni_programmate(id),
    scadenza            DATE NOT NULL,
    tipo                TEXT NOT NULL CHECK (tipo IN ('preavviso', 'scadenza')),
    letto_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id_operatore, id_manutenzione, scadenza, tipo)
);

COMMIT;
