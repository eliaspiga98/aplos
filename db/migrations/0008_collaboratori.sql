BEGIN;

CREATE TABLE collaboratori (
    id          BIGSERIAL PRIMARY KEY,
    nome        TEXT NOT NULL,
    telefono    TEXT,
    email       TEXT,
    mansioni    TEXT,
    note        TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collaboratori_attivi
    ON collaboratori (nome) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_collaboratori_updated_at
    BEFORE UPDATE ON collaboratori
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE lavori_assegnazioni (
    id                           BIGSERIAL PRIMARY KEY,
    id_lavoro                    BIGINT NOT NULL REFERENCES lavori(id),
    id_collaboratore             BIGINT NOT NULL REFERENCES collaboratori(id),
    mansione                     TEXT NOT NULL,
    assegnato_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rimosso_at                   TIMESTAMPTZ,
    id_operatore_assegnazione    BIGINT NOT NULL REFERENCES operatori(id),
    id_operatore_rimozione       BIGINT REFERENCES operatori(id),

    CONSTRAINT chk_assegnazione_mansione_non_vuota
        CHECK (length(btrim(mansione)) > 0),
    CONSTRAINT chk_assegnazione_rimozione_coerente
        CHECK (rimosso_at IS NULL OR rimosso_at >= assegnato_at)
);

CREATE INDEX idx_lavori_assegnazioni_lavoro
    ON lavori_assegnazioni (id_lavoro, assegnato_at DESC);
CREATE INDEX idx_lavori_assegnazioni_collaboratore
    ON lavori_assegnazioni (id_collaboratore, assegnato_at DESC);
CREATE UNIQUE INDEX uq_lavori_assegnazioni_attive
    ON lavori_assegnazioni (id_lavoro, id_collaboratore, lower(mansione))
    WHERE rimosso_at IS NULL;

COMMIT;
