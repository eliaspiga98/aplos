-- Un incarico resta associato al lavoro anche dopo il completamento della sua
-- fase. Gli eventi append-only consentono di mostrare lo storico solo quando
-- richiesto e alimentano le statistiche mensili dei collaboratori.

ALTER TABLE lavori_assegnazioni
  ADD COLUMN fase TEXT NOT NULL DEFAULT 'altro',
  ADD COLUMN stato_incarico TEXT NOT NULL DEFAULT 'attivo',
  ADD COLUMN completato_at TIMESTAMPTZ,
  ADD COLUMN id_operatore_stato BIGINT REFERENCES operatori(id),
  ADD CONSTRAINT chk_lavori_assegnazioni_fase
    CHECK (fase IN ('cad', 'rifinitura', 'altro')),
  ADD CONSTRAINT chk_lavori_assegnazioni_stato
    CHECK (stato_incarico IN ('attivo', 'completato', 'rimosso')),
  ADD CONSTRAINT chk_lavori_assegnazioni_completamento
    CHECK (stato_incarico <> 'completato' OR completato_at IS NOT NULL),
  ADD CONSTRAINT chk_lavori_assegnazioni_rimozione
    CHECK (stato_incarico <> 'rimosso' OR rimosso_at IS NOT NULL);

UPDATE lavori_assegnazioni
SET fase = CASE
  WHEN lower(mansione) LIKE '%cad%' THEN 'cad'
  WHEN lower(mansione) LIKE '%rifinit%' THEN 'rifinitura'
  ELSE 'altro'
END,
stato_incarico = CASE WHEN rimosso_at IS NULL THEN 'attivo' ELSE 'rimosso' END,
id_operatore_stato = id_operatore_rimozione;

UPDATE lavori_assegnazioni a
SET stato_incarico = 'completato', completato_at = l.finito_at
FROM lavori l
WHERE l.id = a.id_lavoro
  AND l.stato = 'finito'
  AND a.stato_incarico = 'attivo';

DROP INDEX uq_lavori_assegnazioni_attive;

CREATE UNIQUE INDEX uq_lavori_assegnazioni_correnti
  ON lavori_assegnazioni (id_lavoro, id_collaboratore, fase, lower(mansione))
  WHERE stato_incarico <> 'rimosso';

CREATE TABLE lavori_assegnazioni_eventi (
  id                 BIGSERIAL PRIMARY KEY,
  id_assegnazione    BIGINT NOT NULL REFERENCES lavori_assegnazioni(id),
  id_lavoro          BIGINT NOT NULL REFERENCES lavori(id),
  id_collaboratore   BIGINT NOT NULL REFERENCES collaboratori(id),
  fase               TEXT NOT NULL,
  mansione           TEXT NOT NULL,
  evento             TEXT NOT NULL,
  id_operatore       BIGINT REFERENCES operatori(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_lavori_assegnazioni_eventi_fase
    CHECK (fase IN ('cad', 'rifinitura', 'altro')),
  CONSTRAINT chk_lavori_assegnazioni_eventi_tipo
    CHECK (evento IN ('assegnato', 'completato', 'riattivato', 'modificato', 'rimosso'))
);

CREATE INDEX idx_lavori_assegnazioni_eventi_lavoro
  ON lavori_assegnazioni_eventi (id_lavoro, created_at DESC);
CREATE INDEX idx_lavori_assegnazioni_eventi_collaboratore
  ON lavori_assegnazioni_eventi (id_collaboratore, created_at DESC);

INSERT INTO lavori_assegnazioni_eventi
  (id_assegnazione, id_lavoro, id_collaboratore, fase, mansione,
   evento, id_operatore, created_at)
SELECT id, id_lavoro, id_collaboratore, fase, mansione,
       'assegnato', id_operatore_assegnazione, assegnato_at
FROM lavori_assegnazioni;

INSERT INTO lavori_assegnazioni_eventi
  (id_assegnazione, id_lavoro, id_collaboratore, fase, mansione,
   evento, id_operatore, created_at)
SELECT id, id_lavoro, id_collaboratore, fase, mansione,
       'completato', id_operatore_stato, completato_at
FROM lavori_assegnazioni
WHERE stato_incarico = 'completato';

INSERT INTO lavori_assegnazioni_eventi
  (id_assegnazione, id_lavoro, id_collaboratore, fase, mansione,
   evento, id_operatore, created_at)
SELECT id, id_lavoro, id_collaboratore, fase, mansione,
       'rimosso', id_operatore_rimozione, rimosso_at
FROM lavori_assegnazioni
WHERE rimosso_at IS NOT NULL;
